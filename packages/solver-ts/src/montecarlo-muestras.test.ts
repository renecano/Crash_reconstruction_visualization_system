/**
 * U6 (material promocional, «nube de incertidumbre»): el Monte Carlo deja ver cada muestra sin
 * cambiar nada de lo que calcula. Las poses de las muestras son las mismas de las que salen los
 * percentiles del Resultado.
 */
import { loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { distribution } from "./inversion";
import { monteCarlo } from "./montecarlo";

describe("monteCarlo con alMuestra", () => {
  it("entrega cada muestra válida y sus reposos dan los mismos percentiles", () => {
    const spec = loadFixture("lateral_interseccion") as Record<string, unknown>;
    const sin = monteCarlo(spec, { samples: 16 }).toDict();
    const reposos = new Map<string, number[]>();
    const indices: number[] = [];
    const con = monteCarlo(spec, {
      samples: 16,
      alMuestra: (i, r) => {
        indices.push(i);
        for (const v of r.vehiculos) {
          if (!reposos.has(v.id)) reposos.set(v.id, []);
          reposos.get(v.id)!.push(v.restPose[0]);
        }
      },
    }).toDict();
    // Nada cambia por mirar.
    expect(con).toEqual(sin);
    expect(indices.length).toBe(sin.validas);
    const vehiculos = sin.vehiculos as { id: string; reposo_x_m: { p50: number } }[];
    for (const v of vehiculos) {
      const d = distribution(reposos.get(v.id)!);
      expect(d.p50).toBeCloseTo(v.reposo_x_m.p50, 4);
    }
  });
});
