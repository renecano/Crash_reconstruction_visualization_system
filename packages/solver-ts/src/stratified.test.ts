import { describe, expect, it } from "vitest";
import { PyRandom } from "./pyrandom";
import { CountingDraws, countDraws, LatinHypercube, normPpf, StratifiedDraws } from "./stratified";

describe("hipercubo latino (T3.1)", () => {
  it("cada dimensión reparte las muestras en estratos distintos", () => {
    const lhs = new LatinHypercube(12, 3, new PyRandom(7));
    for (let d = 0; d < 3; d++) {
      const estratos = lhs.u.map((row) => Math.floor(row[d]! * 12)).sort((a, b) => a - b);
      expect(estratos).toEqual(Array.from({ length: 12 }, (_, i) => i));
      for (const row of lhs.u) expect(row[d]!).toBeGreaterThanOrEqual(0);
      for (const row of lhs.u) expect(row[d]!).toBeLessThan(1);
    }
  });

  it("es determinista por semilla y distinto con otra", () => {
    expect(new LatinHypercube(8, 2, new PyRandom(3)).u).toEqual(
      new LatinHypercube(8, 2, new PyRandom(3)).u,
    );
    expect(new LatinHypercube(8, 2, new PyRandom(3)).u).not.toEqual(
      new LatinHypercube(8, 2, new PyRandom(4)).u,
    );
    // Sin generador, el diseño sale de la semilla fija: igual para cualquier escena.
    expect(new LatinHypercube(12, 5).u).toEqual(new LatinHypercube(12, 5).u);
    expect(new LatinHypercube(12, 5).u).not.toEqual(new LatinHypercube(12, 6).u);
  });

  it("la permutación es la de `random.shuffle` de CPython (semilla 7, ocho elementos)", () => {
    // Python 3.14: random.seed(7); x = list(range(8)); random.shuffle(x) → x
    const x = [0, 1, 2, 3, 4, 5, 6, 7];
    new PyRandom(7).shuffle(x);
    expect(x).toEqual([6, 7, 2, 4, 0, 3, 1, 5]);
    // Y el hipercubo entero (semilla 3, 4 × 2) da lo mismo que `croquis_solver.stratified`.
    const lhs = new LatinHypercube(4, 2, new PyRandom(3)).u;
    const ref = [
      [0.8424887916370198, 0.8876961604400183],
      [0.15098000964904862, 0.5479360259988248],
      [0.6564300760270135, 0.42928700981710755],
      [0.2663822148099533, 0.1352434714072597],
    ];
    for (let i = 0; i < 4; i++)
      for (let d = 0; d < 2; d++) expect(lhs[i]![d]).toBeCloseTo(ref[i]![d]!, 15);
  });

  it("la inversa de la normal tiene la precisión de Acklam", () => {
    // Valores de `statistics.NormalDist().inv_cdf` en CPython 3.14.
    const casos: [number, number][] = [
      [0.001, -3.090232306167813],
      [0.1, -1.2815515655446008],
      [0.5, 0],
      [0.9, 1.2815515655446008],
      [0.999, 3.090232306167813],
    ];
    for (const [p, z] of casos) expect(normPpf(p)).toBeCloseTo(z, 7);
    expect(normPpf(0)).toBeLessThan(-6);
    expect(normPpf(1)).toBeGreaterThan(6);
  });

  it("los sorteos de una fila salen en orden y no sobran; la pasada seca los cuenta", () => {
    const fila = new StratifiedDraws([0.5, 0.25, 0.9]);
    expect(fila.uniform(10, 20)).toBe(15);
    expect(fila.gauss(0, 2)).toBeCloseTo(2 * normPpf(0.25), 12);
    expect(fila.uniform(0, 1)).toBe(0.9);
    expect(() => fila.uniform(0, 1)).toThrow(RangeError);
    expect(
      countDraws((d) => {
        d.uniform(0, 1);
        d.gauss(0, 1);
        d.gauss(5, 1);
      }),
    ).toBe(3);
    expect(new CountingDraws().gauss(4)).toBe(4);
  });
});
