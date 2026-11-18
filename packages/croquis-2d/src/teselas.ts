/**
 * Las calles desde las teselas vectoriales del mapa (OpenFreeMap, esquema OpenMapTiles), con la forma
 * de una respuesta de Overpass (René, 2026-11-18, ronda 4: en el caso del Boulevard Adolfo Ruiz
 * Cortines las flechas salieron por puntos cardinales aunque el mapa mostraba el boulevard).
 *
 * El mapa de La escena ya trae las calles en sus teselas; Overpass tarda (unos 35 s el 2026-11-18) o
 * no responde. Con esto, Croquis propone el cruce y las flechas en cuanto el mapa terminó de dibujar,
 * y Overpass, si llega, solo afina (trae carriles y anchos que las teselas no tienen).
 *
 * Mismos datos (OpenStreetMap, ODbL) y misma atribución que el mapa. Las teselas llegan hasta zoom 14:
 * la geometría es de unos 0.6 m, de sobra para el rumbo de una flecha.
 */
import type { OsmNode, OsmWay, OverpassResponse } from "./osm";

/** Una línea de las capas `transportation` o `transportation_name`, como la da MapLibre. */
export interface LineaTesela {
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

/** La clase de OpenMapTiles → la etiqueta `highway` de OSM (solo lo que es calle para vehículos). */
const CLASE_A_HIGHWAY: Readonly<Record<string, string>> = {
  motorway: "motorway",
  trunk: "trunk",
  primary: "primary",
  secondary: "secondary",
  tertiary: "tertiary",
  minor: "residential",
  service: "service",
};

/** Un texto de las propiedades de la tesela (los números y lo demás no cuentan). */
const texto = (x: unknown): string => (typeof x === "string" ? x : "");

const lineas = (g: LineaTesela["geometry"]): [number, number][][] =>
  g.type === "LineString"
    ? [g.coordinates as [number, number][]]
    : g.type === "MultiLineString"
      ? (g.coordinates as [number, number][][])
      : [];

/** La clave de un vértice: el mismo punto en dos líneas es el mismo nodo (así se ven los cruces). */
const claveDe = ([lon, lat]: [number, number]) => `${lon.toFixed(7)},${lat.toFixed(7)}`;

/** Metros entre dos puntos cercanos (equirectangular). */
function metros(a: [number, number], b: [number, number]): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]) * 111_320;
}

/** Metros de `p` al segmento `a`–`b` (plano local, equirectangular). */
function aSegmento(p: [number, number], a: [number, number], b: [number, number]): number {
  const k = Math.cos((p[1] * Math.PI) / 180) * 111_320;
  const ax = (a[0] - p[0]) * k;
  const ay = (a[1] - p[1]) * 111_320;
  const bx = (b[0] - p[0]) * k;
  const by = (b[1] - p[1]) * 111_320;
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/**
 * Las calles a `radioM` de `centro` ([lon, lat]) como una respuesta de Overpass: un nodo por vértice
 * (compartido entre líneas que se tocan) y una vía por tramo, con su `highway`, su sentido y su nombre
 * (de `transportation_name`, la línea con nombre más cercana a su punto medio). Los tramos repetidos (una calle
 * en dos teselas vecinas) salen una vez.
 */
export function overpassDeTeselas(
  calles: readonly LineaTesela[],
  nombres: readonly LineaTesela[],
  centro: readonly [number, number],
  radioM: number,
): OverpassResponse {
  const nodos = new Map<string, OsmNode>();
  const nodo = (p: [number, number]): number => {
    const k = claveDe(p);
    let n = nodos.get(k);
    if (!n) {
      n = { type: "node", id: -(nodos.size + 1), lat: p[1], lon: p[0] };
      nodos.set(k, n);
    }
    return n.id;
  };
  // Las líneas con nombre (la capa de nombres repite la geometría de las calles, a veces partida
  // distinto): el nombre de un tramo es el de la línea que pasa a menos de 3 m de su punto medio.
  const conNombre: { nombre: string; l: [number, number][] }[] = [];
  for (const f of nombres) {
    const nombre = (texto(f.properties["name:es"]) || texto(f.properties.name)).trim();
    if (!nombre) continue;
    for (const l of lineas(f.geometry)) if (l.length >= 2) conNombre.push({ nombre, l });
  }
  const nombreCerca = (p: [number, number]): string | null => {
    let mejor: { nombre: string; d: number } | null = null;
    for (const { nombre, l } of conNombre) {
      for (let i = 0; i + 1 < l.length; i++) {
        const d = aSegmento(p, l[i]!, l[i + 1]!);
        if (d <= 3 && (!mejor || d < mejor.d)) mejor = { nombre, d };
      }
    }
    return mejor?.nombre ?? null;
  };
  const vistas = new Set<string>();
  const vias: OsmWay[] = [];
  for (const f of calles) {
    const highway = CLASE_A_HIGHWAY[texto(f.properties.class)];
    if (!highway) continue;
    // Las rampas son enlaces: en OSM, `<clase>_link`.
    const tipo =
      f.properties.ramp === 1 && highway !== "residential" && highway !== "service"
        ? `${highway}_link`
        : highway;
    for (const l of lineas(f.geometry)) {
      if (l.length < 2 || !l.some((p) => metros(p, centro as [number, number]) <= radioM)) continue;
      const firma = l.map(claveDe).join(";");
      const reves = [...l].reverse().map(claveDe).join(";");
      if (vistas.has(firma) || vistas.has(reves)) continue;
      vistas.add(firma);
      const tags: Record<string, string> = { highway: tipo };
      // El punto medio del tramo (a la mitad de su arista central).
      const k = Math.floor((l.length - 1) / 2);
      const medio: [number, number] = [
        (l[k]![0] + l[k + 1]![0]) / 2,
        (l[k]![1] + l[k + 1]![1]) / 2,
      ];
      const nombre = nombreCerca(medio);
      if (nombre) tags.name = nombre;
      if (f.properties.oneway === 1) tags.oneway = "yes";
      else if (f.properties.oneway === -1) tags.oneway = "-1";
      vias.push({ type: "way", id: -(vias.length + 1), nodes: l.map(nodo), tags });
    }
  }
  return { elements: [...nodos.values(), ...vias] };
}
