import type { ComparacionDictamen } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  cifraContraste,
  conLetra,
  conSigno,
  lecturaFisica,
  pctConSigno,
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

  it("la cifra: 63.90 de Croquis contra 63.15 de CESVI, +0.75 km/h y +1.19 %", () => {
    const f = cifraContraste(axa)!;
    expect(f.croquis.toFixed(2)).toBe("63.90");
    expect(f.cesvi.toFixed(2)).toBe("63.15");
    expect(conSigno(f.difKmh)).toBe("+0.75");
    expect(pctConSigno(f.difPct)).toBe("+1.19 %");
    // Si Croquis queda abajo, el signo lo dice.
    expect(conSigno(-13.94)).toBe("−13.94");
    expect(pctConSigno(-22.07)).toBe("−22.07 %");
  });

  it("sin una velocidad que Croquis calcule no hay cifra (no se inventa)", () => {
    const fila = { ...axa.velocidades[0]!, croquis_kmh: null, error_kmh: null, error_pct: null };
    expect(cifraContraste({ ...axa, velocidades: [fila] })).toBeNull();
    expect(cifraContraste({ ...axa, velocidades: [] })).toBeNull();
  });

  const fila = (extra = {}) => ({
    vehiculo: "V2",
    metodo: "Deformación (EBS)",
    cesviQue: "x",
    cesviKmh: 63.15,
    croquisQue: "y",
    croquisKmh: 49.21,
    croquisRango: [47.32, 49.21] as [number, number],
    diferenciaKmh: -13.94,
    diferenciaPct: -22.07,
    porQue: "con la masa de V2 sola",
    ...extra,
  });

  it("la lectura física: la velocidad del solver con su rango contra la misma del reporte", () => {
    const contra = {
      filas: [fila({ vehiculo: "V1", metodo: "Restos (desplazamiento)" }), fila()],
      avisos: [],
    } as never;
    expect(lecturaFisica(contra, "V2")).toEqual({
      vehiculo: "V2",
      croquis: 49.21,
      rango: [47.32, 49.21],
      cesvi: 63.15,
      difKmh: -13.94,
      difPct: -22.07,
      porQue: "con la masa de V2 sola",
    });
    // Los restos son otro método: sin una fila por deformación no hay lectura.
    const soloRestos = { filas: [fila({ metodo: "Restos (desplazamiento)" })], avisos: [] };
    expect(lecturaFisica(soloRestos as never, "V2")).toBeNull();
    expect(lecturaFisica(null, "V2")).toBeNull();
    // Si la evidencia no la fija, se dice: no se inventa una cifra.
    const sin = { filas: [fila({ croquisKmh: null, diferenciaKmh: null })], avisos: [] };
    expect(lecturaFisica(sin as never, "V2")!.croquis).toBeNull();
    expect(conLetra("con la masa de V2 sola; V20 no", "V2", "B")).toBe(
      "con la masa de B sola; V20 no",
    );
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
    // También abarca el rango que se le pide.
    const r2 = reglaContraste(49.21, 63.15, [30, 49.21]);
    expect(r2.pos(30)).toBeGreaterThanOrEqual(0);
    expect(r2.pos(30)).toBeLessThan(r2.croquis);
  });
});
