/**
 * Buscar el lugar del hecho (René, 2026-11-04, A1; 2026-11-18, B5): `/api/lugar` consulta Nominatim
 * desde el servidor, con el User-Agent de Croquis, caché y límite por cliente, como pide su política
 * de uso; si Nominatim no responde, prueba Photon (komoot). Las coordenadas y los links de mapas no
 * llegan aquí: el navegador los interpreta (`lib/lugar-texto.ts`) y va directo al punto.
 *
 * Siempre en México, y primero dentro de lo que ya se sabe del caso (B5: un choque en San Luis Potosí
 * caía en la CDMX):
 * - **La zona:** el municipio y el estado del caso; si el caso no los trae, los del texto
 *   («…, Mazatlán, Sinaloa»).
 * - **El área:** se ubica el municipio (o el estado) y la calle se busca solo dentro de su caja
 *   (`viewbox` con `bounded=1`). Si en el municipio no aparece, se busca en el estado, avisando.
 * - **Qué se busca, en orden:** el texto como está, la primera calle con la colonia, la primera calle,
 *   la segunda calle («esquina con…») y la colonia. Si nada aparece, el municipio, avisando.
 * - **Varias opciones** con su municipio y su estado, para que el perito elija; nunca salta a la
 *   primera.
 * - **Carretera con kilómetro** («MEX 15D km 47+800»): la carretera dentro del municipio.
 *   OpenStreetMap casi nunca tiene los postes de kilómetro, así que el resultado lo dice.
 */
import {
  MemoryRateLimiter,
  type RateLimiter,
  redisFromEnv,
  UpstashRateLimiter,
} from "@croquis/extraction/server";
import { z } from "zod";
import { interpretarLugar } from "@/lib/lugar-texto";

import { crucesPorNombre, patronDeNombres } from "./cruces";

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
/** Cuántas opciones se muestran. */
export const OPCIONES = 5;

export const LugarIn = z.object({
  q: z.string().trim().min(2).max(300),
  municipio: z.string().trim().max(120).optional(),
  estado: z.string().trim().max(80).optional(),
});
export type LugarConsulta = z.infer<typeof LugarIn>;

export interface ResultadoLugar {
  /** La calle y la colonia (o lo que nombre el lugar). */
  nombre: string;
  lat: number;
  lon: number;
  /** El municipio (o la alcaldía) y el estado donde cae, para que el perito elija bien. */
  municipio?: string;
  estado?: string;
  /**
   * Qué tan preciso es (revisión de la cadena, René 2026-11-24): el cruce de dos vías, una calle, o
   * solo una zona (colonia, pueblo, municipio). Sobre una zona La escena no arma la escena sola: el
   * centro de una colonia no es el lugar del choque.
   */
  precision?: "cruce" | "calle" | "zona";
}

export interface LugarOut {
  resultados: ResultadoLugar[];
  /** Qué se encontró, en palabras para el perito (si no fue exactamente lo que escribió). */
  aviso: string | null;
  fuente: "nominatim" | "photon" | null;
  cache: "hit" | "miss";
  /**
   * El mapa no respondió (Overpass o Nominatim, aun con réplicas y reintento): no se sabe si existe. No
   * es «no encontrado»: el perito reintenta (René, 2026-11-28).
   */
  sinRespuesta?: boolean;
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
const sinAcentos = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function cacheKey(c: LugarConsulta): string {
  // v2: desde B5 los resultados traen municipio y estado; los guardados antes no. v3: su precisión
  // (cruce, calle o zona) y la alcaldía en la Ciudad de México (revisión de la cadena, 2026-11-24).
  return `croquis:lugar:v3:${normalizar(c.q)}|${normalizar(c.municipio)}|${normalizar(c.estado)}`;
}

// --- Lo que dice el texto --------------------------------------------------------------------------

/** Los 32 estados, con las formas en que los escriben los reportes, y su nombre en OpenStreetMap. */
const ESTADOS: readonly [RegExp, string][] = [
  [/^aguascalientes$/, "Aguascalientes"],
  [/^baja california( norte)?$/, "Baja California"],
  [/^baja california sur$/, "Baja California Sur"],
  [/^campeche$/, "Campeche"],
  [/^chiapas$/, "Chiapas"],
  [/^chihuahua$/, "Chihuahua"],
  [
    /^(ciudad de mexico|cdmx|d ?f|distrito federal|mexico,? d ?f|mexico df|cd de mexico)$/,
    "Ciudad de México",
  ],
  [/^coahuila( de zaragoza)?$/, "Coahuila"],
  [/^colima$/, "Colima"],
  [/^durango$/, "Durango"],
  [/^guanajuato$/, "Guanajuato"],
  [/^guerrero$/, "Guerrero"],
  [/^hidalgo$/, "Hidalgo"],
  [/^jalisco$/, "Jalisco"],
  [/^(estado de mexico|edo de mexico|edo mex|edomex)$/, "Estado de México"],
  [/^michoacan( de ocampo)?$/, "Michoacán"],
  [/^morelos$/, "Morelos"],
  [/^nayarit$/, "Nayarit"],
  [/^nuevo leon$/, "Nuevo León"],
  [/^oaxaca$/, "Oaxaca"],
  [/^puebla$/, "Puebla"],
  [/^queretaro( de arteaga)?$/, "Querétaro"],
  [/^quintana roo$/, "Quintana Roo"],
  [/^san luis potosi$/, "San Luis Potosí"],
  [/^sinaloa$/, "Sinaloa"],
  [/^sonora$/, "Sonora"],
  [/^tabasco$/, "Tabasco"],
  [/^tamaulipas$/, "Tamaulipas"],
  [/^tlaxcala$/, "Tlaxcala"],
  [/^veracruz( de ignacio de la llave)?$/, "Veracruz"],
  [/^yucatan$/, "Yucatán"],
  [/^zacatecas$/, "Zacatecas"],
];

/** El nombre del estado en OpenStreetMap («México DF» → «Ciudad de México»), o null. */
export function estadoDe(texto: string | undefined): string | null {
  if (!texto) return null;
  const n = sinAcentos(texto)
    .replace(/^(el )?estado( libre y soberano)? de (?!mexico)/, "")
    .replace(/,/g, "");
  return ESTADOS.find(([re]) => re.test(n))?.[1] ?? null;
}

/** Lo que no puede ser un municipio: una calle, una colonia, un cruce o un número. */
const NO_MUNICIPIO =
  /^(calle|c\.|av\.?|avenida|blvd\.?|boulevard|bulevar|calzada|carretera|camino|autopista|perif[eé]rico|circuito|privada|cerrada|andador|colonia|col\.|fracc|barrio|unidad|residencial|entre|esquina|esq\.?|frente|km|kil[oó]metro|a la altura|a \d|\d)/i;

/**
 * La zona que trae el texto, si el caso no la da: «Av. Carranza 123, San Luis Potosí, San Luis
 * Potosí» → municipio San Luis Potosí, estado San Luis Potosí, y lo demás («Av. Carranza 123»).
 */
export function zonaDelTexto(q: string): { municipio?: string; estado?: string; resto: string } {
  const partes = q
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = partes.length - 1; i >= 0; i--) {
    const estado = estadoDe(partes[i]);
    if (!estado) continue;
    const previa = partes[i - 1]?.replace(/^(municipio|alcald[ií]a|delegaci[oó]n)( de)?\s+/i, "");
    const municipio =
      previa && i - 1 >= 1 && !NO_MUNICIPIO.test(previa) && previa.length <= 60
        ? previa
        : undefined;
    const fin = municipio ? i - 1 : i;
    return { estado, ...(municipio ? { municipio } : {}), resto: partes.slice(0, fin).join(", ") };
  }
  return { resto: q };
}

