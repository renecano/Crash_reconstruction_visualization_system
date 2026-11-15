import { PRODUCTION_SAMPLES } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import { MUESTRAS_DE_REFERENCIA, muestrasDe, notaDeMuestras } from "./reconstruccion";

/** Auditoría del 2026-11-15, N3: todo rango dice con cuántas simulaciones se calculó. */
describe("las simulaciones de un rango van en el dato", () => {
  const con = (muestras?: number) => ({ resultado: { inversion: { muestras } } });

  it("distingue las de producción de las de referencia", () => {
    expect(muestrasDe(con(PRODUCTION_SAMPLES.samples))).toEqual({
      inversion: PRODUCTION_SAMPLES.samples,
      juego: "producción",
    });
    expect(muestrasDe(con(MUESTRAS_DE_REFERENCIA))).toEqual({
      inversion: MUESTRAS_DE_REFERENCIA,
      juego: "referencia",
    });
    expect(muestrasDe(con(20))?.juego).toBe("otro");
    expect(PRODUCTION_SAMPLES.samples).not.toBe(MUESTRAS_DE_REFERENCIA);
  });

  it("la nota lleva el número; sin el dato no lo inventa", () => {
    expect(notaDeMuestras(con(32))).toBe("p10–p90 de 32 simulaciones");
    expect(muestrasDe(con())).toBeNull();
    expect(notaDeMuestras(con())).toBe("p10–p90 de las simulaciones");
    expect(notaDeMuestras({ resultado: {} })).toBe("p10–p90 de las simulaciones");
  });
});
