import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { roadLayout } from "@croquis/croquis-2d";
import { armarCaso3d, caso3dErrors, type Caso3D } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { escenarioDe } from "./escenario";

const DIR = join(__dirname, "../../../../../packages/scene-schema/fixtures/caso3d");
const casos = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => [f, JSON.parse(readFileSync(join(DIR, f), "utf8")) as Caso3D] as const);

describe("el escenario del visor Unity (ADR 0112)", () => {
  it("cumple el esquema del paquete en los 23 casos versionados", () => {
    expect(casos).toHaveLength(23);
    for (const [f, c] of casos) {
      const p = armarCaso3d(c.escena, c.resultado, null, escenarioDe(c.escena, c.resultado));
      expect(caso3dErrors(p), f).toEqual([]);
    }
    // 23 paquetes completos: con toda la suite corriendo pasa de los 5 s por omisión.
  }, 30_000);

  it("da lo mismo dos veces: lo procedural va con la semilla de la escena", () => {
    const [, c] = casos[0]!;
    expect(JSON.stringify(escenarioDe(c.escena, c.resultado))).toBe(
      JSON.stringify(escenarioDe(c.escena, c.resultado)),
    );
    expect(escenarioDe(c.escena, c.resultado).semilla).toBe(c.escena.meta.semilla);
  });

  it("la calzada cubre la plantilla del croquis 2D", () => {
    for (const [f, c] of casos) {
      const layout = roadLayout(c.escena.lugar);
      const calzada = escenarioDe(c.escena, c.resultado).via.capas.find(
        (k) => k.nombre === "calzada",
      );
      expect(calzada, f).toBeDefined();
      // Cada franja del croquis tiene su centro sobre algún triángulo de la calzada.
      for (const s of layout.strips) {
        expect(
          dentroDeAlguno(calzada!.posiciones, calzada!.indices, s.center.x, s.center.y),
          f,
        ).toBe(true);
      }
    }
  });

  it("de noche y con lluvia lo dice el ambiente", () => {
    const noche = casos.find(([f]) => f === "nocturno_lluvia.json")![1];
    const a = escenarioDe(noche.escena, noche.resultado).ambiente;
    expect(a.noche).toBe(true);
    expect(a.precipitacion).not.toBe("ninguna");
    const dia = casos.find(([f]) => f === "alcance.json")![1];
    expect(escenarioDe(dia.escena, dia.resultado).ambiente.noche).toBe(false);
  });
});

function dentroDeAlguno(pos: number[], idx: number[], x: number, y: number): boolean {
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
    const d1 = lado(pos, a, b, x, y);
    const d2 = lado(pos, b, c, x, y);
    const d3 = lado(pos, c, a, x, y);
    const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
    const posi = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
    if (!(neg && posi)) return true;
  }
  return false;
}

function lado(p: number[], i: number, j: number, x: number, y: number): number {
  return (
    (p[2 * j]! - p[2 * i]!) * (y - p[2 * i + 1]!) -
    (p[2 * j + 1]! - p[2 * i + 1]!) * (x - p[2 * i]!)
  );
}
