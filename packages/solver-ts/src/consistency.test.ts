import { loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { checkConsistencyBasic, checkMap } from "./consistency";

type Json = Record<string, unknown>;

describe("revisión contra las calles del mapa (port de check_map, ADR 0023)", () => {
  it("pregunta solo si un vehículo arranca lejos de toda calle del mapa", () => {
    const spec = structuredClone(loadFixture("alcance")) as unknown as Json;
    expect(checkMap(spec)).toEqual([]);
    const vehiculos = spec.vehiculos as { posicion_inicial: { x: number; y: number } }[];
    const xs = vehiculos.map((v) => v.posicion_inicial.x);
    const y0 = vehiculos.reduce((s, v) => s + v.posicion_inicial.y, 0) / vehiculos.length;
    (spec.lugar as Json).red_vial = {
      fuente_datos: "OpenStreetMap",
      licencia: "ODbL-1.0",
      atribucion: "Contiene información de OpenStreetMap (ODbL)",
      consultado: "2026-10-16T18:30:24Z",
      vias: [
        {
          id_osm: 1,
          tipo: "secondary",
          carriles: 4,
          puntos: [
            { x: Math.min(...xs) - 50, y: y0 },
            { x: Math.max(...xs) + 50, y: y0 },
          ],
        },
      ],
    };
    expect(checkMap(spec)).toEqual([]);
    vehiculos[0]!.posicion_inicial.y = y0 + 30;
    const flags = checkMap(spec);
    expect(flags.map((f) => f.codigo)).toEqual(["fuera_de_la_via_del_mapa"]);
    const lane = Number(((spec.lugar as Json).ancho_carril as Json).valor);
    expect(flags[0]!.datos.distancia_m).toBeCloseTo(30 - 2 * lane, 9);
    expect(flags[0]!.mensaje).toContain("¿Puedes revisar dónde estaba?");
    expect(checkConsistencyBasic(spec).some((f) => f.codigo === "fuera_de_la_via_del_mapa")).toBe(
      true,
    );
  });
});
