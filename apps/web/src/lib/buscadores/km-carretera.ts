/**
 * «Carretera 45, km 120», «Toluca–Zitácuaro km 30», «MEX-15D km 54»: dónde queda ese kilómetro (René,
 * 2026-11-27; en la prueba como perito, «km 30 de la Toluca–Zitácuaro» caía dentro de Toluca y «km 120
 * de la 45» en el centro de Ciudad Juárez).
 *
 * 1. Lee la carretera (su número, `ref` en OSM), el tramo («Toluca–Zitácuaro»: el origen y el destino),
 *    el kilómetro y la población cercana que diga la narración.
 * 2. Con mojones de OSM (`highway=milestone` con `distance`), el km sale de ellos: el mojón mismo o
 *    interpolado entre los dos que lo rodean.
 * 3. Sin mojones, el km se mide por la carretera desde el origen del tramo: es aproximado (el
 *    kilometraje oficial puede empezar en otro punto) y se dice.
 * 4. Sin origen ni mojones, solo el punto de la carretera más cercano a la población que se nombra.
 *
 * Siempre con su explicación para el perito y su nivel de seguridad. No toca la escena: lo conecta la
 * colocación con la interfaz de René (`buscadores-lugar.ts`).
 */
import { USER_AGENT } from "../../server/osm";
import type { BuscarKmCarretera, RedLugar, ZonaCaso } from "../buscadores-lugar";
import { ATRIBUCION_OSM, geocodificar } from "./geocodificar";

export interface PuntoBuscado {
  lat: number;
  lon: number;
  seguridad: "alta" | "media" | "baja";
  metodo: "mojon" | "interpolado" | "medido-desde-origen" | "cerca-de-poblacion";
  /** Para el perito: cómo se ubicó y qué tan confiable es. */
  explicacion: string;
}

export interface KmNarrado {
  /** El número de la carretera, como en OSM: «MEX 45», «MEX 15D». */
  ref: string | null;
  /** El tramo: de dónde a dónde («Toluca», «Zitácuaro»). */
  tramo: [string, string] | null;
  /** El kilómetro (con los metros de «km 54+300»). */
  km: number;
  /** «cerca de Villa Victoria». */
  cercaDe: string | null;
}

type LatLon = { lat: number; lon: number };
interface Via {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: LatLon[];
}
interface Mojon {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}
export interface RespuestaOverpass {
  elements: (Via | Mojon | { type: string })[];
}

export interface DepsKm {
  /** Una consulta de Overpass QL (en producción, `/api/osm`; en las pruebas, respuestas grabadas). */
  overpass: (consulta: string) => Promise<RespuestaOverpass>;
  /** Dónde está una población (en producción, `/api/lugar`). */
  poblacion: (nombre: string) => Promise<LatLon | null>;
}

const NOMBRE =
  "[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ.]*(?:\\s+(?:de\\s+|del\\s+|la\\s+)?[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ.]*){0,3}";

/** Lo que dice el texto del kilómetro; `null` si no nombra un km de una carretera. */
export function leerKmCarretera(texto: string): KmNarrado | null {
  const k = /\b(?:km\.?|kil[oó]metro)\s*(\d{1,4}(?:[.,]\d+)?)(?:\s*\+\s*(\d{1,3}))?/i.exec(texto);
  if (!k) return null;
  const km = Number(k[1]!.replace(",", ".")) + (k[2] ? Number(k[2]) / 1000 : 0);
  const r =
    /\bMEX\s*[-–]?\s*(\d{1,3})\s*([Dd])?\b/.exec(texto) ??
    /\b(?:carretera|autopista)(?:\s+federal)?(?:\s+(?:n[uú]mero|no\.))?\s+(\d{1,3})\s*([Dd])?\b/i.exec(
      texto,
    );
  const ref = r ? `MEX ${r[1]}${r[2] ? "D" : ""}` : null;
  const t = new RegExp(`(${NOMBRE})\\s*[–—-]\\s*(${NOMBRE})`).exec(texto);
  const tramo: [string, string] | null =
    t && !/^MEX$/i.test(t[1]!) ? [t[1]!.trim(), t[2]!.trim()] : null;
  const c = new RegExp(`\\bcerca\\s+de\\s+(${NOMBRE})`).exec(texto);
  if (!ref && !tramo) return null;
  return { ref, tramo, km, cercaDe: c ? c[1]!.trim() : null };
}

