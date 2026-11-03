/**
 * Desgaste, parches y charcos del pavimento (T1.2, ADR 0095): un mapa en planta, calculado una
 * vez por escena con su semilla, que el material del asfalto muestrea en lugar de ruido por pixel
 * (de noche el asfalto encharcado llenaba la pantalla con ruido 3D por pixel: `t1_tirones.mjs`).
 *
 * Canales (0–255), sobre una ventana cuadrada del mundo centrada en la acción:
 * - **R, desgaste:** más oscuro donde ruedan las llantas (dos bandas por carril, a ±0.8 m del
 *   centro del carril) y pulido general por el tránsito; 0 = asfalto nuevo.
 * - **G, parches:** manchas de asfalto más nuevo o más viejo (bacheo), 0 ó 255 con borde.
 * - **B, bajos:** dónde se junta el agua cuando llueve (charcos), 0 = seco.
 *
 * Todo es determinista con la semilla; valores visuales, no física.
 */
import { mulberry32 } from "./debris";

export const WEAR_SIZE = 512;
/** Ventana del mundo que cubre el mapa (m); fuera de ella el asfalto queda sin desgaste. */
export const WEAR_WINDOW_M = 160;
/** Distancia del centro del carril a cada rodada (m). */
export const WHEEL_TRACK_OFFSET_M = 0.8;
export const WHEEL_TRACK_WIDTH_M = 0.45;

export interface LaneAxis {
  /** Eje del carril: dos puntos en el mundo (m). */
  a: { x: number; y: number };
  b: { x: number; y: number };
}

export interface WearMap {
  data: Uint8Array;
  size: number;
  /** Centro y lado de la ventana del mundo (m). */
  cx: number;
  cy: number;
  windowM: number;
}

/** Ruido de valor suave en [0, 1] (bilineal sobre una retícula con semilla). */
function valueNoise(seed: number, cells: number): (u: number, v: number) => number {
  const rng = mulberry32(seed);
  const grid = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const at = (i: number, j: number) =>
    grid[((j + cells + 1) % (cells + 1)) * (cells + 1) + ((i + cells + 1) % (cells + 1))]!;
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = at(i, j) * (1 - sx) + at(i + 1, j) * sx;
    const bottom = at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
}

/** Distancia de un punto al segmento a–b (m). */
function distToSegment(px: number, py: number, a: LaneAxis["a"], b: LaneAxis["b"]): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return Math.hypot(px - a.x, py - a.y);
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

export function buildWearMap(
  seed: number,
  lanes: readonly LaneAxis[],
  center: { x: number; y: number },
  size = WEAR_SIZE,
  windowM = WEAR_WINDOW_M,
): WearMap {
  const data = new Uint8Array(size * size * 4);
  // Parches de 2–4 m y bajos de 4–8 m (celdas de ruido de 3.3 y 4.4 m en 160 m).
  const patches = valueNoise(Math.trunc(seed) * 7 + 1, 48);
  const puddles = valueNoise(Math.trunc(seed) * 11 + 3, 36);
  const polish = valueNoise(Math.trunc(seed) * 13 + 5, 8);
  const texel = windowM / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = center.x - windowM / 2 + (i + 0.5) * texel;
      const y = center.y - windowM / 2 + (j + 0.5) * texel;
      const u = i / size;
      const v = j / size;
      // Rodadas: lo más cerca que queda el punto de alguna rodada de algún carril.
      let track = 0;
      for (const l of lanes) {
        const d = distToSegment(x, y, l.a, l.b);
        const dd = Math.abs(d - WHEEL_TRACK_OFFSET_M);
        const k = Math.max(0, 1 - dd / WHEEL_TRACK_WIDTH_M);
        track = Math.max(track, k * k * (3 - 2 * k));
      }
      const wear = Math.min(1, 0.7 * track + 0.3 * polish(u, v));
      const patch = patches(u, v);
      const patchMask = patch > 0.74 ? Math.min(1, (patch - 0.74) / 0.1) : 0;
      const low = puddles(u, v);
      const puddle = low > 0.62 ? Math.min(1, (low - 0.62) / 0.08) : 0;
      const o = 4 * (j * size + i);
      data[o] = Math.round(255 * wear);
      data[o + 1] = Math.round(255 * patchMask);
      data[o + 2] = Math.round(255 * puddle);
      data[o + 3] = 255;
    }
  }
  return { data, size, cx: center.x, cy: center.y, windowM };
}

/** Valor (0–1) de un canal del mapa en un punto del mundo (vecino más cercano; para pruebas). */
export function wearAt(m: WearMap, x: number, y: number, channel: 0 | 1 | 2): number {
  const i = Math.floor(((x - m.cx) / m.windowM + 0.5) * m.size);
  const j = Math.floor(((y - m.cy) / m.windowM + 0.5) * m.size);
  if (i < 0 || j < 0 || i >= m.size || j >= m.size) return 0;
  return m.data[4 * (j * m.size + i) + channel]! / 255;
}
