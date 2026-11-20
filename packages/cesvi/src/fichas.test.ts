import { describe, expect, it } from "vitest";
import type { Expediente } from "./corpus";
import { conMasasDelModelo, conMasasDeFicha, fichaDe, masaDeModelo } from "./fichas";
import { masaTipica } from "./escena-narracion";

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

describe("la masa del modelo leído (René, 2026-11-20)", () => {
  const veh = (id: string, marca: string | null, modelo: string | null, clase: string) =>
    ({
      id,
      ...(marca ? { marca: { valor: marca, fuente: "relato" } } : {}),
      ...(modelo ? { modelo: { valor: modelo, fuente: "relato" } } : {}),
      clase,
    }) as Expediente["vehiculos"][number];

  it("la ficha del fabricante de su modelo, con su URL; sin importar versión ni año", () => {
    expect(masaDeModelo(veh("V1", "Nissan", "Versa", "sedan_compacto"))).toMatchObject({
      masa_kg: 1110,
      version: "Nissan Versa Sense TM 2026",
    });
    expect(masaDeModelo(veh("V1", null, "Hilux", "pickup"))!.masa_kg).toBe(1890);
    expect(masaDeModelo(veh("V1", "Toyota", "Hilux", "pickup"))!.fuente).toMatch(
      /^masa en vacío .*https:\/\//,
    );
    // La ficha del Aveo no publica la masa: no hay masa de modelo.
    expect(masaDeModelo(veh("V1", "Chevrolet", "Aveo", "sedan_compacto"))).toBeNull();
    // Otra marca con la misma familia no cuenta.
    expect(masaDeModelo(veh("V1", "Ford", "Versa", "sedan_compacto"))).toBeNull();
  });

  it("solo sin modelo queda sin masa (y se pregunta); sin ficha, la típica de su clase", () => {
    const e = {
      vehiculos: [
        veh("V1", "Nissan", "Versa", "sedan_compacto"),
        veh("V2", "Chevrolet", "Aveo", "sedan_compacto"),
        veh("V3", null, null, "pickup"),
      ],
    } as unknown as Expediente;
    const [a, b, c] = conMasasDelModelo(e, masaTipica).vehiculos;
    expect(a!.masa).toEqual({ valor: 1110, unidad: "kg", fuente: "supuesto" });
    expect(b!.masa).toEqual({
      valor: masaTipica("sedan_compacto")!.valor,
      unidad: "kg",
      fuente: "supuesto",
    });
    expect(c!.masa).toBeUndefined();
  });
});
