/**
 * Calles reales de OpenStreetMap para una escena del usuario (ADR 0040).
 *
 * El navegador pide las calles alrededor de unas coordenadas; aquí se consulta Overpass con la
 * misma consulta que los extractos versionados (`overpassQuery`) y se devuelve su respuesta. Cada
 * punto se consulta una vez: la respuesta se cachea en Redis (si está configurado) o en memoria, y
 * en la CDN de Vercel (`Cache-Control`). Con eso el uso cabe holgado en la política del servidor
 * público (muy por debajo de 10,000 consultas al día, sin uso comercial).
 *
 * Solo servidor. La conversión a `lugar.red_vial` la hace el navegador (`applyMap`), para que el
 * resultado sea idéntico al de las escenas canónicas.
 */
import { overpassQuery, type OverpassResponse } from "@croquis/croquis-2d";
import {
  MemoryRateLimiter,
  type RateLimiter,
  redisFromEnv,
  UpstashRateLimiter,
} from "@croquis/extraction/server";
import { z } from "zod";

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
/**
 * Instancias públicas de Overpass, en orden: la principal y dos espejos públicos de la lista de la
 * wiki de OSM. Las públicas se saturan seguido (ADR 0040): si una no responde, se prueba la
 * siguiente.
 */
export const OVERPASS_URLS = [
  OVERPASS_URL,
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
] as const;
/** Espera por instancia (s): las tres caben en el límite de 60 s de la función. */
export const TIMEOUT_S = 15;
export const USER_AGENT =
  "Croquis/0.1 (reconstruccion ilustrativa de percances; proyecto academico)";
/** Días que se guarda la respuesta de un punto: las calles cambian poco. */
export const CACHE_DAYS = 30;
const MEMORY_ENTRIES = 200;

export const OsmIn = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  radio: z.coerce.number().int().min(50).max(300).default(150),
});

export interface OsmCache {
  get(key: string): Promise<OverpassResponse | null>;
  set(key: string, value: OverpassResponse): Promise<void>;
}

/** Caché en memoria del proceso, con un tope de entradas (la más vieja sale primero). */
export class MemoryOsmCache implements OsmCache {
  private readonly m = new Map<string, OverpassResponse>();
  get(key: string): Promise<OverpassResponse | null> {
    return Promise.resolve(this.m.get(key) ?? null);
  }
  set(key: string, value: OverpassResponse): Promise<void> {
    this.m.set(key, value);
    if (this.m.size > MEMORY_ENTRIES) this.m.delete(this.m.keys().next().value!);
    return Promise.resolve();
  }
}

export interface OsmDeps {
  fetcher: typeof fetch;
  cache: OsmCache;
  limiter: RateLimiter;
}

export function defaultOsmDeps(env: NodeJS.ProcessEnv = process.env): OsmDeps {
  const redis = redisFromEnv(env);
  const perHour = Number(env.CROQUIS_OSM_RATE_PER_HOUR ?? "60");
  return {
    fetcher: fetch,
    cache: redis
      ? {
          get: async (k) => (await redis.get<OverpassResponse>(k)) ?? null,
          set: async (k, v) => {
            await redis.set(k, v, { ex: CACHE_DAYS * 86_400 });
          },
        }
      : new MemoryOsmCache(),
    limiter: redis
      ? new UpstashRateLimiter(redis, perHour, "croquis:osm")
      : new MemoryRateLimiter(perHour),
  };
}

/** Clave de caché: el punto redondeado a ~1 m (5 decimales) y el radio. */
export function cacheKey(lat: number, lon: number, radio: number): string {
  return `croquis:osm:${lat.toFixed(5)}:${lon.toFixed(5)}:${radio}`;
}

export class OsmError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface OsmOut {
  respuesta: OverpassResponse;
  cache: "hit" | "miss";
  /** Host de la instancia de Overpass que respondió; null si salió de la caché. */
  instancia: string | null;
}

/**
 * Respuesta de Overpass para el punto. Usa la caché; si una instancia está saturada (429 o 5xx) o
 * no responde a tiempo, prueba la siguiente. Un error de la consulta (4xx) no se reintenta.
 */
export async function callesCerca(
  input: z.infer<typeof OsmIn>,
  clientKey: string,
  deps: OsmDeps,
): Promise<OsmOut> {
  const lat = Number(input.lat.toFixed(5));
  const lon = Number(input.lon.toFixed(5));
  const key = cacheKey(lat, lon, input.radio);
  const cached = await deps.cache.get(key);
  if (cached) return { respuesta: cached, cache: "hit", instancia: null };
  if (!(await deps.limiter.allow(clientKey))) {
    throw new OsmError(429, "Demasiadas consultas al mapa en una hora. Intenta más tarde.");
  }
  const body = new URLSearchParams({ data: overpassQuery(lat, lon, input.radio) });
  for (const url of OVERPASS_URLS) {
    let res: Response;
    try {
      res = await deps.fetcher(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(TIMEOUT_S * 1000),
      });
    } catch {
      continue; // sin respuesta a tiempo o sin red: la siguiente instancia
    }
    if (res.ok) {
      let respuesta: OverpassResponse;
      try {
        respuesta = (await res.json()) as OverpassResponse;
      } catch {
        continue;
      }
      if (!Array.isArray(respuesta.elements)) continue;
      await deps.cache.set(key, respuesta);
      return { respuesta, cache: "miss", instancia: new URL(url).host };
    }
    if (res.status !== 429 && res.status < 500) break;
  }
  throw new OsmError(
    502,
    "OpenStreetMap no respondió: sus servidores públicos están saturados. Intenta en unos minutos; " +
      "las escenas que ya tienen sus calles no lo necesitan.",
  );
}
