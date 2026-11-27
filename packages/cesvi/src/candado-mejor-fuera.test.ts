import { describe, expect, it } from "vitest";
import { candadoFisico } from "./candado";

/**
 * El mejor ajuste fuera de su propio rango no da cifra (René, 2026-11-25, aud-30: el ciclista salía
 * a 33 km/h con rango 13–30): el candado lo dice, con las dos cifras y qué revisar.
 */
describe("el candado con el mejor ajuste fuera de su rango", () => {
  const velocidad = (mejor: number, p10: number, p90: number) => ({
    vehiculo: "V2",
    previa: { mejor, p10, p50: (p10 + p90) / 2, p90 },
    impacto: null,
  });

  it("por arriba: no hay cifra y se explica por qué", () => {
    const c = candadoFisico({ especAnimada: {}, ids: {}, velocidades: [velocidad(33, 13, 30)] });
    expect(c.noCuadra).not.toBeNull();
    expect(c.noCuadra!.motivos.join(" ")).toMatch(/33 km\/h.*por arriba de su propio rango.*13/);
    expect(c.noCuadra!.revisar.join(" ")).toMatch(/evidencia y los supuestos/);
  });

  it("por debajo, igual", () => {
    const c = candadoFisico({ especAnimada: {}, ids: {}, velocidades: [velocidad(10, 13, 30)] });
    expect(c.noCuadra!.motivos.join(" ")).toMatch(/por debajo de su propio rango/);
  });

  it("dentro de su rango, o fuera por menos del 10 % de su ancho (el ruido del p90), no lo marca", () => {
    // 50.3 con 30.4–48.6: 1.7 km/h fuera, menos del 10 % de 18.2: queda el límite con las dos cifras.
    for (const v of [velocidad(20, 13, 30), velocidad(30.4, 13, 30), velocidad(50.3, 30.4, 48.6)]) {
      const c = candadoFisico({ especAnimada: {}, ids: {}, velocidades: [v] });
      expect(c.noCuadra).toBeNull();
    }
  });
});
