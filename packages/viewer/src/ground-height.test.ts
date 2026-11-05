import { describe, expect, it } from "vitest";
import { alturaDelPiso } from "./ground-height";

describe("altura del piso bajo los vehículos (René, 2026-11-04, C2)", () => {
  // Una banqueta de 10 × 3 m (dos triángulos) entre x 0–10 y y 5–8, a 0.15 m.
  const banqueta = {
    mesh: { positions: [0, 5, 10, 5, 10, 8, 0, 8], indices: [0, 1, 2, 0, 2, 3] },
    altura: 0.15,
  };

  it("sobre la banqueta, su altura; en la calzada, 0", () => {
    const h = alturaDelPiso([banqueta]);
    expect(h(5, 6.5)).toBeCloseTo(0.15, 9);
    expect(h(9.9, 7.9)).toBeCloseTo(0.15, 9);
    expect(h(5, 2)).toBe(0);
    expect(h(12, 6)).toBe(0);
  });

  it("el relieve cuenta y manda si es más alto; nunca baja de 0", () => {
    const h = alturaDelPiso([banqueta], (x) => (x > 20 ? 0.4 : -0.2));
    expect(h(25, 0)).toBeCloseTo(0.4, 9);
    expect(h(5, 0)).toBe(0);
    expect(h(5, 6)).toBeCloseTo(0.15, 9);
  });

  it("una banqueta que cruza varias celdas de la rejilla se encuentra en todas", () => {
    const larga = {
      mesh: { positions: [-50, 0, 50, 0, 50, 2, -50, 2], indices: [0, 1, 2, 0, 2, 3] },
      altura: 0.15,
    };
    const h = alturaDelPiso([larga]);
    for (const x of [-49, -13, 0, 7, 33, 49]) expect(h(x, 1)).toBeCloseTo(0.15, 9);
  });
});
