/**
 * «A la altura de Metro Portales», «en la glorieta de la Diana Cazadora», «a la altura de la salida a San
 * Jerónimo», una gasolinera o un centro comercial con nombre: dónde queda esa referencia en OSM y, si la
 * narración nombra la calle, el punto de esa calle más cercano a ella (René, 2026-11-27; en la prueba
 * como perito, Tlalpan a la altura de Portales caía a 7.5 km y la Diana a 4.4 km).
 *
 * La referencia se busca por su nombre y su zona (alcaldía o municipio) en el buscador de lugares y se
 * filtra por su tipo (estación, glorieta o monumento, colonia o avenida, gasolinera, centro comercial):
 * buscarla por nombre en Overpass en un radio de kilómetros pasaba de 70 s. Overpass solo da las calles a
 * 700 m de la referencia.
 *
 * Siempre con su explicación para el perito y su nivel de seguridad. No toca la escena: lo conecta la
 * interfaz de buscadores.
 */
import type { BuscarReferencia, RedLugar, ZonaCaso } from "../buscadores-lugar";
import { coincideCalle } from "./normalizar-calle";

type LatLon = { lat: number; lon: number };

export type TipoReferencia = "estacion" | "glorieta" | "lugar" | "gasolinera" | "comercio";

export interface ReferenciaNarrada {
  tipo: TipoReferencia;
  /** El nombre como lo dice la narración: «Portales», «Diana Cazadora», «San Jerónimo». */
  nombre: string;
  /** La calle donde fue el hecho, si la narración la nombra. */
  calle: string | null;
}

export interface PuntoReferido {
  lat: number;
  lon: number;
  seguridad: "alta" | "media" | "baja";
  /** El elemento de OSM de la referencia y, si la hay, la calle donde quedó el punto. */
  referencia: { nombre: string; osm: string };
  calle: string | null;
  explicacion: string;
  /** Si hay varias referencias con ese nombre: todas, la elegida primero. */
  opciones?: { lat: number; lon: number; nombre: string }[];
}

interface Elemento {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: LatLon;
  tags?: Record<string, string>;
  geometry?: LatLon[];
}
export interface RespuestaOverpass {
  elements: Elemento[];
}
export interface DepsReferencia {
  /** Las calles alrededor de un punto (Overpass; en producción, `/api/osm`). */
  overpass: (consulta: string) => Promise<RespuestaOverpass>;
  /** El buscador de lugares (Nominatim; en producción, `/api/lugar`). */
  buscar: (texto: string) => Promise<Encontrado[]>;
}

const NOMBRE =
  "[A-ZÁÉÍÓÚÑ0-9][\\wÁÉÍÓÚÑáéíóúñ.'-]*(?:\\s+(?:de\\s+(?:la\\s+|los\\s+|las\\s+)?|del\\s+|y\\s+)?[A-ZÁÉÍÓÚÑ0-9][\\wÁÉÍÓÚÑáéíóúñ.'-]*){0,4}";

const PATRONES: { tipo: TipoReferencia; re: RegExp }[] = [
  {
    tipo: "estacion",
    re: new RegExp(
      `\\b(?:estaci[oó]n(?:\\s+del?\\s+(?:metro|metrob[uú]s|tren\\s+ligero))?|metro|metrob[uú]s)\\s+(${NOMBRE})`,
      "i",
    ),
  },
  {
    tipo: "glorieta",
    re: new RegExp(`\\bglorieta\\s+(?:de\\s+(?:la\\s+|los\\s+|las\\s+)?|del\\s+)?(${NOMBRE})`, "i"),
  },
  { tipo: "gasolinera", re: new RegExp(`\\bgasolinera\\s+(${NOMBRE})`, "i") },
  {
    tipo: "comercio",
    re: new RegExp(
      `\\b(?:centro\\s+comercial|plaza\\s+comercial)\\s+(${NOMBRE})|\\b((?:Plaza|Galer[ií]as|Parque)\\s+${NOMBRE})`,
    ),
  },
  {
    tipo: "lugar",
    re: new RegExp(
      `\\b(?:salida\\s+(?:a|hacia)|a\\s+la\\s+altura\\s+de(?:\\s+la\\s+colonia)?|en\\s+la\\s+colonia|colonia|pueblo\\s+de)\\s+(${NOMBRE})`,
    ),
  },
];
const CALLE =
  /\b((?:[Cc]alzada|[Aa]venida|[Aa]v\.|[Bb]oulevard|[Bb]lvd\.?|[Cc]alle|[Pp]aseo|[Pp]erif[eé]rico|[Aa]nillo\s+[Pp]erif[eé]rico|[Vv]iaducto|[Ee]je|[Cc]ircuito)\s+(?:de\s+(?:la\s+|los\s+)?|del\s+)?[A-ZÁÉÍÓÚÑ0-9][\wÁÉÍÓÚÑáéíóúñ.'-]*(?:\s+(?:de\s+(?:la\s+|los\s+)?|del\s+)?[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.'-]*){0,3})/;

