/**
 * Salida estructurada de Claude (port de la parte pura de
 * `extraction/croquis_extraction/claude_client.py`): esquema, prompt de sistema, huella, precios y
 * conversión de la salida a hechos con cita.
 *
 * Claude no produce la EscenaSpec ni geometría: produce hechos (`campo`, `valor`, `cita`) con
 * salida estructurada contra un esquema pequeño, y el constructor determinista los convierte en
 * EscenaSpec. Todo aquí es isomórfico (navegador, Node y funciones de Vercel); la llamada a la API
 * y las grabaciones están en `server/`.
 */
import { ESCENA_JSON_SCHEMA } from "@croquis/scene-schema";
import glosario from "../data/glosario.json";
import modelos from "../data/modelos.json";
import { emptyFacts, fact, type Fact, type Facts, type FactValue } from "./facts";
import { PROMPTS } from "./generated/prompts";
import { glossaryVersion } from "./glossary";
import { sha256Hex } from "./hash";
import { pyJsonDumps } from "./pyjson";
import { pyStr } from "./spec-builder";

/**
 * v3 es el prompt de producción: v2 más la fase de las marcas; no empeoró en dev ni en el test
 * CISS (ADR 0019). v2 lo fue antes (ADR 0012).
 * Las grabaciones de v1 viven en `grabaciones/<modelo>/` y las de otras versiones en
 * `grabaciones/<versión>/<modelo>/`.
 */
export const PROMPT_VERSIONS = ["extraccion_v1", "extraccion_v2", "extraccion_v3"] as const;
export type PromptVersion = (typeof PROMPT_VERSIONS)[number];
export const PROMPT_VERSION: PromptVersion = "extraccion_v3";
export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type Model = (typeof MODELS)[number];
export const DEFAULT_EFFORT = "medium";
export const MAX_TOKENS = 16000;

/** USD por millón de tokens: entrada, salida, escritura de caché (5 min) y lectura de caché. */
export const PRICES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  "claude-sonnet-5-5": { input: 2.0, output: 10.0, cache_write: 2.5, cache_read: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cache_write: 0.125, cache_read: 0.01 },
  // Modelo al que puede caer el respaldo de rechazos del servidor (fallbacks="default").
  "claude-opus-5-5": { input: 4.0, output: 20.0, cache_write: 5.0, cache_read: 0.2 },
};
/** Haiku 5.5 cobra más por encima de 100 000 tokens de entrada. */
const HAIKU_LONG = { input: 0.5, output: 2.5, cache_write: 0.625, cache_read: 0.05 };

export const SCALAR_CAMPOS = [
  "lugar.tipo_via",
  "lugar.superficie",
  "lugar.estado_superficie",
  "lugar.carriles_por_sentido",
  "entorno.clima",
  "entorno.iluminacion",
  "evento.tipo",
  "evento.objeto",
  "evidencias.marcas_m",
  "evidencias.marcas_fase",
  "evidencias.distancia_proyeccion_m",
] as const;
/**
 * Campos que pide cada versión del prompt: v1 y v2 no conocen la fase de las marcas (contrato
 * 1.1.0, ADR 0019), así su esquema y su huella no cambian y sus grabaciones siguen valiendo.
 */
const SINCE_V3 = new Set(["evidencias.marcas_fase"]);
/**
 * Dispositivos del contrato que ningún prompt vigente pide (llegan del croquis): el semáforo
 * peatonal (contrato 1.3.0, ADR 0038). Si entraran al esquema de salida, cambiaría la huella de
 * los prompts v1-v3 y sus respuestas grabadas dejarían de valer.
 */
export const NOT_ASKED_DEVICES = new Set(["semaforo_peatonal"]);
export const VEHICLE_CAMPOS = [
  "vehiculo.clase",
  "vehiculo.maniobra",
  "vehiculo.velocidad_kmh",
  "vehiculo.frenado",
  "vehiculo.color",
  "vehiculo.zona_impacto",
] as const;
export const PERSON_CAMPOS = ["persona.cinturon", "persona.casco"] as const;
export const CAMPOS: readonly string[] = [...SCALAR_CAMPOS, ...VEHICLE_CAMPOS, ...PERSON_CAMPOS];
const NUMERIC_CAMPOS = new Set([
  "lugar.carriles_por_sentido",
  "evidencias.marcas_m",
  "evidencias.distancia_proyeccion_m",
  "vehiculo.velocidad_kmh",
]);
/** Campos del esquema de salida de una versión del prompt. */
export function camposFor(prompt: string): readonly string[] {
  if (prompt === "extraccion_v1" || prompt === "extraccion_v2") {
    return CAMPOS.filter((c) => !SINCE_V3.has(c));
  }
  return CAMPOS;
}
const BOOL_CAMPOS = new Set(["vehiculo.frenado", "persona.cinturon", "persona.casco"]);
const EVENT_TYPES = [
  "impacto_vehiculo_vehiculo",
  "impacto_vehiculo_objeto",
  "impacto_vehiculo_persona",
  "volcadura",
  "derrape",
  "inicio_frenado",
  "arrastre",
];

