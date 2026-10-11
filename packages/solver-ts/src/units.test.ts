import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { degToRad, kmhToMs, msToKmh, radToDeg } from "./units";

describe("units", () => {
  it("convierte valores conocidos", () => {
    expect(kmhToMs(36)).toBeCloseTo(10, 12);
    expect(msToKmh(10)).toBeCloseTo(36, 12);
    expect(degToRad(180)).toBeCloseTo(Math.PI, 15);
  });

  it("ida y vuelta km/h ↔ m/s es casi identidad", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 400, noNaN: true }), (v) => {
        expect(msToKmh(kmhToMs(v))).toBeCloseTo(v, 9);
      }),
    );
  });

  it("ida y vuelta grados ↔ radianes es casi identidad", () => {
    fc.assert(
      fc.property(fc.double({ min: -720, max: 720, noNaN: true }), (d) => {
        expect(radToDeg(degToRad(d))).toBeCloseTo(d, 9);
      }),
    );
  });
});
