import { describe, expect, it } from "vitest";
import { acotar, factorRueda, mover, VISTA_INICIAL, ZOOM_MAX, zoomEn } from "./zoom-vista";

/** El acercamiento del 2D (René, 2026-11-25): botones, rueda y pellizco, sin salirse del dibujo. */
describe("acercar y alejar el 2D", () => {
  it("acerca dejando fijo el punto bajo el cursor", () => {
    const v = zoomEn(VISTA_INICIAL, 2, 300, 200, 800, 500);
    expect(v.k).toBe(2);
    // El punto (300, 200) de la caja sigue mostrando el mismo punto del dibujo.
    expect((300 - v.dx) / v.k).toBeCloseTo(300, 9);
    expect((200 - v.dy) / v.k).toBeCloseTo(200, 9);
  });

  it("no pasa de 8× ni de 1×, y en 1× no se mueve", () => {
    expect(zoomEn(VISTA_INICIAL, 100, 0, 0, 800, 500).k).toBe(ZOOM_MAX);
    expect(zoomEn({ k: 2, dx: -100, dy: -50 }, 0.1, 0, 0, 800, 500)).toEqual(VISTA_INICIAL);
    expect(mover(VISTA_INICIAL, 50, 50, 800, 500)).toEqual(VISTA_INICIAL);
  });

  it("acercado, arrastra sin dejar huecos en los bordes", () => {
    const v = mover({ k: 2, dx: -200, dy: -100 }, 500, 500, 800, 500);
    expect(v).toEqual({ k: 2, dx: 0, dy: 0 });
    expect(acotar({ k: 2, dx: -2000, dy: -2000 }, 800, 500)).toEqual({ k: 2, dx: -800, dy: -500 });
  });

  it("la rueda hacia arriba acerca y hacia abajo aleja", () => {
    expect(factorRueda(-100)).toBeGreaterThan(1);
    expect(factorRueda(100)).toBeLessThan(1);
    expect(factorRueda(-100) * factorRueda(100)).toBeCloseTo(1, 9);
  });
});
