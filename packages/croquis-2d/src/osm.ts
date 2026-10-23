/**
 * De una respuesta de Overpass a `lugar.red_vial` y a la plantilla paramétrica alineada con el
 * mapa (ADR 0023). La usan el script que arma las escenas con `ubicacion_real` y producción.
 *
 * Proyección: equirrectangular local alrededor de `ubicacion_real` (este, norte en metros, radio
 * medio de la Tierra 6 371 008.8 m). A menos de 500 m del origen el error es de centímetros. Luego
 * se gira `−rotacion_deg` para que el eje de la calle principal quede sobre +X, como en las
 * plantillas paramétricas (ADR 0006).
 */
import type { EscenaSpec } from "@croquis/scene-schema";

export const EARTH_RADIUS_M = 6_371_008.8;
export const OSM_ATTRIBUTION =
  "Contiene información de OpenStreetMap, disponible en openstreetmap.org bajo la Open Database License (ODbL)";

/** Calles que se dibujan y su jerarquía (mayor = más importante). Andadores y ciclovías no. */
export const HIGHWAY_RANK: Readonly<Record<string, number>> = {
  motorway: 9,
  trunk: 8,
  primary: 7,
  secondary: 6,
  tertiary: 5,
  unclassified: 4,
  residential: 3,
  living_street: 2,
  service: 1,
  motorway_link: 8,
  trunk_link: 7,
  primary_link: 6,
  secondary_link: 5,
  tertiary_link: 4,
};

export interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  /** Las etiquetas del nodo (árboles, postes); las calles no las usan. */
  tags?: Record<string, string>;
}
export interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}
export interface OverpassResponse {
  osm3s?: { timestamp_osm_base?: string };
  elements: (OsmNode | OsmWay | { type: string })[];
}

export interface Point {
  x: number;
  y: number;
}

export interface ViaMapa {
  id_osm: number;
  tipo: string;
  nombre?: string;
  carriles?: number;
  ancho_m?: number;
  un_sentido?: boolean;
  puntos: Point[];
}

export interface RedVial {
  fuente_datos: "OpenStreetMap";
  licencia: "ODbL-1.0";
  atribucion: string;
  consultado: string;
  nodo_cruce?: number;
  vias: ViaMapa[];
}

/** Este y norte (m) de un punto respecto al origen. */
export function enu(lat: number, lon: number, lat0: number, lon0: number): Point {
  const k = (Math.PI / 180) * EARTH_RADIUS_M;
  return { x: (lon - lon0) * k * Math.cos((lat0 * Math.PI) / 180), y: (lat - lat0) * k };
}

export function rotateDeg(p: Point, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
}

function parts(resp: OverpassResponse): { nodes: Map<number, OsmNode>; ways: OsmWay[] } {
  const nodes = new Map<number, OsmNode>();
  const ways: OsmWay[] = [];
  for (const e of resp.elements) {
    if (e.type === "node") nodes.set((e as OsmNode).id, e as OsmNode);
    else if (e.type === "way") {
      const w = e as OsmWay;
      if (w.tags?.highway && HIGHWAY_RANK[w.tags.highway] !== undefined) ways.push(w);
    }
  }
  return { nodes, ways };
}

