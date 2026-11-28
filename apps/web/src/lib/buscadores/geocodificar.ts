/**
 * Buscar un lugar por su nombre para los buscadores (René, 2026-11-28): primero Nominatim, con su
 * política de uso (una consulta por segundo como máximo, el User-Agent de Croquis, caché de respuestas
 * que puede ser permanente y la atribución «© OpenStreetMap contributors»); si no responde o no
 * encuentra, el geocodificador de Esri, con sus resultados solo en memoria durante la sesión. La llamada
 * a Esri con la llave de servidor (`ESRI_GEOCODE_API_KEY`) la conecta la colocación al integrar los
 * buscadores. Cada resultado dice de dónde salió («encontrado con Esri»).
 */
import { USER_AGENT } from "../../server/osm";
import type { RedLugar } from "../buscadores-lugar";
import { LLAVE_ESRI } from "../visor-unity/piso";

export const ATRIBUCION_OSM = "© OpenStreetMap contributors";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const ESRI =
  "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";

export interface LugarGeocodificado {
  lat: number;
  lon: number;
  nombre: string;
  /** La clase y el tipo de OSM (`railway`/`station`…) o, de Esri, su tipo («Metro Station»…). */
  categoria: string;
  tipo: string;
  fuente: "nominatim" | "esri";
}

export interface Geocodificacion {
  resultados: LugarGeocodificado[];
  fuente: "nominatim" | "esri" | null;
}

/**
 * La caché de Nominatim (lo pide su política de uso): puede ser permanente. Por omisión, en memoria;
 * la colocación puede conectar una que dure (`fijarCacheNominatim`).
 */
export interface CacheNominatim {
  get: (
    clave: string,
  ) => Promise<LugarGeocodificado[] | undefined> | LugarGeocodificado[] | undefined;
  set: (clave: string, valor: LugarGeocodificado[]) => Promise<void> | void;
}
const MAX_CACHE = 500;
function enMemoria(): CacheNominatim {
  const m = new Map<string, LugarGeocodificado[]>();
  return {
    get: (k) => m.get(k),
    set: (k, v) => {
      if (m.size >= MAX_CACHE) m.delete(m.keys().next().value!);
      m.set(k, v);
    },
  };
}
let cacheNominatim: CacheNominatim = enMemoria();
/** Conecta una caché permanente para Nominatim (solo Nominatim: Esri no lo permite). */
export function fijarCacheNominatim(c: CacheNominatim) {
  cacheNominatim = c;
}
/**
 * Los resultados de Esri, solo en memoria y durante la sesión: sus condiciones no permiten guardarlos
 * (René, 2026-11-28). Nunca van a la caché de Nominatim.
 */
const sesionEsri = new Map<string, LugarGeocodificado[]>();
/** Cuándo salió la última consulta a Nominatim (ms), para no pasar de una por segundo. */
let ultimaNominatim = 0;

async function nominatim(texto: string, limite: number, red: RedLugar) {
  const url = `${NOMINATIM}?format=jsonv2&limit=${limite}&countrycodes=mx&q=${encodeURIComponent(texto)}`;
  const guardado = await cacheNominatim.get(url);
  if (guardado) return guardado;
  const espera = 1000 - (Date.now() - ultimaNominatim);
  if (espera > 0 && ultimaNominatim > 0) await red.pausa?.(espera);
  ultimaNominatim = Date.now();
  const r = await red.fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!r.ok) throw new Error(`Nominatim respondió ${r.status}`);
  const d = (await r.json()) as {
    lat: string;
    lon: string;
    name?: string;
    display_name?: string;
    category?: string;
    type?: string;
  }[];
  const out = d.map((x) => ({
    lat: Number(x.lat),
    lon: Number(x.lon),
    nombre: x.name || x.display_name || texto,
    categoria: x.category ?? "",
    tipo: x.type ?? "",
    fuente: "nominatim" as const,
  }));
  await cacheNominatim.set(url, out);
  return out;
}

async function esri(texto: string, limite: number, red: RedLugar) {
  if (!LLAVE_ESRI) return [];
  const url = `${ESRI}?f=json&countryCode=MEX&maxLocations=${limite}&outFields=Type,PlaceName&singleLine=${encodeURIComponent(texto)}&token=${LLAVE_ESRI}`;
  const guardado = sesionEsri.get(url);
  if (guardado) return guardado;
  const r = await red.fetch(url);
  if (!r.ok) throw new Error(`Esri respondió ${r.status}`);
  const d = (await r.json()) as {
    candidates?: {
      address: string;
      location: { x: number; y: number };
      attributes?: { Type?: string; PlaceName?: string };
    }[];
    error?: { message?: string };
  };
  if (d.error) throw new Error(`Esri: ${d.error.message ?? "error"}`);
  const out = (d.candidates ?? []).map((c) => ({
    lat: c.location.y,
    lon: c.location.x,
    nombre: c.attributes?.PlaceName || c.address,
    categoria: "esri",
    tipo: c.attributes?.Type ?? "",
    fuente: "esri" as const,
  }));
  if (sesionEsri.size >= MAX_CACHE) sesionEsri.delete(sesionEsri.keys().next().value!);
  sesionEsri.set(url, out);
  return out;
}

/** Busca el lugar: Nominatim y, si no responde o no encuentra, Esri. Lanza si ninguno responde. */
export async function geocodificar(
  texto: string,
  red: RedLugar,
  limite = 8,
): Promise<Geocodificacion> {
  let fallo: unknown = null;
  try {
    const r = await nominatim(texto, limite, red);
    if (r.length) return { resultados: r, fuente: "nominatim" };
  } catch (e) {
    fallo = e;
  }
  try {
    const r = await esri(texto, limite, red);
    if (r.length) return { resultados: r, fuente: "esri" };
  } catch (e) {
    fallo ??= e;
  }
  if (fallo) throw fallo;
  return { resultados: [], fuente: null };
}

/** Lo que agrega la explicación según de dónde salió el lugar. */
export const deDondeSalio = (f: "nominatim" | "esri" | null) =>
  f === "esri" ? " (encontrado con Esri)" : ` (${ATRIBUCION_OSM})`;

/** Para las pruebas: olvida la caché y la hora de la última consulta. */
export function olvidarGeocodificaciones() {
  cacheNominatim = enMemoria();
  sesionEsri.clear();
  ultimaNominatim = 0;
}
