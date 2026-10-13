import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { leafPaths, mutate } from "./fuzz";
import { ResultadoSchema } from "./generated/resultado.zod";
import { FIXTURE_NAMES, loadFixture } from "./fixtures";
import { RESULT_LOADERS, loadResultado, resultadoErrors, validateResultado } from "./resultado";

describe("resultado del solver", () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name}: el resultado versionado cumple el esquema (Ajv y Zod)`, async () => {
      const r = await loadResultado(name);
      expect(r.escena_id).toBe(loadFixture(name).meta.id);
      const ids = loadFixture(name).vehiculos.map((v) => v.id);
      expect(r.vehiculos.map((v) => v.id)).toEqual(ids);
      for (const v of r.vehiculos) {
        const n = v.trayectoria.t.length;
        for (const arr of Object.values(v.trayectoria)) expect(arr).toHaveLength(n);
        expect(v.trayectoria.t[0]).toBeCloseTo(r.t_inicio, 9);
        expect(v.trayectoria.t.at(-1)).toBeCloseTo(r.t_fin, 9);
      }
    });
  }

  it("rechaza campos de más (el resultado nunca asigna culpa)", async () => {
    const raw = structuredClone(await RESULT_LOADERS.alcance()) as Record<string, unknown>;
    raw.culpable = "veh-a";
    expect(resultadoErrors(raw).join("\n")).toContain("culpable");
    expect(validateResultado(raw).ok).toBe(false);
  });

  it("rechaza perfiles de daño que no tienen 6 puntos", async () => {
    const raw = structuredClone(await RESULT_LOADERS.alcance()) as {
      vehiculos: { dano: { perfil_m: number[] } }[];
    };
    const first = raw.vehiculos[0];
    expect(first).toBeDefined();
    if (first) first.dano.perfil_m = [0, 0, 0];
    expect(validateResultado(raw).ok).toBe(false);
  });

  it("Ajv y Zod coinciden en 300 resultados mutados", async () => {
    const docs = await Promise.all(FIXTURE_NAMES.map((n) => RESULT_LOADERS[n]()));
    const paths = docs.map((d) => leafPaths(d, 3));
    fc.assert(
      fc.property(
        fc.nat({ max: docs.length - 1 }),
        fc.nat({ max: 5000 }),
        fc.nat({ max: 11 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (fi, pi, kind, payload) => {
          const list = paths[fi] ?? [];
          const path = list[pi % list.length];
          if (!path) return;
          const doc = mutate(docs[fi], path, kind, payload);
          expect(ResultadoSchema.safeParse(doc).success).toBe(resultadoErrors(doc).length === 0);
        },
      ),
      { numRuns: 300, seed: 20261013 },
    );
  });
});
