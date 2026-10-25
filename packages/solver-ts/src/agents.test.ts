/**
 * Paridad de los conductores como agentes (R12a, ADR 0088): el port TS da el mismo bloque `agentes`
 * que la referencia Python en cada escena de hipótesis
 * (`packages/scene-schema/fixtures/agentes/resultados`, `croquis-solver reconstruct --all`).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasDrivers, simulateDrivers } from "./agents";
import { differences } from "./parity-diff";
import { reconstruct } from "./reconstruct";

const here = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(here, "../../scene-schema/fixtures/agentes");
const leer = (ruta: string) =>
  JSON.parse(readFileSync(resolve(DIR, ruta), "utf8")) as Record<string, unknown>;
const ESCENAS = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

describe("los conductores como agentes: paridad con Python", () => {
  it("hay escenas de hipótesis, y cada una trae conductores", () => {
    expect(ESCENAS).toEqual([
      "alcance_frena_antes",
      "alcance_volantea",
      "axa_agentes",
      "carambola_cadena",
    ]);
    for (const n of ESCENAS) expect(hasDrivers(leer(`${n}.json`))).toBe(true);
  });

  it.each(ESCENAS)(
    "%s da lo mismo que Python",
    (n) => {
      const spec = leer(`${n}.json`);
      const agentes = simulateDrivers(spec, reconstruct(spec));
      expect(agentes).not.toBeNull();
      const got = JSON.parse(JSON.stringify(agentes!.toDict())) as unknown;
      expect(differences(leer(`resultados/${n}.json`), got)).toEqual([]);
    },
    120_000,
  );
});
