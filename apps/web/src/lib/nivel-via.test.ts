import type { OverpassResponse } from "@croquis/croquis-2d";
import { describe, expect, it } from "vitest";
import { callesParaGuardar, respuestaDeGuardadas } from "./calles-guardadas";
import { ajustarACalle, callesDe } from "./escena-facil";
import { callesDelNivel, nivelDeTags } from "./nivel-via";

/**
 * Las vías elevadas (René, 2026-11-27; auditoría #380): el Periférico a ras del piso y la Autopista
 * Urbana Sur encima, 2 m al lado; una rampa (a ras del piso) que sube a la elevada y comparte su nodo.
 */
const lat0 = 19.3;
const lon = (m: number) => -99.18 + m / (111320 * Math.cos((lat0 * Math.PI) / 180));
const lat = (m: number) => lat0 + m / 111320;
const RED = {
  elements: [
    { type: "node", id: 1, lat: lat(0), lon: lon(-200) },
    { type: "node", id: 2, lat: lat(0), lon: lon(200) },
    { type: "node", id: 3, lat: lat(2), lon: lon(-200) },
    { type: "node", id: 4, lat: lat(2), lon: lon(200) },
    { type: "node", id: 5, lat: lat(60), lon: lon(300) },
    { type: "way", id: 10, nodes: [1, 2], tags: { highway: "trunk", name: "Periférico" } },
    {
      type: "way",
      id: 11,
      nodes: [3, 4],
      tags: { highway: "motorway", name: "Autopista Urbana Sur", bridge: "yes", layer: "1" },
    },
    { type: "way", id: 12, nodes: [4, 5], tags: { highway: "motorway_link", name: "Rampa" } },
  ],
} as unknown as OverpassResponse;
const sobreAmbas = { lon: lon(0), lat: lat(1) };

describe("las vías elevadas en La escena", () => {
  it("el nivel de una vía: layer, bridge o tunnel", () => {
    expect(nivelDeTags({ layer: "2" })).toBe(2);
    expect(nivelDeTags({ bridge: "yes" })).toBe(1);
    expect(nivelDeTags({ tunnel: "yes" })).toBe(-1);
    expect(nivelDeTags({ highway: "primary" })).toBe(0);
  });

  it("narrado a ras del piso: el choque queda en el Periférico, no en la Autopista Urbana", () => {
    const calles = callesDe(callesDelNivel(RED, false));
    expect(calles.map((c) => c.nombre)).toEqual(["Periférico", "Rampa"]);
    expect(ajustarACalle(calles, sobreAmbas)!.calle.nombre).toBe("Periférico");
  });

  it("narrado sobre el puente: queda en la Autopista Urbana; el Periférico de abajo no cuenta, la rampa sí", () => {
    const calles = callesDe(callesDelNivel(RED, true));
    expect(calles.map((c) => c.nombre).sort()).toEqual(["Autopista Urbana Sur", "Rampa"]);
    expect(ajustarACalle(calles, sobreAmbas)!.calle.nombre).toBe("Autopista Urbana Sur");
  });

  it("el nivel se guarda con el caso y vuelve igual", () => {
    const g = callesParaGuardar(RED, { lat: lat0, lon: lon(0) }, 300, "overpass");
    expect(g.vias.find((v) => v.nombre === "Autopista Urbana Sur")!.nivel).toBe(1);
    expect(g.vias.find((v) => v.nombre === "Periférico")!.nivel).toBeUndefined();
    const ida = callesDe(callesDelNivel(respuestaDeGuardadas(g), false));
    expect(ida.map((c) => c.nombre)).toEqual(["Periférico", "Rampa"]);
  });
});
