import { describe, expect, it } from "vitest";
import { adopt, type Resumen } from "./ajuste";

const r = (
  punto: number | null,
  maximo: number,
  ancho: number,
  area: number,
  nPunto = 30,
): Resumen => ({
  n: 100,
  n_punto: nPunto,
  punto,
  maximo,
  ancho,
  area,
});

describe("regla de adopción (ADR 0033)", () => {
  it("no adopta si alguna métrica empeora, aunque las demás mejoren mucho", () => {
    expect(adopt(r(5, 10, 70, 3), { a: r(5.1, 5, 20, 2), b: r(4, 5, 20, 3.5) })).toBeNull();
  });
  it("entre los que no empeoran nada, gana el menor error por punto", () => {
    expect(adopt(r(5, 10, 70, 3), { a: r(4.5, 9, 30, 3), b: r(4, 10, 60, 2.9) })).toBe("b");
  });
  it("con menos de 15 casos ordenados el error por punto no cuenta y decide la suma", () => {
    const actual = r(5, 10, 70, 3, 10);
    expect(adopt(actual, { a: r(9, 9, 40, 3, 10), b: r(1, 10, 60, 3, 10) })).toBe("a");
  });
  it("empatar no es empeorar", () => {
    expect(adopt(r(5, 10, 70, 3), { a: r(5, 10, 70, 3) })).toBe("a");
  });
});
