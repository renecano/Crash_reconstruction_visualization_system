/**
 * Lógica de las rutas del relato (Route Handlers de Next.js en Vercel; antes FastAPI).
 *
 * El navegador ya redactó el texto; aquí se vuelve a redactar como defensa en profundidad. La
 * extracción usa Claude con salida estructurada si hay llave y tope de gasto (y, en Vercel,
 * almacenamiento para llevarlo); si no, la línea base de reglas. Siempre termina en el mismo
 * constructor de EscenaSpec y el verificador de evidencia, y propone la primera ronda de preguntas.
 *
 * Solo servidor: usa la llave de la API y el tope de gasto. No se importa desde componentes.
 */
import {
  ask,
  buildSpec,
  extractSpec,
  factsFromOutput,
  findTerms,
  LLMError,
  preguntaToDict,
  redact,
  sha256Hex,
  verifySpec,
} from "@croquis/extraction";
import {
  type BudgetStore,
  type ClientLike,
  extract,
  FileBudgetStore,
  MemoryRateLimiter,
  RECORDINGS,
  type RateLimiter,
  redisFromEnv,
  RedisBudgetStore,
  UpstashRateLimiter,
} from "@croquis/extraction/server";
import { InvalidSpecError, responder, type ResponderOut } from "@/lib/responder";
import { join } from "node:path";
import { z } from "zod";

type Json = Record<string, unknown>;

export const MAX_TEXT = 5000;

export const ExtraerIn = z.object({
  texto: z.string().min(1).max(MAX_TEXT),
  metodo: z.enum(["auto", "reglas", "claude"]).default("auto"),
});

export const ResponderIn = z.object({
  spec: z.record(z.string(), z.unknown()),
  texto: z.string().max(MAX_TEXT).nullish(),
  respuestas: z.record(z.string(), z.unknown()).default({}),
  contestadas: z.array(z.string()).default([]),
});

export interface Settings {
  apiKey: string;
  model: string;
  budgetUsd: number;
  rateLimitPerHour: number;
  /** En Vercel no hay disco: sin Upstash no se puede llevar el gasto y Claude queda apagado. */
  onVercel: boolean;
  hasRedis: boolean;
}

export function settingsFromEnv(env: NodeJS.ProcessEnv = process.env): Settings {
  const budget = Number(env.CROQUIS_LLM_DAILY_BUDGET_USD ?? "2");
  const rate = Number(env.CROQUIS_LLM_RATE_LIMIT_PER_HOUR ?? "20");
  return {
    apiKey: env.ANTHROPIC_API_KEY ?? "",
    model: env.CROQUIS_LLM_MODEL || "claude-sonnet-5-5",
    budgetUsd: Number.isFinite(budget) ? budget : 0,
    rateLimitPerHour: Number.isFinite(rate) ? rate : 20,
    onVercel: Boolean(env.VERCEL),
    hasRedis: redisFromEnv(env) !== null,
  };
}

/** Por qué no se puede usar Claude (o null si sí se puede). */
export function llmUnavailable(s: Settings): string | null {
  if (!s.apiKey || s.budgetUsd <= 0) return "Claude no está configurado en este servidor";
  if (s.onVercel && !s.hasRedis) {
    return "falta el almacenamiento del tope de gasto (Upstash) en este despliegue";
  }
  return null;
}

export interface Deps {
  settings: Settings;
  budgetStore: BudgetStore;
  limiter: RateLimiter;
  /** Cliente de Anthropic (las pruebas inyectan un doble). */
  client?: ClientLike;
}

let shared: Deps | null = null;

/** Dependencias de producción: Upstash en Vercel; el libro `gasto.json` y memoria en local. */
export function defaultDeps(): Deps {
  if (shared) return shared;
  const settings = settingsFromEnv();
  const redis = redisFromEnv();
  shared = {
    settings,
    budgetStore: redis
      ? new RedisBudgetStore(redis)
      : new FileBudgetStore(join(RECORDINGS, "gasto.json")),
    limiter: redis
      ? new UpstashRateLimiter(redis, settings.rateLimitPerHour, "croquis:relato")
      : new MemoryRateLimiter(settings.rateLimitPerHour),
  };
  return shared;
}

