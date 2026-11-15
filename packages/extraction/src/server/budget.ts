/**
 * Tope de gasto diario de la API de Claude (PLAN §16.4; `CROQUIS_LLM_DAILY_BUDGET_USD`).
 *
 * En Vercel no hay disco persistente: el gasto del día se lleva en Upstash Redis (Marketplace de
 * Vercel). En local y en la grabación de E1 se lleva en `grabaciones/gasto.json`, con el mismo
 * formato que la referencia Python ({fecha: usd}). En pruebas, en memoria.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Redis } from "@upstash/redis";
import { BudgetExceededError, costUsd, LLMError } from "../claude-output";

export interface BudgetStore {
  spentToday(): Promise<number>;
  /** Suma `usd` (puede ser negativo: el ajuste de una reserva) al día `day`, por omisión hoy. */
  charge(usd: number, day?: string): Promise<void>;
}

/** El día del tope corta a la medianoche del centro de México, no a la de UTC (las 18:00 de aquí). */
export const ZONA_DEL_TOPE = "America/Mexico_City";

const FECHA = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_DEL_TOPE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha AAAA-MM-DD en el centro de México (en la laptop, la de `datetime.date.today()`). */
export function today(now = new Date()): string {
  return FECHA.format(now);
}

function round8(x: number): number {
  return Number(x.toFixed(8));
}

export class MemoryBudgetStore implements BudgetStore {
  private readonly byDay = new Map<string, number>();
  spentToday(): Promise<number> {
    return Promise.resolve(this.byDay.get(today()) ?? 0);
  }
  charge(usd: number, day?: string): Promise<void> {
    const d = day ?? today();
    this.byDay.set(d, round8((this.byDay.get(d) ?? 0) + usd));
    return Promise.resolve();
  }
}

/** Libro `gasto.json` compartido con la referencia Python. */
export class FileBudgetStore implements BudgetStore {
  constructor(private readonly path: string) {}

  private read(): Record<string, number> {
    if (!existsSync(this.path)) return {};
    return JSON.parse(readFileSync(this.path, "utf-8")) as Record<string, number>;
  }

  spentToday(): Promise<number> {
    return Promise.resolve(this.read()[today()] ?? 0);
  }

  charge(usd: number, day?: string): Promise<void> {
    const data = this.read();
    const d = day ?? today();
    data[d] = round8((data[d] ?? 0) + usd);
    const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => (a < b ? -1 : 1)));
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
    return Promise.resolve();
  }
}

/** Gasto del día en Upstash Redis: una clave por día que caduca sola. */
export class RedisBudgetStore implements BudgetStore {
  constructor(
    private readonly redis: Pick<Redis, "get" | "incrbyfloat" | "expire">,
    private readonly prefix = "croquis:gasto",
  ) {}

  async spentToday(): Promise<number> {
    const v = await this.redis.get<string | number>(`${this.prefix}:${today()}`);
    return v === null ? 0 : Number(v);
  }

  async charge(usd: number, day?: string): Promise<void> {
    const key = `${this.prefix}:${day ?? today()}`;
    await this.redis.incrbyfloat(key, usd);
    await this.redis.expire(key, 3 * 24 * 3600);
  }
}

/** Upstash si está configurado (Vercel); si no, `null` y quien llama decide. */
export function redisFromEnv(env: NodeJS.ProcessEnv = process.env): Redis | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

/** Tope diario en USD; 0 o sin configurar = sin llamadas a la API. */
export function budgetUsd(env: NodeJS.ProcessEnv = process.env): number {
  const v = Number(env.CROQUIS_LLM_DAILY_BUDGET_USD ?? "0");
  return Number.isFinite(v) ? v : 0;
}

/** Tokens que se suman a la cota de entrada por lo que la API agrega al armar la petición. */
const MARGEN_DE_ENTRADA = 1000;

/**
 * Lo más que puede costar una llamada, para reservarlo antes de hacerla (auditoría del 2026-11-15,
 * I1). No es una estimación del costo: es una cota.
 * - Entrada: un token ocupa al menos un byte, así que los bytes de lo que se manda (instrucciones,
 *   mensaje y esquema) son más que sus tokens; se cobran al precio más caro de entrada (el de
 *   escribir la caché) y se les suma un margen por lo que la API agrega.
 * - Salida: `max_tokens` completo.
 * Si el respaldo del servidor atiende con un modelo más caro, el cobro real puede pasar de la
 * reserva; al terminar se cobra lo real.
 */
export function costoMaximoUsd(model: string, pedido: unknown, maxTokens: number): number {
  const bytes = Buffer.byteLength(JSON.stringify(pedido), "utf8");
  return costUsd(model, {
    input_tokens: 0,
    output_tokens: maxTokens,
    cache_creation_input_tokens: bytes + MARGEN_DE_ENTRADA,
    cache_read_input_tokens: 0,
  });
}

/**
 * Una llamada a Claude con el tope de gasto del día como tope de verdad: reserva lo más que puede
 * costar antes de llamar y, al terminar, deja cobrado lo que costó. Así varias peticiones a la vez
 * no pasan juntas del tope, y una llamada que falla después de que la API la cobró (negativa,
 * respuesta truncada, JSON inválido) también cuenta. Si la llamada falla sin costo conocido (la red,
 * un error de la API), la reserva se devuelve.
 *
 * El ajuste va al día de la reserva aunque la llamada cruce la medianoche.
 */
export async function conReserva<T>(
  store: BudgetStore,
  topeUsd: number,
  reservaUsd: number,
  llamada: () => Promise<T>,
  costoDe: (r: T) => number,
): Promise<T> {
  if (topeUsd <= 0 || (await store.spentToday()) >= topeUsd) {
    throw new BudgetExceededError("Se alcanzó el tope de gasto diario de la API de Claude.");
  }
  const dia = today();
  await store.charge(reservaUsd, dia);
  if ((await store.spentToday()) > topeUsd + 1e-9) {
    await store.charge(-reservaUsd, dia);
    throw new BudgetExceededError(
      "Lo que queda del tope de gasto diario de la API de Claude no alcanza para esta lectura.",
    );
  }
  try {
    const r = await llamada();
    await store.charge(costoDe(r) - reservaUsd, dia);
    return r;
  } catch (e) {
    await store.charge((e instanceof LLMError ? e.costoUsd : 0) - reservaUsd, dia);
    throw e;
  }
}
