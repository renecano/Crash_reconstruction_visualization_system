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

export interface BudgetStore {
  spentToday(): Promise<number>;
  charge(usd: number): Promise<void>;
}

/** Fecha local AAAA-MM-DD (como `datetime.date.today().isoformat()`). */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function round8(x: number): number {
  return Number(x.toFixed(8));
}

export class MemoryBudgetStore implements BudgetStore {
  private readonly byDay = new Map<string, number>();
  spentToday(): Promise<number> {
    return Promise.resolve(this.byDay.get(today()) ?? 0);
  }
  charge(usd: number): Promise<void> {
    const d = today();
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

  charge(usd: number): Promise<void> {
    const data = this.read();
    const d = today();
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

  async charge(usd: number): Promise<void> {
    const key = `${this.prefix}:${today()}`;
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