export interface Termino {
  id: string;
  texto: string;
  inicio: number;
  fin: number;
  ambiguo: boolean;
  pregunta: string | null;
}

export interface ExtraerOut {
  spec: Json;
  texto: string;
  metodo: "reglas" | "claude";
  motivo: string | null;
  redacciones_servidor: number;
  verificador: { revisados: number; corregidos: number; degradados: number };
  /** Posiciones en unidades UTF-16 sobre `texto` (las que usa el navegador para resaltar). */
  glosario: Termino[];
  preguntas: Json[];
}

export type ExtraerEvent =
  | { tipo: "inicio"; metodo: "reglas" | "claude" }
  | { tipo: "progreso"; caracteres: number }
  | { tipo: "resultado"; datos: ExtraerOut }
  | { tipo: "error"; mensaje: string };

/** Extracción como secuencia de eventos (la ruta los emite como NDJSON, uno por línea). */
export async function* extraerEventos(
  body: z.infer<typeof ExtraerIn>,
  clientKey: string,
  deps: Deps,
): AsyncGenerator<ExtraerEvent> {
  const red = redact(body.texto);
  const text = red.text;
  const specId = "relato-" + sha256Hex(text).slice(0, 12);
  const s = deps.settings;
  let motivo: string | null = null;
  let spec: Json | null = null;
  const unavailable = llmUnavailable(s);
  const wantsClaude = body.metodo === "claude" || (body.metodo === "auto" && unavailable === null);
  if (wantsClaude && unavailable !== null) {
    motivo = `${capitalize(unavailable)}; se usó la línea base de reglas.`;
  } else if (wantsClaude) {
    if (!(await deps.limiter.allow(clientKey))) {
      motivo = "Límite de peticiones por hora alcanzado; se usó la línea base de reglas.";
    } else {
      yield { tipo: "inicio", metodo: "claude" };
      const progress: number[] = [];
      try {
        const pending = extract(text, specId, s.model, {
          mode: "live",
          client: deps.client,
          budget: s.budgetUsd,
          budgetStore: deps.budgetStore,
          onProgress: (n) => progress.push(n),
        });
        // Emite el progreso mientras el modelo escribe.
        let done = false;
        const finished = pending.finally(() => {
          done = true;
        });
        while (!done) {
          await Promise.race([finished, new Promise((r) => setTimeout(r, 250))]);
          const last = progress[progress.length - 1];
          if (last !== undefined) {
            progress.length = 0;
            yield { tipo: "progreso", caracteres: last };
          }
        }
        const rec = await finished;
        const [facts] = factsFromOutput(rec.salida, text);
        spec = buildSpec(facts, text, { specId, origen: "escrito", sintetico: false });
      } catch (e) {
        if (!(e instanceof LLMError)) throw e;
        motivo = `Claude no respondió (${e.message}); se usó la línea base de reglas.`;
      }
    }
  }
  const metodo: "reglas" | "claude" = spec !== null ? "claude" : "reglas";
  if (spec === null) {
    yield { tipo: "inicio", metodo: "reglas" };
    spec = extractSpec(text, specId);
  }
  const [verified, stats] = verifySpec(spec, text);
  const glosario = findTerms(text).map((t) => ({
    id: t.id,
    texto: t.texto,
    inicio: t.start,
    fin: t.end,
    ambiguo: t.ambiguo,
    pregunta: t.pregunta,
  }));
  yield {
    tipo: "resultado",
    datos: {
      spec: verified,
      texto: text,
      metodo,
      motivo,
      redacciones_servidor: red.spans.length,
      verificador: stats,
      glosario,
      preguntas: ask(verified, text).map(preguntaToDict),
    },
  };
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export { InvalidSpecError, type ResponderOut };

/** Aplica las respuestas (como dato de la persona) y propone la siguiente ronda. */
export function responderRelato(body: z.infer<typeof ResponderIn>): ResponderOut {
  const text = body.texto ? redact(body.texto).text : null;
  return responder(body.spec, text, body.respuestas, body.contestadas);
}

/** Cliente para el límite de peticiones: la primera IP de `x-forwarded-for` (Vercel la llena). */
export function clientKeyFrom(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "anon";
}
