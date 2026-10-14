/**
 * Paridad E7: el solver TS reconstruye las diez escenas canónicas y su resultado coincide con el
 * de la referencia Python (`packages/scene-schema/fixtures/resultados`) con la misma tolerancia de
 * `croquis-solver reconstruct --check` (relativa 1e-6, absoluta 1e-5; textos y booleanos exactos).
 * Los bloques de Monte Carlo, inversión y consistencia llegan al port en F9 y aquí no se comparan.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_NAMES, loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { reconstruct, reconstructionToDict } from "./reconstruct";

const here = dirname(fileURLToPath(import.meta.url));
const RESULTS = resolve(here, "../../scene-schema/fixtures/resultados");
const REL_TOL = 1e-6;
const ABS_TOL = 1e-5;
const F9_BLOCKS = new Set(["incertidumbre", "inversion", "consistencia"]);

function isClose(a: number, b: number): boolean {
  if (a === b) return true;
  const diff = Math.abs(a - b);
  return diff <= Math.max(REL_TOL * Math.max(Math.abs(a), Math.abs(b)), ABS_TOL);
}

/** Diferencias estructurales o numéricas fuera de tolerancia (como `results_io.differences`). */
export function differences(expected: unknown, actual: unknown, path = ""): string[] {
  const out: string[] = [];
  if (typeof expected === "boolean" || typeof actual === "boolean") {
    if (expected !== actual) out.push(`${path}: ${String(expected)} ≠ ${String(actual)}`);
  } else if (typeof expected === "number" && typeof actual === "number") {
    if (!isClose(expected, actual)) out.push(`${path}: ${expected} ≠ ${actual}`);
  } else if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      out.push(`${path}: longitud ${expected.length} ≠ ${actual.length}`);
    } else {
      expected.forEach((e, i) => out.push(...differences(e, actual[i], `${path}/${i}`)));
    }
  } else if (
    expected !== null &&
    actual !== null &&
    typeof expected === "object" &&
    typeof actual === "object"
  ) {
    const e = expected as Record<string, unknown>;
    const a = actual as Record<string, unknown>;
    const ek = new Set(Object.keys(e));
    const ak = new Set(Object.keys(a));
    const only = [...ek].filter((k) => !ak.has(k)).concat([...ak].filter((k) => !ek.has(k)));
    if (only.length > 0) out.push(`${path}: claves ${only.sort().join(", ")}`);
    for (const k of [...ek].filter((x) => ak.has(x)).sort()) {
      out.push(...differences(e[k], a[k], `${path}/${k}`));
    }
  } else if (expected !== actual) {
    out.push(`${path}: ${JSON.stringify(expected)} ≠ ${JSON.stringify(actual)}`);
  }
  return out;
}

describe("paridad E7 con el solver Python (escenas canónicas)", () => {
  for (const name of FIXTURE_NAMES) {
    it(name, () => {
      const want = JSON.parse(readFileSync(resolve(RESULTS, `${name}.json`), "utf-8")) as Record<
        string,
        unknown
      >;
      for (const k of F9_BLOCKS) delete want[k];
      const got = reconstructionToDict(reconstruct(loadFixture(name)));
      const diffs = differences(want, got);
      expect(diffs.slice(0, 8), `${diffs.length} diferencias`).toEqual([]);
    });
  }
});