function lanesOf(w: OsmWay): number | undefined {
  const n = Number.parseInt(w.tags?.lanes ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : undefined;
}

function widthOf(w: OsmWay): number | undefined {
  const m = /^\s*([\d.]+)\s*(m)?\s*$/.exec(w.tags?.width ?? "");
  const v = m ? Number(m[1]) : Number.NaN;
  return Number.isFinite(v) && v >= 2 && v <= 60 ? v : undefined;
}

function oneway(w: OsmWay): -1 | 0 | 1 {
  const v = w.tags?.oneway;
  if (v === "yes" || v === "1" || v === "true") return 1;
  if (v === "-1" || v === "reverse") return -1;
  return 0;
}

export interface Arm {
  wayId: number;
  /** Rumbo del brazo desde el cruce, en grados antihorarios desde el este. */
  bearingDeg: number;
  rank: number;
  lanes?: number;
}

export interface Crossing {
  nodeId: number;
  arms: Arm[];
  /** Calle principal (mayor jerarquía; empate: más carriles) y rumbo de su eje. */
  main: OsmWay;
  mainAxisDeg: number;
  /** La otra calle con brazos en el cruce, si la hay. */
  secondary?: OsmWay;
}

const norm = (d: number): number => ((d % 360) + 360) % 360;
const axisDiff = (a: number, b: number): number => {
  const d = Math.abs(norm(a) - norm(b)) % 180;
  return Math.min(d, 180 - d);
};

/** Brazos del cruce en `nodeId`: un brazo por cada vecino del nodo en cada calle. */
export function crossingAt(resp: OverpassResponse, nodeId: number): Crossing {
  const { nodes, ways } = parts(resp);
  const c = nodes.get(nodeId);
  if (!c) throw new Error(`El nodo ${nodeId} no está en la respuesta`);
  const arms: Arm[] = [];
  for (const w of ways) {
    w.nodes.forEach((id, i) => {
      if (id !== nodeId) return;
      for (const j of [i - 1, i + 1]) {
        const nb = nodes.get(w.nodes[j] ?? -1);
        if (!nb) continue;
        const p = enu(nb.lat, nb.lon, c.lat, c.lon);
        arms.push({
          wayId: w.id,
          bearingDeg: norm((Math.atan2(p.y, p.x) * 180) / Math.PI),
          rank: HIGHWAY_RANK[w.tags!.highway!]!,
          lanes: lanesOf(w),
        });
      }
    });
  }
  if (arms.length === 0) throw new Error(`El nodo ${nodeId} no es parte de ninguna calle`);
  const byId = new Map(ways.map((w) => [w.id, w]));
  const best = [...arms].sort((a, b) => b.rank - a.rank || (b.lanes ?? 0) - (a.lanes ?? 0))[0]!;
  const main = byId.get(best.wayId)!;
  const name = main.tags?.name;
  // Eje principal: el brazo principal; la calle principal sigue del otro lado si hay un brazo de
  // la misma calle (mismo nombre o mismo way) casi opuesto.
  const mainAxisDeg = best.bearingDeg;
  const sec = arms
    .filter((a) => axisDiff(a.bearingDeg, mainAxisDeg) > 30)
    .map((a) => byId.get(a.wayId)!)
    .find((w) => w.tags?.name !== name || name === undefined);
  return { nodeId, arms, main, mainAxisDeg, secondary: sec };
}

/** Brazos distintos (los que difieren más de 20° en rumbo): 3 es una T, 4 o más, una X. */
export function distinctArms(arms: readonly Arm[]): number {
  const out: number[] = [];
  for (const a of [...arms].sort((p, q) => p.bearingDeg - q.bearingDeg)) {
    if (
      !out.some((b) => Math.min(Math.abs(b - a.bearingDeg), 360 - Math.abs(b - a.bearingDeg)) < 20)
    )
      out.push(a.bearingDeg);
  }
  return out.length;
}

export interface RedVialOptions {
  lat: number;
  lon: number;
  radioM: number;
  rotacionDeg: number;
  nodoCruce?: number;
}

/** Calles de la respuesta, en metros locales, recortadas a 1.5 radios del origen. */
export function redVialFrom(resp: OverpassResponse, o: RedVialOptions): RedVial {
  const { nodes, ways } = parts(resp);
  const vias: ViaMapa[] = [];
  const maxR = 1.5 * o.radioM;
  for (const w of ways) {
    let pts = w.nodes
      .map((id) => nodes.get(id))
      .filter((n): n is OsmNode => n !== undefined)
      .map((n) => rotateDeg(enu(n.lat, n.lon, o.lat, o.lon), -o.rotacionDeg));
    if (oneway(w) === -1) pts = pts.reverse();
    // Tramo continuo de puntos dentro del radio ampliado (la consulta ya trae solo calles cerca).
    const inside = pts.map((p) => Math.hypot(p.x, p.y) <= maxR);
    const first = inside.indexOf(true);
    const last = inside.lastIndexOf(true);
    if (first < 0 || last - first < 1) continue;
    const kept = pts.slice(first, last + 1).map((p) => ({
      x: Math.round(p.x * 1000) / 1000,
      y: Math.round(p.y * 1000) / 1000,
    }));
    const via: ViaMapa = { id_osm: w.id, tipo: w.tags!.highway!, puntos: kept.slice(0, 400) };
    if (w.tags?.name) via.nombre = w.tags.name.slice(0, 120);
    const lanes = lanesOf(w);
    if (lanes !== undefined) via.carriles = lanes;
    const width = widthOf(w);
    if (width !== undefined) via.ancho_m = width;
    if (oneway(w) !== 0) via.un_sentido = true;
    vias.push(via);
  }
  // Las de mayor jerarquía primero; el contrato admite hasta 64.
  vias.sort(
    (a, b) => (HIGHWAY_RANK[b.tipo] ?? 0) - (HIGHWAY_RANK[a.tipo] ?? 0) || a.id_osm - b.id_osm,
  );
  const red: RedVial = {
    fuente_datos: "OpenStreetMap",
    licencia: "ODbL-1.0",
    atribucion: OSM_ATTRIBUTION,
    consultado: resp.osm3s?.timestamp_osm_base ?? "",
    vias: vias.slice(0, 64),
  };
  if (o.nodoCruce !== undefined) red.nodo_cruce = o.nodoCruce;
  return red;
}

export interface TemplateFromMap {
  tipo_via: "interseccion_x" | "interseccion_t" | "recta";
  sentidos: "un_sentido" | "doble_sentido";
  carriles_por_sentido: number;
  carriles_por_sentido_secundaria?: number;
  /** Ancho de carril desde `width`/`lanes`; sin `width`, no se deriva (queda el de siempre). */
  ancho_carril_m?: number;
  rotacion_deg: number;
}

/** Plantilla paramétrica alineada con el cruce: tipo, sentidos, carriles y rotación. */
export function templateFromCrossing(c: Crossing): TemplateFromMap {
  const n = distinctArms(c.arms);
  const ow = oneway(c.main) !== 0;
  const lanes = lanesOf(c.main) ?? (ow ? 1 : 2);
  const t: TemplateFromMap = {
    tipo_via: n >= 4 ? "interseccion_x" : n === 3 ? "interseccion_t" : "recta",
    sentidos: ow ? "un_sentido" : "doble_sentido",
    carriles_por_sentido: ow ? lanes : Math.max(1, Math.ceil(lanes / 2)),
    rotacion_deg: Math.round(c.mainAxisDeg * 100) / 100,
  };
  if (c.secondary) {
    const ls = lanesOf(c.secondary);
    if (ls !== undefined)
      t.carriles_por_sentido_secundaria =
        oneway(c.secondary) !== 0 ? ls : Math.max(1, Math.ceil(ls / 2));
  }
  const w = widthOf(c.main);
  if (w !== undefined) t.ancho_carril_m = Math.round((w / lanes) * 100) / 100;
  return t;
}

/**
 * Consulta Overpass QL de las calles a menos de `radioM` del punto, con sus nodos: la misma que usa
 * `croquis-data osm` (ADR 0023), para que producción y los extractos versionados coincidan.
 */
export function overpassQuery(lat: number, lon: number, radioM: number): string {
  return (
    `[out:json][timeout:25];way(around:${radioM},${lat},${lon})["highway"];` +
    "out body;>;out skel qt;"
  );
}

/**
 * Nodo de cruce más cercano al punto (a menos de `maxM`): un nodo compartido por dos o más calles,
 * con al menos tres brazos distintos (una T o una X). null si no hay ninguno.
 */
export function nearestCrossing(
  resp: OverpassResponse,
  lat: number,
  lon: number,
  maxM = 60,
): number | null {
  const { nodes, ways } = parts(resp);
  const count = new Map<number, number>();
  for (const w of ways) {
    for (const id of new Set(w.nodes)) count.set(id, (count.get(id) ?? 0) + 1);
  }
  let best: { id: number; d: number } | null = null;
  for (const [id, n] of count) {
    if (n < 2) continue;
    const node = nodes.get(id);
    if (!node) continue;
    const p = enu(node.lat, node.lon, lat, lon);
    const d = Math.hypot(p.x, p.y);
    if (d > maxM || (best && d >= best.d)) continue;
    if (distinctArms(crossingAt(resp, id).arms) < 3) continue;
    best = { id, d };
  }
  return best?.id ?? null;
}

/** Calles del mapa ya puestas en la escena. */
export interface MapaAplicado {
  spec: EscenaSpec;
  nodo: number;
  vias: number;
}

/**
 * Pone en la escena las calles reales alrededor del punto (ADR 0040): el cruce más cercano queda en
 * el origen con la calle principal sobre +X, la plantilla paramétrica (tipo, sentidos, carriles y
 * ancho de carril si OSM lo trae) se deriva del cruce, y la red se guarda en `lugar.red_vial` para
 * que la escena sea determinista y funcione sin red. Los campos que salen del mapa llevan la fuente
 * `mapa` y conservan la evidencia del relato que tuvieran. Sin cruce cerca, error: no se inventa
 * una orientación.
 */
export function applyMap(
  spec: EscenaSpec,
  resp: OverpassResponse,
  o: { lat: number; lon: number; radioM: number },
): MapaAplicado {
  const nodo = nearestCrossing(resp, o.lat, o.lon);
  if (nodo === null) {
    throw new Error(
      "No encontré un cruce de calles a menos de 60 m de esas coordenadas. Ponlas sobre el cruce.",
    );
  }
  const { nodes } = parts(resp);
  const c = nodes.get(nodo)!;
  const cruce = crossingAt(resp, nodo);
  const t = templateFromCrossing(cruce);
  const red = redVialFrom(resp, {
    lat: c.lat,
    lon: c.lon,
    radioM: o.radioM,
    rotacionDeg: t.rotacion_deg,
    nodoCruce: nodo,
  });
  const out = structuredClone(spec);
  const lugar = out.lugar as unknown as Record<string, unknown>;
  const field = (key: string, valor: unknown, confianza: number, nota: string, extra = {}) => {
    const prev = lugar[key] as { evidencia?: unknown } | undefined;
    lugar[key] = {
      valor,
      fuente: "mapa",
      confianza,
      ...(prev?.evidencia ? { evidencia: prev.evidencia } : {}),
      nota,
      ...extra,
    };
  };
  const principal = cruce.main.tags?.name ?? "la calle principal";
  field("tipo_via", t.tipo_via, 0.9, `Del cruce en OpenStreetMap (nodo ${nodo}, ADR 0040).`);
  field("sentidos", t.sentidos, 0.85, `Sentido de ${principal} en OSM (oneway).`);
  field(
    "carriles_por_sentido",
    t.carriles_por_sentido,
    0.85,
    `Carriles de ${principal} en OSM (lanes, o el valor usual si no viene).`,
  );
  if (t.carriles_por_sentido_secundaria !== undefined) {
    field(
      "carriles_por_sentido_secundaria",
      t.carriles_por_sentido_secundaria,
      0.85,
      `Carriles de ${cruce.secondary?.tags?.name ?? "la calle secundaria"} en OSM (lanes).`,
    );
  }
  if (t.ancho_carril_m !== undefined) {
    field(
      "ancho_carril",
      t.ancho_carril_m,
      0.8,
      `Ancho de ${principal} en OSM entre sus carriles.`,
      {
        unidad: "m",
      },
    );
  }
  lugar.ubicacion_real = {
    lat: c.lat,
    lon: c.lon,
    radio_m: o.radioM,
    rotacion_deg: t.rotacion_deg,
    procedencia: {
      fuente: "usuario",
      confianza: 1,
      nota: `Coordenadas que dio la persona; el origen es el cruce más cercano en OSM (nodo ${nodo}).`,
    },
  };
  lugar.red_vial = red;
  return { spec: out, nodo, vias: red.vias.length };
}

// --- Objetos del lugar (R10, ADR 0081) ------------------------------------------------------------

/**
 * Consulta de los objetos del lugar que el 3D dibuja: árboles, postes de alumbrado y de luz, y
 * bardas y muros. Va aparte de la de calles (`overpassQuery`), que comparten los extractos
 * versionados.
 */
export function overpassQueryObjetos(lat: number, lon: number, radioM: number): string {
  const a = `around:${radioM},${lat},${lon}`;
  return (
    `[out:json][timeout:25];(` +
    `node(${a})["natural"="tree"];` +
    `node(${a})["highway"="street_lamp"];` +
    `node(${a})["power"~"^(pole|tower)$"];` +
    `way(${a})["barrier"~"^(wall|fence|retaining_wall)$"];` +
    `);out body;>;out skel qt;`
  );
}

/** Un objeto del entorno salido del mapa, en metros del marco de la escena (sin girar). */
export interface ObjetoDelMapa {
  id: string;
  tipo: "arbol" | "poste" | "barda" | "muro";
  posicion: Point;
  rumbo_deg?: number;
  largo_m?: number;
  material?: "vegetal" | "metal" | "concreto" | "mamposteria";
  nota: string;
}

/**
 * Los objetos de la respuesta alrededor de un origen, del más cercano al más lejano, hasta `max`.
 * Una barda o un muro van por tramos (cada tramo entre dos nodos), con su largo y su rumbo.
 */
export function objetosDelMapa(
  resp: OverpassResponse,
  o: { lat: number; lon: number; radioM: number; max: number },
): ObjetoDelMapa[] {
  // `parts` solo deja las calles: las bardas y los muros se toman de la respuesta.
  const { nodes } = parts(resp);
  const ways = resp.elements.filter((e): e is OsmWay => e.type === "way");
  const out: ObjetoDelMapa[] = [];
  for (const n of nodes.values()) {
    const t = n.tags ?? {};
    const tipo =
      t.natural === "tree"
        ? "arbol"
        : t.highway === "street_lamp" || t.power === "pole" || t.power === "tower"
          ? "poste"
          : null;
    if (!tipo) continue;
    const p = enu(n.lat, n.lon, o.lat, o.lon);
    out.push({
      id: `osm-${n.id}`,
      tipo,
      posicion: p,
      ...(tipo === "arbol" ? { material: "vegetal" as const } : {}),
      nota: `OpenStreetMap, nodo ${n.id} (${tipo === "arbol" ? "natural=tree" : (t.highway ?? `power=${t.power}`)}).`,
    });
  }
  for (const w of ways) {
    const b = w.tags?.barrier;
    if (!b || !/^(wall|fence|retaining_wall)$/.test(b)) continue;
    const pts = w.nodes
      .map((id) => nodes.get(id))
      .filter((n): n is OsmNode => n !== undefined)
      .map((n) => enu(n.lat, n.lon, o.lat, o.lon));
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k]!;
      const c = pts[k + 1]!;
      const largo = Math.hypot(c.x - a.x, c.y - a.y);
      if (largo < 0.5) continue;
      out.push({
        id: `osm-${w.id}-${k}`,
        tipo: b === "fence" ? "barda" : "muro",
        posicion: { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 },
        // Rumbo desde el norte (grados), como el de los vehículos.
        rumbo_deg: Number(((Math.atan2(c.x - a.x, c.y - a.y) * 180) / Math.PI).toFixed(1)),
        largo_m: Number(largo.toFixed(2)),
        ...(b === "fence" ? {} : { material: "mamposteria" as const }),
        nota: `OpenStreetMap, vía ${w.id}, tramo ${k + 1} (barrier=${b}).`,
      });
    }
  }
  return out
    .filter((x) => Math.hypot(x.posicion.x, x.posicion.y) <= o.radioM)
    .sort((x, y) => Math.hypot(x.posicion.x, x.posicion.y) - Math.hypot(y.posicion.x, y.posicion.y))
    .slice(0, o.max);
}
