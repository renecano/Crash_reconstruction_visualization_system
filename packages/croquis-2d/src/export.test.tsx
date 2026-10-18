// @vitest-environment jsdom
import { LEGEND_TEXT, loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { scaleBarMeters } from "./Croquis";
import { croquisSvg } from "./export";

function parse(markup: string): Document {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  return doc;
}

describe("croquis exportable", () => {
  it("SVG autónomo: XML válido, xmlns, tamaño en píxeles y fondo", () => {
    const spec = loadFixture("lateral_interseccion");
    const { markup, width, height } = croquisSvg(spec);
    expect(markup.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    const svg = parse(markup).documentElement;
    expect(svg.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    expect(Number(svg.getAttribute("width"))).toBe(width);
    expect(Number(svg.getAttribute("height"))).toBe(height);
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${width} ${height}`);
    expect(svg.firstElementChild?.tagName).toBe("rect");
    // Sin estilos de la página ni eventos del editor.
    expect(svg.getAttribute("style")).toBeNull();
    expect(markup).not.toMatch(/onPointer|touch-action/);
  });

  it("lleva la marca, la semilla y el hash de entradas", () => {
    const spec = loadFixture("lateral_interseccion");
    const hash = "b".repeat(64);
    const { markup } = croquisSvg({ ...spec, meta: { ...spec.meta, hash_relato: hash } });
    const text = parse(markup).documentElement.textContent ?? "";
    expect(text).toContain(LEGEND_TEXT);
    expect(text).toContain(`semilla ${spec.meta.semilla}`);
    expect(text).toContain(`hash ${hash}`);
  });

  it("con vía de OpenStreetMap, también su atribución", () => {
    const { markup } = croquisSvg(loadFixture("interseccion_toluca"));
    expect(parse(markup).documentElement.textContent).toMatch(/OpenStreetMap/);
  });

  it("la escala fija el tamaño (más píxeles por metro, imagen más grande)", () => {
    const spec = loadFixture("alcance");
    const a = croquisSvg(spec, { scale: 10 });
    const b = croquisSvg(spec, { scale: 20 });
    expect(b.width).toBeCloseTo(a.width * 2, 6);
    expect(b.height).toBeCloseTo(a.height * 2, 6);
  });
});

describe("barra de escala", () => {
  it("elige 1-2-5 × 10ⁿ sin pasar de una quinta parte del ancho", () => {
    expect(scaleBarMeters(100)).toBe(20);
    expect(scaleBarMeters(60)).toBe(10);
    expect(scaleBarMeters(26)).toBe(5);
    expect(scaleBarMeters(300)).toBe(50);
    expect(scaleBarMeters(5000)).toBe(1000);
  });

  it("aparece en el croquis exportado con su largo", () => {
    const { markup } = croquisSvg(loadFixture("lateral_interseccion"));
    expect(markup).toMatch(/data-testid="escala"[^]*?\d+ m<\/text>/);
  });
});
