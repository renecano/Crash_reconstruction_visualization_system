/**
 * Límite de peticiones por cliente y hora para las Route Handlers. En Vercel usa Upstash
 * (`@upstash/ratelimit`, ventana deslizante compartida entre instancias); en local, una ventana en
 * memoria del proceso.
 */
import { Ratelimit } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";

export interface RateLimiter {
  allow(key: string): Promise<boolean>;
}

/** Ventana deslizante de una hora en memoria (un solo proceso). */
export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  allow(key: string): Promise<boolean> {
    const t = this.now();
    const q = (this.hits.get(key) ?? []).filter((x) => t - x <= 3_600_000);
    if (q.length >= this.limit) {
      this.hits.set(key, q);
      return Promise.resolve(false);
    }
    q.push(t);
    this.hits.set(key, q);
    return Promise.resolve(true);
  }
}

export class UpstashRateLimiter implements RateLimiter {
  private readonly rl: Ratelimit;
  constructor(redis: Redis, limit: number, prefix: string) {
    this.rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, "1 h"), prefix });
  }
  async allow(key: string): Promise<boolean> {
    return (await this.rl.limit(key)).success;
  }
}
