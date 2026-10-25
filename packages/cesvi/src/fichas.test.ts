import { describe, expect, it } from "vitest";
import type { Expediente } from "./corpus";
import { conMasasDeFicha, fichaDe } from "./fichas";

const v1 = {
  id: "V1",
  marca: { valor: "Chevrolet", fuente: "dictamen_importado" },
  modelo: { valor: "Silverado 2500", fuente: "dictamen_importado" },
  anio: 2007,
  clase: "pickup",
} as Expediente["vehiculos"][number];

describe("la masa de ficha técnica de un vehículo de un caso", () => {
  it("la Silverado 2500 2007 de AXA: punto medio de las de cuatro puertas, que ±5 % cubre", () => {
    const f = fichaDe(v1)!;
    // 5,398 a 5,899 lb (KBB), en kg.
    expect(f.peso_vacio_kg).toEqual([2448.5, 2675.7]);
    expect(f.masa_kg).toBe(2562.1);
    expect(f.masa_kg * 0.95).toBeLessThan(f.peso_vacio_kg[0]!);
    expect(f.masa_kg * 1.05).toBeGreaterThan(f.peso_vacio_kg[1]!);
    expect(fichaDe({ ...v1, anio: 2008 })).toBeNull();
  });

  it("solo llena la masa que falta, como supuesto", () => {
    const e = {
      vehiculos: [
        v1,
        { ...v1, id: "V2", masa: { valor: 1431.083, unidad: "kg", fuente: "dictamen_importado" } },
      ],
    } as unknown as Expediente;
    const [a, b] = conMasasDeFicha(e).vehiculos;
    expect(a!.masa).toEqual({ valor: 2562.1, unidad: "kg", fuente: "supuesto" });
    expect(b!.masa!.valor).toBe(1431.083);
  });
});
