/**
 * Buscar el lugar del hecho (René, 2026-11-04, A1): `/api/lugar` consulta Nominatim desde el
 * servidor, con el User-Agent de Croquis, caché y límite por cliente, como pide su política de uso;
 * si Nominatim no responde, prueba Photon (komoot). Las coordenadas y los links de mapas no llegan
 * aquí: el navegador los interpreta (`lib/lugar-texto.ts`) y va directo al punto.
 *
 * Lo que se busca:
 * - **Carretera con kilómetro** («MEX 15D km 47+800»): la carretera dentro del municipio del caso
 *   (Nominatim con la caja del municipio y `bounded=1`). OpenStreetMap casi nunca tiene los postes
 *   de kilómetro, así que el resultado lo dice: el perito mueve el mapa hasta el punto.
 * - **Texto:** primero tal cual; si no hay nada (la descripción completa del lugar casi nunca se
 *   encuentra), la primera calle con el municipio; si tampoco, el municipio, avisando.
 */
import {
  MemoryRateLimiter,
  type RateLimiter,
  redisFromEnv,
  UpstashRateLimiter,
} from "@croquis/extraction/server";
import { z } from "zod";
import { interpretarLugar } from "@/lib/lugar-texto";

export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
export const PHOTON_URL = "https://photon.komoot.io/api/";
export const USER_AGENT =
  "Croquis/0.1 (reconstruccion ilustrativa de percances para peritos; https://croquis-sage.vercel.app)";
/** Caja de México para Photon (oeste, sur, este, norte). */
const MEXICO_BBOX = "-118.6,14.3,-86.5,32.8";
/** Nominatim pide como máximo una consulta por segundo: entre dos de la misma búsqueda, esto (ms). */
export const PAUSA_NOMINATIM_MS = 1100;
const ESPERA_MS = 8000;
export const CACHE_DIAS = 30;
const MEMORIA = 300;

export const LugarIn = z.object({
  q: z.string().trim().min(2).max(300),
  municipio: z.string().trim().max(120).optional(),
  estado: z.string().trim().max(80).optional(),
});
export type LugarConsulta = z.infer<typeof LugarIn>;

export interface ResultadoLugar {
  nombre: string;
  lat: number;
  lon: number;
}

export interface LugarOut {
  resultados: ResultadoLugar[];
  /** Qué se encontró, en palabras para el perito (si no fue exactamente lo que escribió). */
  aviso: string | null;
  fuente: "nominatim" | "photon" | null;
  cache: "hit" | "miss";
}

export interface LugarCache {
  get(key: string): Promise<LugarOut | null>;
  set(key: string, value: LugarOut): Promise<void>;
}

export class MemoryLugarCache implements LugarCache {
  private readonly m = new Map<string, LugarOut>();
  get(key: string): Promise<LugarOut | null> {
    return Promise.resolve(this.m.get(key) ?? null);
  }
  set(key: string, value: LugarOut): Promise<void> {
    this.m.set(key, value);
    if (this.m.size > MEMORIA) this.m.delete(this.m.keys().next().value!);
    return Promise.resolve();
  }
}

export interface LugarDeps {
  fetcher: typeof fetch;
  cache: LugarCache;
  limiter: RateLimiter;
  /** Pausa entre consultas a Nominatim (inyectable en las pruebas). */
  pausa?: (ms: number) => Promise<void>;
}

export function defaultLugarDeps(env: NodeJS.ProcessEnv = process.env): LugarDeps {
  const redis = redisFromEnv(env);
  const porHora = Number(env.CROQUIS_LUGAR_RATE_PER_HOUR ?? "60");
  return {
    fetcher: fetch,
    cache: redis
      ? {
          get: async (k) => (await redis.get<LugarOut>(k)) ?? null,
          set: async (k, v) => {
            await redis.set(k, v, { ex: CACHE_DIAS * 86_400 });
          },
        }
      : new MemoryLugarCache(),
    limiter: redis
      ? new UpstashRateLimiter(redis, porHora, "croquis:lugar")
      : new MemoryRateLimiter(porHora),
  };
}

