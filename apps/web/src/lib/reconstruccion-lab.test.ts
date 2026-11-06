import type { Reconstruccion } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  frasePercentil,
  histograma,
  marcasDelEje,
  protagonista,
  textoBarra,
} from "./reconstruccion-lab";

const conVelocidades = (velocidades: Reconstruccion["velocidades"]) =>
  ({ velocidades }) as unknown as Reconstruccion;

describe("la reconstrucción (Laboratorio §8)", () => {
  it("la protagonista es la más rápida que la evidencia fija; sin ninguna, nada", () => {
    const r = conVelocidades([
      { vehiculo: "V1", previa: null, impacto: { p10: 6, p50: 9, p90: 9.1 } },
      { vehiculo: "V2", previa: null, impacto: { p10: 47, p50: 49, p90: 49.2 } },
    ]);
    expect(protagonista(r)?.vehiculo).toBe("V2");
    expect(
      protagonista(conVelocidades([{ vehiculo: "V1", previa: null, impacto: null }])),
    ).toBeNull();
  });

  it("el histograma: una barra por km/h, las del rango marcadas, ninguna simulación se pierde", () => {
    const b = histograma([30.2, 30.9, 31.5, 33.1, 34], 30.5, 33.5);
    expect(b.map((x) => x.desde)).toEqual([30, 31, 32, 33, 34]);
    expect(b.map((x) => x.n)).toEqual([2, 1, 0, 1, 1]);
    expect(b.map((x) => x.enRango)).toEqual([true, true, true, true, false]);
    expect(b.reduce((a, x) => a + x.n, 0)).toBe(5);
    expect(histograma([], 1, 2)).toEqual([]);
  });

  it("las marcas del eje caen en múltiplos redondos", () => {
    const b = histograma([22, 47], 25, 45);
    expect(marcasDelEje(b)).toEqual([25, 30, 35, 40, 45]);
    expect(marcasDelEje(histograma([30, 33], 30, 33))).toEqual([30, 32, 34]);
    expect(marcasDelEje([])).toEqual([]);
  });

  it("cada percentil se explica en una frase, y cada barra en palabras", () => {
    expect(frasePercentil("p10", 26.2)).toContain("más de 26.2 km/h");
    expect(frasePercentil("p50", 34.5)).toContain("abajo de 34.5 km/h");
    expect(frasePercentil("p90", 44)).toContain("menos de 44.0 km/h");
    expect(textoBarra({ desde: 34, n: 1, enRango: true })).toBe(
      "34–35 km/h: 1 simulación, dentro de p10–p90",
    );
  });
});
