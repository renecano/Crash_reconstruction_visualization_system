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
});