export class LLMError extends Error {}
export class BudgetExceededError extends LLMError {}

type SchemaDefs = Record<string, { properties: Record<string, { enum?: string[] }> }>;

function schemaEnum(defname: string, prop = "valor"): string[] {
  const defs = (ESCENA_JSON_SCHEMA as unknown as { $defs: SchemaDefs }).$defs;
  const values = defs[defname]?.properties[prop]?.enum;
  if (!values) throw new Error(`Sin enum ${defname}.${prop} en escena.schema.json`);
  return [...values];
}

let allowed: Record<string, readonly string[]> | null = null;

/** Valores válidos por campo: los del contrato más los genéricos que acepta el constructor. */
export function allowedValues(): Record<string, readonly string[]> {
  allowed ??= {
    "lugar.tipo_via": [...schemaEnum("CampoTipoVia"), "interseccion"],
    "lugar.superficie": schemaEnum("CampoSuperficie"),
    "lugar.estado_superficie": schemaEnum("CampoEstadoSuperficie"),
    "entorno.clima": [...schemaEnum("CampoClima"), "lluvia"],
    "entorno.iluminacion": [...schemaEnum("CampoIluminacion"), "noche"],
    "evento.tipo": EVENT_TYPES,
    "evento.objeto": schemaEnum("ObjetoEntorno", "tipo"),
    "evidencias.marcas_fase": schemaEnum("EvidenciaFisica", "fase"),
    "vehiculo.clase": [...schemaEnum("CampoClaseVehiculo"), "suv_o_pickup", "camion_o_autobus"],
    "vehiculo.maniobra": [...schemaEnum("CampoManiobra"), "cambio_carril"],
    "vehiculo.zona_impacto": schemaEnum("ZonaCDC", "lado"),
    "persona.rol": schemaEnum("CampoRolPersona"),
    "dispositivo.tipo": schemaEnum("Dispositivo", "tipo").filter((t) => !NOT_ASKED_DEVICES.has(t)),
  };
  return allowed;
}

/** Esquema de la salida estructurada; sin uniones: lo opcional es una lista que puede faltar. */
export function outputSchema(prompt: string = PROMPT_VERSION): Record<string, unknown> {
  const av = allowedValues();
  return {
    type: "object",
    properties: {
      vehiculos: {
        type: "array",
        items: {
          type: "object",
          properties: { narrador: { type: "boolean" } },
          required: ["narrador"],
          additionalProperties: false,
        },
      },
      personas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            rol: { type: "string", enum: [...av["persona.rol"]!] },
            cita: { type: "string" },
            vehiculo: { type: "integer" },
          },
          required: ["rol", "cita", "vehiculo"],
          additionalProperties: false,
        },
      },
      hechos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            campo: { type: "string", enum: [...camposFor(prompt)] },
            vehiculo: { type: "integer" },
            persona: { type: "integer" },
            valor: { type: "string" },
            cita: { type: "string" },
          },
          required: ["campo", "vehiculo", "persona", "valor", "cita"],
          additionalProperties: false,
        },
      },
      dispositivos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tipo: { type: "string", enum: [...av["dispositivo.tipo"]!] },
            cita: { type: "string" },
          },
          required: ["tipo", "cita"],
          additionalProperties: false,
        },
      },
      preguntas: { type: "array", items: { type: "string" } },
    },
    required: ["vehiculos", "personas", "hechos", "dispositivos", "preguntas"],
    additionalProperties: false,
  };
}

function valuesDoc(prompt: string): string {
  const av = allowedValues();
  const lines = ["Valores por campo (`valor` va como texto):"];
  for (const campo of camposFor(prompt)) {
    if (NUMERIC_CAMPOS.has(campo)) lines.push(`- ${campo}: número`);
    else if (BOOL_CAMPOS.has(campo)) lines.push(`- ${campo}: true o false`);
    else if (campo === "vehiculo.color") {
      lines.push(`- ${campo}: el color como lo dice el relato, en minúsculas y sin acento`);
    } else lines.push(`- ${campo}: ${av[campo]!.join(", ")}`);
  }
  lines.push(
    "En `hechos`, `vehiculo` es el índice del vehículo para los campos `vehiculo.*` y -1 para " +
      "los demás; `persona` es el índice de la persona para `persona.*` y -1 para los demás. " +
      "En `personas`, `vehiculo` es el índice del vehículo en que iba o -1.",
  );
  return lines.join("\n");
}

