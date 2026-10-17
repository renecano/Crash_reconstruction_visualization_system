/**
 * Paridad del álgebra lineal y del optimizador con la referencia Python (ADR 0027): los vectores de
 * `fixtures/numerics.json` los escribe `uv run croquis-solver numerics` y aquí se recalculan con el
 * port. Se exige igualdad bit a bit (mismo algoritmo, mismo orden de operaciones, doble precisión).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lstsq, matmul, pinv, solveSpd, svd, transpose } from "./linalg";
import { leastSquaresSoftL1, softL1Cost } from "./lsq";
import { median, quantilesInclusive } from "./pymath";
import { PyRandom } from "./pyrandom";

interface LinalgCase {
  a?: number[][];
  b: number[];
  svd?: { u: number[][]; s: number[]; vt: number[][] };
  pinv?: number[][];
  lstsq?: number[];
  spd?: number[][];
  solve_spd?: number[];
}
interface LsqCase {
  kind: "lineal" | "rosenbrock";
  a?: number[][];
  b?: number[];
  lo: number[];
  hi: number[];
  scale?: number[];
  max_nfev?: number;
  x: number[];
  cost: number;
  success: boolean;
  nfev: number;
}

const data = JSON.parse(
  readFileSync(new URL("../fixtures/numerics.json", import.meta.url), "utf-8"),
) as {
  linalg: LinalgCase[];
  lsq: LsqCase[];
  random: { seed: number; randrange: Record<string, number[]>; gauss: number[]; mixto: number[] }[];
  statistics: { data: number[]; quantiles10: number[]; median: number }[];
};

/** Diferencias bit a bit (`Object.is`, con +0 y −0 iguales) entre dos estructuras numéricas. */
function bitDiffs(got: unknown, want: unknown, path = ""): string[] {
  if (typeof want === "number") {
    return typeof got === "number" && Object.is(got + 0, want + 0)
      ? []
      : [`${path}: ${String(got)} ≠ ${want}`];
  }
  if (Array.isArray(want)) {
    if (!Array.isArray(got) || got.length !== want.length) return [`${path}: forma distinta`];
    return want.flatMap((w, i) => bitDiffs(got[i], w, `${path}/${i}`));
  }
  return got === want ? [] : [`${path}: ${String(got)} ≠ ${String(want)}`];
}

describe("álgebra lineal propia: mismos bits que Python", () => {
  it("SVD, pinv y lstsq", () => {
    const bad: string[] = [];
    data.linalg.forEach((c, i) => {
      if (!c.a) return;
      const [u, s, vt] = svd(c.a);
      bad.push(...bitDiffs(u, c.svd!.u, `${i}/u`));
      bad.push(...bitDiffs(s, c.svd!.s, `${i}/s`));
      bad.push(...bitDiffs(vt, c.svd!.vt, `${i}/vt`));
      bad.push(...bitDiffs(pinv(c.a, 1e-10), c.pinv, `${i}/pinv`));
      bad.push(...bitDiffs(lstsq(c.a, c.b), c.lstsq, `${i}/lstsq`));
    });
    expect(bad.slice(0, 5)).toEqual([]);
    expect(data.linalg.filter((c) => c.a).length).toBeGreaterThan(30);
  });

  it("Cholesky", () => {
    const bad = data.linalg.flatMap((c, i) =>
      c.spd ? bitDiffs(solveSpd(c.spd, c.b), c.solve_spd, `${i}`) : [],
    );
    expect(bad).toEqual([]);
  });

  it("matmul y transpose", () => {
    const a = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];
    expect(transpose(a)).toEqual([
      [1, 3, 5],
      [2, 4, 6],
    ]);
    expect(matmul(transpose(a), a)).toEqual([
      [35, 44],
      [44, 56],
    ]);
  });
});

describe("optimizador propio: mismo camino que Python", () => {
  it("problemas lineales y Rosenbrock dan el mismo punto, costo, evaluaciones y convergencia", () => {
    const bad: string[] = [];
    data.lsq.forEach((c, i) => {
      let res;
      if (c.kind === "lineal") {
        const a = c.a!;
        const b = c.b!;
        const fun = (x: number[]) =>
          b.map((bi, r) => {
            let acc = 0;
            for (let k = 0; k < x.length; k++) acc += a[r]![k]! * x[k]!;
            return acc - bi;
          });
        const jac = () => a.map((row) => [...row]);
        res = leastSquaresSoftL1(
          fun,
          jac,
          new Array<number>(a[0]!.length).fill(0),
          c.lo,
          c.hi,
          c.scale!,
          c.max_nfev!,
        );
      } else {
        const fun = (x: number[]) => [10 * (x[1]! - x[0]! * x[0]!), 1 - x[0]!];
        const jac = (x: number[]) => [
          [-20 * x[0]!, 10],
          [-1, 0],
        ];
        res = leastSquaresSoftL1(fun, jac, [-1.2, 1], c.lo, c.hi, [1, 1], 500);
      }
      bad.push(...bitDiffs(res.x, c.x, `${i}/x`));
      bad.push(...bitDiffs(res.cost, c.cost, `${i}/cost`));
      if (res.nfev !== c.nfev) bad.push(`${i}/nfev: ${res.nfev} ≠ ${c.nfev}`);
      if (res.success !== c.success) bad.push(`${i}/success`);
    });
    expect(bad.slice(0, 5)).toEqual([]);
    expect(data.lsq.length).toBe(22);
  });

  it("costo soft_l1", () => {
    expect(softL1Cost([0])).toBe(0);
    expect(softL1Cost([1])).toBeCloseTo(Math.SQRT2 - 1, 15);
  });
});

describe("random de CPython: randrange y gauss", () => {
  it("randrange da los mismos enteros", () => {
    for (const c of data.random) {
      const rng = new PyRandom(BigInt(c.seed));
      for (const [n, want] of Object.entries(c.randrange)) {
        expect(want.map(() => rng.randrange(Number(n)))).toEqual(want);
      }
    }
  });

  it("gauss (y su valor guardado) coincide a 12 cifras con CPython", () => {
    const close = (got: number, want: number) =>
      Math.abs(got - want) <= 1e-11 * Math.max(1, Math.abs(want));
    for (const c of data.random) {
      const rng = new PyRandom(BigInt(c.seed));
      for (const n of Object.keys(c.randrange))
        for (let k = 0; k < 25; k++) rng.randrange(Number(n));
      const gauss = c.gauss.map(() => rng.gauss(0, 1));
      gauss.forEach((g, i) => expect(close(g, c.gauss[i]!)).toBe(true));
      const mixed = c.mixto.map(() => rng.uniform(-1, 1) + rng.gauss(2, 0.5));
      mixed.forEach((g, i) => expect(close(g, c.mixto[i]!)).toBe(true));
    }
  });
});

describe("statistics de CPython", () => {
  it("quantiles(n=10, inclusive) y median dan los mismos bits", () => {
    const bad = data.statistics.flatMap((c, i) => [
      ...bitDiffs(quantilesInclusive(c.data, 10), c.quantiles10, `${i}/q`),
      ...bitDiffs(median(c.data), c.median, `${i}/med`),
    ]);
    expect(bad).toEqual([]);
  });
});
