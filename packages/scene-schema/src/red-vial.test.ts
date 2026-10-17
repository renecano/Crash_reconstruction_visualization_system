import { describe, expect, it } from "vitest";
import { outsideRedVialM, RED_VIAL_DEFAULTS, viaWidthM } from "./red-vial";

// Los mismos casos que python/tests/test_red_vial.py (paridad con la referencia).
const CRUCE = [
  {
    tipo: "secondary",
    carriles: 4,
    puntos: [
      { x: -50, y: 0 },
      { x: 50, y: 0 },
    ],
  },
  {
    tipo: "residential",
    puntos: [
      { x: 0, y: -40 },
      { x: 0, y: 40 },
    ],
  },
  {
    tipo: "primary",
    ancho_m: 20,
    puntos: [
      { x: 100, y: -10 },
      { x: 100, y: 10 },
    ],
  },
];

describe("red vial del mapa", () => {
  it("ancho de OSM o carriles por ancho de carril", () => {
    expect(viaWidthM(CRUCE[0]!)).toBe(4 * 3.5);
    expect(viaWidthM(CRUCE[0]!, 3.3)).toBeCloseTo(4 * 3.3, 12);
    expect(viaWidthM(CRUCE[1]!)).toBe(RED_VIAL_DEFAULTS.carriles_por_tipo.residential! * 3.5);
    expect(viaWidthM(CRUCE[2]!)).toBe(20);
    expect(viaWidthM({ tipo: "secondary_link" })).toBe(3 * 3.5);
    expect(viaWidthM({ tipo: "track" })).toBe(2 * 3.5);
  });

  it("cuánto queda fuera de la calzada", () => {
    expect(outsideRedVialM({ x: 10, y: 0 }, CRUCE)).toBeCloseTo(-7, 12);
    expect(outsideRedVialM({ x: 10, y: 12 }, CRUCE)).toBeCloseTo(5, 12);
    expect(outsideRedVialM({ x: 0, y: 30 }, CRUCE)).toBeCloseTo(-3.5, 12);
    expect(outsideRedVialM({ x: 95, y: 0 }, CRUCE)).toBeCloseTo(-5, 12);
    expect(outsideRedVialM({ x: 30, y: 30 }, CRUCE)).toBeCloseTo(23, 12);
  });
});