const R = 6_371_000;
function metros(a: LatLon, b: LatLon): number {
  const k = Math.PI / 180;
  const x = (b.lon - a.lon) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  const y = (b.lat - a.lat) * k;
  return Math.hypot(x, y) * R;
}
const clave = (p: LatLon) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
const kmTexto = (m: number) => `${(m / 1000).toFixed(1)} km`;

/** La red de la carretera: vértices (por coordenada) y sus vecinos con la distancia. */
function red(vias: readonly Via[]) {
  const puntos = new Map<string, LatLon>();
  const vecinos = new Map<string, { a: string; m: number }[]>();
  const unir = (a: LatLon, b: LatLon) => {
    const ka = clave(a);
    const kb = clave(b);
    puntos.set(ka, a);
    puntos.set(kb, b);
    const m = metros(a, b);
    (vecinos.get(ka) ?? vecinos.set(ka, []).get(ka)!).push({ a: kb, m });
    (vecinos.get(kb) ?? vecinos.set(kb, []).get(kb)!).push({ a: ka, m });
  };
  for (const v of vias)
    for (let i = 0; i + 1 < (v.geometry?.length ?? 0); i++)
      unir(v.geometry![i]!, v.geometry![i + 1]!);
  return { puntos, vecinos };
}

/** Distancias por la carretera desde `origen` (Dijkstra sencillo: la red es de unos miles de puntos). */
function distancias(r: ReturnType<typeof red>, origen: string): Map<string, number> {
  const d = new Map<string, number>([[origen, 0]]);
  const hechos = new Set<string>();
  const pendientes = new Set<string>([origen]);
  while (pendientes.size) {
    let u = "";
    let du = Infinity;
    for (const p of pendientes) {
      const x = d.get(p)!;
      if (x < du) {
        du = x;
        u = p;
      }
    }
    pendientes.delete(u);
    hechos.add(u);
    for (const { a, m } of r.vecinos.get(u) ?? []) {
      if (hechos.has(a)) continue;
      const nd = du + m;
      if (nd < (d.get(a) ?? Infinity)) {
        d.set(a, nd);
        pendientes.add(a);
      }
    }
  }
  return d;
}

/** El vértice de la red más cercano a `p`. */
function masCercano(r: ReturnType<typeof red>, p: LatLon): { k: string; m: number } | null {
  let mejor: { k: string; m: number } | null = null;
  for (const [k, q] of r.puntos) {
    const m = metros(p, q);
    if (!mejor || m < mejor.m) mejor = { k, m };
  }
  return mejor;
}

/** Los puntos de la red que quedan a `objetivo` metros por la carretera (sobre cada tramo que lo cruza). */
function aDistancia(r: ReturnType<typeof red>, d: Map<string, number>, objetivo: number): LatLon[] {
  const out: LatLon[] = [];
  for (const [u, du] of d)
    for (const { a, m } of r.vecinos.get(u) ?? []) {
      const da = d.get(a);
      if (da === undefined || !(du <= objetivo && da > objetivo) || m <= 0) continue;
      const f = (objetivo - du) / m;
      const p = r.puntos.get(u)!;
      const q = r.puntos.get(a)!;
      out.push({ lat: p.lat + (q.lat - p.lat) * f, lon: p.lon + (q.lon - p.lon) * f });
    }
  return out;
}

