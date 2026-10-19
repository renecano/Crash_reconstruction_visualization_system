import { CubeTexture, DataTexture } from "three";
import type { EnvTexture } from "./env-textures";
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

describe("grava suelta (ADR 0036)", () => {
  it("tiene grano del tamaño de una piedra, no una mancha lisa", () => {
    expect(SURFACE_LOOK.grava_suelta.patch?.grainM).toBeGreaterThan(0.01);
    expect(SURFACE_LOOK.grava_suelta.patch?.grainM).toBeLessThan(0.1);
    expect(SURFACE_LOOK.aceite.patch?.grainM).toBeUndefined();
  });

  it("con la textura de grava, las manchas ganan relieve aunque la calzada no tenga textura", () => {
    const fake = (): EnvTexture => {
      const tex = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
      return {
        map: tex,
        normal: tex,
        rough: tex,
        tileM: 2,
        meanRgb: [0.1, 0.1, 0.1],
        meanRough: 0.9,
      };
    };
    const a = asphaltMaterial("grava_suelta");
    a.applyTexture(null);
    expect(a.material.normalNode).toBeNull();
    a.applyTexture(null, fake());
    expect(a.material.normalNode).toBeTruthy();
    a.applyTexture(fake(), fake());
    expect(a.material.normalNode).toBeTruthy();
    // Sin manchas de grava, la textura de grava no se usa.
    const seco = asphaltMaterial("seco");
    seco.applyTexture(null, fake());
    expect(seco.material.normalNode).toBeNull();
  });
});

describe("interruptor de diagnóstico gravaPrevia (E6, ADR 0036)", () => {
  it("vuelve a las manchas de antes solo en grava suelta", () => {
    expect(asphaltMaterial("grava_suelta", true).look.patch?.grainM).toBeUndefined();
    expect(asphaltMaterial("grava_suelta").look.patch?.grainM).toBeGreaterThan(0);
    expect(asphaltMaterial("lodo", true).look).toBe(SURFACE_LOOK.lodo);
  });
});
