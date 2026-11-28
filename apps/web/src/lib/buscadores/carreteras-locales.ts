/**
 * Las carreteras federales y estatales de México guardadas en Croquis (René, 2026-11-28): el km de una
 * carretera sin depender de Overpass, que se satura. Las extrajo una vez de OpenStreetMap
 * `tools/datos/carreteras-mx.mjs` (ODbL, © OpenStreetMap contributors; data/SOURCES.md):
 * motorway, trunk y primary con `ref` (y motorway o trunk con nombre), con su geometría simplificada,
 * y sus mojones. Responde con la misma forma que Overpass, así que `ubicarKm` no cambia.
 *
 * Cómo encuentra la carretera:
 * - por su número («MEX 45»: la libre o la de cuota, como la consulta de Overpass);
 * - por su nombre con las dos poblaciones del tramo («Autopista Toluca - Atlacomulco»), con guion,
 *   guion largo, «Carretera» o «Autopista», sin importar acentos ni el orden;
 * - si su nombre no las dice, por las dos poblaciones de sus extremos: la carretera con número que pasa
 *   cerca de las dos.
 */
import type { KmNarrado, RespuestaOverpass } from "./km-carretera";

type LatLon = { lat: number; lon: number };
interface ViaLocal {
  id: number;
  ref: string;
  nombre: string;
  puntos: LatLon[];
  /** minLat, minLon, maxLat, maxLon */
  caja: [number, number, number, number];
}
interface Red {
  vias: ViaLocal[];
  mojones: { lat: number; lon: number; km: number }[];
}
interface Datos {
  refs: string[];
  nombres: string[];
  vias: (string | number)[][];
  mojones: number[][];
}

/** «Encoded polyline» a puntos (precisión 1e-5). */
export function decodificar(s: string): LatLon[] {
  const out: LatLon[] = [];
  let i = 0,
    lat = 0,
    lon = 0;
  const num = () => {
    let r = 0,
      sh = 0,
      b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      r |= (b & 0x1f) << sh;
      sh += 5;
    } while (b >= 0x20);
    return r & 1 ? ~(r >> 1) : r >> 1;
  };
  while (i < s.length) {
    lat += num();
    lon += num();
    out.push({ lat: lat / 1e5, lon: lon / 1e5 });
  }
  return out;
}

let red: Promise<Red> | null = null;
/** Se cargan una vez, la primera vez que se pide un km (solo en el servidor). */
export function cargarCarreteras(): Promise<Red> {
  return (red ??= import("./datos/carreteras-mx.json").then((m) => armar(m.default as Datos)));
}

function armar(d: Datos): Red {
  const vias = d.vias.map(([r, n, g], id) => {
    const puntos = decodificar(g as string);
    const caja: ViaLocal["caja"] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of puntos) {
      caja[0] = Math.min(caja[0], p.lat);
      caja[1] = Math.min(caja[1], p.lon);
      caja[2] = Math.max(caja[2], p.lat);
      caja[3] = Math.max(caja[3], p.lon);
    }
    return { id: id + 1, ref: d.refs[r as number]!, nombre: d.nombres[n as number]!, puntos, caja };
  });
  return {
    vias,
    mojones: d.mojones.map(([lat, lon, km]) => ({ lat: lat! / 1e5, lon: lon! / 1e5, km: km! })),
  };
}

