/**
 * De hechos a EscenaSpec, contrato v1 (port de `extraction/croquis_extraction/spec_builder.py`).
 *
 * Cada hecho con cita pasa como `fuente: relato` con su evidencia literal (posición del fragmento
 * en el relato, en puntos de código como en Python). Lo que el relato no dice se completa con
 * valores por omisión marcados `default` o `supuesto`, nunca como `relato`. La geometría es una
 * disposición genérica coherente con el tipo de choque, que se corrige en el croquis: el LLM y las
 * reglas no producen geometría.
 */
import { cpIndex, cpLength } from "./codepoints";
import { fact, type Fact, type Facts, type FactValue, stated } from "./facts";
import { sha256Hex } from "./hash";

type Json = Record<string, unknown>;

export const CREATED = "2026-10-13T00:00:00-06:00";
const CONF_STATED = 0.9;
const CONF_ASSUMED = 0.4;
const CONF_DEFAULT = 0.3;
const LETTERS = "ABCDEFGH";

export const COLOR_HEX: Readonly<Record<string, string>> = {
  blanco: "#f2f2f0",
  blanca: "#f2f2f0",
  negro: "#141414",
  negra: "#141414",
  gris: "#8a8d91",
  plata: "#c0c3c7",
  plateado: "#c0c3c7",
  plateada: "#c0c3c7",
  rojo: "#a8231c",
  roja: "#a8231c",
  azul: "#1f4e8c",
  verde: "#2f6b3a",
  amarillo: "#e3b51e",
  amarilla: "#e3b51e",
  naranja: "#d9701e",
  cafe: "#5a3b25",
  café: "#5a3b25",
  vino: "#5e1626",
  dorado: "#b8913a",
  dorada: "#b8913a",
  beige: "#d8c9a8",
  morado: "#5b3a7a",
  morada: "#5b3a7a",
};

/** Genéricos del relato → valor válido del contrato (pasa a supuesto con nota). */
const ENUM_FIX: ReadonlyMap<string, string> = new Map([
  ["lugar.tipo_via|interseccion", "interseccion_x"],
  ["entorno.clima|lluvia", "lluvia_ligera"],
  ["entorno.iluminacion|noche", "noche_con_alumbrado"],
  ["clase|suv_o_pickup", "suv_compacta"],
  ["clase|camion_o_autobus", "autobus"],
  ["maniobra|cambio_carril", "cambio_carril_izquierda"],
]);

export class EvidenceError extends Error {}

/** `str(x)` de Python para los valores de un hecho. */
export function pyStr(x: FactValue): string {
  if (typeof x === "boolean") return x ? "True" : "False";
  return String(x);
}

function evidence(text: string, cita: string): Json[] {
  const i = text.indexOf(cita);
  if (i < 0) throw new EvidenceError(`La cita no está en el relato: ${JSON.stringify(cita)}`);
  const inicio = cpIndex(text, i);
  return [{ inicio, fin: inicio + cpLength(cita), texto: cita }];
}

function fix(key: string, valor: FactValue): [FactValue, boolean] {
  if (typeof valor === "string") {
    const fixed = ENUM_FIX.get(`${key}|${valor}`);
    if (fixed !== undefined) return [fixed, true];
  }
  return [valor, false];
}

function campo(
  text: string,
  key: string,
  f: Fact | undefined,
  dflt: FactValue,
  extra?: Json,
): Json {
  let out: Json;
  if (f === undefined) {
    out = { valor: dflt, fuente: "default", confianza: CONF_DEFAULT };
  } else {
    const [valor, fixed] = fix(key, f.valor);
    const isStated = f.fuente === "relato" && f.cita !== null && !fixed;
    out = {
      valor,
      fuente: isStated ? "relato" : f.cita || fixed ? "supuesto" : f.fuente,
      confianza: isStated ? CONF_STATED : CONF_ASSUMED,
    };
    if (f.cita) out.evidencia = evidence(text, f.cita);
    if (fixed) {
      out.nota = `El relato dice '${pyStr(f.valor)}'; se precisó como '${pyStr(valor)}' (confírmalo).`;
    }
  }
  if (!["relato", "usuario", "supuesto", "default"].includes(out.fuente as string)) {
    out.fuente = "supuesto";
  }
  if (extra) Object.assign(out, extra);
  return out;
}