/** La referencia que dice el texto (la primera que encuentre) y la calle; `null` si no hay. */
export function leerReferencia(texto: string): ReferenciaNarrada | null {
  for (const { tipo, re } of PATRONES) {
    const m = re.exec(texto);
    const nombre = (m?.[1] ?? m?.[2])?.trim();
    if (!nombre) continue;
    const calle = CALLE.exec(texto.replace(m![0], " "))?.[1]?.trim() ?? null;
    // «la estación Portales del Metro»: el sistema no es parte del nombre.
    // El nombre termina en la primera palabra en minúscula que no sea «de», «del», «la», «y»… seguida
    // de otra con mayúscula («Pemex sobre avenida…» → «Pemex»).
    const ps = nombre.split(/\s+/);
    let fin = 1;
    while (fin < ps.length) {
      const p = ps[fin]!;
      if (/^[A-ZÁÉÍÓÚÑ0-9]/.test(p)) fin++;
      else if (/^(de|del|la|las|los|y)$/.test(p) && /^[A-ZÁÉÍÓÚÑ0-9]/.test(ps[fin + 1] ?? ""))
        fin += 2;
      else break;
    }
    const limpio = ps
      .slice(0, fin)
      .join(" ")
      .replace(/[.,;:]+$/, "")
      .replace(/\s+del?\s+(?:metro|metrob[uú]s|tren\s+ligero)$/i, "");
    return { tipo, nombre: limpio, calle };
  }
  return null;
}

/** Un resultado del buscador de lugares (Nominatim, `format=jsonv2`). */
export interface Encontrado {
  category: string;
  type: string;
  name: string;
  lat: string | number;
  lon: string | number;
}

/** Qué clases de resultado sirven para cada tipo de referencia. */
const CLASES: Record<TipoReferencia, (e: Encontrado) => boolean> = {
  estacion: (e) =>
    (e.category === "railway" && /^(station|halt|stop)$/.test(e.type)) ||
    e.category === "public_transport",
  glorieta: (e) =>
    ["tourism", "historic", "junction"].includes(e.category) ||
    (e.category === "highway" && /roundabout|turning/.test(e.type)),
  // «la salida a San Jerónimo»: la colonia o la avenida de ese nombre.
  lugar: (e) => ["place", "boundary"].includes(e.category) || e.category === "highway",
  gasolinera: (e) => e.category === "amenity" && e.type === "fuel",
  comercio: (e) => (e.category === "shop" && e.type === "mall") || e.category === "landuse",
};

/** La búsqueda de la referencia en el buscador de lugares. */
export function textoDeBusqueda(r: ReferenciaNarrada, zona: string): string {
  return `${r.nombre}, ${zona}`;
}

/** La consulta de las calles con nombre alrededor de la referencia. */
export function consultaCalles(p: LatLon): string {
  return `[out:json][timeout:30];way(around:700,${p.lat.toFixed(6)},${p.lon.toFixed(6)})["highway"]["name"];out tags geom;`;
}

function metros(a: LatLon, b: LatLon): number {
  const k = Math.PI / 180;
  return (
    Math.hypot((b.lon - a.lon) * k * Math.cos(((a.lat + b.lat) / 2) * k), (b.lat - a.lat) * k) *
    6_371_000
  );
}

