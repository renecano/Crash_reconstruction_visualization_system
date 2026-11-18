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
const sinAcentos = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function cacheKey(c: LugarConsulta): string {
  // v2: desde B5 los resultados traen municipio y estado; los guardados antes no.
  return `croquis:lugar:v2:${normalizar(c.q)}|${normalizar(c.municipio)}|${normalizar(c.estado)}`;
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

/** La primera calle de una descripción: «Calle Azucena esquina con Av. Reforma, col. …» → «Calle Azucena». */
export function primeraCalle(texto: string): string {
  const corte = texto.split(
    /\s+(?:esquina\s+con|esq\.?|y\s+(?:la\s+)?(?:calle|av\.?|avenida)|entre|frente\s+a|a\s+la\s+altura\s+de)\s+|,|;/i,
  )[0];
  return (corte ?? texto)
    .replace(/^(?:en\s+)?(?:el\s+)?(?:crucero|cruce|intersecci[oó]n)\s+(?:de\s+)?(?:la\s+)?/i, "")
    .replace(/^(?:las\s+)?calles\s+/i, "")
    .trim();
}

/** La otra calle de un cruce: «… esquina con Av. Reforma, col. …» → «Av. Reforma». */
export function segundaCalle(texto: string): string | null {
  const m =
    /\s(?:esquina\s+con|esq\.?|y\s+(?:la\s+)?(?:calle|av\.?|avenida)|entre(?:\s+las\s+calles)?)\s+([^,;]+?)(?:\s+y\s+|,|;|$)/i.exec(
      texto,
    ) ?? /^(?:las\s+)?calles\s+[^,;]+?\s+y\s+([^,;]+)/i.exec(texto);
  const c = m?.[1]?.trim();
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
function aResultado(x: Nominatim): ResultadoLugar {
  const a = x.address ?? {};
  const municipio =
    a.city ?? a.town ?? a.municipality ?? a.county ?? a.city_district ?? a.borough ?? a.village;
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
  };
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
  const delTexto = zonaDelTexto(c.q);
  const estado = estadoDe(c.estado) ?? c.estado ?? delTexto.estado;
  const municipio = c.municipio ?? delTexto.municipio;
  const texto = delTexto.estado ? delTexto.resto || c.q : c.q;
  const zona = { municipio, estado, texto };
  const interpretado = interpretarLugar(texto);
  let out: Omit<LugarOut, "cache">;
  try {
    out = await conNominatim(zona, interpretado, nom);
  } catch (e) {
    if (!(e instanceof SinServicio)) throw e;
    // Nominatim no respondió: Photon, con la carretera o el texto y la zona.
    const donde = [municipio, estado].filter(Boolean).join(", ");
    const q =
      interpretado.tipo === "carretera"
        ? [interpretado.ref, donde].filter(Boolean).join(", ")
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
): Promise<Omit<LugarOut, "cache">> {
  const { municipio, estado, texto } = zona;
  const donde = [municipio, estado].filter(Boolean).join(", ");

  // El área: el municipio (que caiga en su estado) y, si no aparece, el estado.
  const enEstado = (x: Nominatim) =>
    !estado || sinAcentos(x.address?.state ?? x.display_name).includes(sinAcentos(estado));
  let cajaMunicipio: Nominatim | null = null;
  if (municipio) {
    const r = await nom({ q: donde, limit: "3" });
    cajaMunicipio = r.find((x) => x.boundingbox && enEstado(x)) ?? null;
  }
  let cajaEstado: Nominatim | null = null;
  const estadoCaja = async () => {
    if (!estado || cajaEstado) return cajaEstado;
    const r = await nom({ state: estado, country: "México", limit: "1" });
    cajaEstado = r.find((x) => x.boundingbox) ?? null;
    return cajaEstado;
  };

  if (interpretado.tipo === "carretera") {
    const km = interpretado.km !== null ? `el km ${interpretado.km}` : "el kilómetro";
    const caja = cajaMunicipio ?? (await estadoCaja());
    if (caja?.boundingbox) {
      const tramos = await nom({
        q: interpretado.ref,
        viewbox: viewbox(caja.boundingbox),
        bounded: "1",
      });
      const zonaTexto = cajaMunicipio ? donde : estado!;
      if (tramos.length)
        return {
          resultados: sinRepetir(tramos.map(aResultado)),
          aviso: `La ${interpretado.ref} dentro de ${zonaTexto}. OpenStreetMap no tiene ${km}: mueve el mapa por la carretera hasta el punto.`,
          fuente: "nominatim",
        };
      return {
        resultados: [aResultado(caja)],
        aviso: `No se encontró la ${interpretado.ref} dentro de ${zonaTexto}: el mapa queda ahí.`,
        fuente: "nominatim",
      };
    }
    const tramos = await nom({ q: interpretado.ref });
    return {
      resultados: sinRepetir(tramos.map(aResultado)),
      aviso: tramos.length
        ? `La ${interpretado.ref}; el caso no dice el municipio y OpenStreetMap no tiene ${km}.`
        : "No se encontró la carretera. Prueba con el municipio.",
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
  const calle = primeraCalle(texto);
  const colonia = coloniaDe(texto);
  const variantes = [
    ...new Set(
      [
        sinZona(texto),
        colonia && calle ? `${calle}, ${colonia}` : null,
        calle,
        segundaCalle(texto),
        colonia,
      ].filter((s): s is string => Boolean(s && s.trim().length >= 3)),
    ),
  ];
  const buscarEn = async (caja: Nominatim, cuantas: number) => {
    for (const v of variantes.slice(0, cuantas)) {
      const r = await nom({ q: v, viewbox: viewbox(caja.boundingbox!), bounded: "1" });
      if (r.length) return { v, r };
    }
    return null;
  };

  if (cajaMunicipio) {
    const h = await buscarEn(cajaMunicipio, variantes.length);
    if (h)
      return {
        resultados: sinRepetir(h.r.map(aResultado)),
        aviso:
          h.v === variantes[0]
            ? null
            : `No se encontró el lugar completo; se buscó «${h.v}» en ${donde}.`,
        fuente: "nominatim",
      };
  }
  const caja = await estadoCaja();
  if (caja) {
    const h = await buscarEn(caja, 2);
    if (h)
      return {
        resultados: sinRepetir(h.r.map(aResultado)),
        aviso: municipio
          ? `No apareció en ${municipio}; estas opciones son de otros municipios de ${estado}. Revisa cuál es.`
          : `Opciones en ${estado}: el caso no dice el municipio.`,
        fuente: "nominatim",
      };
  }
  if (cajaMunicipio)
    return {
      resultados: [aResultado(cajaMunicipio)],
      aviso: `No se encontró la calle: el mapa queda en ${donde}. Muévelo hasta el lugar.`,
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