/**
 * Lo que va antes del nombre de la vía y no es parte de él: «paso a desnivel de …», «puente de …»,
 * «curva del …», «bajada de …» (ronda 4: «curva del Circuito Exterior Mexiquense» no aparecía).
 */
const PREFIJO_DE_LUGAR =
  /^(?:en\s+)?(?:el\s+|la\s+)?(?:paso\s+a\s+desnivel|puente(?:\s+vehicular)?|distribuidor\s+vial|curva|bajada|subida|pendiente)\s+(?:de\s+(?:la\s+|el\s+)?|del\s+|en\s+(?:la\s+|el\s+)?|sobre\s+(?:la\s+|el\s+)?)?/i;

/**
 * Las dos vías de un cruce narrado (ronda 4, René: «paso a desnivel de Solidaridad Las Torres sobre
 * Paseo Tollocan» caía en el centro de Toluca): «X sobre Y» en un puente o paso a desnivel, «X a la
 * altura de (la calle) Y», «X esquina con Y», «cruce de X con Y», «X y la avenida Y». null si no hay
 * dos; «a la altura de» un municipio no es un cruce.
 */
export function viasDelCruce(texto: string, municipio?: string): [string, string] | null {
  // Lo que sigue a las calles no es parte del cruce (revisión de la cadena, René 2026-11-24: en los
  // reportes reales de CESVI, «calles de Surutato y Mapiri en la colonia Loma Linda» daba la calle
  // «Mapiri en la colonia Loma Linda»): la colonia y el número de la casa.
  const limpio = texto
    .replace(/[–—]/g, "-")
    .replace(/[“”"«»]/g, "")
    .replace(
      /\s+(?:en\s+|de\s+)?(?:la\s+)?(?:col\.?|colonia|fracc\.?|fraccionamiento|barrio|unidad\s+habitacional)\s+.*$/i,
      "",
    )
    .replace(/\s*,?\s*(?:\bNo\.?\s*\d|\bN\.\s*\d|#\s*\d).*$/i, "")
    // La coma que queda antes de la colonia quitada (René, 2026-11-27: «Boulevard Independencia y
    // Calzada Abastos, colonia Magdalenas» no se leía como cruce y caía a 4.7 km del cruce).
    .replace(/[\s,;.]+$/, "")
    .trim();
  const puente =
    /^(?:en\s+)?(?:el\s+)?(?:paso\s+a\s+desnivel|puente(?:\s+vehicular)?|distribuidor\s+vial)\s+(?:de\s+(?:la\s+|el\s+)?|del\s+)?(.+?)\s+sobre\s+(?:la\s+|el\s+)?([^,;]+)/i.exec(
      limpio,
    );
  const altura =
    /^(.+?)\s+a\s+la\s+altura\s+de(?:l)?\s+(?:la\s+|el\s+)?(?:calle\s+)?([^,;]+)/i.exec(limpio);
  const cruce =
    /^(?:en\s+)?(?:el\s+|la\s+)?(?:crucero|cruce|intersecci[oó]n)\s+(?:que\s+(?:conforman?|forman?)\s+)?(?:de\s+)?(?:las\s+calles\s+|la\s+|el\s+)?(.+?)\s+(?:con|y|e)\s+(?:la\s+|el\s+)?([^,;]+)/i.exec(
      limpio,
    );
  // «calles de X y Y», «entre las calles X y Y», «calle X y la calle Y».
  const calles =
    /^(?:entre\s+)?(?:las\s+)?calles?\s+(?:de\s+)?(.+?)\s+(?:y|e)\s+(?:la\s+|el\s+)?(?:calle\s+)?([^,;]+)/i.exec(
      limpio,
    );
  // «Avenida X, unos 15 m al norte de su cruce con Avenida Y»; «Paseo X, en la bajada hacia el cruce
  // con Y».
  const suCruce =
    /^(.+?),?\s+(?:a\s+)?(?:unos\s+|aproximadamente\s+)?(?:\d+(?:[.,]\d+)?\s*m(?:etros)?\s+(?:al\s+\w+\s+|antes\s+|despu[eé]s\s+)?)?(?:de|en)\s+su\s+(?:cruce|intersecci[oó]n|esquina)\s+con\s+(?:la\s+|el\s+)?([^,;]+)/i.exec(
      limpio,
    );
  const elCruce =
    /^(.+?),\s+[^,;]{0,70}?\b(?:el|su)\s+(?:cruce|intersecci[oó]n|esquina)\s+con\s+(?:la\s+|el\s+)?([^,;]+)/i.exec(
      limpio,
    );
  const entre = /^entre\s+(?:la\s+|el\s+)?(.+?)\s+y\s+(?:la\s+|el\s+)?([^,;]+)/i.exec(limpio);
  // «X esquina con Y», «X casi esquina Y».
  const esquina =
    /^(.+?)\s+(?:casi\s+)?esq(?:uina|\.)?\s+(?:con\s+|de\s+)?(?:la\s+|el\s+)?(?:calle\s+)?([^,;]+)/i.exec(
      limpio,
    );
  // «Circuito Interior e Insurgentes Norte», «Eje Central y Viaducto Miguel Alemán»: dos vías con tipo.
  const TIPO = String.raw`(?:av\.?|avenida|calle|calz\.?|calzada|blvd\.?|boulevard|bulevar|eje|circuito|perif[eé]rico|viaducto|paseo|carretera|prolongaci[oó]n|prol\.?|anillo|v[ií]a)`;
  const dosVias = new RegExp(
    String.raw`^(${TIPO}\s+.+?)\s+(?:y|e)\s+(?:la\s+|el\s+)?((?:${TIPO}\s+)?[A-ZÁÉÍÓÚÑ][^,;]*)$`,
    "i",
  ).exec(limpio);
  const m =
    puente ?? cruce ?? suCruce ?? elCruce ?? calles ?? entre ?? esquina ?? altura ?? dosVias;
  let par: [string, string] | null = m ? [m[1]!.trim(), m[2]!.trim()] : null;
  if (!par) {
    const otra = segundaCalle(limpio);
    if (otra) par = [primeraCalle(limpio), otra];
  }
  if (!par) return null;
  const [a, b] = par.map((x) =>
    x
      .replace(PREFIJO_DE_LUGAR, "")
      .replace(/^(?:las\s+calles\s+|la\s+calle\s+|calles?\s+de\s+|la\s+|el\s+)/i, "")
      .replace(/\s+casi$/i, "")
      .replace(/[,;.\s]+$/, "")
      .trim(),
  ) as [string, string];
  if (a.length < 3 || b.length < 3 || sinAcentos(a) === sinAcentos(b)) return null;
  // «a la altura de Amanalco»: el municipio, no una calle. «a la altura del metro…», «del número…»,
  // «del establecimiento…», «del retorno…»: una referencia, no una calle.
  if (
    municipio &&
    (sinAcentos(b).includes(sinAcentos(municipio)) || sinAcentos(municipio).includes(sinAcentos(b)))
  )
    return null;
  if (
    /^(?:metro|n[uú]mero|establecimiento|retorno|domicilio|estacionamiento|puente|kil[oó]metro|km)\b/i.test(
      b,
    )
  )
    return null;
  return [a, b];
}

/** Metros por grado, en un plano local alrededor de `lat`. */
const plano = (lat: number) => ({ x: 111320 * Math.cos((lat * Math.PI) / 180), y: 110574 });

type Tramo = [[number, number], [number, number]];

/** Los tramos (lon, lat) de la geometría de una vía de Nominatim. */
function tramosDe(g: Nominatim["geojson"]): Tramo[] {
  if (!g) return [];
  const lineas: [number, number][][] =
    g.type === "LineString"
      ? [g.coordinates as [number, number][]]
      : g.type === "MultiLineString" || g.type === "Polygon"
        ? (g.coordinates as [number, number][][])
        : g.type === "MultiPolygon"
          ? (g.coordinates as [number, number][][][]).flat()
          : [];
  return lineas.flatMap((l) => l.slice(1).map((q, i) => [l[i]!, q] as Tramo));
}

/**
 * Dónde se cruzan (o pasan más cerca) dos tramos, en metros: el punto medio de lo más cercano y la
 * distancia. Plano local; para tramos de calle (cientos de metros) el error es de centímetros.
 */
function cercania(a: Tramo, b: Tramo): { lat: number; lon: number; m: number } {
  const k = plano(a[0][1]);
  const P = (p: [number, number]) => ({ x: p[0] * k.x, y: p[1] * k.y });
  const [p1, p2, p3, p4] = [P(a[0]), P(a[1]), P(b[0]), P(b[1])];
  const d1 = { x: p2.x - p1.x, y: p2.y - p1.y };
  const d2 = { x: p4.x - p3.x, y: p4.y - p3.y };
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) > 1e-9) {
    const t = ((p3.x - p1.x) * d2.y - (p3.y - p1.y) * d2.x) / den;
    const u = ((p3.x - p1.x) * d1.y - (p3.y - p1.y) * d1.x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1)
      return { lon: (p1.x + t * d1.x) / k.x, lat: (p1.y + t * d1.y) / k.y, m: 0 };
  }
  // Sin cruzarse: lo más cercano está en un extremo de alguno.
  const alTramo = (
    p: { x: number; y: number },
    q: { x: number; y: number },
    d: { x: number; y: number },
  ) => {
    const l2 = d.x * d.x + d.y * d.y;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - q.x) * d.x + (p.y - q.y) * d.y) / l2)) : 0;
    const c = { x: q.x + t * d.x, y: q.y + t * d.y };
    return { m: Math.hypot(p.x - c.x, p.y - c.y), x: (p.x + c.x) / 2, y: (p.y + c.y) / 2 };
  };
  const mejor = [
    alTramo(p1, p3, d2),
    alTramo(p2, p3, d2),
    alTramo(p3, p1, d1),
    alTramo(p4, p1, d1),
  ].sort((x, y) => x.m - y.m)[0]!;
  return { lon: mejor.x / k.x, lat: mejor.y / k.y, m: mejor.m };
}

