import { describe, expect, it } from "vitest";
import { limiteMejorFuera, mejorFueraDelRango } from "./mejor-fuera";

/** Hallado el 2026-11-15: la pantalla mostraba «102 km/h, rango 72–99» sin decir nada. */
describe("el mejor ajuste fuera de su rango", () => {
  it("se detecta de qué lado queda, con la holgura del redondeo", () => {
    expect(mejorFueraDelRango({ mejor: 102.07, p10: 71.68, p90: 99.05 })).toBe("arriba");
    expect(mejorFueraDelRango({ mejor: 14.2, p10: 21.4, p90: 31.6 })).toBe("abajo");
    // AXA (eval/results/axa_rango_estable.json): dentro, los dos vehículos.
    expect(mejorFueraDelRango({ mejor: 56.87, p10: 55.11, p90: 78.06 })).toBeNull();
    expect(mejorFueraDelRango({ mejor: 14.98, p10: 1.04, p90: 21.38 })).toBeNull();
    // Medio km/h de diferencia no se ve en enteros: no se avisa.
    expect(mejorFueraDelRango({ mejor: 40.4, p10: 9.11, p90: 39.95 })).toBeNull();
    expect(mejorFueraDelRango({ mejor: 40.4 })).toBeNull();
    expect(mejorFueraDelRango(null)).toBeNull();
  });

  it("el límite dice las dos cifras y qué conviene hacer, sin culpar a nadie", () => {
    const l = limiteMejorFuera("V2", { mejor: 102.07, p10: 71.68, p90: 99.05 })!;
    expect(l).toContain(
      "V2: el mejor ajuste (102 km/h) queda por arriba del rango de las simulaciones (72–99)",
    );
    expect(l).toContain("Conviene revisar la evidencia");
    expect(limiteMejorFuera("V1", { mejor: 14.2, p10: 21.4, p90: 31.6 })).toContain("por debajo");
    expect(limiteMejorFuera("V2", { mejor: 56.87, p10: 55.11, p90: 78.06 })).toBeNull();
  });
});
