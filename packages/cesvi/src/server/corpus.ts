/**
 * La lectura de un dictamen completo con Claude para el corpus (C0, `../corpus.ts`): la petición
 * (la misma para la API normal y para la de lotes), la lectura de la respuesta y su costo. Solo
 * para scripts locales: usa la llave de la API.
 */
import Anthropic from "@anthropic-ai/sdk";
import { costUsd, LLMError, PRICES } from "@croquis/extraction";
import { ESQUEMA_CORPUS, mensajeCorpus, SISTEMA_CORPUS, type SalidaCorpus } from "../corpus";
import type { ClienteClaude } from "./consideraciones";

export const MODELO_CORPUS = "claude-sonnet-5-5";

/** Un cliente con reintentos generosos (el corpus manda cientos de peticiones). */
export function clienteCorpus(): Anthropic {
  return new Anthropic({ maxRetries: 8 });
}

export interface UsoTokens {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

/** La petición para un dictamen; el sistema (reglas y glosario) va en caché. */
export function pedidoCorpus(textoDictamen: string, modelo = MODELO_CORPUS) {
  return {
    model: modelo,
    max_tokens: 32000,
    system: [
      {
        type: "text" as const,
        text: SISTEMA_CORPUS,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [{ role: "user" as const, content: mensajeCorpus(textoDictamen) }],
    output_config: {
      effort: "medium" as const,
      format: { type: "json_schema" as const, schema: ESQUEMA_CORPUS },
    },
  };
}

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

export interface LecturaDictamen {
  salida: SalidaCorpus;
  modeloRespuesta: string;
  uso: UsoTokens;
  costoUsd: number;
}

/** Costo de una respuesta; la API de lotes cobra la mitad de cada token. */
export function costoCorpus(modelo: string, uso: UsoTokens, lote: boolean): number {
  const c = costUsd(modelo in PRICES ? modelo : MODELO_CORPUS, uso);
  return lote ? Number((c / 2).toFixed(8)) : c;
}

/** La respuesta del modelo como salida del corpus (falla si se negó, se truncó o no es JSON). */
export function lecturaDeMensaje(r: MensajeFinal, lote: boolean): LecturaDictamen {
  if (r.stop_reason === "refusal") {
    throw new LLMError(
      `El modelo declinó la petición (${JSON.stringify(r.stop_details ?? null)}).`,
    );
  }
  if (r.stop_reason === "max_tokens") throw new LLMError("La lectura se truncó en max_tokens.");
  const cuerpo = r.content.find((b) => b.type === "text")?.text ?? "";
  let salida: SalidaCorpus;
  try {
    salida = JSON.parse(cuerpo) as SalidaCorpus;
  } catch {
    throw new LLMError("La salida estructurada no es JSON válido.");
  }
  const uso: UsoTokens = {
    input_tokens: r.usage.input_tokens ?? 0,
    output_tokens: r.usage.output_tokens ?? 0,
    cache_creation_input_tokens: r.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: r.usage.cache_read_input_tokens ?? 0,
  };
  return { salida, modeloRespuesta: r.model, uso, costoUsd: costoCorpus(r.model, uso, lote) };
}

/** Lee un dictamen con la API normal (para el piloto). */
export async function leerDictamen(
  textoDictamen: string,
  cliente: ClienteClaude = new Anthropic(),
  modelo = MODELO_CORPUS,
): Promise<LecturaDictamen> {
  const stream = cliente.messages.stream(pedidoCorpus(textoDictamen, modelo));
  return lecturaDeMensaje(await stream.finalMessage(), false);
}

/** Tokens de entrada de la petición de un dictamen (la API de conteo no cobra). */
export async function tokensDeEntrada(
  textoDictamen: string,
  cliente: ClienteClaude = new Anthropic(),
  modelo = MODELO_CORPUS,
): Promise<number> {
  const p = pedidoCorpus(textoDictamen, modelo);
  const r = await cliente.messages.countTokens({
    model: p.model,
    system: p.system,
    messages: p.messages,
    output_config: p.output_config,
  });
  return r.input_tokens;
}
