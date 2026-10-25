/**
 * Paridad E7: el solver TS reconstruye las escenas canónicas y su resultado coincide con el
 * de la referencia Python (`packages/scene-schema/fixtures/resultados`) con la misma tolerancia de
 * `croquis-solver reconstruct --check` (relativa 1e-6, absoluta 1e-5; textos y booleanos exactos).
 * Se compara el resultado completo, Monte Carlo, inversión y consistencia incluidos (F9). Los
 * bloques de inversión y consistencia, con una unidad de su resolución reportada (ver
 * `scripts/e7-parity.ts`).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_NAMES, loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { fullResult } from "./full-result";
import { differences } from "./parity-diff";

const here = dirname(fileURLToPath(import.meta.url));
const RESULTS = resolve(here, "../../scene-schema/fixtures/resultados");

describe("paridad E7 con el solver Python (escenas canónicas)", () => {
  for (const name of FIXTURE_NAMES) {
    it(
      name,
      () => {
        const want = JSON.parse(readFileSync(resolve(RESULTS, `${name}.json`), "utf-8")) as Record<
          string,
          unknown
        >;
        const got = JSON.parse(JSON.stringify(fullResult(loadFixture(name)))) as Record<
          string,
          unknown
        >;
        const diffs = differences(want, got);
        expect(diffs.slice(0, 8), `${diffs.length} diferencias`).toEqual([]);
      },
      60_000,
    ); // resultado completo (Monte Carlo e inversión): ~2 s por escena, más con la CPU ocupada
  }
});
