/**
 * Acotamientos y barreras por clase de vía (T1.2 de PLAN-CESVI v3, ADR 0095). Funciones puras en
 * planta (marco del mundo, metros); el grafo de escena las convierte en mallas.
 *
 * - **Acotamiento de grava:** en `carretera_dos_carriles` una franja de grava a cada lado de la
 *   calzada; en `autopista` la plantilla ya incluye el acotamiento dentro de la calzada
 *   (`layout.ts`), así que la franja exterior va sobre ella. En las calles del mapa, en
 *   `motorway` y `trunk` (y sus enlaces), fuera del ancho de la vía.
 * - **Barrera metálica:** solo en autopista y en `motorway`/`trunk` del mapa: una línea a cada
 *   lado, al borde exterior del acotamiento, con postes cada `BARRIER_POST_SPACING_M`.
 *
 * Nada de esto cambia la física: son objetos del escenario, procedurales, no del lugar real.
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import { longitudM } from "@croquis/scene-schema";
import type { Mesh2D } from "./road-geometry";

export const SHOULDER_WIDTH_M = 2.5;
export const BARRIER_POST_SPACING_M = 4;
/** Altura del riel (centro) y del poste (m), como una barrera de doble onda común. */
export const BARRIER_RAIL_HEIGHT_M = 0.55;
export const BARRIER_POST_HEIGHT_M = 0.75;
export const BARRIER_RAIL_THICKNESS_M = 0.31;

interface Vec2 {
  x: number;
  y: number;
}
interface Strip {
  center: Vec2;
  length: number;
  width: number;
  heading: number;
}
interface Via {
  puntos: readonly Vec2[];
  ancho: number;
  tipo?: string;
}

export interface RoadDecor {
  /** Franjas de grava (cuadriláteros en planta). */
  shoulders: Mesh2D;
  /** Barreras: polilíneas en planta (cada una, una línea de barrera). */
  barriers: Vec2[][];
}

const FAST_HIGHWAYS = /^(motorway|trunk)(_link)?$/;
const SHOULDER_TEMPLATES = new Set(["carretera_dos_carriles", "autopista"]);

function pushQuad(m: Mesh2D, a: Vec2, b: Vec2, c: Vec2, d: Vec2): void {
  const base = m.positions.length / 2;
  m.positions.push(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
  m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Franja paralela a la polilínea `pts`, entre los desplazamientos laterales `from` y `to`. */
function bandAlong(m: Mesh2D, pts: readonly Vec2[], from: number, to: number): void {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    pushQuad(
      m,
      { x: a.x + nx * from, y: a.y + ny * from },
      { x: b.x + nx * from, y: b.y + ny * from },
      { x: b.x + nx * to, y: b.y + ny * to },
      { x: a.x + nx * to, y: a.y + ny * to },
    );
  }
}

/** Polilínea desplazada lateralmente `off` metros (positivo: a la izquierda del recorrido). */
function offsetLine(pts: readonly Vec2[], off: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    out.push({ x: pts[i]!.x + nx * off, y: pts[i]!.y + ny * off });
  }
  return out;
}

function stripLine(s: Strip): Vec2[] {
  const r = (s.heading * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = Math.sin(r);
  return [
    { x: s.center.x - (dx * s.length) / 2, y: s.center.y - (dy * s.length) / 2 },
    { x: s.center.x + (dx * s.length) / 2, y: s.center.y + (dy * s.length) / 2 },
  ];
}

/** Puntos de una barrera cada `spacing` m a lo largo de la polilínea (para los postes). */
export function postsAlong(pts: readonly Vec2[], spacing = BARRIER_POST_SPACING_M): Vec2[] {
  const out: Vec2[] = [];
  let next = 0;
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    while (next <= walked + len + 1e-9) {
      const s = (next - walked) / len;
      out.push({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
      next += spacing;
    }
    walked += len;
  }
  return out;
}

/**
 * Acotamientos y barreras de la escena. Con calles del mapa se siguen las calles; si no, la
 * plantilla de la vía (`layout.strips`; las curvas de la plantilla, en arcos, no llevan todavía).
 */
export function roadDecorFor(
  lugar: EscenaSpec["lugar"],
  layout: { strips: readonly Strip[] },
  mapVias?: readonly Via[],
): RoadDecor {
  const shoulders: Mesh2D = { positions: [], indices: [] };
  const barriers: Vec2[][] = [];
  const shoulderW = lugar.ancho_acotamiento ? longitudM(lugar.ancho_acotamiento) : SHOULDER_WIDTH_M;
  if (mapVias && mapVias.length > 0) {
    for (const v of mapVias) {
      if (!v.tipo || !FAST_HIGHWAYS.test(v.tipo)) continue;
      const half = v.ancho / 2;
      for (const side of [-1, 1]) {
        bandAlong(shoulders, v.puntos, side * half, side * (half + shoulderW));
        barriers.push(offsetLine(v.puntos, side * (half + shoulderW)));
      }
    }
    return { shoulders, barriers };
  }
  const tipo = lugar.tipo_via.valor;
  if (!SHOULDER_TEMPLATES.has(tipo)) return { shoulders, barriers };
  for (const s of layout.strips) {
    const line = stripLine(s);
    const half = s.width / 2;
    // La autopista de la plantilla ya trae el acotamiento dentro de su ancho.
    const inner = tipo === "autopista" ? half - shoulderW : half;
    for (const side of [-1, 1]) {
      bandAlong(shoulders, line, side * inner, side * (inner + shoulderW));
      if (tipo === "autopista") barriers.push(offsetLine(line, side * (inner + shoulderW)));
    }
  }
  return { shoulders, barriers };
}
