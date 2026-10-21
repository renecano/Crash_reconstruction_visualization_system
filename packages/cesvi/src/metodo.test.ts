import { crushEnergy, Stiffness } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import { caso } from "./caso";
import { formulaDesplazamiento, formulaEbs, formulaMcHenry } from "./formulas";
import { compararVelocidades, ebs, mcHenry, velocidadDesplazamiento } from "./metodo";
import { reproducir } from "./reproduccion";
import { segundaOpinion } from "./segunda-opinion";

const c = caso("A2010930");
const d = c.calculos.deformacion_B;
const medicion = { L: d.L_m.valor, A: d.A.valor, B: d.B.valor, C: d.C_m.map((x) => x.valor) };
const masaT = c.vehiculos.B.masa_kg!.valor / 1000;

describe("McHenry (forma de libro)", () => {
  it("con los datos impresos del dictamen A2010930 da 225.454, no 220.190 (ADR 0048)", () => {
    expect(mcHenry(medicion).energia).toBeCloseTo(225.454, 3);
  });

  it("2, 4 y 6 medidas son la integral por tramos del solver (crushEnergy)", () => {
    const k = new Stiffness(55.405, 385.336);
    for (const C of [
      [0.5, 0.3],
      [0.96, 0.86, 0.52, 0.2],
      [0.1, 0.4, 0.6, 0.55, 0.3, 0.05],
    ]) {
      expect(mcHenry({ L: 1.689, A: 55.405, B: 385.336, C }).energia).toBeCloseTo(
        crushEnergy(C, 1.689, k),
        9,
      );
    }
  });

  it("la de 6 medidas cuenta los extremos una vez y las interiores dos (sin las erratas impresas)", () => {
    const C = [1, 1, 1, 1, 1, 1];
    const r = mcHenry({ L: 5, A: 0, B: 6, C });
    // C1 + 2C2 + 2C3 + 2C4 + 2C5 + C6 = 10; cuadrados 10 y productos vecinos 5.
    expect(r.sumaLineal).toBe(10);
    expect(r.sumaCuadratica).toBe(15);
    // Perfil uniforme: E = L·(A·C + B·C²/2 + A²/2B) = 5·3 = 15.
    expect(r.energia).toBeCloseTo(15, 12);
  });

  it("rechaza un número de medidas que el método no usa", () => {
    expect(() => mcHenry({ ...medicion, C: [0.5, 0.4, 0.3] })).toThrow(/2, 4 o 6/);
  });
});

describe("EBS y desplazamiento con los números del dictamen", () => {
  it("partiendo de la energía del reporte: 63.15 km/h exacto; en m/s el reporte trunca (17.54209 → 17.5420)", () => {
    const v = ebs(d.reporte.energia.valor, masaT);
    expect(v.ms).toBeCloseTo(17.542093, 6);
    expect(Math.trunc(v.ms * 1e4) / 1e4).toBe(17.542);
    expect(v.kmh.toFixed(2)).toBe("63.15");
  });

  it("con los datos impresos: 63.90 km/h (+1.2 %)", () => {
    const v = ebs(mcHenry(medicion).energia, masaT);
    expect(v.kmh.toFixed(2)).toBe("63.90");
    expect(((v.kmh - 63.15) / 63.15) * 100).toBeCloseTo(1.19, 2);
  });

  it("velocidad por desplazamiento: 16.74 m/s y 60.27 km/h, exactos", () => {
    const z = c.calculos.desplazamiento;
    const v = velocidadDesplazamiento(z.a.valor, z.g_ms2.valor, z.D_m.valor);
    expect(v.ms.toFixed(2)).toBe("16.74");
    expect(v.kmh.toFixed(2)).toBe("60.27");
  });

  it("la diferencia entre 63.15 y 60.27 km/h es significativa solo si el umbral es menor", () => {
    const r = compararVelocidades(63.15, 60.27, 10);
    expect(r.diferenciaKmh).toBeCloseTo(2.88, 10);
    expect(r.diferenciaPct).toBeCloseTo(4.56, 2);
    expect(r.significativa).toBe(false);
    expect(compararVelocidades(63.15, 60.27, 4).significativa).toBe(true);
  });
});

describe("Reproducción del dictamen", () => {
  const { filas } = reproducir(c);
  const f = (clave: string) => filas.find((x) => x.clave === clave)!;

  it("coinciden con el reporte la EBS desde su energía y la velocidad por desplazamiento", () => {
    for (const clave of ["ebs_kmh_reporte", "v3_ms", "v3_kmh"]) {
      expect(f(clave).coincide, clave).toBe("redondeo");
    }
    expect(f("ebs_ms_reporte").coincide).toBe("truncamiento");
  });

  it("la energía y la EBS con los datos impresos difieren, con su porcentaje", () => {
    expect(f("energia").coincide).toBeNull();
    expect(f("energia").diferenciaPct).toBeCloseTo(2.39, 2);
    expect(f("ebs_kmh_datos").coincide).toBeNull();
    expect(f("ebs_kmh_datos").diferenciaPct).toBeCloseTo(1.19, 2);
  });
});

describe("Fórmulas sustituidas", () => {
  it("la de 4 medidas se escribe como en el dictamen", () => {
    const p = formulaMcHenry(medicion, "kJ");
    expect(p.general).toBe(
      "E = L/3 · [ A/2 · (C1 + 2C2 + 2C3 + C4) + B/6 · (C1² + 2C2² + 2C3² + C4² + C1·C2 + C2·C3 + C3·C4) + 3A²/2B ]",
    );
    expect(p.sustituida).toContain("55.405/2 · (0.96 + 2·0.86 + 2·0.52 + 0.2)");
    expect(p.resultado).toBe("E = 225.454 kJ");
  });

  it("EBS y desplazamiento", () => {
    expect(formulaEbs(220.1900228, 1.431083).resultado).toBe("EBS = 17.5421 m/s = 63.15 km/h");
    expect(formulaDesplazamiento(0.9, 9.8, 15.89).resultado).toBe("V3 = 16.74 m/s = 60.27 km/h");
  });
});

describe("Segunda opinión (rigidez de NHTSA)", () => {
  it("usa la clase pickup medida y da un intervalo que contiene su valor central", () => {
    const s = segundaOpinion(medicion.C, medicion.L, masaT * 1000, "pickup");
    expect(s.origen).toBe("nhtsa");
    expect(s.pruebas).toBeGreaterThan(0);
    expect(s.intervaloKmh).not.toBeNull();
    const [lo, hi] = s.intervaloKmh!;
    expect(lo).toBeLessThanOrEqual(s.kmh);
    expect(hi).toBeGreaterThanOrEqual(s.kmh);
  });
});