export class LugarError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const normalizar = (s: string | undefined) =>
  (s ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

export function cacheKey(c: LugarConsulta): string {
  return `croquis:lugar:${normalizar(c.q)}|${normalizar(c.municipio)}|${normalizar(c.estado)}`;
}

/** La primera calle de una descripción: «Calle Azucena esquina con Av. Reforma, col. …» → «Calle Azucena». */
export function primeraCalle(texto: string): string {
  const corte = texto.split(
    /\s+(?:esquina\s+con|esq\.?|y\s+(?:la\s+)?(?:calle|av\.?|avenida)|entre|frente\s+a|a\s+la\s+altura\s+de)\s+|,|;/i,
  )[0];
  return (corte ?? texto)
    .replace(/^(?:en\s+)?(?:el\s+)?(?:crucero|cruce|intersecci[oó]n)\s+(?:de\s+)?(?:la\s+)?/i, "")
    .trim();
}

interface Nominatim {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string];
}

class SinServicio extends Error {}

async function nominatim(params: Record<string, string>, deps: LugarDeps): Promise<Nominatim[]> {
  const url = new URL(NOMINATIM_URL);
  for (const [k, v] of Object.entries({
    format: "jsonv2",
    limit: "5",
    countrycodes: "mx",
    "accept-language": "es",
    ...params,
  }))
    url.searchParams.set(k, v);
  let r: Response;
  try {
    r = await deps.fetcher(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(ESPERA_MS),
    });
  } catch {
    throw new SinServicio();
  }
  if (!r.ok) throw new SinServicio();
  const d = (await r.json().catch(() => null)) as Nominatim[] | null;
  if (!Array.isArray(d)) throw new SinServicio();
  return d;
}

async function photon(q: string, deps: LugarDeps): Promise<ResultadoLugar[]> {
  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "5");
  url.searchParams.set("bbox", MEXICO_BBOX);
  let r: Response;
  try {
    r = await deps.fetcher(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(ESPERA_MS),
    });
  } catch {
    throw new SinServicio();
  }
  if (!r.ok) throw new SinServicio();
  const d = (await r.json().catch(() => null)) as {
    features?: {
      geometry: { coordinates: [number, number] };
      properties: Record<string, string | undefined>;
    }[];
  } | null;
  if (!d || !Array.isArray(d.features)) throw new SinServicio();
  return d.features.map((f) => {
    const p = f.properties;
    const nombre = [p.name, p.street, p.district, p.city, p.state].filter(Boolean).join(", ");
    return { nombre: nombre || q, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
  });
}

const aResultados = (r: Nominatim[]): ResultadoLugar[] =>
  r.map((x) => ({ nombre: x.display_name, lat: Number(x.lat), lon: Number(x.lon) }));

/**
 * Busca el lugar. Usa la caché; Nominatim primero y, si no responde, Photon con la misma consulta.
 */
export async function buscarLugar(
  c: LugarConsulta,
  clientKey: string,
  deps: LugarDeps,
): Promise<LugarOut> {
  const key = cacheKey(c);
  const guardado = await deps.cache.get(key);
  if (guardado) return { ...guardado, cache: "hit" };
  if (!(await deps.limiter.allow(clientKey))) {
    throw new LugarError(
      429,
      "Demasiadas búsquedas en una hora. Mueve el mapa a mano hasta el lugar.",
    );
  }
  const pausa = deps.pausa ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let consultas = 0;
  const nom = async (params: Record<string, string>) => {
    if (consultas++ > 0) await pausa(PAUSA_NOMINATIM_MS);
    return nominatim(params, deps);
  };
  const zona = [c.municipio, c.estado].filter(Boolean).join(", ");
  const interpretado = interpretarLugar(c.q);
  let out: Omit<LugarOut, "cache">;
  try {
    out = await conNominatim(c, interpretado, zona, nom);
  } catch (e) {
    if (!(e instanceof SinServicio)) throw e;
    // Nominatim no respondió: Photon, con la carretera o el texto y la zona.
    const q =
      interpretado.tipo === "carretera"
        ? [interpretado.ref, zona].filter(Boolean).join(", ")
        : [c.q, zona].filter(Boolean).join(", ");
    try {
      const resultados = await photon(q, deps);
      out = {
        resultados,
        aviso: resultados.length ? null : "No se encontró. Prueba con la calle y el municipio.",
        fuente: "photon",
      };
    } catch {
      throw new LugarError(
        502,
        "Los buscadores de OpenStreetMap no respondieron. Mueve el mapa a mano hasta el lugar o pega las coordenadas.",
      );
    }
  }
  const final: LugarOut = { ...out, cache: "miss" };
  if (final.resultados.length) await deps.cache.set(key, final);
  return final;
}

