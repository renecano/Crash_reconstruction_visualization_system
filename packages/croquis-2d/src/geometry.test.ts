import { describe, expect, it } from "vitest";
import { length, orientedBox, rotate, sub } from "./geometry";

describe("geometry", () => {
  it("rotar 90° lleva el eje X al eje Y", () => {
    const r = rotate({ x: 1, y: 0 }, Math.PI / 2);
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y).toBeCloseTo(1, 12);
  });

  it("la caja orientada conserva largo y ancho", () => {
    const [fl, fr, rr] = orientedBox({ x: 3, y: -2 }, 4.5, 1.8, 0.7);
    if (!fl || !fr || !rr) throw new Error("faltan esquinas");
    expect(length(sub(fl, fr))).toBeCloseTo(1.8, 12);
    expect(length(sub(fr, rr))).toBeCloseTo(4.5, 12);
  });
});
