import { describe, expect, it } from "vitest";
import { actoDePaso, actosDelCaso, continuarA } from "./actos";
import { CLAVES_PASOS } from "./pasos-caso";

describe("los seis actos del Laboratorio (prompt §4)", () => {
  it("con reporte son seis y cubren los ocho pasos, cada paso en un solo acto", () => {
    const actos = actosDelCaso(CLAVES_PASOS);
    expect(actos.map((a) => a.nombre)).toEqual([
      "El hecho",
      "La escena",
      "Reconstrucción",
      "Análisis",
      "Contra CESVI",
      "Dictamen",
    ]);
    expect(actos.flatMap((a) => a.pasos)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("sin reporte, Contra CESVI no aparece y los índices siguen a los pasos del caso", () => {
    const sinReporte = CLAVES_PASOS.filter((c) => c !== "reporte");
    const actos = actosDelCaso(sinReporte);
    expect(actos.map((a) => a.clave)).not.toContain("contraste");
    expect(actos.at(-1)).toEqual({ clave: "dictamen", nombre: "Dictamen", pasos: [6] });
    expect(actoDePaso(actos, 5)).toBe(3);
    expect(actoDePaso(actos, 9)).toBe(-1);
  });

  it("«Continuar a…» con la contracción del español", () => {
    expect(continuarA("El hecho")).toBe("Continuar al hecho");
    expect(continuarA("La reconstrucción")).toBe("Continuar a la reconstrucción");
    expect(continuarA("Los daños")).toBe("Continuar a los daños");
    expect(continuarA("Croquis contra el reporte de CESVI")).toBe(
      "Continuar a Croquis contra el reporte de CESVI",
    );
  });
});
