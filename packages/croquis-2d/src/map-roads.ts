/**
 * Geometría de las calles del mapa que comparten el croquis 2D y el visor 3D (ADR 0039 y 0041):
 * dónde van las rayas de una calle con `carriles` de OSM y dónde la cruza otra calle. El visor la
 * convierte en triángulos; el croquis, en trazos. Así los dos cortan las rayas en el mismo lugar.
 */
import type { Vec2 } from "./geometry";
import type { LaneStrip } from "./layout";

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

/** Ancho de las rayas (m). */
export const LINE_WIDTH = 0.12;
/** Dos tramos casi paralelos (menos de 30°) se continúan: no es un cruce. */
export const PARALLEL_COS = Math.cos((30 * Math.PI) / 180);

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

/** Rayas de una calle del mapa como las de una franja recta de su ancho; null sin `carriles`. */
export function mapViaLineOffsets(
  v: MapVia,
): { edges: number[]; center: number[]; dashed: number[] } | null {
  if (v.carriles === undefined) return null;
  return stripLineOffsets(
    { center: { x: 0, y: 0 }, length: 0, heading: 0, width: v.ancho, lanes: v.carriles, median: 0 },
    !(v.unSentido ?? false),
  );
}

/** Distancia de p al segmento ab y la dirección unitaria del segmento. */
export function segmentDistance(p: Vec2, a: Vec2, b: Vec2): { dist: number; d: Vec2 } {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return { dist: Math.hypot(p.x - a.x, p.y - a.y), d: { x: 1, y: 0 } };
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const t = Math.min(len, Math.max(0, (p.x - a.x) * d.x + (p.y - a.y) * d.y));
  return { dist: Math.hypot(p.x - (a.x + d.x * t), p.y - (a.y + d.y * t)), d };
}

export interface MapCrossings {
  /** ¿p cae en la calzada de otra calle que cruza a la dirección `d` (no que la continúa)? */
  inCrossing: (p: Vec2, self: MapVia, d: Vec2, margin: number) => boolean;
  /**
   * ¿p cae sobre la calzada de otra calle, con cualquier ángulo? Para banquetas y guarniciones:
   * una calle que sigue en línea no las corta (quedan fuera de su eje), pero dos calzadas paralelas
   * muy juntas (una avenida de dos cuerpos) sí.
   */
  onOtherPavement: (p: Vec2, self: MapVia, margin: number) => boolean;
}

export function mapCrossings(vias: readonly MapVia[]): MapCrossings {
  return {
    inCrossing: (p, self, d, margin) =>
      vias.some((o) => {
        if (o === self) return false;
        for (let i = 0; i + 1 < o.puntos.length; i++) {
          const r = segmentDistance(p, o.puntos[i]!, o.puntos[i + 1]!);
          if (
            r.dist <= o.ancho / 2 + margin &&
            Math.abs(r.d.x * d.x + r.d.y * d.y) < PARALLEL_COS
          ) {
            return true;
          }
        }
        return false;
      }),
    onOtherPavement: (p, self, margin) =>
      vias.some(
        (o) =>
          o !== self &&
          o.puntos.some((q, i) => {
            const b = o.puntos[i + 1];
            return b !== undefined && segmentDistance(p, q, b).dist < o.ancho / 2 + margin;
          }),
      ),
  };
}

/** Un tramo continuo de raya en el croquis. */
export interface MapLaneLine {
  /** Índice de la calle en `vias`. */
  via: number;
  a: Vec2;
  b: Vec2;
}

/** Paso con el que se prueba, a lo largo de la calle, si una raya cae en un cruce (m). */
const PROBE_M = 1;

/**
 * Rayas interiores de las calles del mapa para el croquis 2D (ADR 0041): la división de sentidos
 * (una sola raya en el eje) y las de carril, en los mismos lugares que en el visor y cortadas en
 * los mismos cruces. Las orillas no se dibujan, como en las plantillas del croquis. Devuelve
 * tramos continuos; el croquis les pone el trazo discontinuo.
 */
export function mapLaneLines(vias: readonly MapVia[]): MapLaneLine[] {
  const { inCrossing } = mapCrossings(vias);
  const out: MapLaneLine[] = [];
  vias.forEach((v, vi) => {
    const offsets = mapViaLineOffsets(v);
    if (!offsets) return;
    const lines = [...(offsets.center.length > 0 ? [0] : []), ...offsets.dashed];
    for (let i = 0; i + 1 < v.puntos.length; i++) {
      const a = v.puntos[i]!;
      const b = v.puntos[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-6) continue;
      const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      const n = { x: -d.y, y: d.x };
      const at = (s: number, off: number): Vec2 => ({
        x: a.x + d.x * s + n.x * off,
        y: a.y + d.y * s + n.y * off,
      });
      for (const off of lines) {
        let start: number | null = null;
        for (let s0 = 0; s0 < len - 1e-9; s0 += PROBE_M) {
          const s1 = Math.min(s0 + PROBE_M, len);
          const keep = !inCrossing(at((s0 + s1) / 2, off), v, d, 0.5);
          if (keep && start === null) start = s0;
          if (!keep && start !== null) {
            out.push({ via: vi, a: at(start, off), b: at(s0, off) });
            start = null;
          }
        }
        if (start !== null) out.push({ via: vi, a: at(start, off), b: at(len, off) });
      }
    }
  });
  return out;
}
