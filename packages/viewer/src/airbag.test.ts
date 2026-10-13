import { describe, expect, it } from "vitest";
import { airbagDecision, airbagScale, IIHS_THRESHOLDS, MPH_TO_KMH } from "./airbag";

const base = { pdofHoras: 12, cinturon: true, objetoEstrecho: false, dosRuedas: false };

describe("bolsas de aire (umbrales IIHS)", () => {
  it("los umbrales son los del IIHS convertidos a km/h", () => {
    expect(IIHS_THRESHOLDS.frontalConCinturonKmh).toBeCloseTo(16 * MPH_TO_KMH, 9);
    expect(IIHS_THRESHOLDS.frontalSinCinturonKmh).toBeCloseTo(11 * MPH_TO_KMH, 9);
    expect(IIHS_THRESHOLDS.lateralObjetoEstrechoKmh).toBeCloseTo(8 * MPH_TO_KMH, 9);
    expect(IIHS_THRESHOLDS.lateralDistribuidoKmh).toBeCloseTo(18 * MPH_TO_KMH, 9);
  });

  it("la frontal se despliega según ΔV y cinturón", () => {
    expect(airbagDecision({ ...base, deltaVKmh: 30 }).frontal).toBe(true);
    expect(airbagDecision({ ...base, deltaVKmh: 22 }).frontal).toBe(false);
    expect(airbagDecision({ ...base, deltaVKmh: 22, cinturon: false }).frontal).toBe(true);
    const unknown = airbagDecision({ ...base, deltaVKmh: 22, cinturon: undefined });
    expect(unknown.frontal).toBe(false);
    expect(unknown.motivo).toContain("cinturón no declarado");
    expect(airbagDecision({ ...base, deltaVKmh: 30, pdofHoras: 1.5 }).frontal).toBe(true);
  });

  it("la lateral depende del lado y del tipo de impacto", () => {
    expect(airbagDecision({ ...base, deltaVKmh: 32, pdofHoras: 3 }).lateral).toBe("derecha");
    expect(airbagDecision({ ...base, deltaVKmh: 32, pdofHoras: 9 }).lateral).toBe("izquierda");
    expect(airbagDecision({ ...base, deltaVKmh: 20, pdofHoras: 9 }).lateral).toBeNull();
    expect(
      airbagDecision({ ...base, deltaVKmh: 20, pdofHoras: 9, objetoEstrecho: true }).lateral,
    ).toBe("izquierda");
  });

  it("no aplica en dos ruedas, impactos traseros ni sin impacto", () => {
    expect(airbagDecision({ ...base, deltaVKmh: 60, dosRuedas: true }).frontal).toBe(false);
    expect(airbagDecision({ ...base, deltaVKmh: 60, pdofHoras: 6 }).frontal).toBe(false);
    expect(airbagDecision({ ...base, deltaVKmh: 0 }).motivo).toBe("Sin impacto.");
  });

  it("se infla en ~30 ms y se desinfla sin pasar de su tamaño", () => {
    expect(airbagScale(0)).toBe(0);
    expect(airbagScale(0.03)).toBeCloseTo(0.5, 9);
    expect(airbagScale(0.045)).toBe(1);
    for (let t = 0.045; t < 3; t += 0.01) expect(airbagScale(t)).toBeLessThanOrEqual(1);
    expect(airbagScale(3)).toBeCloseTo(0.55, 9);
  });
});
