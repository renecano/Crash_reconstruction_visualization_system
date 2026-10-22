/**
 * La lectura de un dictamen completo con Claude para el corpus (C0, `../corpus.ts`): la petición
 * (la misma para la API normal y para la de lotes), la lectura de la respuesta y su costo. Solo
 * para scripts locales: usa la llave de la API.
 */
import Anthropic from "@anthropic-ai/sdk";
import { costUsd, LLMError, PRICES } from "@croquis/extraction";
import { ESQUEMA_CORPUS, mensajeCorpus, SISTEMA_CORPUS, type SalidaCorpus } from "../corpus";
import { ESQUEMA_NARRACION, mensajeNarracion, SISTEMA_NARRACION } from "../narracion";
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

/** Una petición de lectura de un dictamen con salida estructurada; el sistema va en caché. */
export function pedidoLectura(
  sistema: string,
  mensaje: string,
  esquema: Record<string, unknown>,
  modelo = MODELO_CORPUS,
) {
  return {
    model: modelo,
    max_tokens: 32000,
    system: [
      {
        type: "text" as const,
        text: sistema,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [{ role: "user" as const, content: mensaje }],
    output_config: {
      effort: "medium" as const,
      format: { type: "json_schema" as const, schema: esquema },
    },
  };
}

/** La petición del corpus (C0) para un dictamen: reglas y glosario en caché. */
export function pedidoCorpus(textoDictamen: string, modelo = MODELO_CORPUS) {
  return pedidoLectura(SISTEMA_CORPUS, mensajeCorpus(textoDictamen), ESQUEMA_CORPUS, modelo);
}

/** La petición de la narración sin conclusiones y las conclusiones de CESVI (R0). */
export function pedidoNarracion(textoDictamen: string, modelo = MODELO_CORPUS) {
  return pedidoLectura(
    SISTEMA_NARRACION,
    mensajeNarracion(textoDictamen),
    ESQUEMA_NARRACION,
    modelo,
  );
}

export type Pedido = ReturnType<typeof pedidoLectura>;

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

export interface LecturaDictamen<T = SalidaCorpus> {
  salida: T;
  modeloRespuesta: string;
  uso: UsoTokens;
  costoUsd: number;
}

/** Costo de una respuesta; la API de lotes cobra la mitad de cada token. */
export function costoCorpus(modelo: string, uso: UsoTokens, lote: boolean): number {
  const c = costUsd(modelo in PRICES ? modelo : MODELO_CORPUS, uso);
  return lote ? Number((c / 2).toFixed(8)) : c;
}

/** La respuesta del modelo como salida estructurada (falla si se negó, se truncó o no es JSON). */
export function lecturaDeMensaje<T = SalidaCorpus>(
  r: MensajeFinal,
  lote: boolean,
): LecturaDictamen<T> {
  if (r.stop_reason === "refusal") {
    throw new LLMError(
      `El modelo declinó la petición (${JSON.stringify(r.stop_details ?? null)}).`,
    );
  }
  if (r.stop_reason === "max_tokens") throw new LLMError("La lectura se truncó en max_tokens.");
  const cuerpo = r.content.find((b) => b.type === "text")?.text ?? "";
  let salida: T;
  try {
    salida = JSON.parse(cuerpo) as T;
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
  return leerConPedido(pedidoCorpus(textoDictamen, modelo), cliente);
}

/** Manda una petición con la API normal y lee su salida estructurada. */
export async function leerConPedido<T = SalidaCorpus>(
  pedido: Pedido,
  cliente: ClienteClaude = new Anthropic(),
): Promise<LecturaDictamen<T>> {
  const stream = cliente.messages.stream(pedido);
  return lecturaDeMensaje<T>(await stream.finalMessage(), false);
}

/** Tokens de entrada de la petición de un dictamen (la API de conteo no cobra). */
export async function tokensDeEntrada(
  textoDictamen: string,
  cliente: ClienteClaude = new Anthropic(),
  modelo = MODELO_CORPUS,
): Promise<number> {
  return tokensDePedido(pedidoCorpus(textoDictamen, modelo), cliente);
}

/** Tokens de entrada de una petición (la API de conteo no cobra). */
export async function tokensDePedido(
  p: Pedido,
  cliente: ClienteClaude = new Anthropic(),
): Promise<number> {
  const r = await cliente.messages.countTokens({
    model: p.model,
    system: p.system,
    messages: p.messages,
    output_config: p.output_config,
  });
  return r.input_tokens;
}