/** La caja que cubre `radioM` alrededor de `c`, para la consulta. */
function caja(c: LatLon, radioM: number): string {
  const dLat = radioM / 111_320;
  const dLon = radioM / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  const f = (x: number) => x.toFixed(4);
  return `${f(c.lat - dLat)},${f(c.lon - dLon)},${f(c.lat + dLat)},${f(c.lon + dLon)}`;
}

/** La consulta de Overpass: la carretera (por su número o por su tramo) y sus mojones, alrededor de `c`. */
export function consultaKm(n: KmNarrado, c: LatLon, radioM: number): string {
  const b = caja(c, radioM);
  const filtro = n.ref
    ? // «Carretera 45» puede ser la libre o la de cuota (45D); «MEX-15D», solo la de cuota.
      `["ref"~"^${n.ref.replace(" ", " ?-?")}${n.ref.endsWith("D") ? "" : "D?"}$"]`
    : `["name"~"${n.tramo![0]}.*${n.tramo![1]}|${n.tramo![1]}.*${n.tramo![0]}",i]`;
  return (
    `[out:json][timeout:60];way(${b})["highway"~"^(motorway|trunk|primary|secondary)(_link)?$"]${filtro}->.w;` +
    `.w out tags geom;node(around.w:40)["highway"="milestone"];out;`
  );
}

