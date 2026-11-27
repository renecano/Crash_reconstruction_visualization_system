import { loadFixture } from "@croquis/scene-schema";
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import { enPoligono } from "./obstaculos";
import { contraObstaculos } from "./obstaculos-rigidos";

type Json = Record<string, unknown>;
type Tr = { t: number[]; x: number[]; y: number[] };

/**
 * «¿Y si…?» con edificios y muros como obstáculos rígidos (René, 2026-11-27): con la Ranger a
 * 100 km/h los vehículos atravesaban las casas. Aquí, el cruce lateral con A a 100 km/h: B sale
 * despedido al noreste, hacia una casa.
 */
const CASA = {
  nombre: "Casa de prueba",
  tipo: "edificio" as const,
  puntos: [
    { x: 6, y: 6 },
    { x: 12, y: 6 },
    { x: 12, y: 12 },
    { x: 6, y: 12 },
  ],
};
const simular = (s: Json) => Promise.resolve(reconstructionToDict(reconstruct(s as never)) as Json);
const trayectoria = (r: Json, id: string) =>
  (r.vehiculos as Json[]).find((v) => v.id === id)!.trayectoria as Tr;
/** m: lo más adentro de la casa que llega el centro de B. */
function adentro(tr: Tr): number {
  let max = 0;
  for (let k = 0; k < tr.t.length; k++) {
    const p = { x: tr.x[k]!, y: tr.y[k]! };
    if (enPoligono(p, CASA.puntos))
      max = Math.max(max, Math.min(p.x - 6, 12 - p.x, p.y - 6, 12 - p.y));
  }
  return max;
}

describe("los edificios como obstáculos rígidos en la hipótesis", () => {
  it("B ya no atraviesa la casa: choca contra la fachada y se detiene ahí", async () => {
    const spec = structuredClone(loadFixture("lateral_interseccion")) as unknown as Json;
    ((spec.vehiculos as Json[])[0]!.velocidad_previa as Json).valor = 100;
    const sin = await simular(spec);
    expect(adentro(trayectoria(sin, "veh-b"))).toBeGreaterThan(1);

    const con = await contraObstaculos(spec, [CASA], simular);
    expect(con.choques.map((c) => [c.vehiculo, c.obstaculo])).toContainEqual([
      "veh-b",
      "Casa de prueba",
    ]);
    // El centro de B no entra a la casa más que medio vehículo (la cara toca la fachada).
    expect(adentro(trayectoria(con.resultado, "veh-b"))).toBeLessThan(1);
    // Y el choque contra el muro está en la escena, con el daño que calcula el solver.
    expect(
      ((con.spec.eventos as Json[]) ?? []).some((e) => e.tipo === "impacto_vehiculo_objeto"),
    ).toBe(true);
  }, 120_000);

  it("sin obstáculos, la escena y el resultado quedan igual", async () => {
    const spec = structuredClone(loadFixture("lateral_interseccion")) as unknown as Json;
    const con = await contraObstaculos(spec, [], simular);
    expect(con.choques).toEqual([]);
    expect(con.spec).toEqual(spec);
  });
});
