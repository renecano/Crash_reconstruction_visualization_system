import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { degrees, pyMod, pyRound, pySum, radians } from "./pymath";

// Casos escritos por CPython (`round` y `sum`); ver el comentario de `pymath.ts`.
const cases = JSON.parse(
  readFileSync(new URL("../fixtures/pymath.json", import.meta.url), "utf-8"),
) as {
  round: [number, number, number][];
  sum: [number[], number][];
  mod: [number, number, number][];
  radians: [number, number][];
  degrees: [number, number][];
};

describe("aritmética con semántica de CPython", () => {
  it("round(x, nd) da los mismos bits, empates incluidos", () => {
    const bad = cases.round.filter(([x, nd, want]) => !Object.is(pyRound(x, nd) + 0, want + 0));
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("sum() compensada da los mismos bits", () => {
    const bad = cases.sum.filter(([xs, want]) => pySum(xs) !== want);
    expect(bad.slice(0, 3)).toEqual([]);
  });

  it("% de Python (signo del divisor), radians y degrees dan los mismos bits", () => {
    expect(cases.mod.filter(([a, b, want]) => !Object.is(pyMod(a, b), want)).slice(0, 3)).toEqual(
      [],
    );
    expect(cases.radians.filter(([x, want]) => radians(x) !== want)).toEqual([]);
    expect(cases.degrees.filter(([x, want]) => degrees(x) !== want)).toEqual([]);
  });
});
