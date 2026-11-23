import { describe, expect, it } from "vitest";
import { contradiceLoNarrado, limiteContraNarracion } from "./contra-narracion";
import type { VelocidadNarrada } from "./velocidad-narrada";

const exceso: VelocidadNarrada = {
  kmh: 65,
  rango_kmh: [50, 80],
  origen: "narración",
  descripcion: "a exceso de velocidad",
  respecto_al_limite: "arriba",
  limite_kmh: 50,
  limite_fuente: "LGMSV",
};

describe("las posiciones contra lo narrado", () => {
  it("el árbol: «exceso de velocidad» con límite de 50 y las posiciones en 39 (30–47)", () => {
    const t = limiteContraNarracion("V1", exceso, { mejor: 39.2, p10: 30.1, p90: 47.3 });
    expect(t).toBe(
      "V1: la narración dice más de 50 km/h («a exceso de velocidad»); las posiciones dan 39 km/h (30–47). No se fuerza ninguna de las dos: revisa las posiciones marcadas y lo que dice la narración.",
    );
  });

  it("si el rango toca lo narrado, o la velocidad la dio el perito, no dice nada", () => {
    expect(contradiceLoNarrado(exceso, { mejor: 45, p10: 38, p90: 51 })).toBe(false);
    expect(
      limiteContraNarracion("V1", { ...exceso, origen: "perito" }, { mejor: 39, p10: 30, p90: 47 }),
    ).toBeNull();
  });

  it("una cota: «a más de 90» contra 60 (55–70) sí; contra 85 (80–95) no", () => {
    const mas90 = {
      ...exceso,
      kmh: 90,
      rango_kmh: [90, 90],
      cota: "minimo",
      respecto_al_limite: undefined,
    } as VelocidadNarrada;
    expect(limiteContraNarracion("V1", mas90, { mejor: 60, p10: 55, p90: 70 })).toMatch(
      /dice al menos 90 km\/h/,
    );
    expect(contradiceLoNarrado(mas90, { mejor: 85, p10: 80, p90: 95 })).toBe(false);
  });
});
