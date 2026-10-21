import { describe, expect, it } from "vitest";
import { loadFixture } from "./fixtures";
import { LEGEND_TEXT, legendFor, legendLines, legendString } from "./legend";

describe("leyenda de las exportaciones (PLAN §10)", () => {
  it("lleva el texto fijo, la semilla y el hash de entradas", () => {
    const spec = loadFixture("lateral_interseccion");
    const hash = "a".repeat(64);
    const info = legendFor({ ...spec, meta: { ...spec.meta, hash_relato: hash } });
    expect(info.texto).toBe(LEGEND_TEXT);
    expect(info.semilla).toBe(String(spec.meta.semilla));
    expect(legendLines(info)).toEqual([LEGEND_TEXT, `semilla ${spec.meta.semilla} · hash ${hash}`]);
    expect(legendString(info)).toContain("No es un peritaje");
  });

  it("agrega la atribución de OpenStreetMap cuando la escena usa su vía", () => {
    const spec = loadFixture("interseccion_toluca");
    const lines = legendLines(legendFor(spec));
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatch(/OpenStreetMap/);
  });

  it("sin hash, solo la semilla", () => {
    const spec = loadFixture("alcance");
    const meta = { ...spec.meta };
    delete meta.hash_relato;
    expect(legendLines(legendFor({ ...spec, meta }))[1]).toBe(`semilla ${spec.meta.semilla}`);
  });

  it("la palabra de la semilla sigue el idioma de la exportación", () => {
    const spec = loadFixture("alcance");
    const meta = { ...spec.meta };
    delete meta.hash_relato;
    const info = { ...legendFor({ ...spec, meta }), etiquetaSemilla: "seed" };
    expect(legendLines(info)[1]).toBe(`seed ${spec.meta.semilla}`);
  });
});