/** Metros: dos vías que pasan a menos de esto se cruzan (un paso a desnivel incluido). */
export const CRUCE_M = 40;

/** El punto donde se cruzan dos vías (la más cercana de sus partes), o null si no se tocan. */
export function cruceDeVias(
  a: readonly Nominatim[],
  b: readonly Nominatim[],
  tope = CRUCE_M,
): { lat: number; lon: number; m: number; de: Nominatim } | null {
  let mejor: { lat: number; lon: number; m: number; de: Nominatim } | null = null;
  for (const x of a)
    for (const ta of tramosDe(x.geojson))
      for (const y of b)
        for (const tb of tramosDe(y.geojson)) {
          const c = cercania(ta, tb);
          if (!mejor || c.m < mejor.m) mejor = { ...c, de: x };
        }
  return mejor && mejor.m <= tope ? mejor : null;
}

/** La primera calle de una descripción: «Calle Azucena esquina con Av. Reforma, col. …» → «Calle Azucena». */
export function primeraCalle(texto: string): string {
  const corte = texto.split(
    /\s+(?:esquina\s+con|esq\.?|y\s+(?:la\s+)?(?:calle|av\.?|avenida)|entre|frente\s+a|a\s+la\s+altura\s+de)\s+|,|;/i,
  )[0];
  // «… No.500», «… #27», «… en la colonia Jardines del Lago» (revisión de la cadena, René
  // 2026-11-24): el número de la casa y la colonia no son parte del nombre de la calle.
  const sinCasa = (corte ?? texto)
    .replace(/\s+(?:No\.?|N\.|#|n[uú]m(?:ero)?\.?)\s*\d.*$/i, "")
    .replace(
      /\s+(?:en\s+|de\s+)?(?:la\s+)?(?:col\.?|colonia|fracc\.?|fraccionamiento|barrio)\s+.*$/i,
      "",
    );
  return sinCasa
    .replace(/^(?:en\s+)?(?:el\s+)?(?:crucero|cruce|intersecci[oó]n)\s+(?:de\s+)?(?:la\s+)?/i, "")
    .replace(PREFIJO_DE_LUGAR, "")
    .replace(/^(?:las\s+)?calles\s+/i, "")
    .trim();
}

/** La otra calle de un cruce: «… esquina con Av. Reforma, col. …» → «Av. Reforma». */
export function segundaCalle(texto: string): string | null {
  const m =
    /\s(?:esquina\s+con|esq\.?|y\s+(?:la\s+)?(?:calle|av\.?|avenida)|entre(?:\s+las\s+calles)?)\s+([^,;]+?)(?:\s+y\s+|,|;|$)/i.exec(
      texto,
    ) ?? /^(?:las\s+)?calles\s+[^,;]+?\s+y\s+([^,;]+)/i.exec(texto);
  // «entre las calles de Libertad y…» → «Libertad».
  const c = m?.[1]?.trim().replace(/^(?:de|la|el|los|las)\s+/i, "");
  return c && c.length >= 3 ? c : null;
}

/** La colonia, el fraccionamiento o el barrio: «…, colonia Del Mar» → «Colonia Del Mar». */
export function coloniaDe(texto: string): string | null {
  const m =
    /\b(colonia|col\.|fraccionamiento|fracc\.?|barrio|residencial|unidad habitacional)\s+([^,;]+)/i.exec(
      texto,
    );
  if (!m) return null;
  const nombre = m[2]!.trim();
  return /^col/i.test(m[1]!) ? `Colonia ${nombre}` : `${m[1]} ${nombre}`;
}

// --- Nominatim y Photon -----------------------------------------------------------------------------

interface Nominatim {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  boundingbox?: [string, string, string, string];
  address?: Record<string, string | undefined>;
  /** Con `polygon_geojson=1`: la geometría de la vía (para el cruce de dos). */
  geojson?: { type: string; coordinates: unknown };
  /** El tipo del resultado en jsonv2 («road», «suburb», «city»…) y su clase («highway», «place»…). */
  addresstype?: string;
  category?: string;
  type?: string;
}

class SinServicio extends Error {}

async function nominatim(params: Record<string, string>, deps: LugarDeps): Promise<Nominatim[]> {
  const url = new URL(NOMINATIM_URL);
  for (const [k, v] of Object.entries({
    format: "jsonv2",
    limit: String(OPCIONES),
    countrycodes: "mx",
    addressdetails: "1",
    "accept-language": "es",
    ...params,
  }))
    url.searchParams.set(k, v);
  let r: Response | null = null;
  // Si Nominatim pide calma (429, o 629 cuando se pasa del ancho de banda), una espera y un reintento
  // (revisión de la cadena, René 2026-11-24: el cruce se perdía y caía a una sola calle).
  for (let intento = 0; intento < 2; intento++) {
    try {
      r = await deps.fetcher(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(ESPERA_MS),
      });
    } catch {
      throw new SinServicio();
    }
    if (r.status !== 429 && r.status !== 629) break;
    if (intento === 0)
      await (deps.pausa ?? ((ms: number) => new Promise((x) => setTimeout(x, ms))))(2000);
  }
  if (!r?.ok) throw new SinServicio();
  const d = (await r.json().catch(() => null)) as Nominatim[] | null;
  if (!Array.isArray(d)) throw new SinServicio();
  return d;
}

export const NOMINATIM_INVERSA_URL = "https://nominatim.openstreetmap.org/reverse";

/** La colonia (o barrio, fraccionamiento) de un punto, con la búsqueda inversa de Nominatim. */
async function coloniaEn(lat: number, lon: number, deps: LugarDeps): Promise<string | null> {
  const url = new URL(NOMINATIM_INVERSA_URL);
  for (const [k, v] of Object.entries({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lon),
    zoom: "16",
    addressdetails: "1",
    "accept-language": "es",
  }))
    url.searchParams.set(k, v);
  try {
    const r = await deps.fetcher(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    if (!r.ok) return null;
    const d = (await r.json().catch(() => null)) as { address?: Record<string, string> } | null;
    const a = d?.address ?? {};
    const colonia = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.residential ?? a.city_district;
    if (colonia) return colonia;
    // Sin colonias en el mapa (Toluca): el código postal y la localidad.
    const localidad = a.village ?? a.town ?? a.hamlet ?? a.city;
    return [a.postcode ? `C.P. ${a.postcode}` : null, localidad].filter(Boolean).join(", ") || null;
  } catch {
    return null;
  }
}

async function photon(q: string, deps: LugarDeps): Promise<ResultadoLugar[]> {
  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(OPCIONES));
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
    const nombre = [p.name, p.street, p.district].filter(Boolean).join(", ");
    return {
      nombre: nombre || q,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      ...(p.city || p.county ? { municipio: (p.city ?? p.county)! } : {}),
      ...(p.state ? { estado: p.state } : {}),
    };
  });
}