/** Dónde queda el km que dice el texto; `null` si no nombra uno o no se encuentra la carretera. */
export async function ubicarKm(texto: string, deps: DepsKm): Promise<PuntoBuscado | null> {
  const n = leerKmCarretera(texto);
  if (!n) return null;
  const origen = n.tramo ? await deps.poblacion(n.tramo[0]) : null;
  const destino = n.tramo ? await deps.poblacion(n.tramo[1]) : null;
  const cerca = n.cercaDe ? await deps.poblacion(n.cercaDe) : null;
  const centro = origen ?? cerca;
  if (!centro) return null;
  const radio = origen ? n.km * 1000 + 15_000 : 25_000;
  // La carretera alrededor de los dos extremos del tramo: el km se puede contar desde cualquiera.
  const resp = await deps.overpass(consultaKm(n, centro, radio));
  if (origen && destino) {
    const ids = new Set(resp.elements.map((e) => `${e.type}/${(e as { id?: number }).id}`));
    for (const e of (await deps.overpass(consultaKm(n, destino, radio))).elements)
      if (!ids.has(`${e.type}/${(e as { id?: number }).id}`)) resp.elements.push(e);
  }
  const vias = resp.elements.filter((e): e is Via => e.type === "way" && !!(e as Via).geometry);
  if (!vias.length) return null;
  const r = red(vias);
  const nombreVia = n.ref ?? `${n.tramo![0]}–${n.tramo![1]}`;
  const aviso = (p: LatLon) => {
    if (!cerca || !n.cercaDe) return { texto: "", lejos: false };
    const m = metros(p, cerca);
    return m > 15_000
      ? {
          texto: ` Ojo: queda a ${kmTexto(m)} de ${n.cercaDe}, que también dice la narración; revisa el kilómetro.`,
          lejos: true,
        }
      : { texto: ` Queda a ${kmTexto(m)} de ${n.cercaDe}, como dice la narración.`, lejos: false };
  };

  // Con mojones: el mojón del km, o interpolado entre los dos que lo rodean.
  const mojones = resp.elements
    .filter((e): e is Mojon => e.type === "node" && (e as Mojon).tags?.highway === "milestone")
    .map((m) => ({ m, km: Number((m.tags?.distance ?? m.tags?.pk ?? "").replace(",", ".")) }))
    .filter((x) => Number.isFinite(x.km))
    .sort((a, b) => a.km - b.km);
  const exacto = mojones.find((x) => Math.abs(x.km - n.km) < 0.05);
  if (exacto) {
    const a = aviso(exacto.m);
    return {
      lat: exacto.m.lat,
      lon: exacto.m.lon,
      seguridad: a.lejos ? "media" : "alta",
      metodo: "mojon",
      explicacion: `km ${n.km} de la ${nombreVia}: el mojón del km ${exacto.km} en el mapa.${a.texto}`,
    };
  }
  const antes = [...mojones].reverse().find((x) => x.km < n.km);
  const despues = mojones.find((x) => x.km > n.km);
  if (antes && despues) {
    const ka = masCercano(r, antes.m);
    const kd = masCercano(r, despues.m);
    if (ka && kd) {
      const d = distancias(r, ka.k);
      const total = d.get(kd.k);
      if (total) {
        const f = (n.km - antes.km) / (despues.km - antes.km);
        const cand = aDistancia(r, d, f * total);
        const pd = r.puntos.get(kd.k)!;
        const p = cand.sort((x, y) => metros(x, pd) - metros(y, pd))[0];
        if (p) {
          const a = aviso(p);
          return {
            ...p,
            seguridad: a.lejos ? "baja" : "media",
            metodo: "interpolado",
            explicacion: `km ${n.km} de la ${nombreVia}, interpolado por la carretera entre los mojones ${antes.km} y ${despues.km}.${a.texto}`,
          };
        }
      }
    }
  }

  // Sin mojones, desde un extremo del tramo, medido por la carretera. Con una población narrada como
  // ancla (René, 2026-11-28: el km 120 de la 45 contado desde Chihuahua quedaba a 108 km de Villa
  // Ahumada), se prueban los dos sentidos y se elige el que deja el km cerca de ella; si aun así queda a
  // más de 10 km, va como dudoso para que el perito lo confirme.
  if (n.tramo && (origen || destino)) {
    const sentidos: { desde: string; punto: LatLon }[] = [];
    const extremos = [
      [n.tramo[0], origen, destino],
      [n.tramo[1], destino, origen],
    ] as const;
    for (const [desde, de, hacia] of extremos) {
      if (!de) continue;
      const o = masCercano(r, de);
      if (!o) continue;
      const cand = aDistancia(r, distancias(r, o.k), n.km * 1000);
      const p = hacia ? cand.sort((x, y) => metros(x, hacia) - metros(y, hacia))[0] : cand[0];
      if (p) sentidos.push({ desde, punto: p });
      if (!cerca) break; // sin ancla, desde el primero que dice la narración
    }
    if (sentidos.length) {
      const [elegido, ...otros] = cerca
        ? [...sentidos].sort((a, b) => metros(a.punto, cerca) - metros(b.punto, cerca))
        : sentidos;
      const m = cerca ? metros(elegido!.punto, cerca) : null;
      const dudoso = m !== null && m > 10_000;
      const otro = otros[0];
      const comparado =
        cerca && otro && n.cercaDe
          ? `; contado desde ${otro.desde} quedaba a ${kmTexto(metros(otro.punto, cerca))} de ${n.cercaDe}`
          : "";
      return {
        ...elegido!.punto,
        seguridad: m !== null && !dudoso ? "media" : "baja",
        metodo: "medido-desde-origen",
        explicacion:
          `km ${n.km} de la ${nombreVia}, medido por la carretera desde ${elegido!.desde}` +
          (cerca && n.cercaDe
            ? ` (el sentido que lo deja a ${kmTexto(m!)} de ${n.cercaDe}${comparado})`
            : "") +
          ". Aproximado: el mapa no tiene mojones en este tramo." +
          (dudoso
            ? ` Dudoso: aun así queda a ${kmTexto(m!)} de ${n.cercaDe}; confírmalo o márcalo en el mapa.`
            : ""),
      };
    }
  }

  // Sin origen ni mojones: el punto de la carretera más cercano a la población nombrada.
  if (cerca && n.cercaDe) {
    const c = masCercano(r, cerca);
    if (c) {
      const p = r.puntos.get(c.k)!;
      return {
        lat: p.lat,
        lon: p.lon,
        seguridad: "baja",
        metodo: "cerca-de-poblacion",
        explicacion:
          `El punto de la ${nombreVia} más cercano a ${n.cercaDe} (a ${kmTexto(c.m)}): el km ${n.km} no se pudo ubicar` +
          " porque el mapa no tiene mojones y no se sabe desde dónde se cuenta. Marca el lugar exacto si lo conoces.",
      };
    }
  }
  return null;
}

