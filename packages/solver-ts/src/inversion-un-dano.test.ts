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
import { checkAssumedRest, checkDamageReach } from "./consistency";
import { evidenceFromSpec, invert } from "./inversion";
import { differences } from "./parity-diff";

const here = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(here, "../../scene-schema/fixtures/inversion");
type Json = Record<string, unknown>;
const leer = (ruta: string) => JSON.parse(readFileSync(resolve(DIR, ruta), "utf8")) as Json;

describe.each(["alcance_un_dano", "axa_alcance", "axa_reposo_lejano"])(
  "inversión con un solo daño medido: %s",
  (n) => {
    const spec = leer(`${n}.json`);
    const golden = leer(`resultados/${n}.json`);
    const ev = evidenceFromSpec(spec);

    it("el daño entra como mínimo, con la misma distribución que Python", () => {
      expect(ev.labels()).toEqual(golden.evidencia);
      expect(ev.damageDv.size).toBe(0);
      expect(ev.damageMin.has("veh-a")).toBe(true);
      const mio = Object.fromEntries([...ev.damageMin].map(([k, d]) => [k, d.toDict()]));
      expect(differences(golden.dano_minimo, mio)).toEqual([]);
    });

    it("la inversión, las banderas y la otra hipótesis coinciden con la referencia Python", () => {
      const inv = invert(spec);
      const banderas = [...checkDamageReach(spec, inv), ...checkAssumedRest(spec, inv)];
      const mio: Record<string, unknown> = { inversion: inv.toDict(), consistencia: banderas };
      if (banderas.some((b) => b.codigo === "reposo_supuesto_vs_dano"))
        mio.inversion_reposo_supuesto = invert(spec, { assumedAsData: true }).toDict();
      const ref = Object.fromEntries(
        Object.entries(golden).filter(([k]) => k !== "evidencia" && k !== "dano_minimo"),
      );
      expect(differences(ref, JSON.parse(JSON.stringify(mio)))).toEqual([]);
    }, 600_000);
  },
);

describe("qué daño cuenta (ADR 0091)", () => {
  it("entre el costado y el frente, el de la cara del contacto aunque vaya después", () => {
    const spec = leer("alcance_un_dano.json");
    const solo = structuredClone(spec);
    (solo.danos_declarados as Json[]).splice(0, 1); // quita el costado derecho (va primero)
    expect(evidenceFromSpec(solo, 1).damageMin).toEqual(evidenceFromSpec(spec, 1).damageMin);
  });

  it("en AXA, con el mejor ajuste del multiarranque, el reposo supuesto de V2 cabe con la deformación (ADR 0091)", () => {
    const golden = leer("resultados/axa_alcance.json");
    expect(golden.consistencia).toEqual([]);
    expect(golden.inversion_reposo_supuesto).toBeUndefined();
    const modos = (golden.inversion as { multiarranque: { modos: unknown[] } }).multiarranque.modos;
    expect(modos).toHaveLength(1);
  });

  it("un reposo supuesto que la deformación no permite da dos hipótesis (ADR 0091)", () => {
    const golden = leer("resultados/axa_reposo_lejano.json");
    expect((golden.consistencia as { codigo: string }[]).map((c) => c.codigo)).toEqual([
      "reposo_supuesto_vs_dano",
    ]);
    expect(golden.inversion_reposo_supuesto).toBeDefined();
  });
});