function proc(text: string, f: Fact | undefined): Json {
  if (f === undefined || !f.cita) {
    return { fuente: f ? "supuesto" : "default", confianza: f ? CONF_ASSUMED : CONF_DEFAULT };
  }
  return {
    fuente: f.fuente === "relato" ? "relato" : "supuesto",
    confianza: CONF_STATED,
    evidencia: evidence(text, f.cita),
  };
}

function pose(x: number, y: number, rumbo: number): Json {
  return {
    x,
    y,
    rumbo_deg: rumbo,
    procedencia: {
      fuente: "supuesto",
      confianza: 0.3,
      nota: "Disposición genérica; ajústala en el croquis.",
    },
  };
}

/** Poses genéricas (x, y, rumbo) que no se enciman y respetan el tipo de choque. */
function layout(n: number, zonas: Map<number, string>): [number, number, number][] {
  const poses: [number, number, number][] = [[-30.0, -1.75, 0.0]];
  const za = zonas.get(0);
  const zb = zonas.get(1);
  if (n >= 2) {
    if (za === "F" && zb === "B") poses.push([-12.0, -1.75, 0.0]);
    else if (za === "B" && zb === "F") poses.push([-48.0, -1.75, 0.0]);
    else if (za === "L" || za === "R" || zb === "L" || zb === "R") {
      poses.push([0.0, zb !== "R" ? -30.0 : 30.0, zb !== "R" ? 90.0 : -90.0]);
    } else if (za === "F" && zb === "F") poses.push([30.0, 1.75, 180.0]);
    else poses.push([25.0, 1.75, 180.0]);
  }
  for (let k = 2; k < n; k++) poses.push([-30.0 - 12.0 * k, -5.25, 0.0]);
  return poses;
}

export interface BuildOptions {
  specId: string;
  titulo?: string | null;
  origen?: string;
  sintetico?: boolean;
}

/** Semilla de la escena: los primeros 8 dígitos hex del SHA-256 del id, módulo un millón. */
export function seedFor(specId: string): number {
  return parseInt(sha256Hex(specId).slice(0, 8), 16) % 1_000_000;
}

