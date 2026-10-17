import { CubeTexture } from "three";
import { describe, expect, it } from "vitest";
import type { SurfaceState } from "./environment";
import { asphaltMaterial, patchThreshold, SURFACE_LOOK } from "./road-surface";

const ESTADOS: SurfaceState[] = ["seco", "mojado", "encharcado", "grava_suelta", "aceite", "lodo"];

describe("pavimento según el estado del piso", () => {
  it("cada estado del contrato tiene aspecto; lo mojado es más oscuro y liso que lo seco", () => {
    for (const e of ESTADOS) expect(SURFACE_LOOK[e]).toBeDefined();
    expect(SURFACE_LOOK.mojado.roughness).toBeLessThan(SURFACE_LOOK.seco.roughness);
    expect(SURFACE_LOOK.encharcado.patch!.roughness).toBeLessThan(SURFACE_LOOK.mojado.roughness);
    expect(SURFACE_LOOK.seco.reflect).toBe(0);
    expect(SURFACE_LOOK.encharcado.reflect).toBeGreaterThan(SURFACE_LOOK.mojado.reflect);
  });

  it("más cobertura baja el umbral del ruido", () => {
    expect(patchThreshold(0.45)).toBeLessThan(patchThreshold(0.2));
    expect(patchThreshold(-1)).toBe(patchThreshold(0));
    expect(patchThreshold(2)).toBe(patchThreshold(1));
  });

  it("solo el piso que refleja recibe el cielo como mapa de entorno", () => {
    const cielo = new CubeTexture();
    const mojado = asphaltMaterial("mojado");
    mojado.setReflections(cielo);
    expect(mojado.material.envMap).toBe(cielo);
    expect(mojado.material.envMapIntensity).toBe(SURFACE_LOOK.mojado.reflect);
    mojado.setReflections(null);
    expect(mojado.material.envMap).toBeNull();
    const seco = asphaltMaterial("seco");
    seco.setReflections(cielo);
    expect(seco.material.envMap).toBeNull();
    for (const e of ESTADOS) {
      const m = asphaltMaterial(e).material;
      expect(m.colorNode).toBeTruthy();
      expect(m.roughnessNode).toBeTruthy();
    }
  });
});
