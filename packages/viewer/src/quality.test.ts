import { describe, expect, it } from "vitest";
import { QUALITY_PROFILES, nextQualityLevel } from "./quality";

describe("quality", () => {
  it("baja un nivel con fps bajos y nunca por debajo de baja", () => {
    expect(nextQualityLevel("alta", 20)).toBe("media");
    expect(nextQualityLevel("media", 20)).toBe("baja");
    expect(nextQualityLevel("baja", 5)).toBe("baja");
  });

  it("sube un nivel con fps altos y nunca por encima de alta", () => {
    expect(nextQualityLevel("baja", 60)).toBe("media");
    expect(nextQualityLevel("media", 60)).toBe("alta");
    expect(nextQualityLevel("alta", 120)).toBe("alta");
  });

  it("mantiene el nivel en la zona de histéresis", () => {
    expect(nextQualityLevel("media", 45)).toBe("media");
  });

  it("los perfiles son monótonos en costo", () => {
    expect(QUALITY_PROFILES.baja.maxTrees).toBeLessThan(QUALITY_PROFILES.media.maxTrees);
    expect(QUALITY_PROFILES.media.maxTrees).toBeLessThan(QUALITY_PROFILES.alta.maxTrees);
    expect(QUALITY_PROFILES.baja.pixelRatio).toBeLessThanOrEqual(QUALITY_PROFILES.media.pixelRatio);
  });
});
