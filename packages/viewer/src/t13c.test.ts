import { Color, SRGBColorSpace } from "three";
import { describe, expect, it } from "vitest";
import { FACADE_PALETTE_MX } from "./environment-decor";
import { fogColorFor, nightSkyColors } from "./sky";
import { frondTexture, PALM_FRONDS, palmCrown } from "./tree-impostors";

describe("T1.3c: defectos de T1.3b", () => {
  it("la noche es azul oscuro neutro a casi negro, no verde oliva", () => {
    for (const streetLights of [true, false]) {
      const c = nightSkyColors(streetLights);
      const env = { night: true, streetLights, turbidity: 2.5, sun: { elevation: -20 } };
      for (const hex of [c.horizon, c.zenith, fogColorFor(env as never)]) {
        const { r, g, b } = new Color(hex);
        // Oscuro y con el azul por encima del verde y del rojo (nada de oliva).
        expect(Math.max(r, g, b)).toBeLessThan(0.22);
        expect(b).toBeGreaterThanOrEqual(g);
        expect(b).toBeGreaterThanOrEqual(r);
      }
    }
  });

  it("de día la niebla es azulada, no casi blanca", () => {
    const env = { night: false, streetLights: false, turbidity: 2.5, sun: { elevation: 50 } };
    const { r, g, b } = new Color(fogColorFor(env as never));
    expect(b).toBeGreaterThan(r);
    expect((r + g + b) / 3).toBeLessThan(0.8);
  });

  it("la paleta de fachadas es clara y poco saturada", () => {
    for (const hex of FACADE_PALETTE_MX) {
      const hsl = { h: 0, s: 0, l: 0 };
      // En sRGB (three guarda los colores en lineal): claridad como la ve el ojo, y la saturación
      // de HSV (la de HSL se dispara en los colores claros).
      const c = new Color(hex);
      c.getHSL(hsl, SRGBColorSpace);
      const rgb = { r: 0, g: 0, b: 0 };
      c.getRGB(rgb, SRGBColorSpace);
      const mx = Math.max(rgb.r, rgb.g, rgb.b);
      const mn = Math.min(rgb.r, rgb.g, rgb.b);
      expect(hsl.l).toBeGreaterThan(0.6);
      expect((mx - mn) / mx).toBeLessThan(0.45);
    }
  });

  it("la fronda de la palmera es una textura con mipmaps y bordes suaves", () => {
    const t = frondTexture();
    expect(t.generateMipmaps).toBe(true);
    const img = t.image as { width: number; height: number; data: Uint8Array };
    expect(img.width).toBe(128);
    expect(img.height).toBe(512);
    // Hay alfa intermedio (bordes suaves), transparente fuera de la fronda y opaco en la vena.
    const alphas = new Set<number>();
    for (let i = 3; i < img.data.length; i += 4) alphas.add(img.data[i]!);
    expect(alphas.size).toBeGreaterThan(8);
    expect(img.data[4 * ((img.height - 1) * img.width) + 3]).toBe(0); // punta, borde: fuera
    const mid = 4 * (10 * 128 + 64) + 3; // vena central cerca del pie
    expect(img.data[mid]).toBeGreaterThan(225);
    expect(frondTexture()).toBe(t); // se comparte
    expect(palmCrown().getAttribute("position").count).toBe(PALM_FRONDS * 14);
  });
});
