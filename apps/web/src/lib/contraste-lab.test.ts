import type { ComparacionDictamen } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  cifraContraste,
  conteoCriterios,
  criteriosContraste,
  reglaContraste,
} from "./contraste-lab";

const axa = {
  modalidad: { cesvi: "alcance", croquis: "alcance", motivo: "", coincide: true },
  zonas: { cesvi: 2, coinciden: 2, tercios_comparables: 2, tercios_coinciden: 2 },
  secuencia: { cesvi: 1, primero_coincide: true, completa_coincide: null },
  velocidades: [
    {
      vehiculo: "V2",
      que: "velocidad de impacto por deformación",
      cesvi_kmh: 63.15,
      croquis_kmh: 63.9,
      error_kmh: 0.75,
      error_pct: 1.1876,
    },
  ],
  posiciones: { cesvi: 0, croquis_las_tiene: 0 },
} as unknown as ComparacionDictamen;

describe("Contra CESVI (Laboratorio §8)", () => {
  it("AXA: 3 coinciden, 0 difieren y las posiciones finales sin dato", () => {
    const c = criteriosContraste(axa);
    expect(conteoCriterios(c)).toEqual({ coinciden: 3, difieren: 0, sinDato: 1 });
    expect(c.find((x) => x.clave === "posiciones")!.detalle).toBe(
      "Sin dato en el reporte · no comparable",
    );
    expect(c.find((x) => x.clave === "zonas")!.detalle).toBe("2 de 2 · tercios 2 de 2");
  });

  it("lo que no coincide se cuenta como diferencia", () => {
    const c = criteriosContraste({
      ...axa,
      modalidad: { ...axa.modalidad, coincide: false },
      zonas: { ...axa.zonas, coinciden: 1 },
      posiciones: { cesvi: 2, croquis_las_tiene: 1 },
    });
    expect(conteoCriterios(c)).toEqual({ coinciden: 1, difieren: 3, sinDato: 0 });
  });

  it("la cifra: 63.90 de Croquis contra 63.15 de CESVI, 0.75 km/h y 1.2 %", () => {
    const f = cifraContraste(axa)!;
    expect(f.croquis.toFixed(2)).toBe("63.90");
    expect(f.cesvi.toFixed(2)).toBe("63.15");
    expect(f.difKmh.toFixed(2)).toBe("0.75");
    expect(f.difPct.toFixed(1)).toBe("1.2");
  });

  it("sin una velocidad que Croquis calcule no hay cifra (no se inventa)", () => {
    const fila = { ...axa.velocidades[0]!, croquis_kmh: null, error_kmh: null, error_pct: null };
    expect(cifraContraste({ ...axa, velocidades: [fila] })).toBeNull();
    expect(cifraContraste({ ...axa, velocidades: [] })).toBeNull();
  });

  it("la regla deja los dos valores adentro, en su lugar y en orden", () => {
    const r = reglaContraste(63.9, 63.15);
    expect(r.marcas.map((m) => m.kmh)).toEqual([60, 62, 64, 66, 68]);
    expect(r.croquis).toBeCloseTo(((63.9 - 60) / 8) * 100, 1);
    expect(r.cesvi).toBeLessThan(r.croquis);
    // Con una diferencia grande el paso crece, sin perder ningún valor.
    const g = reglaContraste(20, 80);
    expect(g.croquis).toBeGreaterThan(0);
    expect(g.cesvi).toBeLessThan(100);
    expect(g.marcas.length).toBeLessThan(15);
  });
});