/** Un resultado con su calle y colonia, y aparte su municipio y estado. */
/** Lo que para Nominatim es una zona (colonia, pueblo, municipio); lo demás es un punto preciso. */
const TIPOS_DE_ZONA = new Set([
  "suburb",
  "neighbourhood",
  "quarter",
  "city",
  "town",
  "village",
  "hamlet",
  "municipality",
  "county",
  "state",
  "region",
  "country",
  "city_district",
  "borough",
  "postcode",
  "residential",
  "allotments",
]);

function aResultado(x: Nominatim): ResultadoLugar {
  const a = x.address ?? {};
  // En la Ciudad de México, Nominatim da la ciudad como municipio: el del caso es la alcaldía.
  const cdmx = /ciudad de m[eé]xico/i.test(a.city ?? a.state ?? "");
  const municipio =
    (cdmx ? (a.borough ?? a.city_district) : undefined) ??
    a.city ??
    a.town ??
    a.municipality ??
    a.county ??
    a.city_district ??
    a.borough ??
    a.village;
  // Sin el tipo (una respuesta que no lo trae), no se sabe: no se trata como zona.
  const precision: ResultadoLugar["precision"] =
    !x.category && !x.addresstype
      ? undefined
      : x.category === "boundary" ||
          x.category === "place" ||
          TIPOS_DE_ZONA.has(x.addresstype ?? "")
        ? "zona"
        : "calle";
  const lugar = [
    a.road ?? x.name,
    a.neighbourhood ?? a.suburb ?? a.quarter ?? a.hamlet ?? a.village,
  ].filter((s, i, xs): s is string => Boolean(s) && xs.indexOf(s) === i && s !== municipio);
  return {
    nombre: lugar.join(", ") || x.display_name.split(",").slice(0, 2).join(",").trim(),
    lat: Number(x.lat),
    lon: Number(x.lon),
    ...(municipio ? { municipio } : {}),
    ...(a.state ? { estado: a.state } : {}),
    ...(precision ? { precision } : {}),
  };
}

