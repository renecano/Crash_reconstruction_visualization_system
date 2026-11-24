import { describe, expect, it } from "vitest";
import { StraightPath } from "./preimpact";
import { firstContact, MAX_OVERLAP_M, overlapDepth } from "./reconstruct";

/**
 * El primer contacto (revisión de la cadena, René 2026-11-24): en un choque oblicuo, juntar los centros
 * de las zonas metía la esquina de un vehículo en el otro y el solver los separaba de golpe.
 */
const cuerpo = (length: number, width: number, v0: number) =>
  ({ body: { length, width }, v0 }) as unknown as Parameters<typeof firstContact>[0][number];
const rect = (x: number, y: number, l: number, w: number): [number, number][] => [
  [x + l / 2, y + w / 2],
  [x + l / 2, y - w / 2],
  [x - l / 2, y - w / 2],
  [x - l / 2, y + w / 2],
];

describe("el primer contacto", () => {
  it("mide lo que se enciman dos rectángulos", () => {
    expect(overlapDepth(rect(0, 0, 4, 2), rect(3.5, 0, 4, 2))).toBeCloseTo(0.5, 9);
    expect(overlapDepth(rect(0, 0, 4, 2), rect(5, 0, 4, 2))).toBe(0);
  });

  it("si se enciman de más, los retrocede en proporción a su velocidad hasta tocarse", () => {
    // A va al este y llega a x = 0; B va al norte y llega a (1, 0): la esquina de A dentro de B.
    const a = new StraightPath([-20, 0], 0, 40);
    const b = new StraightPath([1, -20], Math.PI / 2, 40);
    const s = firstContact([cuerpo(4.4, 1.8, 10), cuerpo(4.4, 1.8, 10)], [a, b], [20, 20]);
    expect(s[0]).toBeLessThan(20);
    expect(s[1]).toBeLessThan(20);
    expect(20 - s[0]!).toBeCloseTo(20 - s[1]!, 6);
  });

  it("si apenas se tocan, no cambia nada", () => {
    const a = new StraightPath([-20, 0], 0, 40);
    const b = new StraightPath([4.4, 0], 0, 40);
    const s = firstContact([cuerpo(4.4, 1.8, 10), cuerpo(4.4, 1.8, 0)], [a, b], [20, 0.1]);
    expect(s).toEqual([20, 0.1]);
    expect(MAX_OVERLAP_M).toBe(0.5);
  });
});