const OVERPASS = "https://overpass-api.de/api/interpreter";

/**
 * Las consultas por la red inyectada: Overpass por POST y las poblaciones con `geocodificar` (Nominatim
 * con su política de uso y, de respaldo, Esri). `fuentes` dice de dónde salieron las poblaciones.
 */
export function depsDeRed(
  zona: ZonaCaso,
  red: RedLugar,
): DepsKm & { fuentes: Set<"nominatim" | "esri"> } {
  const fuentes = new Set<"nominatim" | "esri">();
  return {
    fuentes,
    overpass: async (consulta) => {
      const r = await red.fetch(OVERPASS, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
        body: new URLSearchParams({ data: consulta }).toString(),
      });
      if (!r.ok) throw new Error(`Overpass respondió ${r.status}`);
      return (await r.json()) as RespuestaOverpass;
    },
    poblacion: async (nombre) => {
      const g = await geocodificar([nombre, zona.estado].filter(Boolean).join(", "), red, 5);
      if (g.fuente) fuentes.add(g.fuente);
      // La población, no un arroyo ni una calle con su nombre («Arroyo Villa Ahumada»).
      const p =
        g.resultados.find((x) => x.categoria === "place" || x.categoria === "boundary") ??
        g.resultados[0];
      return p ? { lat: p.lat, lon: p.lon } : null;
    },
  };
}

/**
 * El buscador del km con la interfaz de René (`BuscarKmCarretera`): «Croquis encontró: km 30 de la MEX 15
 * · …». Nunca un punto por omisión: si no lo ubica, dice por qué.
 */
export const buscarKmCarretera: BuscarKmCarretera = async (narracion, zona, red) => {
  const n = leerKmCarretera(narracion);
  if (!n)
    return {
      encontrado: false,
      como: "km",
      aplica: false,
      explicacion: "La narración no nombra el kilómetro de una carretera.",
    };
  const via = n.ref ?? `${n.tramo![0]}–${n.tramo![1]}`;
  let p: PuntoBuscado | null;
  const deps = depsDeRed(zona, red);
  try {
    p = await ubicarKm(narracion, deps);
  } catch (e) {
    return {
      encontrado: false,
      como: "km",
      aplica: true,
      explicacion: `No pude consultar OpenStreetMap para el km ${n.km} de la ${via}: ${e instanceof Error ? e.message : String(e)}.`,
    };
  }
  if (!p)
    return {
      encontrado: false,
      como: "km",
      aplica: true,
      explicacion:
        n.tramo || n.cercaDe
          ? `No encontré la ${via} en OpenStreetMap cerca de ${n.tramo?.[0] ?? n.cercaDe}.`
          : `No puedo ubicar el km ${n.km} de la ${via}: el mapa no tiene sus postes y la narración no dice el tramo ni una población cercana.`,
    };
  return {
    encontrado: true,
    punto: { lat: p.lat, lon: p.lon },
    como: "km",
    seguridad: p.seguridad,
    que:
      p.metodo === "cerca-de-poblacion"
        ? `la ${via} cerca de ${n.cercaDe}`
        : `km ${n.km} de la ${via}`,
    // La atribución que pide OSM y, si una población salió de Esri, que lo diga.
    explicacion: `${p.explicacion} Datos de OpenStreetMap (${ATRIBUCION_OSM})${deps.fuentes.has("esri") ? "; la población, encontrada con Esri" : ""}.`,
  };
};
