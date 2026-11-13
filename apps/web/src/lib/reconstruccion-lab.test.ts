import type { Reconstruccion } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  frasePercentil,
  histograma,
  marcasDelEje,
  protagonista,
  posEnHistograma,
  rangoDeVelocidad,
  sinDispersion,
  textoBarra,
  tipImpacto,
  tipVehiculo,
} from "./reconstruccion-lab";

const conVelocidades = (velocidades: Reconstruccion["velocidades"]) =>
  ({ velocidades }) as unknown as Reconstruccion;

describe("la reconstrucción (Laboratorio §8)", () => {
  it("la protagonista es la más rápida que la evidencia fija; sin ninguna, nada", () => {
    const r = conVelocidades([
      { vehiculo: "V1", previa: { mejor: 14.98 }, impacto: { p50: 90 } },
      { vehiculo: "V2", previa: { mejor: 56.87 }, impacto: { p50: 60.33 } },
    ]);
    // Se decide por el mejor ajuste, no por la mediana de las simulaciones.
    expect(protagonista(r)?.vehiculo).toBe("V2");
    expect(
      protagonista(conVelocidades([{ vehiculo: "V1", previa: null, impacto: { p50: 9 } }])),
    ).toBeNull();
  });

  it("si las simulaciones no se apartan, se dice, y el rango se nombra como lineal", () => {
    const previa = { mejor: 41.5, p10: 27.2, p50: 41.5, p90: 55.7, rango_por: "laplace" };
    const v = {
      vehiculo: "V2",
      previa,
      impacto: { p10: 41.5, p50: 41.5, p90: 41.5, valores: [41.5, 41.5] },
    };
    expect(sinDispersion(v)).toBe(true);
    expect(rangoDeVelocidad(v)).toEqual({ p10: 27.2, p90: 55.7, lineal: true });
    // Con dispersión real, el de las muestras.
    const con = { ...v, previa: { mejor: 56.87, p10: 54.79, p90: 78.39 } };
    expect(rangoDeVelocidad(con)).toEqual({ p10: 54.79, p90: 78.39, lineal: false });
    // Sin un rango que dar, no se inventa.
    expect(rangoDeVelocidad({ ...v, previa: { mejor: 41.5 } })).toBeNull();
    expect(rangoDeVelocidad({ ...v, previa: { mejor: 41.5, p10: 41.5, p90: 41.5 } })).toBeNull();
    expect(rangoDeVelocidad({ ...v, previa: null })).toBeNull();
  });

  it("el histograma: una barra por km/h, las del rango marcadas, ninguna simulación se pierde", () => {
    const b = histograma([30.2, 30.9, 31.5, 33.1, 34], 30.5, 33.5);
    expect(b.map((x) => x.desde)).toEqual([30, 31, 32, 33, 34]);
    expect(b.map((x) => x.n)).toEqual([2, 1, 0, 1, 1]);
    expect(b.map((x) => x.enRango)).toEqual([true, true, true, true, false]);
    expect(b.reduce((a, x) => a + x.n, 0)).toBe(5);
    expect(histograma([], 1, 2)).toEqual([]);
  });

  it("el eje abarca el mejor ajuste y lo marca en su lugar, aunque ninguna simulación caiga ahí", () => {
    const b = histograma([70.5, 75.2, 80], 70, 80, 60.5);
    expect(b[0]!.desde).toBe(60);
    expect(b.reduce((a, x) => a + x.n, 0)).toBe(3);
    expect(posEnHistograma(b, 60.5)).toBeCloseTo((0.5 / b.length) * 100, 6);
    expect(posEnHistograma(b, 500)).toBeNull();
    expect(posEnHistograma([], 1)).toBeNull();
  });

  it("las marcas del eje caen en múltiplos redondos", () => {
    const b = histograma([22, 47], 25, 45);
    expect(marcasDelEje(b)).toEqual([25, 30, 35, 40, 45]);
    expect(marcasDelEje(histograma([30, 33], 30, 33))).toEqual([30, 32, 34]);
    expect(marcasDelEje([])).toEqual([]);
  });

  it("los tooltips de la escena dicen lo que hay, y «sin dato» si no lo hay", () => {
    expect(
      tipVehiculo({
        nombre: "A · Silverado 2500",
        masaKg: 2562.1,
        masaDe: "supuesto",
        kmh: 14.98,
        dano: "daño posterior",
      }),
    ).toBe(
      "A · Silverado 2500 · masa 2,562.1 kg (supuesto) · antes del impacto 14.98 km/h · daño posterior",
    );
    expect(tipVehiculo({ nombre: "B", masaKg: null, masaDe: null, kmh: null, dano: null })).toBe(
      "B · masa: sin dato · la evidencia no fija su velocidad",
    );
    expect(tipImpacto("B contra A", "perito")).toBe(
      "Impacto · t 0.00 s · B contra A · lo colocó el perito",
    );
    expect(tipImpacto("B contra A", null)).toBe("Impacto · t 0.00 s · B contra A");
  });

  it("cada percentil se explica en una frase, y cada barra en palabras", () => {
    expect(frasePercentil("p10", 26.2)).toContain("más de 26.20 km/h");
    expect(frasePercentil("p50", 75.2)).toContain("es la mediana de las simulaciones");
    expect(frasePercentil("p90", 44)).toContain("menos de 44.00 km/h");
    expect(textoBarra({ desde: 34, n: 1, enRango: true })).toBe(
      "34–35 km/h: 1 simulación, dentro de p10–p90",
    );
  });
});