async function conNominatim(
  c: LugarConsulta,
  interpretado: ReturnType<typeof interpretarLugar>,
  zona: string,
  nom: (params: Record<string, string>) => Promise<Nominatim[]>,
): Promise<Omit<LugarOut, "cache">> {
  if (interpretado.tipo === "carretera") {
    const km = interpretado.km !== null ? `el km ${interpretado.km}` : "el kilómetro";
    if (zona) {
      const [mun] = await nom({ q: zona, limit: "1" });
      const bb = mun?.boundingbox;
      if (mun && bb) {
        // boundingbox de Nominatim: sur, norte, oeste, este; viewbox: oeste, norte, este, sur.
        const viewbox = `${bb[2]},${bb[1]},${bb[3]},${bb[0]}`;
        const tramos = await nom({ q: interpretado.ref, viewbox, bounded: "1" });
        if (tramos.length)
          return {
            resultados: aResultados(tramos),
            aviso: `La ${interpretado.ref} dentro de ${zona}. OpenStreetMap no tiene ${km}: mueve el mapa por la carretera hasta el punto.`,
            fuente: "nominatim",
          };
        return {
          resultados: aResultados([mun]),
          aviso: `No se encontró la ${interpretado.ref} dentro de ${zona}: el mapa queda en el municipio.`,
          fuente: "nominatim",
        };
      }
    }
    const tramos = await nom({ q: interpretado.ref });
    return {
      resultados: aResultados(tramos),
      aviso: tramos.length
        ? `La ${interpretado.ref}; el caso no dice el municipio y OpenStreetMap no tiene ${km}.`
        : "No se encontró la carretera. Prueba con el municipio.",
      fuente: "nominatim",
    };
  }
  // La zona se agrega solo si el texto no la trae ya (el diálogo abre con la descripción completa).
  const yaTraeZona = !c.municipio || normalizar(c.q).includes(normalizar(c.municipio));
  const exacto = await nom({ q: yaTraeZona || !zona ? c.q : `${c.q}, ${zona}` });
  if (exacto.length) return { resultados: aResultados(exacto), aviso: null, fuente: "nominatim" };
  const calle = primeraCalle(c.q);
  if (calle && calle !== c.q) {
    const r = await nom({ q: [calle, zona].filter(Boolean).join(", ") });
    if (r.length)
      return {
        resultados: aResultados(r),
        aviso: `No se encontró el lugar completo; se buscó «${calle}»${zona ? ` en ${zona}` : ""}.`,
        fuente: "nominatim",
      };
  }
  if (zona) {
    const r = await nom({ q: zona, limit: "1" });
    if (r.length)
      return {
        resultados: aResultados(r),
        aviso: `No se encontró la calle: el mapa queda en ${zona}. Muévelo hasta el lugar.`,
        fuente: "nominatim",
      };
  }
  return {
    resultados: [],
    aviso:
      "No se encontró. Prueba con la calle y el municipio, o pega las coordenadas o un link de Google Maps.",
    fuente: "nominatim",
  };
}
