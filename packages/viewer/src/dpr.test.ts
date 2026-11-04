import { describe, expect, it } from "vitest";
import { memoriaPantallaMB } from "./diagnostics";
import { LIMITE_PANTALLA_MB, dprPara, pantallaDe } from "./dpr";
import { NIGHT_PIXEL_RATIO_MEDIA } from "./quality";

describe("dpr por nivel y memoria de pantalla (René, 2026-11-04, M1)", () => {
  it("nunca pasa de min(devicePixelRatio, 2) ni del tope del nivel", () => {
    // La M1 de René: devicePixelRatio 2, ventana 1256 × 521 CSS px.
    expect(dprPara("alta", 2, 1256, 521)).toBeLessThanOrEqual(2);
    expect(dprPara("media", 2, 1256, 521)).toBeLessThanOrEqual(1.5);
    expect(dprPara("baja", 2, 1256, 521)).toBe(1);
    expect(dprPara("ultra", 3, 800, 600)).toBeLessThanOrEqual(2);
    expect(dprPara("media", 1, 1920, 1080)).toBe(1);
  });

  it("baja el dpr hasta que la memoria de pantalla cabe en el límite", () => {
    const dpr = dprPara("alta", 2, 1256, 521);
    const mb = memoriaPantallaMB(pantallaDe("alta", 1256, 521, dpr)).pantallaMB;
    expect(mb).toBeLessThanOrEqual(LIMITE_PANTALLA_MB);
    // Con dpr 3 (lo que salía) pasaba de 150 MB por mucho.
    expect(memoriaPantallaMB(pantallaDe("alta", 1256, 521, 3)).pantallaMB).toBeGreaterThan(300);
    // Y con dpr 2 tampoco cabe: el límite obliga a menos.
    expect(dpr).toBeLessThan(2);
    expect(dpr).toBeGreaterThanOrEqual(1);
  });

  it("no baja de 1 aunque la pantalla sea enorme", () => {
    expect(dprPara("ultra", 2, 5120, 2880)).toBe(1);
  });

  it("de noche en media aplica el factor nocturno", () => {
    expect(dprPara("media", 1, 1280, 720, { noche: true })).toBeCloseTo(NIGHT_PIXEL_RATIO_MEDIA);
  });
});
