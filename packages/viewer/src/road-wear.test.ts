import { describe, expect, it } from "vitest";
import { buildWearMap, wearAt, WHEEL_TRACK_OFFSET_M } from "./road-wear";

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