/** El punto de la polilínea más cercano a `p`. */
function puntoMasCercano(ps: readonly LatLon[], p: LatLon): { q: LatLon; m: number } | null {
  let mejor: { q: LatLon; m: number } | null = null;
  const k = Math.cos((p.lat * Math.PI) / 180);
  for (let i = 0; i + 1 < ps.length; i++) {
    const a = ps[i]!;
    const b = ps[i + 1]!;
    const dx = (b.lon - a.lon) * k;
    const dy = b.lat - a.lat;
    const l2 = dx * dx + dy * dy;
    const t = l2
      ? Math.max(0, Math.min(1, ((p.lon - a.lon) * k * dx + (p.lat - a.lat) * dy) / l2))
      : 0;
    const q = { lat: a.lat + dy * t, lon: a.lon + (b.lon - a.lon) * t };
    const m = metros(p, q);
    if (!mejor || m < mejor.m) mejor = { q, m };
  }
  return mejor;
}

/** Cómo se dice la referencia en la explicación. */
const COMO: Record<TipoReferencia, string> = {
  estacion: "la estación",
  glorieta: "la glorieta",
  lugar: "",
  gasolinera: "la gasolinera",
  comercio: "",
};

/**
 * Dónde queda la referencia del texto y, si nombra la calle, el punto de la calle más cercano a ella.
 * `zona`: la alcaldía o el municipio de la narración. `null` si no hay referencia o no se encuentra.
 */
export async function ubicarReferencia(
  texto: string,
  zona: string,
  deps: DepsReferencia,
): Promise<PuntoReferido | null> {
  const r = leerReferencia(texto);
  if (!r) return null;
  const todos = (await deps.buscar(textoDeBusqueda(r, zona))).map((e) => ({
    e,
    p: { lat: Number(e.lat), lon: Number(e.lon) },
  }));
  const delTipo = todos.filter((x) => CLASES[r.tipo](x.e));
  const usar = delTipo.length ? delTipo : todos;
  // Los candidatos distintos: los que están a más de 300 m uno de otro (una estación trae andenes y
  // accesos; la Diana tiene dos esculturas en el mapa).
  const candidatos: typeof usar = [];
  for (const x of usar) if (candidatos.every((c) => metros(c.p, x.p) > 300)) candidatos.push(x);
  if (!candidatos.length) return null;
  const tipoDudoso = !delTipo.length;
  // Varios tramos de la misma avenida no son lugares distintos.
  const mismaCalle =
    candidatos.every((c) => c.e.category === "highway") &&
    new Set(candidatos.map((c) => c.e.name.replace(/\s+\d+$/, ""))).size === 1;
  const ambigua =
    candidatos.length > 1 && !mismaCalle
      ? ` Hay ${candidatos.length} lugares con ese nombre en el mapa; se tomó el que está junto a ${r.calle ?? "la zona"}.`
      : "";
  const dicha = (c: (typeof candidatos)[number]) =>
    `${COMO[r.tipo] ? `${COMO[r.tipo]} ` : ""}${c.e.name}`.trim();
  const mayuscula = (t: string) => `${t[0]!.toUpperCase()}${t.slice(1)}`;

  if (r.calle) {
    // Para cada candidato, el punto más cercano de la calle narrada; gana el que la tiene más cerca.
    let mejor: {
      c: (typeof candidatos)[number];
      q: LatLon;
      m: number;
      nombre: string;
      seguridad: "alta" | "media" | "baja";
    } | null = null;
    for (const c of candidatos.slice(0, 3)) {
      const vias = (await deps.overpass(consultaCalles(c.p))).elements.filter(
        (e) => e.type === "way" && e.geometry?.length && e.tags && coincideCalle(r.calle!, e.tags),
      );
      for (const v of vias) {
        const cc = puntoMasCercano(v.geometry!, c.p);
        if (cc && (!mejor || cc.m < mejor.m))
          mejor = {
            c,
            ...cc,
            nombre: v.tags!.name ?? r.calle,
            seguridad: coincideCalle(r.calle, v.tags!)!.seguridad,
          };
      }
    }
    if (mejor && mejor.m <= 700) {
      const seg =
        tipoDudoso || mejor.seguridad === "baja"
          ? "baja"
          : mejor.m <= 150 && !ambigua
            ? "alta"
            : "media";
      const elegida = mejor.c;
      return {
        ...mejor.q,
        seguridad: seg,
        ...(ambigua
          ? {
              opciones: [elegida, ...candidatos.filter((x) => x !== elegida)].map((x) => ({
                ...x.p,
                nombre: x.e.name,
              })),
            }
          : {}),
        referencia: { nombre: mejor.c.e.name, osm: `${mejor.c.e.category}/${mejor.c.e.type}` },
        calle: mejor.nombre,
        explicacion: `El punto de ${mejor.nombre} más cercano a ${dicha(mejor.c)} (a ${Math.round(mejor.m)} m), según el mapa.${ambigua}`,
      };
    }
    const c = candidatos[0]!;
    return {
      ...c.p,
      seguridad: "baja",
      referencia: { nombre: c.e.name, osm: `${c.e.category}/${c.e.type}` },
      calle: null,
      explicacion: `${mayuscula(dicha(c))} está en el mapa, pero ${r.calle} no pasa a menos de 700 m: se tomó la referencia misma. Marca el lugar si lo conoces.${ambigua}`,
    };
  }
  const c = candidatos[0]!;
  return {
    ...c.p,
    seguridad: ambigua || tipoDudoso ? "baja" : "media",
    referencia: { nombre: c.e.name, osm: `${c.e.category}/${c.e.type}` },
    calle: null,
    explicacion: `${mayuscula(dicha(c))}, según el mapa (la narración no dice en qué calle).${ambigua}`,
  };
}

