import { describe, expect, it } from "vitest";
import { cinematicCamera } from "./cameras";
import { cinematicFocus, firstImpactTime, impactBlurWeight } from "./cinematic-fx";

describe("efectos de cine de alta y ultra (R10)", () => {
  it("el desenfoque de movimiento solo va alrededor del impacto", () => {
    expect(impactBlurWeight(2, 2)).toBe(1);
    expect(impactBlurWeight(2.15, 2)).toBe(1);
    expect(impactBlurWeight(2.375, 2)).toBeCloseTo(0.5, 10);
    expect(impactBlurWeight(1.4, 2)).toBe(0);
    expect(impactBlurWeight(-3, 2)).toBe(0);
    expect(impactBlurWeight(2, undefined)).toBe(0);
  });

  it("el impacto es el primer evento de impacto del resultado", () => {
    expect(
      firstImpactTime({
        eventos: [
          { tipo: "inicio", t: 0 },
          { tipo: "impacto_2", t: 1.4 },
          { tipo: "impacto_1", t: 0.8 },
        ],
      }),
    ).toBe(0.8);
    expect(firstImpactTime({ eventos: [{ tipo: "reposo", t: 3 }] })).toBeUndefined();
    expect(firstImpactTime({})).toBeUndefined();
  });

  it("la cámara cinemática enfoca a su objetivo, con margen para los dos vehículos", () => {
    expect(cinematicFocus({ position: [3, 4, 0], target: [0, 0, 0] })).toEqual({
      distance: 5,
      focalLength: 6,
    });
    const pose = cinematicCamera(
      {
        t_inicio: 0,
        t_fin: 3,
        punto_impacto: { x: 0, y: 0 },
        vehiculos: [],
      },
      1,
    );
    const f = cinematicFocus(pose);
    expect(f.distance).toBeGreaterThanOrEqual(14);
    expect(f.focalLength).toBeCloseTo(f.distance * 0.6, 10);
  });
});
