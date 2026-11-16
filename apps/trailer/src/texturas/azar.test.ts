import { describe, expect, it } from "vitest";
import { avance, azar, semillaDelCuadro } from "./azar";

describe("lo aleatorio de las texturas lleva semilla", () => {
  it("la misma semilla da la misma secuencia; otra, otra", () => {
    const a = azar(42);
    const b = azar(42);
    const c = azar(43);
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(sa);
    expect([c(), c(), c()]).not.toEqual(sa);
    for (const x of sa) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("la semilla del cuadro cambia cada `cada` cuadros y es un entero de feTurbulence", () => {
    expect(semillaDelCuadro(3, 0, 3)).toBe(semillaDelCuadro(3, 2, 3));
    expect(semillaDelCuadro(3, 3, 3)).not.toBe(semillaDelCuadro(3, 2, 3));
    expect(Number.isInteger(semillaDelCuadro(3, 1234))).toBe(true);
  });

  it("el avance va de 0 a 1 entre los cuadros pedidos", () => {
    expect(avance(0, 10, 40)).toBe(0);
    expect(avance(40, 10, 40)).toBe(1);
    expect(avance(25, 10, 40)).toBeGreaterThan(0.5);
  });
});