export function buildSpec(facts: Facts, text: string, opts: BuildOptions): Json {
  const { specId, titulo = null, origen = "escrito", sintetico = true } = opts;
  const sc = facts.escalares;
  const lugar: Json = {
    tipo_via: campo(text, "lugar.tipo_via", sc.get("lugar.tipo_via"), "recta"),
    carriles_por_sentido: campo(
      text,
      "lugar.carriles_por_sentido",
      sc.get("lugar.carriles_por_sentido"),
      2,
    ),
    ancho_carril: { valor: 3.5, unidad: "m", fuente: "default", confianza: CONF_DEFAULT },
    sentidos: { valor: "doble_sentido", fuente: "default", confianza: CONF_DEFAULT },
    superficie: campo(text, "lugar.superficie", sc.get("lugar.superficie"), "asfalto"),
    estado_superficie: campo(
      text,
      "lugar.estado_superficie",
      sc.get("lugar.estado_superficie"),
      "seco",
    ),
  };
  if (facts.dispositivos.length > 0) {
    lugar.dispositivos = facts.dispositivos.map((d, i) => ({
      id: `disp-${i + 1}`,
      tipo: d.valor,
      posicion: { x: 0.0, y: 0.0 },
      procedencia: proc(text, d),
    }));
  }
  const entorno: Json = {
    clima: campo(text, "entorno.clima", sc.get("entorno.clima"), "despejado"),
    iluminacion: campo(text, "entorno.iluminacion", sc.get("entorno.iluminacion"), "dia"),
  };
  const objFact = sc.get("evento.objeto");
  const objetos: Json[] = [];
  if (objFact !== undefined) {
    objetos.push({
      id: "obj-1",
      tipo: objFact.valor,
      posicion: { x: 6.0, y: -6.0 },
      procedencia: proc(text, objFact),
    });
    entorno.objetos = objetos;
  }
  const n = Math.max(1, facts.vehiculos.length);
  const zonas = new Map<number, string>();
  for (const [k, v] of facts.zonas) zonas.set(k, pyStr(v.valor));
  const evFact = sc.get("evento.tipo");
  let tipoEvento = evFact ? pyStr(evFact.valor) : "";
  const poses = layout(n, zonas);
  const vehiculos: Json[] = [];
  for (let i = 0; i < n; i++) {
    const vf = facts.vehiculos[i] ?? new Map<string, Fact>();
    const letter = LETTERS[i]!;
    const maniobra = campo(text, "maniobra", vf.get("maniobra"), "recto");
    const quieto = maniobra.valor === "detenido" || maniobra.valor === "estacionado";
    const vel = vf.get("velocidad_kmh");
    const velocidad =
      vel !== undefined
        ? campo(text, "velocidad_kmh", vel, 0.0, { unidad: "km/h" })
        : {
            valor: quieto ? 0.0 : 40.0,
            unidad: "km/h",
            fuente: quieto ? "default" : "supuesto",
            confianza: CONF_DEFAULT,
          };
    const colorName = campo(text, "color", vf.get("color"), "gris");
    const [x, y, rumbo] = poses[i]!;
    const v: Json = {
      id: `veh-${letter.toLowerCase()}`,
      rol: letter,
      clase: campo(text, "clase", vf.get("clase"), "sedan_compacto"),
      color: {
        nombre: colorName,
        hex: COLOR_HEX[pyStr(colorName.valor as FactValue).toLowerCase()] ?? "#8a8d91",
      },
      maniobra,
      velocidad_previa: velocidad,
      posicion_inicial: pose(x, y, rumbo),
    };
    const fr = vf.get("frenado");
    if (fr !== undefined) v.frenado = { aplico: campo(text, "frenado", fr, false) };
    vehiculos.push(v);
  }
  const personas: Json[] = [];
  const seats = new Map<number, number>();
  const haveDriver = new Set<number>();
  for (const p of facts.personas) {
    const veh = p.get("vehiculo");
    if (veh !== undefined && p.get("rol")?.valor === "conductor") haveDriver.add(Number(veh.valor));
  }
  const plist = [...facts.personas];
  if (facts.narradorVehiculo !== null && !haveDriver.has(facts.narradorVehiculo)) {
    plist.unshift(
      new Map([
        ["rol", fact("conductor", null, "supuesto")],
        ["vehiculo", fact(facts.narradorVehiculo, null, "supuesto")],
      ]),
    );
  }
  plist.forEach((pf, j) => {
    const rol = campo(text, "rol", pf.get("rol"), "conductor");
    const p: Json = { id: `per-${j + 1}`, rol };
    const veh = pf.get("vehiculo");
    if (veh !== undefined && Number(veh.valor) < vehiculos.length) {
      const vi = Number(veh.valor);
      p.vehiculo_id = vehiculos[vi]!.id;
      const k = seats.get(vi) ?? 0;
      seats.set(vi, k + 1);
      if (rol.valor === "conductor" || rol.valor === "pasajero") {
        const seat =
          rol.valor === "conductor" ? "conductor" : k <= 1 ? "copiloto" : "trasero_derecho";
        p.asiento = { valor: seat, fuente: "supuesto", confianza: CONF_ASSUMED };
      }
      if (facts.narradorVehiculo === vi && rol.valor === "conductor") rol.nota = "narrador";
    } else if (rol.valor === "peaton" || rol.valor === "ciclista") {
      p.posicion_inicial = pose(0.0, -5.0, 90.0);
    }
    for (const key of ["cinturon", "casco"]) {
      const f = pf.get(key);
      if (f !== undefined) p[key] = campo(text, key, f, false);
    }
    personas.push(p);
  });
  for (const v of vehiculos) {
    const aboard = personas.filter((p) => p.vehiculo_id === v.id).map((p) => p.id);
    if (aboard.length > 0) v.ocupantes = aboard;
  }
  // Evento principal.
  let actores = vehiculos.slice(0, objetos.length === 0 ? 2 : 1).map((v) => v.id as string);
  const isFoot = (p: Json): boolean => {
    const r = (p.rol as Json).valor;
    return (r === "peaton" || r === "ciclista") && !("vehiculo_id" in p);
  };
  if (!tipoEvento) {
    if (objetos.length > 0) tipoEvento = "impacto_vehiculo_objeto";
    else if (personas.some(isFoot)) tipoEvento = "impacto_vehiculo_persona";
    else if (vehiculos.length >= 2) tipoEvento = "impacto_vehiculo_vehiculo";
    else tipoEvento = "derrape";
  }
  if (tipoEvento === "impacto_vehiculo_objeto" && objetos.length > 0) {
    actores = [vehiculos[0]!.id as string, objetos[0]!.id as string];
  } else if (tipoEvento === "impacto_vehiculo_persona") {
    const peaton = personas.find((p) => !("vehiculo_id" in p));
    actores = [vehiculos[0]!.id as string, ...(peaton ? [peaton.id as string] : [])];
  } else if (tipoEvento === "volcadura" || tipoEvento === "derrape") {
    actores = [vehiculos[0]!.id as string];
  }
  const evento: Json = {
    id: "ev-1",
    orden: 0,
    tipo: tipoEvento,
    actores,
    procedencia: proc(text, evFact),
  };
  if (zonas.size > 0) {
    const zi = [...zonas.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([i]) => i < vehiculos.length && actores.includes(vehiculos[i]!.id as string))
      .map(([i, lado]) => ({ vehiculo_id: vehiculos[i]!.id, cdc: { lado } }));
    if (zi.length > 0) evento.zonas_impacto = zi;
  }
  const evidencias: Json[] = [];
  const dp = sc.get("evidencias.distancia_proyeccion_m");
  if (dp !== undefined) {
    const e: Json = {
      id: "evid-proyeccion",
      tipo: "distancia_proyeccion",
      longitud: campo(text, "evidencias.distancia_proyeccion_m", dp, 0.0, { unidad: "m" }),
      procedencia: proc(text, dp),
    };
    const peaton = personas.find((p) => !("vehiculo_id" in p));
    if (peaton) e.persona_id = peaton.id;
    evidencias.push(e);
  }
  const mk = sc.get("evidencias.marcas_m");
  if (mk !== undefined) {
    const marcas: Json = { id: "evid-marcas", tipo: "marcas_frenado" };
    const pr = proc(text, mk);
    const fase = sc.get("evidencias.marcas_fase");
    if (fase !== undefined) {
      marcas.fase = fase.valor;
      // La cita de la fase va como segundo fragmento de la procedencia (`facts_from_spec`).
      if (fase.cita && stated(fase) && "evidencia" in pr) {
        pr.evidencia = [...(pr.evidencia as Json[]), ...evidence(text, fase.cita)];
      }
    }
    marcas.vehiculo_id = vehiculos[0]!.id;
    marcas.longitud = campo(text, "evidencias.marcas_m", mk, 0.0, { unidad: "m" });
    marcas.procedencia = pr;
    evidencias.push(marcas);
  }
  const meta: Json = {
    id: specId,
    version_esquema: "1.1.0",
    idioma: "es-MX",
    semilla: seedFor(specId),
    creado: CREATED,
    relato: text,
    origen_relato: origen,
    sintetico,
  };
  if (titulo) meta.titulo = titulo;
  return {
    meta,
    lugar,
    entorno,
    vehiculos,
    personas,
    eventos: [evento],
    danos_declarados: [],
    evidencias,
  };
}
