/**
 * Geometría de la vía para el visor a partir del mismo `roadLayout` del croquis 2D, así el 3D
 * y el croquis coinciden (ADR 0006). Devuelve datos puros (triángulos en el plano del mundo,
 * metros); la capa React los convierte en `BufferGeometry`.
 *
 * Incluye calzada (franjas, arcos y anillos), banquetas, rayas (orilla continua, división de
 * sentidos doble y separación de carriles discontinua) y pasos peatonales. Las rayas no cruzan
 * el área de una intersección. El patrón de raya discontinua (3 m de trazo y 6 m de espacio) es
 * una elección visual, no una cita de norma.
 */
import type { Vec2 } from "@croquis/croquis-2d";
import type { LaneStrip, Ring, RoadLayout } from "@croquis/croquis-2d";

export interface Mesh2D {
  /** Vértices (x, y) en metros, marco del mundo. */
  positions: number[];
  /** Índices de triángulos (antihorario visto desde arriba). */
  indices: number[];
}

export interface RoadGeometry {
  pavement: Mesh2D;
  sidewalk: Mesh2D;
  whiteLines: Mesh2D;
  yellowLines: Mesh2D;
  crosswalks: Mesh2D;
  /** Parte de arriba del camellón (elevado a la altura de la guarnición). */
  medians: Mesh2D;
  /** Caras verticales de las guarniciones: segmentos en planta (de a a b). */
  curbs: { a: Vec2; b: Vec2 }[];
  /** Caja envolvente de la calzada [minX, minY, maxX, maxY]. */
  bounds: [number, number, number, number];
}

export interface RoadOptions {
  dobleSentido: boolean;
  banquetas: boolean;
  /** Guarnición en la orilla de la calzada aunque no haya banqueta (PLAN §7.1). */
  guarniciones?: boolean;
  /** Pasos peatonales: centro del cruce en el mundo y rumbo de la vía que cruzan (grados). */
  crosswalks?: { center: Vec2; roadHeading: number; roadWidth: number }[];
  /** Largo y separación de los segmentos de las rayas discontinuas (por omisión, calle ≤ 50 km/h). */
  dash?: DashPattern;
  /** Cómo van las rayas según los dispositivos de línea de la escena (`markingsFor`). */
  markings?: Markings;
}

export interface DashPattern {
  length: number;
  gap: number;
}

/**
 * Segmentos de las rayas discontinuas del Manual de Señalización y Dispositivos para el Control
 * del Tránsito (SEDATU/SCT, 2023, Tabla II.2-3): calles hasta 50 km/h, 2.5 m cada 5 m; carreteras
 * y calles de más de 50 km/h, 5 m cada 10 m.
 */
export const DASH_HASTA_50: DashPattern = { length: 2.5, gap: 5 };
export const DASH_MAS_50: DashPattern = { length: 5, gap: 10 };

export function dashPatternFor(tipoVia: string | undefined, limiteKmh?: number): DashPattern {
  if (tipoVia === "carretera_dos_carriles" || tipoVia === "autopista") return DASH_MAS_50;
  return limiteKmh !== undefined && limiteKmh > 50 ? DASH_MAS_50 : DASH_HASTA_50;
}

export interface Markings {
  /** Raya entre sentidos: doble continua (no se rebasa) o sencilla discontinua (se rebasa). */
  centro: "doble_continua" | "discontinua";
  /** Rayas entre carriles del mismo sentido: discontinua (se cambia de carril) o continua. */
  carriles: "discontinua" | "continua";
}

/**
 * Lo que dicen los dispositivos `linea_continua` y `linea_discontinua` de la escena. En una vía de
 * doble sentido se refieren a la raya central (lo común en un relato: "había línea continua", no
 * se podía rebasar); en una de un sentido, a las rayas entre carriles. Sin dispositivos: doble
 * continua al centro y discontinua entre carriles.
 */
export function markingsFor(dobleSentido: boolean, tipos: readonly string[]): Markings {
  const continua = tipos.includes("linea_continua");
  const discontinua = tipos.includes("linea_discontinua") && !continua;
  if (dobleSentido) {
    return { centro: discontinua ? "discontinua" : "doble_continua", carriles: "discontinua" };
  }
  return { centro: "doble_continua", carriles: continua ? "continua" : "discontinua" };
}

