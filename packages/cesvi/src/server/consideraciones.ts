/**
 * Borrador de las consideraciones de un dictamen con Claude (Hito 3, docs/cesvi/PROTOTIPO.md,
 * ADR 0051). Solo servidor: usa la llave de la API y el tope de gasto de `@croquis/extraction`.
 *
 * Claude redacta; no calcula. Recibe los números que ya calculó el módulo de cálculo y lo que marcó
 * el perito, y devuelve texto en el estilo de los dictámenes de CESVI, siempre como borrador. Al
 * volver, Croquis busca en el borrador cada número y avisa de los que no venían en los datos, para
 * que el perito los revise.
 */
import Anthropic from "@anthropic-ai/sdk";
import { costUsd, LLMError, PRICES } from "@croquis/extraction";
import type { BudgetStore } from "@croquis/extraction/server";

export const VERSION_PROMPT = "consideraciones-v1";

export const SISTEMA = `Eres asistente de redacción de los peritos de CESVI México. Redactas el BORRADOR del apartado «Consideraciones» de un dictamen técnico de hecho de tránsito, en el estilo de los dictámenes de CESVI: párrafos numerados (1., 2., …), impersonal y en tercera persona («se analizará», «se considera»), técnico y sobrio, en español de México.

Reglas:
- Usa solo los datos y los números que vienen en el mensaje, escritos como vienen. No calcules nada nuevo, no redondees distinto y no inventes medidas, velocidades, distancias, nombres, placas ni fechas.
- Si falta un dato, dilo así: «[el perito debe completar: …]».
- Orden: (1) la declaración del conductor, citada literalmente, y la dinámica que describe; (2) el análisis de las deformaciones: el método de McHenry, la fórmula con sus valores sustituidos, la energía y la velocidad de impacto; (3) el análisis del desplazamiento: la fórmula sustituida y la velocidad; (4) la comparación de las velocidades con el criterio que fijó el perito; (5) la correspondencia de daños: los criterios que marcó el perito y la ubicación de los daños; (6) la conclusión que validó el perito o, si no la hay, la sugerencia de Croquis, marcada como pendiente de validación.
- Cuando un número de Croquis difiere del impreso en el dictamen original, menciona los dos y su diferencia, como vienen en los datos.
- No atribuyas culpa ni responsabilidad legal: describe la mecánica del hecho.
- Responde solo con el texto de las consideraciones, sin título ni comentarios.`;

export interface Hechos {
  caso: string;
  [clave: string]: unknown;
}

/** El mensaje para Claude: los hechos del dictamen como JSON legible. */
export function mensaje(hechos: Hechos): string {
  return `Datos del dictamen ${hechos.caso} (calculados por el módulo de cálculo y marcados por el perito):\n\n${JSON.stringify(hechos, null, 2)}`;
}

const NUMERO = /\d+(?:[.,]\d+)?/g;
const norma = (t: string) => {
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? String(n) : t;
};

/**
 * Números del borrador que no aparecen en los datos. Se ignoran los enteros de un dígito
 * (numeración de párrafos, «2 arroyos», «4 medidas»), que no son cifras de un cálculo.
 */
export function numerosNoReconocidos(borrador: string, hechos: Hechos): string[] {
  const permitidos = new Set((JSON.stringify(hechos).match(NUMERO) ?? []).map(norma));
  const fuera = new Set<string>();
  for (const t of borrador.match(NUMERO) ?? []) {
    if (/^\d$/.test(t)) continue;
    if (!permitidos.has(norma(t))) fuera.add(t);
  }
  return [...fuera];
}

export interface Borrador {
  texto: string;
  numerosNoReconocidos: string[];
  modelo: string;
  modeloRespuesta: string;
  version: string;
  costoUsd: number;
  requestId: string | null;
}

export type ClienteClaude = Pick<Anthropic, "messages" | "beta">;

interface MensajeFinal {
  stop_reason: string | null;
  stop_details?: unknown;
  model: string;
  content: { type: string; text?: string }[];
  usage: {
    input_tokens: number | null;
    output_tokens: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
}

export interface OpcionesBorrador {
  modelo: string;
  presupuestoUsd: number;
  gasto: BudgetStore;
  cliente?: ClienteClaude;
}

/** Pide el borrador a Claude respetando el tope de gasto diario. */
export async function redactarConsideraciones(
  hechos: Hechos,
  o: OpcionesBorrador,
): Promise<Borrador> {
  if (!(o.modelo in PRICES)) throw new LLMError(`Modelo no soportado: ${o.modelo}`);
  if ((await o.gasto.spentToday()) >= o.presupuestoUsd) {
    throw new LLMError("Se alcanzó el tope de gasto diario de la API de Claude.");
  }
  const cliente = o.cliente ?? new Anthropic();
  const params = {
    model: o.modelo,
    max_tokens: 16000,
    system: [
      { type: "text" as const, text: SISTEMA, cache_control: { type: "ephemeral" as const } },
    ],
    messages: [{ role: "user" as const, content: mensaje(hechos) }],
    output_config: { effort: "medium" as const },
  };
  // Respaldo del servidor si los clasificadores declinan (como en las demás llamadas a Claude).
  const stream =
    o.modelo === "claude-sonnet-5-5"
      ? cliente.beta.messages.stream({
          ...params,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        } as unknown as Parameters<ClienteClaude["beta"]["messages"]["stream"]>[0])
      : cliente.messages.stream(params);
  const r = (await stream.finalMessage()) as unknown as MensajeFinal;
  if (r.stop_reason === "refusal") {
    throw new LLMError(
      `El modelo declinó la petición (${JSON.stringify(r.stop_details ?? null)}).`,
    );
  }
  if (r.stop_reason === "max_tokens") throw new LLMError("El borrador se truncó en max_tokens.");
  const texto = r.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  const usage = {
    input_tokens: r.usage.input_tokens ?? 0,
    output_tokens: r.usage.output_tokens ?? 0,
    cache_creation_input_tokens: r.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: r.usage.cache_read_input_tokens ?? 0,
  };
  const servido = String(r.model);
  const costo = costUsd(servido in PRICES ? servido : o.modelo, usage);
  await o.gasto.charge(costo);
  return {
    texto,
    numerosNoReconocidos: numerosNoReconocidos(texto, hechos),
    modelo: o.modelo,
    modeloRespuesta: servido,
    version: VERSION_PROMPT,
    costoUsd: costo,
    requestId: (stream as unknown as { request_id?: string | null }).request_id ?? null,
  };
}
