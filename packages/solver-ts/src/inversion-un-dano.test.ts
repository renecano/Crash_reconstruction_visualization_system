/**
 * La deformación medida de un solo vehículo (ADR 0091): su perfil y su rigidez del reporte, la cara
 * del contacto entre varios daños medidos, su ΔV como mínimo y la bandera `dano_no_alcanzado`.
 * Paridad con la referencia Python (`packages/scene-schema/fixtures/inversion/resultados`,
 * `croquis-solver reconstruct --all`). `axa_alcance` es la escena de AXA A2010930 (reporte de
 * CESVI) con V2 en reposo detrás de V1, como la arma /cesvi.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkDamageReach } from "./consistency";
import { evidenceFromSpec, invert } from "./inversion";
import { differences } from "./parity-diff";

const here = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(here, "../../scene-schema/fixtures/inversion");
type Json = Record<string, unknown>;
const leer = (ruta: string) => JSON.parse(readFileSync(resolve(DIR, ruta), "utf8")) as Json;

describe.each(["alcance_un_dano", "axa_alcance"])("inversión con un solo daño medido: %s", (n) => {
  const spec = leer(`${n}.json`);
  const golden = leer(`resultados/${n}.json`);
  const seed = Number((spec.meta as { semilla: number }).semilla);
  const ev = evidenceFromSpec(spec, seed);

  it("el daño entra como mínimo, con la misma distribución que Python", () => {
    expect(ev.labels()).toEqual(golden.evidencia);
    expect(ev.damageDv.size).toBe(0);
    expect(ev.damageMin.has("veh-a")).toBe(true);
    const mio = Object.fromEntries([...ev.damageMin].map(([k, d]) => [k, d.toDict()]));
    expect(differences(golden.dano_minimo, mio)).toEqual([]);
  });

  it("la inversión y la bandera coinciden con la referencia Python", () => {
    const inv = invert(spec);
    const mio = {
      inversion: inv.toDict(),
      consistencia: checkDamageReach(spec, inv, seed),
    };
    const ref = { inversion: golden.inversion, consistencia: golden.consistencia };
    expect(differences(ref, JSON.parse(JSON.stringify(mio)))).toEqual([]);
  }, 300_000);
});

describe("qué daño cuenta (ADR 0091)", () => {
  it("entre el costado y el frente, el de la cara del contacto aunque vaya después", () => {
    const spec = leer("alcance_un_dano.json");
    const solo = structuredClone(spec);
    (solo.danos_declarados as Json[]).splice(0, 1); // quita el costado derecho (va primero)
    expect(evidenceFromSpec(solo, 1).damageMin).toEqual(evidenceFromSpec(spec, 1).damageMin);
  });

  it("en AXA la reconstrucción no alcanza la deformación del reporte y lo dice", () => {
    const golden = leer("resultados/axa_alcance.json");
    expect((golden.consistencia as { codigo: string }[]).map((c) => c.codigo)).toEqual([
      "dano_no_alcanzado",
    ]);
  });
});
