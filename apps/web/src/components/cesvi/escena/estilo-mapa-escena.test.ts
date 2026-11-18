import { describe, expect, it } from "vitest";
import { estiloMapaEscena, NOMBRES_POR_VIA } from "./estilo-mapa-escena";

describe("los nombres de las calles al alejar (René, 2026-11-18, B6)", () => {
  it("cada tipo de vía tiene su nombre una vez, y las grandes aparecen antes", () => {
    const clases = NOMBRES_POR_VIA.flatMap((n) => n.clases);
    expect(new Set(clases).size).toBe(clases.length);
    for (const c of [
      "motorway",
      "trunk",
      "primary",
      "secondary",
      "tertiary",
      "minor",
      "residential",
    ])
      expect(clases).toContain(c);
    const desde = Object.fromEntries(NOMBRES_POR_VIA.map((n) => [n.id, n.desde]));
    expect(desde["nombres-calles-grandes"]).toBeLessThan(desde["nombres-calles-medias"]!);
    expect(desde["nombres-calles-medias"]).toBeLessThan(desde["nombres-calles-locales"]!);
    // Antes todas aparecían a 15; ahora las locales a 14 y las grandes a 11.
    expect(desde["nombres-calles-locales"]).toBe(14);
    expect(desde["nombres-calles-grandes"]).toBe(11);
  });

  it("en el estilo, las grandes van encima (ganan el lugar) y nunca se enciman", () => {
    for (const tema of ["claro", "oscuro"] as const) {
      const capas = estiloMapaEscena(tema).layers;
      const ids = capas.map((l) => l.id);
      expect(ids.indexOf("nombres-calles-grandes")).toBeGreaterThan(
        ids.indexOf("nombres-calles-locales"),
      );
      for (const n of NOMBRES_POR_VIA) {
        const capa = capas.find((l) => l.id === n.id) as {
          minzoom?: number;
          layout?: Record<string, unknown>;
        };
        expect(capa.minzoom).toBe(n.desde);
        expect(capa.layout?.["text-allow-overlap"]).toBeUndefined();
      }
    }
  });
});