/** Sin acentos, en minúsculas y sin «carretera», «autopista», «libre»…: para comparar nombres. */
export function sinAdornos(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(carretera|autopista|federal|estatal|libre|cuota|de|del|la|el|tramo)\b/g, " ")
    .replace(/[–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const enCaja = (v: ViaLocal, c: LatLon, m: number) => {
  const dLat = m / 111_320;
  const dLon = m / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  return (
    v.caja[0] <= c.lat + dLat &&
    v.caja[2] >= c.lat - dLat &&
    v.caja[1] <= c.lon + dLon &&
    v.caja[3] >= c.lon - dLon
  );
};

/** Distancia (m) de p al punto más cercano de la vía (por sus segmentos). */
function aVia(v: ViaLocal, p: LatLon): number {
  const kx = Math.cos((p.lat * Math.PI) / 180) * 111_320;
  let min = Infinity;
  for (let i = 1; i < v.puntos.length; i++) {
    const a = v.puntos[i - 1]!,
      b = v.puntos[i]!;
    const ax = (a.lon - p.lon) * kx,
      ay = (a.lat - p.lat) * 111_320;
    const dx = (b.lon - a.lon) * kx,
      dy = (b.lat - a.lat) * 111_320;
    const l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return min;
}

/** «MEX 45» y «MEX 45D» (o solo «MEX 15D»), como en OSM («MEX 45;MEX 2», «MEX-45»). */
function coincideRef(ref: string, buscado: string): boolean {
  const num = buscado.replace(/^MEX\s*/, "");
  const cuota = num.endsWith("D");
  const re = new RegExp(`^MEX\\s*-?\\s*${cuota ? num : `${num}D?`}$`, "i");
  return ref.split(";").some((r) => re.test(r.trim()));
}

/** Qué tan cerca (m) tiene que pasar una carretera de una población para contar como su extremo. */
const CERCA_EXTREMO_M = 4000;

/**
 * Las vías de la carretera narrada y sus mojones, alrededor de `centros` (los extremos del tramo o la
 * población cercana), con la forma de una respuesta de Overpass. Sin vías, `elements` vacío.
 */
export function viasDeLaRed(
  r: Red,
  n: KmNarrado,
  centros: LatLon[],
  radioM: number,
): RespuestaOverpass {
  const cerca = r.vias.filter((v) => centros.some((c) => enCaja(v, c, radioM)));
  let elegidas: ViaLocal[] = [];
  if (n.ref) elegidas = cerca.filter((v) => coincideRef(v.ref, n.ref!));
  else if (n.tramo) {
    const [a, b] = n.tramo.map(sinAdornos) as [string, string];
    elegidas = cerca.filter((v) => {
      const nom = sinAdornos(v.nombre);
      return nom.includes(a) && nom.includes(b);
    });
    // Sin nombre que lo diga: la carretera con número que pasa cerca de los dos extremos.
    if (!elegidas.length && centros.length >= 2) {
      const [o, d] = centros as [LatLon, LatLon];
      const porRef = new Map<string, ViaLocal[]>();
      for (const v of cerca)
        if (v.ref) porRef.set(v.ref, [...(porRef.get(v.ref) ?? []), v]);
      const pasan = [...porRef.entries()]
        .map(([ref, vs]) => ({
          ref,
          vs,
          m: Math.max(
            Math.min(...vs.map((v) => aVia(v, o))),
            Math.min(...vs.map((v) => aVia(v, d))),
          ),
        }))
        .filter((x) => x.m < CERCA_EXTREMO_M)
        .sort((x, y) => x.m - y.m);
      elegidas = pasan[0]?.vs ?? [];
    }
  }
  const elements: RespuestaOverpass["elements"] = elegidas.map((v) => ({
    type: "way",
    id: v.id,
    tags: { ref: v.ref, ...(v.nombre ? { name: v.nombre } : {}) },
    geometry: v.puntos,
  }));
  if (elegidas.length) {
    let id = 1;
    for (const m of r.mojones)
      if (
        centros.some((c) => Math.abs(m.lat - c.lat) < radioM / 111_000 + 0.1) &&
        elegidas.some((v) => enCaja(v, m, 60) && aVia(v, m) < 60)
      )
        elements.push({
          type: "node",
          id: id++,
          lat: m.lat,
          lon: m.lon,
          tags: { highway: "milestone", distance: String(m.km) },
        } as RespuestaOverpass["elements"][number]);
  }
  return { elements };
}