/**
 * Los nombres con que se busca una vía de un cruce: el narrado, sin los artículos de en medio («de
 * los», «de la») y sin su tipo («Avenida»). OpenStreetMap la puede tener con cualquiera.
 */

export function variantesDeVia(nombre: string): string[] {
  // «paso a desnivel de Avenida Río Churubusco (Circuito Interior)»: la vía, y su otro nombre.
  const entre = /\(([^)]+)\)/.exec(nombre)?.[1]?.trim();
  const v = nombre
    .replace(
      /^(?:el\s+)?(?:paso\s+a\s+desnivel|puente(?:\s+vehicular)?|distribuidor\s+vial)\s+(?:de\s+(?:la\s+|el\s+)?|del\s+)?/i,
      "",
    )
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const otras = entre && entre.length >= 3 ? [entre] : [];
  const sinArticulos = v.replace(/\s+de(?:\s+(?:los|las|la|el))?\s+/gi, " ").replace(/\s+/g, " ");
  const tipo =
    /^(?:avenida|av\.?|calle|calzada|calz\.?|boulevard|blvd\.?|paseo|eje|circuito|carretera|prolongaci[oó]n|prol\.?)\s+/i;
  return [
    ...new Set(
      [v, sinArticulos, sinArticulos.replace(tipo, ""), tipo.test(v) ? null : `Avenida ${v}`]
        .concat(otras)
        .filter((x): x is string => Boolean(x))
        .map((x) => x.trim()),
    ),
  ].filter((x) => x.length >= 3);
}