export const LINE_WIDTH = 0.12;
/** Largo de las franjas del paso peatonal a lo largo de la vía (m). */
export const CROSSWALK_LENGTH = 3.0;

/** Altura de la guarnición, la banqueta y el camellón (m): 15 cm, la altura usual en México. */
export const CURB_HEIGHT = 0.15;
export const SIDEWALK_WIDTH = 2.5;
const ARC_SEGMENT_M = 2;

function emptyMesh(): Mesh2D {
  return { positions: [], indices: [] };
}

function pushQuad(m: Mesh2D, a: Vec2, b: Vec2, c: Vec2, d: Vec2): void {
  const base = m.positions.length / 2;
  m.positions.push(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
  m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Rectángulo orientado: centro, largo sobre el rumbo, ancho a lo transversal. */
function orientedQuad(m: Mesh2D, c: Vec2, along: Vec2, length: number, width: number): void {
  const n = { x: -along.y, y: along.x };
  const hl = length / 2;
  const hw = width / 2;
  const p = (s: number, w: number): Vec2 => ({
    x: c.x + along.x * s + n.x * w,
    y: c.y + along.y * s + n.y * w,
  });
  pushQuad(m, p(-hl, -hw), p(hl, -hw), p(hl, hw), p(-hl, hw));
}

function dir(headingDeg: number): Vec2 {
  const r = (headingDeg * Math.PI) / 180;
  return { x: Math.cos(r), y: Math.sin(r) };
}

/** Sector de corona circular entre radios y ángulos (grados), en segmentos de ~2 m. */
function annulus(
  m: Mesh2D,
  center: Vec2,
  rIn: number,
  rOut: number,
  from: number,
  to: number,
): void {
  const span = ((to - from) * Math.PI) / 180;
  const n = Math.max(8, Math.ceil((Math.abs(span) * rOut) / ARC_SEGMENT_M));
  for (let i = 0; i < n; i++) {
    const a0 = (from * Math.PI) / 180 + (span * i) / n;
    const a1 = (from * Math.PI) / 180 + (span * (i + 1)) / n;
    const pt = (r: number, a: number): Vec2 => ({
      x: center.x + r * Math.cos(a),
      y: center.y + r * Math.sin(a),
    });
    pushQuad(m, pt(rIn, a0), pt(rOut, a0), pt(rOut, a1), pt(rIn, a1));
  }
}

/** ¿Está el punto dentro del rectángulo de una franja (con margen)? */
/** Arco partido en segmentos rectos de ~2 m (para las caras verticales de la guarnición). */
function arcSegments(
  center: Vec2,
  radius: number,
  from: number,
  to: number,
): { a: Vec2; b: Vec2 }[] {
  const span = ((to - from) * Math.PI) / 180;
  const n = Math.max(8, Math.ceil((Math.abs(span) * radius) / ARC_SEGMENT_M));
  const pt = (k: number): Vec2 => {
    const ang = (from * Math.PI) / 180 + (span * k) / n;
    return { x: center.x + radius * Math.cos(ang), y: center.y + radius * Math.sin(ang) };
  };
  const out: { a: Vec2; b: Vec2 }[] = [];
  for (let k = 0; k < n; k++) out.push({ a: pt(k), b: pt(k + 1) });
  return out;
}

function insideStrip(p: Vec2, s: LaneStrip, margin = 0): boolean {
  const d = dir(s.heading);
  const rel = { x: p.x - s.center.x, y: p.y - s.center.y };
  const along = rel.x * d.x + rel.y * d.y;
  const across = -rel.x * d.y + rel.y * d.x;
  return Math.abs(along) <= s.length / 2 + margin && Math.abs(across) <= s.width / 2 + margin;
}

function insideRing(p: Vec2, r: Ring): boolean {
  return Math.hypot(p.x - r.center.x, p.y - r.center.y) <= r.outerRadius;
}

/** Desplazamientos transversales de las rayas de una franja. */
export function stripLineOffsets(
  s: LaneStrip,
  dobleSentido: boolean,
): { edges: number[]; center: number[]; dashed: number[] } {
  const half = s.width / 2;
  const edges = [-half + LINE_WIDTH, half - LINE_WIDTH];
  const lanesTotal = Math.max(1, s.lanes);
  if (dobleSentido) {
    const perSide = Math.max(1, Math.round(lanesTotal / 2));
    const laneW = (s.width - s.median) / (2 * perSide);
    const m = s.median / 2;
    const center = s.median > 0 ? [-m, m] : [-0.1, 0.1];
    const dashed: number[] = [];
    for (let k = 1; k < perSide; k++) dashed.push(m + k * laneW, -(m + k * laneW));
    return { edges, center, dashed };
  }
  const laneW = s.width / lanesTotal;
  const dashed: number[] = [];
  for (let k = 1; k < lanesTotal; k++) dashed.push(-half + k * laneW);
  return { edges, center: [], dashed };
}

function lineAlongStrip(
  m: Mesh2D,
  s: LaneStrip,
  offset: number,
  dashed: boolean,
  exclude: (p: Vec2) => boolean,
  dash: DashPattern = DASH_HASTA_50,
): void {
  const d = dir(s.heading);
  const n = { x: -d.y, y: d.x };
  const step = dashed ? dash.length + dash.gap : 1;
  const segLen = dashed ? dash.length : 1;
  for (let a = -s.length / 2; a < s.length / 2 - 1e-9; a += step) {
    const len = Math.min(segLen, s.length / 2 - a);
    const mid = a + len / 2;
    const c = {
      x: s.center.x + d.x * mid + n.x * offset,
      y: s.center.y + d.y * mid + n.y * offset,
    };
    if (exclude(c)) continue;
    orientedQuad(m, c, d, len, LINE_WIDTH);
  }
}

function lineAlongArc(
  m: Mesh2D,
  center: Vec2,
  radius: number,
  from: number,
  to: number,
  dashed: boolean,
  dash: DashPattern = DASH_HASTA_50,
): void {
  const total = (Math.abs(to - from) * Math.PI * radius) / 180;
  const step = dashed ? dash.length + dash.gap : ARC_SEGMENT_M;
  const segLen = dashed ? dash.length : ARC_SEGMENT_M;
  for (let s = 0; s < total - 1e-9; s += step) {
    const len = Math.min(segLen, total - s);
    const a0 = from + (s / total) * (to - from);
    const a1 = from + ((s + len) / total) * (to - from);
    annulus(m, center, radius - LINE_WIDTH / 2, radius + LINE_WIDTH / 2, a0, a1);
  }
}

/** Una calle del mapa (ADR 0023): eje, ancho y, si OSM los trae, carriles, sentido y tipo. */
export interface MapVia {
  puntos: readonly Vec2[];
  ancho: number;
  /** `lanes` de OSM; sin él no se pintan rayas (no se inventan). */
  carriles?: number;
  unSentido?: boolean;
  /** `highway` de OSM. */
  tipo?: string;
}

export interface MapRoadOptions extends Pick<RoadOptions, "crosswalks"> {
  /** Banquetas y guarniciones de la escena (`lugar`), como en las plantillas. */
  banquetas?: boolean;
  guarniciones?: boolean;
  dash?: DashPattern;
}

/** Vías de OSM sin banqueta (autopistas y vías rápidas, con sus enlaces). */
const NO_SIDEWALK = /^(motorway|trunk)(_link)?$/;
/** Dos tramos casi paralelos (menos de 30°) se continúan: no es un cruce. */
const PARALLEL_COS = Math.cos((30 * Math.PI) / 180);

/** Distancia de p al segmento ab y la dirección unitaria del segmento. */
function segmentDistance(p: Vec2, a: Vec2, b: Vec2): { dist: number; d: Vec2 } {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return { dist: Math.hypot(p.x - a.x, p.y - a.y), d: { x: 1, y: 0 } };
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const t = Math.min(len, Math.max(0, (p.x - a.x) * d.x + (p.y - a.y) * d.y));
  return { dist: Math.hypot(p.x - (a.x + d.x * t), p.y - (a.y + d.y * t)), d };
}

/**
 * Calzada desde las calles del mapa (ADR 0023): un rectángulo por segmento de cada calle y un
 * disco en cada vértice para cerrar las uniones.
 *
 * Rayas, banquetas y guarniciones (ADR 0039):
 * - **Rayas:** solo en las calles con `carriles` de OSM, con las mismas reglas que las plantillas
 *   (orillas, doble amarilla al centro en doble sentido y discontinuas entre carriles). Sin ese
 *   dato no se pinta nada.
 * - **Banquetas y guarniciones:** si la escena las declara, excepto en autopistas y vías rápidas.
 * - **Cruces:** todo se corta donde otra calle cruza (otra calle con un ángulo de más de 30°). Una
 *   calle que sigue en otra vía de OSM, casi en línea, no corta nada. Las rayas centrales y de
 *   carril también se cortan en los pasos peatonales.
 */
export function buildMapRoadGeometry(
  vias: readonly MapVia[],
  opts: MapRoadOptions = {},
): RoadGeometry {
  const dash = opts.dash ?? DASH_HASTA_50;
  const pavement = emptyMesh();
  const sidewalk = emptyMesh();
  const white = emptyMesh();
  const yellow = emptyMesh();
  const crosswalks = emptyMesh();
  const curbs: { a: Vec2; b: Vec2 }[] = [];
  const withCurbs = (opts.banquetas ?? false) || (opts.guarniciones ?? false);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  /** ¿p cae en la calzada de otra calle que cruza a la dirección `d` (no que la continúa)? */
  const inCrossing = (p: Vec2, self: MapVia, d: Vec2, margin: number): boolean =>
    vias.some((o) => {
      if (o === self) return false;
      for (let i = 0; i + 1 < o.puntos.length; i++) {
        const r = segmentDistance(p, o.puntos[i]!, o.puntos[i + 1]!);
        if (r.dist <= o.ancho / 2 + margin && Math.abs(r.d.x * d.x + r.d.y * d.y) < PARALLEL_COS) {
          return true;
        }
      }
      return false;
    });
  /**
   * ¿p cae sobre la calzada de otra calle, con cualquier ángulo? Para banquetas y guarniciones:
   * una calle que sigue en línea no las corta (quedan fuera de su eje), pero dos calzadas paralelas
   * muy juntas (una avenida de dos cuerpos) sí.
   */
  const onOtherPavement = (p: Vec2, self: MapVia, margin: number): boolean =>
    vias.some(
      (o) =>
        o !== self &&
        o.puntos.some((q, i) => {
          const b = o.puntos[i + 1];
          return b !== undefined && segmentDistance(p, q, b).dist < o.ancho / 2 + margin;
        }),
    );
  const inCrosswalk = (p: Vec2): boolean =>
    (opts.crosswalks ?? []).some((cw) => {
      const d = dir(cw.roadHeading);
      const rel = { x: p.x - cw.center.x, y: p.y - cw.center.y };
      return (
        Math.abs(rel.x * d.x + rel.y * d.y) <= CROSSWALK_LENGTH / 2 &&
        Math.abs(-rel.x * d.y + rel.y * d.x) <= cw.roadWidth / 2
      );
    });

  /** Piezas a lo largo de un segmento, a `off` del eje (sólidas de `step` m o discontinuas). */
  const along = (
    a: Vec2,
    b: Vec2,
    off: number,
    piece: number,
    gap: number,
    draw: (c: Vec2, d: Vec2, len: number, s0: number) => void,
  ): void => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) return;
    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const n = { x: -d.y, y: d.x };
    for (let s0 = 0; s0 < len - 1e-9; s0 += piece + gap) {
      const l = Math.min(piece, len - s0);
      const mid = s0 + l / 2;
      draw({ x: a.x + d.x * mid + n.x * off, y: a.y + d.y * mid + n.y * off }, d, l, s0);
    }
  };

  for (const v of vias) {
    const r = v.ancho / 2;
    const sidewalks = (opts.banquetas ?? false) && !NO_SIDEWALK.test(v.tipo ?? "");
    const offsets =
      v.carriles !== undefined
        ? stripLineOffsets(
            {
              center: { x: 0, y: 0 },
              length: 0,
              heading: 0,
              width: v.ancho,
              lanes: v.carriles,
              median: 0,
            },
            !(v.unSentido ?? false),
          )
        : null;
    for (let i = 0; i < v.puntos.length; i++) {
      const a = v.puntos[i]!;
      minX = Math.min(minX, a.x - r);
      minY = Math.min(minY, a.y - r);
      maxX = Math.max(maxX, a.x + r);
      maxY = Math.max(maxY, a.y + r);
      annulus(pavement, a, 0, r, 0, 360);
      const b = v.puntos[i + 1];
      if (!b) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-6) continue;
      const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      orientedQuad(pavement, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d, len, v.ancho);
      if (offsets) {
        const solid = (mesh: Mesh2D, off: number, walk: boolean) =>
          along(a, b, off, 1, 0, (c, dd, l) => {
            if (inCrossing(c, v, dd, 0.5) || (walk && inCrosswalk(c))) return;
            orientedQuad(mesh, c, dd, l, LINE_WIDTH);
          });
        for (const o of offsets.edges) solid(white, o, false);
        for (const o of offsets.center) solid(yellow, o, true);
        for (const o of offsets.dashed) {
          along(a, b, o, dash.length, dash.gap, (c, dd, l) => {
            if (inCrossing(c, v, dd, 0.5) || inCrosswalk(c)) return;
            orientedQuad(white, c, dd, l, LINE_WIDTH);
          });
        }
      }
      for (const side of [-1, 1]) {
        if (sidewalks) {
          along(a, b, side * (r + SIDEWALK_WIDTH / 2), 2, 0, (c, dd, l) => {
            if (inCrossing(c, v, dd, SIDEWALK_WIDTH / 2) || onOtherPavement(c, v, 0)) return;
            orientedQuad(sidewalk, c, dd, l, SIDEWALK_WIDTH);
          });
        }
        if (withCurbs) {
          along(a, b, side * r, 2, 0, (c, dd, l) => {
            if (inCrossing(c, v, dd, 0.3) || onOtherPavement(c, v, -0.05)) return;
            curbs.push({
              a: { x: c.x - (dd.x * l) / 2, y: c.y - (dd.y * l) / 2 },
              b: { x: c.x + (dd.x * l) / 2, y: c.y + (dd.y * l) / 2 },
            });
          });
        }
      }
    }
  }
  for (const cw of opts.crosswalks ?? []) {
    const d = dir(cw.roadHeading);
    const n = { x: -d.y, y: d.x };
    const stripes = Math.floor(cw.roadWidth / 1.0);
    for (let k = 0; k < stripes; k++) {
      const off = -cw.roadWidth / 2 + 0.5 + k * 1.0;
      orientedQuad(
        crosswalks,
        { x: cw.center.x + n.x * off, y: cw.center.y + n.y * off },
        d,
        CROSSWALK_LENGTH,
        0.5,
      );
    }
  }
  if (!Number.isFinite(minX)) {
    minX = -10;
    minY = -10;
    maxX = 10;
    maxY = 10;
  }
  return {
    pavement,
    sidewalk,
    whiteLines: white,
    yellowLines: yellow,
    crosswalks,
    medians: emptyMesh(),
    curbs,
    bounds: [minX, minY, maxX, maxY],
  };
}