const OVERPASS = "https://overpass-api.de/api/interpreter";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/** Las consultas a OSM por la red inyectada: Nominatim (con su pausa de 1 s) y Overpass por POST. */
export function depsDeRed(red: RedLugar): DepsReferencia {
  let primera = true;
  return {
    buscar: async (texto) => {
      if (!primera) await red.pausa?.(1000);
      primera = false;
      const r = await red.fetch(
        `${NOMINATIM}?format=jsonv2&limit=8&countrycodes=mx&q=${encodeURIComponent(texto)}`,
      );
      if (!r.ok) throw new Error(`Nominatim respondió ${r.status}`);
      return (await r.json()) as Encontrado[];
    },
    overpass: async (consulta) => {
      const r = await red.fetch(OVERPASS, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: consulta }).toString(),
      });
      if (!r.ok) throw new Error(`Overpass respondió ${r.status}`);
      return (await r.json()) as RespuestaOverpass;
    },
  };
}

/** La zona como texto para el buscador: «Benito Juárez, Ciudad de México». */
export const textoDeZona = (z: ZonaCaso) => [z.municipio, z.estado].filter(Boolean).join(", ");

/**
 * El buscador de referencias con la interfaz de René (`BuscarReferencia`): «Croquis encontró: Calzada de
 * Tlalpan a la altura de la estación Portales · …». Nunca un punto por omisión: si no lo encuentra, dice
 * por qué.
 */
export const buscarReferencia: BuscarReferencia = async (narracion, zona, red) => {
  const r = leerReferencia(narracion);
  if (!r)
    return {
      encontrado: false,
      como: "referencia",
      aplica: false,
      explicacion: "La narración no da una referencia (una estación, una glorieta, una colonia…).",
    };
  const z = textoDeZona(zona);
  let p: PuntoReferido | null;
  try {
    p = z ? await ubicarReferencia(narracion, z, depsDeRed(red)) : null;
  } catch (e) {
    return {
      encontrado: false,
      como: "referencia",
      aplica: true,
      explicacion: `No pude consultar OpenStreetMap para «${r.nombre}»: ${e instanceof Error ? e.message : String(e)}.`,
    };
  }
  if (!p)
    return {
      encontrado: false,
      como: "referencia",
      aplica: true,
      explicacion: z
        ? `No encontré «${r.nombre}» en OpenStreetMap en ${z}.`
        : `No sé en qué municipio buscar «${r.nombre}»: la narración no lo dice.`,
    };
  return {
    encontrado: true,
    punto: { lat: p.lat, lon: p.lon },
    como: "referencia",
    seguridad: p.seguridad,
    que: p.calle ? `${p.calle} a la altura de ${p.referencia.nombre}` : p.referencia.nombre,
    explicacion: p.explicacion,
    ...(p.opciones
      ? { opciones: p.opciones.map((o) => ({ punto: { lat: o.lat, lon: o.lon }, que: o.nombre })) }
      : {}),
  };
};