/** Sin repetir el mismo punto (a ~10 m) ni el mismo nombre en el mismo municipio. */
function sinRepetir(rs: readonly ResultadoLugar[]): ResultadoLugar[] {
  const vistos = new Set<string>();
  return rs
    .filter((r) => {
      const a = `${r.lat.toFixed(4)},${r.lon.toFixed(4)}`;
      const b = `${normalizar(r.nombre)}|${normalizar(r.municipio)}`;
      if (vistos.has(a) || vistos.has(b)) return false;
      vistos.add(a).add(b);
      return true;
    })
    .slice(0, OPCIONES);
}

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
  // La zona: la del caso; si el caso no la trae, la del texto.
  // Lo que la redacción dejó como «[NOMBRE]» o «[PLACA]» no se busca (casos guardados antes de B5).
  const sinMarcas = (s: string | undefined) =>
    s
      ?.replace(/\[[A-Z_]+\]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+,/g, ",")
      .trim() || undefined;
  c = {
    ...c,
    q: sinMarcas(c.q) ?? c.q,
    // «alcaldía Benito Juárez», «municipio de Metepec» (revisión de la cadena, René 2026-11-24): la
    // caja del municipio no aparecía y el cruce no se intentaba.
    municipio: sinMarcas(c.municipio)
      ?.replace(/^(?:la\s+)?(?:alcald[ií]a|municipio|delegaci[oó]n)\s+(?:de\s+)?/i, "")
      .trim(),
    estado: sinMarcas(c.estado),
  };
  const delTexto = zonaDelTexto(c.q);
  // Lo que escribió el perito gana: si el texto trae un estado, ese; el municipio del caso solo si
  // es del mismo estado.
  // Un estado que no se reconoce (mal escrito o a medias) no se usa para filtrar.
  const delCaso = estadoDe(c.estado) ?? undefined;
  const estado = delTexto.estado ?? delCaso;
  const municipio = delTexto.estado
    ? (delTexto.municipio ?? (delCaso === delTexto.estado ? c.municipio : undefined))
    : c.municipio;
  const texto = delTexto.estado ? delTexto.resto || c.q : c.q;
  const zona = { municipio, estado, texto };
  const interpretado = interpretarLugar(texto);
  let out: Omit<LugarOut, "cache">;
  try {
    out = await conNominatim(
      zona,
      interpretado,
      nom,
      // Sin un nombre que se pueda buscar, el cruce no se consulta: no es que el mapa no respondiera.
      (cs, caja, centro) =>
        patronDeNombres(cs[0]) && patronDeNombres(cs[1])
          ? crucesPorNombre(cs, caja, centro, deps.fetcher)
          : Promise.resolve([]),
      async (lat, lon) => {
        if (consultas++ > 0) await pausa(PAUSA_NOMINATIM_MS);
        return coloniaEn(lat, lon, deps);
      },
    );
  } catch (e) {
    if (!(e instanceof SinServicio)) throw e;
    // Nominatim no respondió: Photon, con la carretera o el texto y la zona.
    const donde = [municipio, estado].filter(Boolean).join(", ");
    const q =
      interpretado.tipo === "carretera"
        ? [interpretado.ref ?? interpretado.tramo.join(" - "), donde].filter(Boolean).join(", ")
        : [texto, donde].filter(Boolean).join(", ");
    try {
      const resultados = sinRepetir(await photon(q, deps));
      out = {
        resultados,
        aviso: resultados.length
          ? "Elige la opción que coincide con el municipio del caso."
          : "No se encontró. Prueba con la calle y el municipio.",
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

/** La caja de Nominatim como `viewbox`: boundingbox es sur, norte, oeste, este; viewbox, oeste, norte, este, sur. */
const viewbox = (bb: [string, string, string, string]) => `${bb[2]},${bb[1]},${bb[3]},${bb[0]}`;

async function conNominatim(
  zona: { municipio?: string; estado?: string; texto: string },
  interpretado: ReturnType<typeof interpretarLugar>,
  nom: (params: Record<string, string>) => Promise<Nominatim[]>,
  /** Los cruces reales de dos calles en una caja (Overpass); null si no respondió. */
  cruces: (
    calles: readonly [string, string],
    caja: { sur: number; oeste: number; norte: number; este: number },
    centro: { lat: number; lon: number } | null,
  ) => Promise<{ lat: number; lon: number }[] | null> = async () => null,
  /** La colonia de un punto (la búsqueda inversa de Nominatim); null si no se sabe. */
  coloniaDelPunto: (lat: number, lon: number) => Promise<string | null> = async () => null,
): Promise<Omit<LugarOut, "cache">> {
  const { municipio, estado, texto } = zona;
  const donde = [municipio, estado].filter(Boolean).join(", ");

  // El área: el municipio (que caiga en su estado) y, si no aparece, el estado.
  const enEstado = (x: Nominatim) =>
    !estado || sinAcentos(x.address?.state ?? x.display_name).includes(sinAcentos(estado));
  let cajaMunicipio: Nominatim | null = null;
  if (municipio) {
    const r = await nom({ q: donde, limit: "3" });
    // El área que se llama como el municipio (no la ciudad entera ni una calle con su nombre).
    const seLlama = (x: Nominatim) => {
      const n = sinAcentos(x.name ?? x.display_name.split(",")[0] ?? "");
      const m = sinAcentos(municipio);
      return n.includes(m) || m.includes(n);
    };
    cajaMunicipio =
      r.find((x) => x.boundingbox && enEstado(x) && seLlama(x)) ??
      r.find((x) => x.boundingbox && enEstado(x)) ??
      null;
  }
  // Una opción cae en el municipio del caso si su municipio se llama igual (sin acentos).
  const delMunicipio = (x: ResultadoLugar) => {
    if (!municipio || !x.municipio) return false;
    const a = sinAcentos(x.municipio);
    const b = sinAcentos(municipio);
    return a.includes(b) || b.includes(a);
  };
  const primeroDelMunicipio = (rs: ResultadoLugar[]) => [
    ...rs.filter(delMunicipio),
    ...rs.filter((x) => !delMunicipio(x)),
  ];
  let cajaEstado: Nominatim | null = null;
  const estadoCaja = async () => {
    if (!estado || cajaEstado) return cajaEstado;
    const r = await nom({ state: estado, country: "México", limit: "1" });
    cajaEstado = r.find((x) => x.boundingbox) ?? null;
    return cajaEstado;
  };

  if (interpretado.tipo === "carretera") {
    // «el km 236+500», como lo escriben los reportes.
    const k = interpretado.km;
    const metrosKm = k !== null ? Math.round((k - Math.floor(k)) * 1000) : 0;
    const km =
      k !== null
        ? `el km ${Math.floor(k)}${metrosKm ? `+${String(metrosKm).padStart(3, "0")}` : ""}`
        : "el kilómetro";
    const { ref, tramo } = interpretado;
    // Cómo se llama la carretera para buscarla: su clave («MEX 57D») o sus poblaciones («carretera
    // Teapa-Pichucalco», como la nombran OSM y los reportes de CESVI).
    const palabra = /autopista/i.test(interpretado.texto) ? "autopista" : "carretera";
    const nombre = ref ?? (tramo.length === 2 ? `${palabra} ${tramo[0]}-${tramo[1]}` : null);
    const enCaja = async (caja: [string, string, string, string]) =>
      nombre ? nom({ q: nombre, viewbox: viewbox(caja), bounded: "1" }) : [];
    const sobreLaVia = (zonaTexto: string, tramos: Nominatim[]) => ({
      resultados: sinRepetir(tramos.map(aResultado)),
      aviso: `La ${nombre} dentro de ${zonaTexto}. OpenStreetMap no tiene ${km}: mueve el mapa por la carretera hasta el punto.`,
      fuente: "nominatim" as const,
    });
    // 1) El municipio del caso.
    if (cajaMunicipio?.boundingbox) {
      const tramos = await enCaja(cajaMunicipio.boundingbox);
      if (tramos.length) return sobreLaVia(donde, tramos);
    }
    // 2) Las poblaciones del tramo: la carretera entre ellas o, si no aparece, las poblaciones.
    // (Revisión de la cadena, René 2026-11-24: los reportes de CESVI nombran así la carretera.)
    const poblaciones: Nominatim[] = [];
    for (const p of tramo) {
      const r = await nom({ q: [p, estado].filter(Boolean).join(", "), limit: "1" });
      const x = r.find((y) => y.boundingbox && enEstado(y)) ?? r.find((y) => y.boundingbox);
      if (x) poblaciones.push(x);
    }
    if (poblaciones.length) {
      const cajas = poblaciones.map((x) => x.boundingbox!.map(Number));
      const sur = Math.min(...cajas.map((c) => c[0]!));
      const norte = Math.max(...cajas.map((c) => c[1]!));
      const oeste = Math.min(...cajas.map((c) => c[2]!));
      const este = Math.max(...cajas.map((c) => c[3]!));
      // Un margen de 0.05° (unos 5 km): la carretera puede salir de las cajas de las poblaciones.
      const caja = [sur - 0.05, norte + 0.05, oeste - 0.05, este + 0.05].map((x) =>
        String(Math.round(x * 1e4) / 1e4),
      ) as [string, string, string, string];
      const tramos = await enCaja(caja);
      const entre = tramo.join(" y ");
      if (tramos.length) return sobreLaVia(`el tramo de ${entre}`, tramos);
      return {
        resultados: sinRepetir(poblaciones.map(aResultado)).map((x) => ({
          ...x,
          precision: "zona" as const,
        })),
        aviso: `OpenStreetMap no tiene ${km} de la carretera de ${entre}: el mapa abre en el tramo. Mueve el mapa por la carretera hasta el punto, o pega las coordenadas.`,
        fuente: "nominatim",
      };
    }
    // 3) El municipio solo: el mapa abre ahí y el perito lleva el punto a la carretera.
    if (cajaMunicipio?.boundingbox)
      return {
        resultados: [{ ...aResultado(cajaMunicipio), precision: "zona" }],
        aviso: `No se encontró la ${nombre ?? "carretera"} dentro de ${donde}, y OpenStreetMap no tiene ${km}: el mapa abre en el municipio. Mueve el mapa hasta el punto, o pega las coordenadas.`,
        fuente: "nominatim",
      };
    // 4) El estado, o la carretera en todo el país.
    const cajaE = await estadoCaja();
    if (cajaE?.boundingbox && nombre) {
      const tramos = await enCaja(cajaE.boundingbox);
      if (tramos.length) return sobreLaVia(estado!, tramos);
    }
    const tramos = ref ? await nom({ q: ref }) : [];
    return {
      resultados: sinRepetir(tramos.map(aResultado)),
      aviso: tramos.length
        ? `La ${ref}; el caso no dice el municipio y OpenStreetMap no tiene ${km}.`
        : "No se encontró la carretera. ¿Dónde fue? Pega las coordenadas o un link de Google Maps, o toca el lugar en el mapa.",
      fuente: "nominatim",
    };
  }

  // Qué se busca, de lo más a lo menos preciso. Sin la zona dentro del texto: la da la caja.
  // «…, colonia Centro, municipio de Toluca, Estado de México» → «…, colonia Centro»; solo después
  // de una coma, para no cortar «Av. Toluca».
  const sinZona = (s: string) =>
    municipio
      ? s.replace(
          new RegExp(
            `,\\s*(?:municipio de\\s+)?${municipio.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\d]).*$`,
            "iu",
          ),
          "",
        )
      : s;
  const calle = primeraCalle(texto).replace(/\s*[–—]\s*/g, " - ");
  const colonia = coloniaDe(texto);
  // La calle también sin su tipo y sin artículos (revisión de la cadena, René 2026-11-24): OSM tiene
  // «Costera Miguel Alemán» y los reportes de CESVI dicen «Blvd. Costera Miguel Alemán». Como último
  // recurso, el tipo y la primera palabra del nombre («Av. Central Hank González» es «Avenida
  // Central» en OSM); el aviso dice qué se buscó.
  const delNombre = calle ? variantesDeVia(calle).filter((x) => x !== calle) : [];
  const corta =
    /^((?:avenida|av\.?|calle|calzada|calz\.?|boulevard|blvd\.?|bulevar|paseo|circuito)\s+\S+)\s+\S+\s+\S+/i.exec(
      calle,
    )?.[1];
  const variantes = [
    ...new Set(
      [
        sinZona(texto),
        colonia && calle ? `${calle}, ${colonia}` : null,
        calle,
        ...delNombre,
        segundaCalle(texto),
        colonia,
        corta ? corta.replace(/^av\.?\s/i, "Avenida ").replace(/^blvd\.?\s/i, "Boulevard ") : null,
      ].filter((s): s is string => Boolean(s && s.trim().length >= 3)),
    ),
  ];
  // Dentro de la caja y con la zona escrita: la caja es un rectángulo que toca a los municipios
  // vecinos; el nombre del municipio en el texto hace que Nominatim prefiera los del caso.
  const buscarEn = async (caja: Nominatim, cuantas: number, zonaEscrita: string) => {
    let otro: { v: string; r: ResultadoLugar[] } | null = null;
    for (const v of variantes.slice(0, cuantas)) {
      const r = (
        await nom({
          q: zonaEscrita ? `${v}, ${zonaEscrita}` : v,
          viewbox: viewbox(caja.boundingbox!),
          bounded: "1",
        })
      ).map(aResultado);
      // Una zona (la colonia) se guarda por si nada más aparece; se sigue buscando algo preciso
      // («Anillo Periférico Sur, a la altura de la colonia…» daba la colonia y paraba).
      const preciso = r[0]?.precision !== "zona";
      if (preciso && (r.some(delMunicipio) || (r.length && !municipio)))
        return { v, r, delCaso: true };
      if (r.length && (!otro || (preciso && otro.r[0]?.precision === "zona"))) otro = { v, r };
    }
    return otro ? { ...otro, delCaso: false } : null;
  };

  // El cruce de dos vías narradas: las dos con su geometría dentro de la zona y el punto donde se
  // tocan. Antes que la primera calle sola, que cae en cualquier punto de ella.
  const vias = viasDelCruce(texto, municipio);
  const cajaCruce = cajaMunicipio ?? (await estadoCaja());
  const enDonde = donde ? ` en ${donde}` : "";
  // El cruce narrado, con las dos calles (René, 2026-11-27; #388): sus cruces reales en OSM. Uno, el
  // lugar; varios, el perito elige; ninguno, se dice y no se propone otra esquina.
  if (vias && cajaCruce?.boundingbox) {
    const [sur, norte, oeste, este] = cajaCruce.boundingbox.map(Number) as [
      number,
      number,
      number,
      number,
    ];
    const centro = cajaMunicipio
      ? { lat: Number(cajaMunicipio.lat), lon: Number(cajaMunicipio.lon) }
      : null;
    const reales = await cruces(vias, { sur, norte, oeste, este }, centro);
    const deCruce = (p: { lat: number; lon: number }, nombre: string): ResultadoLugar => ({
      nombre,
      lat: p.lat,
      lon: p.lon,
      ...(municipio ? { municipio } : {}),
      ...(estado ? { estado } : {}),
      precision: "cruce" as const,
    });
    if (reales?.length === 1)
      return {
        resultados: [deCruce(reales[0]!, `Cruce de ${vias[0]} con ${vias[1]}`)],
        aviso: `El cruce de ${vias[0]} con ${vias[1]}${enDonde}.`,
        fuente: "nominatim",
      };
    if (reales && reales.length > 1) {
      // Varios cruces (René, 2026-11-27): el orden no es arbitrario y el aviso dice cuál es.
      // - La narración dice «centro»: el más cercano al centro del municipio primero (el punto de la
      //   ciudad en OSM; `reales` ya viene en ese orden).
      // - Nombra otra colonia y OSM la tiene (con su nombre, como colonia o barrio): los que quedan en
      //   ella primero, luego del más cercano a ella al más lejano.
      // - No la tiene, o no nombra ninguna: se dice y el perito elige.
      const colonia = coloniaDe(texto);
      const nombreColonia =
        colonia
          ?.replace(
            /^(?:colonia|fraccionamiento|fracc\.?|barrio|residencial|unidad habitacional)\s+/i,
            "",
          )
          .trim() ?? null;
      const laColonia = colonia
        ? /^(?:colonia|unidad)/i.test(colonia)
          ? `la colonia ${nombreColonia}`
          : `el ${
              colonia
                .replace(/^fracc\.?\s/i, "fraccionamiento ")
                .toLowerCase()
                .split(" ")[0]
            } ${nombreColonia}`
        : null;
      const esCentro = !!nombreColonia && /^centro(?:\s+hist[oó]rico)?$/i.test(nombreColonia);
      let zonaCaja: Nominatim | null = null;
      if (colonia && nombreColonia && !esCentro) {
        const r = await nom({
          q: donde ? `${nombreColonia}, ${donde}` : nombreColonia,
          viewbox: viewbox(cajaCruce.boundingbox),
          bounded: "1",
          limit: "5",
        });
        // Solo un área que se llame así (no un restaurante ni una calle «del Centro»).
        zonaCaja =
          r.find(
            (x) =>
              x.boundingbox &&
              /^(suburb|neighbourhood|quarter|city_district|borough|residential|hamlet|village|town|isolated_dwelling)$/.test(
                x.addresstype ?? "",
              ) &&
              sinAcentos(x.name ?? "").includes(sinAcentos(nombreColonia)),
          ) ?? null;
      }
      const enZona = (p: { lat: number; lon: number }) => {
        const bb = zonaCaja?.boundingbox?.map(Number);
        return !!bb && p.lat >= bb[0]! && p.lat <= bb[1]! && p.lon >= bb[2]! && p.lon <= bb[3]!;
      };
      const ref = zonaCaja ? { lat: Number(zonaCaja.lat), lon: Number(zonaCaja.lon) } : null;
      const lejos = (p: { lat: number; lon: number }) =>
        ref
          ? Math.hypot(p.lat - ref.lat, (p.lon - ref.lon) * Math.cos((ref.lat * Math.PI) / 180))
          : 0;
      const ordenados = ref
        ? [...reales].sort((a, b) => Number(enZona(b)) - Number(enZona(a)) || lejos(a) - lejos(b))
        : reales;
      const dentro = ordenados.filter(enZona).length;
      // La colonia de cada cruce (o su código postal y su localidad), para que el perito sepa cuál es.
      const resultados: ResultadoLugar[] = [];
      for (const p of ordenados) {
        const suya = await coloniaDelPunto(p.lat, p.lon).catch(() => null);
        resultados.push(deCruce(p, `Cruce de ${vias[0]} con ${vias[1]}${suya ? `, ${suya}` : ""}`));
      }
      const cuantos = `${vias[0]} y ${vias[1]} se cruzan en ${reales.length} lugares${enDonde}`;
      const delCentro = municipio ? `al centro de ${municipio}` : "al centro del municipio";
      const aviso = !colonia
        ? `${cuantos} y la narración no dice la colonia ni la zona: elige el del hecho (van del más cercano ${delCentro} al más lejano).`
        : esCentro
          ? `${cuantos}; la narración dice «centro»: el más cercano ${delCentro} va primero. Elige el del hecho.`
          : !zonaCaja
            ? `${cuantos}. No encontré ${laColonia} en el mapa: elige el del hecho (van del más cercano ${delCentro} al más lejano).`
            : dentro
              ? `${cuantos}; ${dentro === 1 ? "uno queda" : `${dentro} quedan`} en ${laColonia}, que nombra la narración, y ${dentro === 1 ? "va" : "van"} primero. Elige el del hecho.`
              : `${cuantos}; ninguno queda en ${laColonia}: van del más cercano a ella al más lejano. Elige el del hecho.`;
      return { resultados, aviso, fuente: "nominatim" };
    }
    if (reales)
      return {
        resultados: [],
        aviso: `No encontré el cruce de ${vias[0]} con ${vias[1]}${enDonde}: márcalo tú en el mapa.`,
        fuente: "nominatim",
      };
  }
  // El mapa no respondió, aun con sus réplicas y un reintento (René, 2026-11-28: el mismo caso daba
  // una vez la esquina y otra una calle recta): no es «no se cruzan». Se dice y no se propone nada; ni
  // la geometría de Nominatim (el punto donde dos tramos pasan más cerca puede ser cualquier lugar) ni
  // una calle sola.
  if (vias && cajaCruce?.boundingbox)
    return {
      resultados: [],
      aviso: `No pude comprobar el cruce de ${vias[0]} con ${vias[1]}${enDonde} (el mapa no respondió): reintenta.`,
      fuente: "nominatim",
      sinRespuesta: true,
    };

  if (cajaMunicipio) {
    const h = await buscarEn(cajaMunicipio, variantes.length, donde);
    if (h)
      return {
        resultados: sinRepetir(primeroDelMunicipio(h.r)),
        aviso: !h.delCaso
          ? `No apareció en ${municipio}; estas opciones son de municipios vecinos. Revisa cuál es.`
          : h.v === variantes[0]
            ? null
            : `No se encontró el lugar completo; se buscó «${h.v}» en ${donde}.`,
        fuente: "nominatim",
      };
  }
  const caja = await estadoCaja();
  if (caja) {
    const h = await buscarEn(caja, 2, estado ?? "");
    if (h)
      return {
        resultados: sinRepetir(primeroDelMunicipio(h.r)),
        aviso: municipio
          ? `No apareció en ${municipio}; estas opciones son de otros municipios de ${estado}. Revisa cuál es.`
          : `Opciones en ${estado}: el caso no dice el municipio.`,
        fuente: "nominatim",
      };
  }
  // Ronda 4 (René): si nada cuadra se pregunta; el centro del municipio no es el lugar del choque.
  if (cajaMunicipio)
    return {
      resultados: [],
      aviso: `No se encontró «${vias ? `${vias[0]} y ${vias[1]}` : calle || texto}» en ${donde}. ¿Dónde fue? Escribe las calles del cruce, pega las coordenadas o un link de Google Maps, o toca el lugar en el mapa.`,
      fuente: "nominatim",
    };
  if (!municipio && !estado) {
    // Sin zona: en todo México, con varias opciones para elegir.
    const r = await nom({ q: texto });
    return {
      resultados: sinRepetir(r.map(aResultado)),
      aviso: r.length
        ? "El caso no dice el municipio ni el estado: elige la opción correcta, o escribe también el municipio y el estado."
        : "No se encontró. Escribe la calle con el municipio y el estado, o pega las coordenadas o un link de Google Maps.",
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
