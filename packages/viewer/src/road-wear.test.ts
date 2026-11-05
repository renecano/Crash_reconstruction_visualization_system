import { describe, expect, it } from "vitest";
import { mulberry32 } from "./debris";
import {
  buildWearMap,
  wearAt,
  WEAR_SIZE,
  WEAR_WINDOW_M,
  WHEEL_TRACK_OFFSET_M,
  WHEEL_TRACK_WIDTH_M,
  type LaneAxis,
  type WearMap,
} from "./road-wear";

const lane = { a: { x: -60, y: 0 }, b: { x: 60, y: 0 } };

describe("mapa de desgaste del pavimento (T1.2)", () => {
  it("es determinista con la semilla y cambia con otra", () => {
    const a = buildWearMap(107, [lane], { x: 0, y: 0 }, 64);
    const b = buildWearMap(107, [lane], { x: 0, y: 0 }, 64);
    const c = buildWearMap(108, [lane], { x: 0, y: 0 }, 64);
    expect(a.data).toEqual(b.data);
    expect(a.data).not.toEqual(c.data);
    expect(a.data.length).toBe(64 * 64 * 4);
  });

  it("las rodadas quedan más oscuras que el centro del carril y que lo lejano", () => {
    const m = buildWearMap(107, [lane], { x: 0, y: 0 });
    const rodada = wearAt(m, 0, WHEEL_TRACK_OFFSET_M, 0);
    const centro = wearAt(m, 0, 0, 0);
    const lejos = wearAt(m, 0, 40, 0);
    expect(rodada).toBeGreaterThan(centro + 0.3);
    expect(rodada).toBeGreaterThan(lejos + 0.3);
    expect(rodada).toBeLessThanOrEqual(1);
  });

  it("parches y charcos cubren una fracción pequeña y los canales van de 0 a 255", () => {
    const m = buildWearMap(107, [lane], { x: 0, y: 0 });
    let patches = 0;
    let puddles = 0;
    for (let k = 0; k < m.size * m.size; k++) {
      if (m.data[4 * k + 1]! > 128) patches++;
      if (m.data[4 * k + 2]! > 128) puddles++;
      expect(m.data[4 * k + 3]).toBe(255);
    }
    const n = m.size * m.size;
    expect(patches / n).toBeGreaterThan(0.01);
    expect(patches / n).toBeLessThan(0.3);
    expect(puddles / n).toBeGreaterThan(0.02);
    expect(puddles / n).toBeLessThan(0.4);
  });

  it("fuera de la ventana no hay desgaste", () => {
    const m = buildWearMap(1, [lane], { x: 0, y: 0 });
    expect(wearAt(m, 1000, 0, 0)).toBe(0);
  });
});

// La versión anterior (cada texel contra cada carril), para comparar bit a bit (René, 2026-11-04).
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

function buildWearMapReferencia(
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

describe("mapa de desgaste rápido (René, 2026-11-04)", () => {
  it("da exactamente el mismo mapa que la versión anterior", () => {
    const rnd = mulberry32(7);
    for (let caso = 0; caso < 4; caso++) {
      const lanes: LaneAxis[] = Array.from({ length: 6 + caso * 5 }, () => {
        const ax = (rnd() - 0.5) * 200;
        const ay = (rnd() - 0.5) * 200;
        const ang = rnd() * Math.PI * 2;
        const len = 5 + rnd() * 120;
        return {
          a: { x: ax, y: ay },
          b: { x: ax + Math.cos(ang) * len, y: ay + Math.sin(ang) * len },
        };
      });
      const c = { x: (rnd() - 0.5) * 20, y: (rnd() - 0.5) * 20 };
      const nuevo = buildWearMap(caso + 3, lanes, c, 128, 160);
      const viejo = buildWearMapReferencia(caso + 3, lanes, c, 128, 160);
      expect(Buffer.from(nuevo.data).equals(Buffer.from(viejo.data))).toBe(true);
    }
  });
});
