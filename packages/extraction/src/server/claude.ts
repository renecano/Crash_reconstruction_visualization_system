/**
 * Llamada a Claude con salida estructurada (port de la parte de red de
 * `extraction/croquis_extraction/claude_client.py`), con streaming para que la función de Vercel
 * entregue progreso desde el primer momento.
 *
 * Modos (`CROQUIS_LLM_MODO`):
 * - `replay` (por omisión; el único que usa CI): lee la respuesta grabada.
 * - `record`: llama a la API, guarda la respuesta y descuenta el gasto del tope diario.
 * - `live`: llama a la API sin grabar (la página del relato con llave configurada).
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  BudgetExceededError,
  costUsd,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  LLMError,
  MAX_TOKENS,
  outputSchema,
  PRICES,
  PROMPT_VERSION,
  promptFingerprint,
  systemPrompt,
  type ClaudeOutput,
} from "../claude-output";
import { sha256Hex } from "../hash";
import { budgetUsd, type BudgetStore } from "./budget";
import { loadRecording, RECORDINGS, saveRecording, type Recording } from "./recordings";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type Mode = "replay" | "record" | "live";

/** Progreso de la extracción mientras el modelo escribe (caracteres de salida recibidos). */
export type Progress = (chars: number) => void;

/** Lo que se usa del SDK; las pruebas inyectan un doble con la misma forma. */
export type ClientLike = Pick<Anthropic, "messages" | "beta">;

interface FinalLike {
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

interface StreamLike {
  on(event: "text", listener: (delta: string, snapshot: string) => void): unknown;
  finalMessage(): Promise<FinalLike>;
  readonly request_id?: string | null;
}

/** "2026-10-14T21:05:00+00:00", como `isoformat(timespec="seconds")` en UTC. */
function isoSeconds(d = new Date()): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

/** Una petición a la API con salida estructurada; devuelve el registro (sin escribirlo). */
export async function callClaude(
  client: ClientLike,
  text: string,
  model: string = DEFAULT_MODEL,
  effort: Effort = DEFAULT_EFFORT,
  onProgress?: Progress,
): Promise<Recording> {
  if (!(model in PRICES)) throw new LLMError(`Modelo no soportado: ${model}`);
  const params = {
    model,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text" as const,
        text: systemPrompt(),
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [{ role: "user" as const, content: `Relato:\n\n${text}` }],
    output_config: {
      effort,
      format: { type: "json_schema" as const, schema: outputSchema() },
    },
  };
  const t0 = performance.now();
  // Respaldo del servidor si los clasificadores declinan (el servidor elige el modelo).
  const stream = (model === "claude-sonnet-5-5"
    ? client.beta.messages.stream({
        ...params,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
    : client.messages.stream(params)) as unknown as StreamLike;
  if (onProgress) stream.on("text", (_delta, snapshot) => onProgress(snapshot.length));
  const resp = await stream.finalMessage();
  const latencyMs = performance.now() - t0;
  if (resp.stop_reason === "refusal") {
    throw new LLMError(
      `El modelo declinó la petición (${JSON.stringify(resp.stop_details ?? null)}).`,
    );
  }
  if (resp.stop_reason === "max_tokens")
    throw new LLMError("La respuesta se truncó en max_tokens.");
  const body = resp.content.find((b) => b.type === "text")?.text ?? "";
  let salida: ClaudeOutput;
  try {
    salida = JSON.parse(body) as ClaudeOutput;
  } catch {
    throw new LLMError("La salida estructurada no es JSON válido.");
  }
  const u = resp.usage;
  const usage = {
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
  };
  const served = String(resp.model);
  const priced = served in PRICES ? served : model;
  return {
    modelo: model,
    modelo_respuesta: served,
    prompt: PROMPT_VERSION,
    huella_prompt: promptFingerprint(),
    esfuerzo: effort,
    texto_sha256: sha256Hex(text),
    salida,
    usage,
    latencia_ms: Math.round(latencyMs * 10) / 10,
    // Si el respaldo sirvió con un modelo sin precio registrado, se estima con el pedido.
    costo_usd: costUsd(priced, usage),
    costo_estimado_con: priced,
    request_id: stream.request_id ?? null,
    grabado: isoSeconds(),
  };
}

export interface ExtractOptions {
  mode?: Mode;
  client?: ClientLike;
  root?: string;
  effort?: Effort;
  /** Tope diario en USD; por omisión `CROQUIS_LLM_DAILY_BUDGET_USD`. */
  budget?: number;
  budgetStore: BudgetStore;
  onProgress?: Progress;
}

/** Registro de extracción para `text` (ya redactado) según el modo. */
export async function extract(
  text: string,
  key: string,
  model: string,
  opts: ExtractOptions,
): Promise<Recording> {
  const mode = opts.mode ?? ((process.env.CROQUIS_LLM_MODO as Mode | undefined) || "replay");
  const root = opts.root ?? RECORDINGS;
  if (mode === "replay") return loadRecording(model, key, text, root);
  if (mode !== "record" && mode !== "live") throw new LLMError(`Modo desconocido: ${String(mode)}`);
  const cap = opts.budget ?? budgetUsd();
  if (cap <= 0 || (await opts.budgetStore.spentToday()) >= cap) {
    throw new BudgetExceededError(
      `Tope de gasto diario alcanzado o sin configurar (CROQUIS_LLM_DAILY_BUDGET_USD=${cap}).`,
    );
  }
  const client = opts.client ?? new Anthropic();
  const rec = await callClaude(client, text, model, opts.effort ?? DEFAULT_EFFORT, opts.onProgress);
  await opts.budgetStore.charge(rec.costo_usd);
  if (mode === "record") saveRecording(rec, key, root);
  return rec;
}