interface GlossaryEntry {
  significado: string;
  efectos: { campo: string; valor: FactValue }[];
}

const systems = new Map<PromptVersion, string>();

export function checkPrompt(prompt: string): PromptVersion {
  if (!(PROMPT_VERSIONS as readonly string[]).includes(prompt)) {
    throw new LLMError(`Versión de prompt desconocida: ${prompt}`);
  }
  return prompt as PromptVersion;
}

/** Tabla modelo → clase de `modelos.json` (la misma que usa la línea base de reglas). */
function modelsDoc(): string {
  const table = (modelos as { modelos: Record<string, { clase: string }> }).modelos;
  return Object.entries(table)
    .map(([name, m]) => `- ${name} → ${m.clase}`)
    .join("\n");
}

/**
 * Prompt de sistema estable (se cachea): instrucciones, valores válidos, glosario y, desde v2, la
 * tabla de modelos.
 */
export function systemPrompt(prompt: string = PROMPT_VERSION): string {
  const version = checkPrompt(prompt);
  const cached = systems.get(version);
  if (cached !== undefined) return cached;
  const lines = (glosario as { entradas: GlossaryEntry[] }).entradas.map((e) => {
    const effects = e.efectos.map((x) => `${x.campo}=${pyStr(x.valor)}`).join(", ");
    return `- ${e.significado}` + (effects ? ` → ${effects}` : "");
  });
  const base = PROMPTS[version]
    .replaceAll("{GLOSARIO}", lines.join("\n"))
    .replaceAll("{MODELOS}", modelsDoc());
  const out = base + "\n\n" + valuesDoc(version) + "\n";
  systems.set(version, out);
  return out;
}

/** Huella del prompt y del esquema: una grabación solo vale para la misma huella. */
export function promptFingerprint(prompt: string = PROMPT_VERSION): string {
  const payload = systemPrompt(prompt) + pyJsonDumps(outputSchema(prompt)) + glossaryVersion();
  return sha256Hex(payload).slice(0, 16);
}

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** `round(x, 8)` de Python para los costos (sin empates exactos en estos valores). */
function round8(x: number): number {
  return Number(x.toFixed(8));
}

/** Costo de una respuesta a partir de su `usage` (tokens) y la tabla de precios. */
export function costUsd(model: string, usage: Usage): number {
  let p = PRICES[model];
  if (!p) throw new LLMError(`Sin precio registrado para ${model}`);
  const inp = usage.input_tokens ?? 0;
  const cw = usage.cache_creation_input_tokens ?? 0;
  const cr = usage.cache_read_input_tokens ?? 0;
  if (model === "claude-haiku-5-5" && inp + cw + cr > 100_000) p = HAIKU_LONG;
  const total =
    inp * p.input! +
    (usage.output_tokens ?? 0) * p.output! +
    cw * p.cache_write! +
    cr * p.cache_read!;
  return round8(total / 1e6);
}

// --- Conversión de la salida a hechos -----------------------------------------------------------

export interface Conversion {
  citas: number;
  /** La cita no aparece en el relato: el hecho baja a supuesto. */
  sin_cita_literal: number;
  /** Valor fuera de los permitidos o índice inexistente: se descarta. */
  valores_invalidos: number;
  preguntas: string[];
}

export interface ClaudeOutput {
  vehiculos?: { narrador?: boolean }[];
  personas?: { rol?: string; cita?: string; vehiculo?: number }[];
  hechos?: {
    campo?: string;
    vehiculo?: number;
    persona?: number;
    valor?: unknown;
    cita?: string;
  }[];
  dispositivos?: { tipo?: string; cita?: string }[];
  preguntas?: unknown[];
}

/** `str(x)` de Python para lo que llega en la salida (None → "None"). */
function pyText(x: unknown): string {
  if (x === undefined) return "";
  if (x === null) return "None";
  if (typeof x === "boolean") return x ? "True" : "False";
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(x);
  return JSON.stringify(x);
}

