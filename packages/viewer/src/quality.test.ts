import { describe, expect, it } from "vitest";
import { QUALITY_PROFILES, nextQualityLevel } from "./quality";

describe("quality", () => {
  it("baja un nivel con fps bajos y nunca por debajo de baja", () => {
    expect(nextQualityLevel("alta", 20)).toBe("media");
    expect(nextQualityLevel("media", 20)).toBe("baja");
    expect(nextQualityLevel("baja", 5)).toBe("baja");
  });

  it("sube un nivel con fps altos y nunca por encima de ultra", () => {
    expect(nextQualityLevel("baja", 60)).toBe("media");
    expect(nextQualityLevel("media", 60)).toBe("alta");
    expect(nextQualityLevel("alta", 120)).toBe("ultra");
    expect(nextQualityLevel("ultra", 240)).toBe("ultra");
    expect(nextQualityLevel("ultra", 20)).toBe("alta");
  });

  it("mantiene el nivel en la zona de histéresis", () => {
    expect(nextQualityLevel("media", 45)).toBe("media");
  });

  it("los perfiles son monótonos en costo", () => {
    expect(QUALITY_PROFILES.baja.maxTrees).toBeLessThan(QUALITY_PROFILES.media.maxTrees);
    expect(QUALITY_PROFILES.media.maxTrees).toBeLessThan(QUALITY_PROFILES.alta.maxTrees);
    expect(QUALITY_PROFILES.baja.pixelRatio).toBeLessThanOrEqual(QUALITY_PROFILES.media.pixelRatio);
    expect(QUALITY_PROFILES.alta.maxTrees).toBeLessThan(QUALITY_PROFILES.ultra.maxTrees);
    expect(QUALITY_PROFILES.alta.pixelRatio).toBeLessThan(QUALITY_PROFILES.ultra.pixelRatio);
  });

  it("alta y ultra no recortan nada de lo que tienen los niveles de abajo (ADR 0026)", () => {
    for (const lvl of ["alta", "ultra"] as const) {
      const p = QUALITY_PROFILES[lvl];
      expect(p.shadows && p.moonShadow && p.envTextures && p.ambientOcclusion && p.bloom).toBe(
        true,
      );
      expect(p.msaaSamples).toBeGreaterThanOrEqual(4);
      expect(p.spotShadowMapSize).toBeGreaterThan(0);
      expect(p.shadowMapSize).toBeGreaterThanOrEqual(QUALITY_PROFILES.media.shadowMapSize);
    }
  });

  it("los efectos de cine de R10 solo van en alta y ultra; baja y media no cambian (§7.8)", () => {
    for (const lvl of ["baja", "media"] as const) {
      const p = QUALITY_PROFILES[lvl];
      expect([p.temporalAA, p.depthOfField, p.motionBlur, p.screenReflections]).toEqual([
        false,
        false,
        false,
        false,
      ]);
    }
    for (const lvl of ["alta", "ultra"] as const) {
      const p = QUALITY_PROFILES[lvl];
      expect(p.temporalAA && p.depthOfField && p.motionBlur).toBe(true);
    }
    expect(QUALITY_PROFILES.alta.screenReflections).toBe(false);
    expect(QUALITY_PROFILES.ultra.screenReflections).toBe(true);
  });
});

describe("modo automático conservador (2026-11-04)", () => {
  it("solo baja un nivel con fps sostenidos bajos; nunca sube", async () => {
    const { lowerQualityIfSlow, LOWER_BELOW_FPS } = await import("./quality");
    expect(lowerQualityIfSlow("ultra", 20)).toBe("alta");
    expect(lowerQualityIfSlow("media", LOWER_BELOW_FPS - 1)).toBe("baja");
    expect(lowerQualityIfSlow("baja", 5)).toBe("baja");
    expect(lowerQualityIfSlow("media", 200)).toBe("media");
    expect(lowerQualityIfSlow("alta", LOWER_BELOW_FPS)).toBe("alta");
  });
});

describe("bajar un nivel con menos de 24 fps durante 5 s (René, 2026-11-04)", () => {
  it("5 s a 20 fps bajan un nivel; a 30 fps no; 3 s lentos tras 5 s fluidos tampoco", async () => {
    const { lowerQualityIfSlow, LOWER_BELOW_FPS } = await import("./quality");
    const { fpsEnVentana } = await import("./backend-choice");
    expect(LOWER_BELOW_FPS).toBe(24);
    const cuadros = (fps: number, s: number) =>
      Array.from({ length: Math.round(fps * s) }, () => 1000 / fps);
    expect(lowerQualityIfSlow("media", fpsEnVentana(cuadros(20, 6), 5000))).toBe("baja");
    expect(lowerQualityIfSlow("alta", fpsEnVentana(cuadros(20, 6), 5000))).toBe("media");
    expect(lowerQualityIfSlow("media", fpsEnVentana(cuadros(30, 6), 5000))).toBe("media");
    const mezcla = [...cuadros(60, 5), ...cuadros(18, 3)];
    expect(lowerQualityIfSlow("media", fpsEnVentana(mezcla, 5000))).toBe("media");
    expect(lowerQualityIfSlow("baja", fpsEnVentana(cuadros(5, 6), 5000))).toBe("baja");
  });
});
