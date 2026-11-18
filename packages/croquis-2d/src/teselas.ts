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

/**
 * Las calles a `radioM` de `centro` ([lon, lat]) como una respuesta de Overpass: un nodo por vértice
 * (compartido entre líneas que se tocan) y una vía por tramo, con su `highway`, su sentido y su nombre
 * (de `transportation_name`, que comparte los vértices de la calle). Los tramos repetidos (una calle
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
  // El nombre de cada vértice que tiene uno (la capa de nombres repite la geometría de la calle).
  const nombreDe = new Map<string, string>();
  for (const f of nombres) {
    const nombre = (texto(f.properties["name:es"]) || texto(f.properties.name)).trim();
    if (!nombre) continue;
    for (const l of lineas(f.geometry)) for (const p of l) nombreDe.set(claveDe(p), nombre);
  }
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
      const conNombre = l.map((p) => nombreDe.get(claveDe(p))).filter(Boolean) as string[];
      if (conNombre.length) {
        // El nombre que más vértices comparte con el tramo, con dos o más: un solo vértice en común
        // es el cruce con otra calle, no la misma calle.
        const cuenta = new Map<string, number>();
        for (const n of conNombre) cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
        const [nombre, veces] = [...cuenta].sort((a, b) => b[1] - a[1])[0]!;
        if (veces >= 2) tags.name = nombre;
      }
      if (f.properties.oneway === 1) tags.oneway = "yes";
      else if (f.properties.oneway === -1) tags.oneway = "-1";
      vias.push({ type: "way", id: -(vias.length + 1), nodes: l.map(nodo), tags });
    }
  }
  return { elements: [...nodos.values(), ...vias] };
}