/** `int(x)` de Python (trunca hacia cero). */
function pyInt(x: unknown, dflt: number): number {
  if (x === undefined) return dflt;
  const n = typeof x === "number" ? x : Number(pyText(x));
  if (!Number.isFinite(n)) throw new LLMError(`Índice inválido: ${pyText(x)}`);
  return Math.trunc(n);
}

const NUMBER_RX = /-?\d+(?:[.,]\d+)?/;
const BOOLS: Readonly<Record<string, boolean>> = {
  true: true,
  si: true,
  sí: true,
  false: false,
  no: false,
};

/** Valor de un hecho según su campo; `null` si no es válido. */
export function parseValue(campo: string, raw: string): FactValue | null {
  const s = raw.trim().toLowerCase();
  if (NUMERIC_CAMPOS.has(campo)) {
    const m = NUMBER_RX.exec(s);
    if (!m) return null;
    const v = parseFloat(m[0].replace(",", "."));
    return campo === "lugar.carriles_por_sentido" ? Math.trunc(v) : v;
  }
  if (BOOL_CAMPOS.has(campo)) return s in BOOLS ? BOOLS[s]! : null;
  if (campo === "vehiculo.color") return s || null;
  const canon = new Map(allowedValues()[campo]!.map((v) => [v.toLowerCase(), v]));
  return canon.get(s) ?? null;
}

/** Hechos a partir de la salida de Claude; las citas que no están literal bajan a supuesto. */
export function factsFromOutput(out: ClaudeOutput, text: string): [Facts, Conversion] {
  const conv: Conversion = {
    citas: 0,
    sin_cita_literal: 0,
    valores_invalidos: 0,
    preguntas: (out.preguntas ?? []).map(pyText).slice(0, 3),
  };
  const f = emptyFacts();
  const withCita = (valor: FactValue, cita: string): Fact => {
    conv.citas++;
    if (cita && text.includes(cita)) return fact(valor, cita, "relato");
    conv.sin_cita_literal++;
    return fact(valor, null, "supuesto");
  };
  (out.vehiculos ?? []).forEach((v, i) => {
    f.vehiculos.push(new Map());
    if (v.narrador && f.narradorVehiculo === null) f.narradorVehiculo = i;
  });
  const av = allowedValues();
  const roles = new Set(av["persona.rol"]);
  for (const p of out.personas ?? []) {
    if (typeof p.rol !== "string" || !roles.has(p.rol)) {
      conv.valores_invalidos++;
      continue;
    }
    const d = new Map<string, Fact>([["rol", withCita(p.rol, pyText(p.cita))]]);
    const k = pyInt(p.vehiculo, -1);
    if (k >= 0 && k < f.vehiculos.length) d.set("vehiculo", fact(k, null, "supuesto"));
    f.personas.push(d);
  }
  const disp = new Set(av["dispositivo.tipo"]);
  for (const d of out.dispositivos ?? []) {
    if (
      typeof d.tipo === "string" &&
      disp.has(d.tipo) &&
      f.dispositivos.every((x) => x.valor !== d.tipo)
    ) {
      f.dispositivos.push(withCita(d.tipo, pyText(d.cita)));
    }
  }
  const scalar = new Set<string>(SCALAR_CAMPOS);
  const vehicle = new Set<string>(VEHICLE_CAMPOS);
  for (const h of out.hechos ?? []) {
    const campo = pyText(h.campo);
    if (!CAMPOS.includes(campo)) {
      conv.valores_invalidos++;
      continue;
    }
    const valor = parseValue(campo, pyText(h.valor));
    if (valor === null) {
      conv.valores_invalidos++;
      continue;
    }
    const cita = pyText(h.cita);
    if (scalar.has(campo)) {
      if (!f.escalares.has(campo)) f.escalares.set(campo, withCita(valor, cita));
      continue;
    }
    const key = campo.split(".").slice(1).join(".");
    if (vehicle.has(campo)) {
      const k = pyInt(h.vehiculo, -1);
      if (!(k >= 0 && k < f.vehiculos.length)) {
        conv.valores_invalidos++;
        continue;
      }
      if (key === "zona_impacto") {
        if (!f.zonas.has(k)) f.zonas.set(k, withCita(valor, cita));
      } else if (!f.vehiculos[k]!.has(key)) {
        f.vehiculos[k]!.set(key, withCita(valor, cita));
      }
      continue;
    }
    const k = pyInt(h.persona, -1);
    if (!(k >= 0 && k < f.personas.length)) {
      conv.valores_invalidos++;
      continue;
    }
    if (!f.personas[k]!.has(key)) f.personas[k]!.set(key, withCita(valor, cita));
  }
  return [f, conv];
}