export function buildRoadGeometry(layout: RoadLayout, opts: RoadOptions): RoadGeometry {
  const dash = opts.dash ?? DASH_HASTA_50;
  const markings = opts.markings ?? markingsFor(opts.dobleSentido, []);
  const pavement = emptyMesh();
  const sidewalk = emptyMesh();
  const white = emptyMesh();
  const yellow = emptyMesh();
  const crosswalks = emptyMesh();
  const medians = emptyMesh();
  const curbs: { a: Vec2; b: Vec2 }[] = [];
  const withCurbs = opts.banquetas || (opts.guarniciones ?? false);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (p: Vec2): void => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };

  // Paso peatonal (franjas de 3 m a lo largo de la vía, a lo ancho de la calzada).
  const insideCrosswalk = (p: Vec2): boolean =>
    (opts.crosswalks ?? []).some((cw) => {
      const d = dir(cw.roadHeading);
      const rel = { x: p.x - cw.center.x, y: p.y - cw.center.y };
      const along = rel.x * d.x + rel.y * d.y;
      const across = -rel.x * d.y + rel.y * d.x;
      return Math.abs(along) <= CROSSWALK_LENGTH / 2 && Math.abs(across) <= cw.roadWidth / 2;
    });
  /** ¿El tramo recto de a a b pasa por algún paso peatonal? (muestreo cada 0.25 m) */
  const crossesWalk = (a: Vec2, b: Vec2): boolean => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.25));
    for (let i = 0; i <= n; i++) {
      if (insideCrosswalk({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n })) {
        return true;
      }
    }
    return false;
  };

  const inIntersection =
    (owner: LaneStrip) =>
    (p: Vec2): boolean =>
      layout.strips.some((o) => o !== owner && insideStrip(p, o, 0.5)) ||
      layout.rings.some((r) => insideRing(p, r));

  for (const s of layout.strips) {
    const d = dir(s.heading);
    orientedQuad(pavement, s.center, d, s.length, s.width);
    const n = { x: -d.y, y: d.x };
    for (const sl of [-1, 1]) {
      for (const sa of [-1, 1]) {
        grow({
          x: s.center.x + (d.x * (sa * s.length)) / 2 + (n.x * (sl * s.width)) / 2,
          y: s.center.y + (d.y * (sa * s.length)) / 2 + (n.y * (sl * s.width)) / 2,
        });
      }
    }
    if (opts.banquetas) {
      for (const side of [-1, 1]) {
        const off = side * (s.width / 2 + SIDEWALK_WIDTH / 2);
        const len = s.length;
        const step = 2;
        for (let a = -len / 2; a < len / 2 - 1e-9; a += step) {
          const l = Math.min(step, len / 2 - a);
          const c = {
            x: s.center.x + d.x * (a + l / 2) + n.x * off,
            y: s.center.y + d.y * (a + l / 2) + n.y * off,
          };
          // La banqueta se interrumpe donde otra vía (o el anillo) ocupa el espacio.
          if (layout.strips.some((o) => o !== s && insideStrip(c, o, SIDEWALK_WIDTH / 2))) continue;
          if (layout.rings.some((r) => insideRing(c, r))) continue;
          orientedQuad(sidewalk, c, d, l, SIDEWALK_WIDTH);
        }
      }
    }
    {
      const step = 2;
      const blocked = (c: Vec2, margin: number): boolean =>
        layout.strips.some((o) => o !== s && insideStrip(c, o, margin)) ||
        layout.rings.some((r) => insideRing(c, r));
      for (let a = -s.length / 2; a < s.length / 2 - 1e-9; a += step) {
        const l = Math.min(step, s.length / 2 - a);
        const at = (along: number, off: number): Vec2 => ({
          x: s.center.x + d.x * along + n.x * off,
          y: s.center.y + d.y * along + n.y * off,
        });
        if (withCurbs) {
          for (const side of [-1, 1]) {
            const off = (side * s.width) / 2;
            if (blocked(at(a + l / 2, off), 0.3)) continue;
            curbs.push({ a: at(a, off), b: at(a + l, off) });
          }
        }
        if (s.median > 0 && !blocked(at(a + l / 2, 0), 0.3)) {
          // Donde un paso peatonal cruza el camellón, se corta a nivel de calle (refugio): el
          // tramo se parte en piezas de 0.25 m y se omiten las que caen en el paso. Los tramos que
          // no tocan un paso quedan igual que antes.
          const pieces = crossesWalk(at(a, 0), at(a + l, 0)) ? Math.ceil(l / 0.25) : 1;
          const pl = l / pieces;
          for (let k = 0; k < pieces; k++) {
            const pa = a + k * pl;
            if (pieces > 1 && insideCrosswalk(at(pa + pl / 2, 0))) continue;
            orientedQuad(medians, at(pa + pl / 2, 0), d, pl, s.median);
            for (const side of [-1, 1]) {
              const off = (side * s.median) / 2;
              curbs.push({ a: at(pa, off), b: at(pa + pl, off) });
            }
          }
        }
      }
    }
    const offsets = stripLineOffsets(s, opts.dobleSentido);
    const excl = inIntersection(s);
    // Las rayas centrales y de carril se interrumpen en el paso peatonal; las orillas siguen.
    const exclWalk = (p: Vec2): boolean => excl(p) || insideCrosswalk(p);
    for (const o of offsets.edges) lineAlongStrip(white, s, o, false, excl);
    // Raya central sencilla discontinua (se puede rebasar) solo sin camellón: con camellón las
    // rayas amarillas son sus orillas y siguen continuas.
    if (markings.centro === "discontinua" && offsets.center.length === 2 && !s.median) {
      lineAlongStrip(yellow, s, 0, true, exclWalk, dash);
    } else {
      for (const o of offsets.center) lineAlongStrip(yellow, s, o, false, exclWalk);
    }
    for (const o of offsets.dashed)
      lineAlongStrip(white, s, o, markings.carriles === "discontinua", exclWalk, dash);
  }

  for (const a of layout.arcs) {
    const rIn = a.radius - a.width / 2;
    const rOut = a.radius + a.width / 2;
    annulus(pavement, a.center, rIn, rOut, a.from, a.to);
    for (const ang of [a.from, a.to, (a.from + a.to) / 2]) {
      for (const r of [rIn, rOut]) {
        grow({
          x: a.center.x + r * Math.cos((ang * Math.PI) / 180),
          y: a.center.y + r * Math.sin((ang * Math.PI) / 180),
        });
      }
    }
    grow({ x: a.center.x, y: a.center.y + rOut });
    if (opts.banquetas) {
      annulus(sidewalk, a.center, rOut, rOut + SIDEWALK_WIDTH, a.from, a.to);
      annulus(sidewalk, a.center, Math.max(0, rIn - SIDEWALK_WIDTH), rIn, a.from, a.to);
    }
    if (withCurbs) {
      for (const r of [rIn, rOut]) curbs.push(...arcSegments(a.center, r, a.from, a.to));
    }
    lineAlongArc(white, a.center, rIn + LINE_WIDTH, a.from, a.to, false);
    lineAlongArc(white, a.center, rOut - LINE_WIDTH, a.from, a.to, false);
    if (opts.dobleSentido && markings.centro === "discontinua") {
      lineAlongArc(yellow, a.center, a.radius, a.from, a.to, true, dash);
    } else if (opts.dobleSentido) {
      lineAlongArc(yellow, a.center, a.radius - 0.1, a.from, a.to, false);
      lineAlongArc(yellow, a.center, a.radius + 0.1, a.from, a.to, false);
    }
  }

  for (const r of layout.rings) {
    annulus(pavement, r.center, r.innerRadius, r.outerRadius, 0, 360);
    grow({ x: r.center.x - r.outerRadius, y: r.center.y - r.outerRadius });
    grow({ x: r.center.x + r.outerRadius, y: r.center.y + r.outerRadius });
    lineAlongArc(white, r.center, r.innerRadius + LINE_WIDTH, 0, 360, false);
    const mid = (r.innerRadius + r.outerRadius) / 2;
    lineAlongArc(white, r.center, mid, 0, 360, true, dash);
    // Isla central como banqueta (camellón elevado), con su guarnición.
    annulus(sidewalk, r.center, 0, r.innerRadius, 0, 360);
    curbs.push(...arcSegments(r.center, r.innerRadius, 0, 360));
  }

  for (const cw of opts.crosswalks ?? []) {
    // Franjas de 0.5 m paralelas a la vía, separadas 0.5 m, a lo ancho de la calzada.
    const d = dir(cw.roadHeading);
    const n = { x: -d.y, y: d.x };
    const stripes = Math.floor(cw.roadWidth / 1.0);
    for (let k = 0; k < stripes; k++) {
      const off = -cw.roadWidth / 2 + 0.5 + k * 1.0;
      const c = { x: cw.center.x + n.x * off, y: cw.center.y + n.y * off };
      orientedQuad(crosswalks, c, d, CROSSWALK_LENGTH, 0.5);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = -10;
    minY = -10;
    maxX = 10;
    maxY = 10;
  }
  return {
    pavement,
    sidewalk,
    whiteLines: white,
    yellowLines: yellow,
    crosswalks,
    medians,
    curbs,
    bounds: [minX, minY, maxX, maxY],
  };
}

/** Área total de una malla 2D (para pruebas). */
export function meshArea(m: Mesh2D): number {
  let area = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i] ?? 0;
    const b = m.indices[i + 1] ?? 0;
    const c = m.indices[i + 2] ?? 0;
    const ax = m.positions[2 * a] ?? 0;
    const ay = m.positions[2 * a + 1] ?? 0;
    const bx = m.positions[2 * b] ?? 0;
    const by = m.positions[2 * b + 1] ?? 0;
    const cx = m.positions[2 * c] ?? 0;
    const cy = m.positions[2 * c + 1] ?? 0;
    area += ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
  }
  return area;
}
