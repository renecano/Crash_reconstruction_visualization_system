import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  conPosicion,
  escenaDeNarracion,
  especDeExpediente,
  type SalidaCorpus,
} from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import { validateEscena } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { conCallesDelMapa } from "./calles-del-mapa";

const aqui = dirname(fileURLToPath(import.meta.url));
const grabada = JSON.parse(
  readFileSync(
    resolve(aqui, "../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const P = { lat: 19.3576, lon: -99.0625 };
const m = (n: number, e: number) => ({
  lat: P.lat + n / 111320,
  lon: P.lon + e / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});
let e = escenaDeNarracion(grabada.salida, grabada.narracion).expediente;
e = conPosicion(e, { vehiculo: "V1", fase: "impacto", punto: m(-2, 0), rumbo: 0 });
e = conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(0, 2), rumbo: 90 });
const base = especDeExpediente(e);

/** Dos calles que se cruzan en el impacto: una de sur a norte y otra de poniente a oriente. */
const cruce: OverpassResponse = {
  osm3s: { timestamp_osm_base: "2026-10-23T00:00:00Z" },
  elements: [
    { type: "node", id: 1, ...m(-60, 0) },
    { type: "node", id: 2, ...m(0, 0) },
    { type: "node", id: 3, ...m(60, 0) },
    { type: "node", id: 4, ...m(0, -60) },
    { type: "node", id: 5, ...m(0, 60) },
    { type: "way", id: 10, nodes: [1, 2, 3], tags: { highway: "primary", name: "Norte" } },
    { type: "way", id: 11, nodes: [4, 2, 5], tags: { highway: "residential", name: "Oriente" } },
  ],
};

describe("las calles del mapa en el 3D de un caso (R10)", () => {
  it("van en el marco de la escena, sin girar, y la escena sigue cumpliendo el contrato", () => {
    const spec = conCallesDelMapa(base.spec, base.origen!, cruce);
    expect(validateEscena(spec).ok).toBe(true);
    const lugar = spec.lugar as {
      red_vial: {
        vias: { nombre?: string; puntos: { x: number; y: number }[] }[];
        licencia: string;
      };
      ubicacion_real: { rotacion_deg: number };
    };
    expect(lugar.red_vial.licencia).toBe("ODbL-1.0");
    expect(lugar.ubicacion_real.rotacion_deg).toBe(0);
    // La calle de sur a norte corre sobre y (x casi constante) en el marco de la escena.
    const norte = lugar.red_vial.vias.find((v) => v.nombre === "Norte")!;
    const xs = norte.puntos.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(3);
  });

  it("sin calles cerca, la escena queda igual", () => {
    expect(conCallesDelMapa(base.spec, base.origen!, { elements: [] })).toBe(base.spec);
  });
});
