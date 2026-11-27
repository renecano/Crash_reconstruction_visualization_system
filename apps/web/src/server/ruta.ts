/**
 * La ruta por las calles del trayecto previo (René, 2026-11-27: «el recorrido sigue las calles reales,
 * respetando sentidos»): de donde marcó el perito hasta donde empieza la reconstrucción. Usa el
 * enrutador OSRM sobre OpenStreetMap con el perfil de auto (respeta los sentidos únicos y las vueltas
 * prohibidas); ADR 0147. La respuesta se guarda (Redis o memoria) y la CDN la sirve 30 días.
 *
 * Es ilustrativa: no entra al solver ni a ninguna cifra.
 */
import { z } from "zod";
import {
  MemoryRateLimiter,
  type RateLimiter,
  redisFromEnv,
  UpstashRateLimiter,
} from "@croquis/extraction/server";
import { USER_AGENT } from "@/server/osm";

export const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
/** La ruta más larga que se traza (m, por las calles). */
export const RUTA_MAXIMA_M = 5500;
export const CACHE_DIAS_RUTA = 30;

const coordenada = z.coerce.number();
export const RutaIn = z.object({
  desde_lat: coordenada.min(-90).max(90),
  desde_lon: coordenada.min(-180).max(180),
  hasta_lat: coordenada.min(-90).max(90),
  hasta_lon: coordenada.min(-180).max(180),
});
export type RutaPedida = z.infer<typeof RutaIn>;

export interface RutaOut {
  /** La ruta como [lat, lon], del inicio al final. */
  puntos: [number, number][];
  distancia_m: number;
  /** La duración que estima el enrutador con las velocidades de cada calle (s): orientativa. */
  duracion_s: number;
  fuente: string;
}

export class RutaError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RutaDeps {
  fetcher: typeof fetch;
  cache: { get(k: string): Promise<RutaOut | null>; set(k: string, v: RutaOut): Promise<void> };
  limiter: RateLimiter;
}

export function defaultRutaDeps(env: NodeJS.ProcessEnv = process.env): RutaDeps {
  const redis = redisFromEnv(env);
  const porHora = Number(env.CROQUIS_RUTA_RATE_PER_HOUR ?? "60");
  const memoria = new Map<string, RutaOut>();
  return {
    fetcher: fetch,
    cache: redis
      ? {
          get: async (k) => (await redis.get<RutaOut>(k)) ?? null,
          set: async (k, v) => {
            await redis.set(k, v, { ex: CACHE_DIAS_RUTA * 86_400 });
          },
        }
      : {
          get: async (k) => memoria.get(k) ?? null,
          set: async (k, v) => {
            if (memoria.size > 200) memoria.clear();
            memoria.set(k, v);
          },
        },
    limiter: redis
      ? new UpstashRateLimiter(redis, porHora, "croquis:ruta")
      : new MemoryRateLimiter(porHora),
  };
}

const r5 = (x: number) => x.toFixed(5);
export const claveRuta = (p: RutaPedida) =>
  `croquis:ruta:${r5(p.desde_lat)},${r5(p.desde_lon)}:${r5(p.hasta_lat)},${r5(p.hasta_lon)}`;

/** La ruta en auto de `desde` a `hasta`, o un error claro. */
export async function rutaPorCalles(
  p: RutaPedida,
  cliente: string,
  deps: RutaDeps,
): Promise<RutaOut> {
  const clave = claveRuta(p);
  const guardada = await deps.cache.get(clave);
  if (guardada) return guardada;
  if (!(await deps.limiter.allow(cliente)))
    throw new RutaError(429, "Demasiadas rutas pedidas en una hora. Intenta más tarde.");
  const url = `${OSRM_URL}/${p.desde_lon},${p.desde_lat};${p.hasta_lon},${p.hasta_lat}?overview=full&geometries=geojson`;
  let r: Response;
  try {
    r = await deps.fetcher(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new RutaError(
      502,
      "No se pudo trazar la ruta por las calles: el enrutador no respondió.",
    );
  }
  if (!r.ok) throw new RutaError(502, `No se pudo trazar la ruta por las calles (${r.status}).`);
  const j = (await r.json()) as {
    code?: string;
    routes?: {
      distance: number;
      duration?: number;
      geometry: { coordinates: [number, number][] };
    }[];
  };
  const ruta = j.routes?.[0];
  if (j.code !== "Ok" || !ruta || ruta.geometry.coordinates.length < 2)
    throw new RutaError(404, "No hay una ruta por las calles entre esos dos puntos.");
  if (ruta.distance > RUTA_MAXIMA_M)
    throw new RutaError(
      422,
      `La ruta mide ${(ruta.distance / 1000).toFixed(1)} km por las calles: el recorrido llega hasta 5 km. Marca un inicio más cerca.`,
    );
  const salida: RutaOut = {
    puntos: ruta.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    distancia_m: ruta.distance,
    duracion_s: ruta.duration ?? 0,
    fuente: "OSRM sobre OpenStreetMap (© colaboradores de OpenStreetMap, ODbL)",
  };
  await deps.cache.set(clave, salida);
  return salida;
}
