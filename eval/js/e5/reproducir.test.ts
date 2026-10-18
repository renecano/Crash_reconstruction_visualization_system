import { buildVehicle } from "@croquis/viewer";
import { describe, expect, it } from "vitest";
import {
  area,
  dimensions,
  energyFromDeltaV,
  evaluate,
  measuredInCroquisOrder,
  predict,
  profileAt,
  profileWidth,
  type Caso,
} from "./reproducir";

function caso(p: Partial<Caso>): Caso {
  return {
    fuente: "ciss",
    id: "ciss:prueba:1:1",
    tipo: "frontal",
    lado: "F",
    clase: "sedan_mediano",
    masa_kg: 1500,
    largo_m: 4.7,
    ancho_m: 1.8,
    perfil_m: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
    ancho_dano_m: 1.6,
    centro_dano_m: 0,
    velocidad_kmh: null,
    dv_kmh: 30,
    zona: "D",
    c1_extremo: "izquierda",
    batalla_m: 2.75,
    pdof_deg: 0,
    obstaculo: "objeto_rigido",
    poste_diametro_m: null,
    otro_masa_kg: null,
    otro_velocidad_kmh: null,
    otro_clase: "",
    otro_plano: "",
    test: false,
    ...p,
  };
}

describe("energía desde el ΔV", () => {
  it("objeto rígido sin rebote: ½ m ΔV²", () => {
    expect(energyFromDeltaV(10, 1000, null, 0)).toBeCloseTo(50_000, 6);
  });
  it("dos vehículos iguales sin rebote: el ΔV es la mitad del de cierre", () => {
    // ΔV1 = 5 → cierre 10 m/s, μ = 500 kg → ½ μ v² = 25 kJ.
    expect(energyFromDeltaV(5, 1000, 1000, 0)).toBeCloseTo(25_000, 6);
  });
  it("con restitución, menos energía disipada para el mismo ΔV", () => {
    expect(energyFromDeltaV(10, 1000, null, 0.1)).toBeLessThan(50_000);
  });
});

describe("perfil en las estaciones", () => {
  const p = [0.1, 0.2, 0.3, 0.3, 0.2, 0.1];
  it("C1 en el extremo +u, C6 en el −u, lineal entre estaciones y cero fuera", () => {
    expect(profileAt(p, 0, 1, 0.5)).toBeCloseTo(0.1);
    expect(profileAt(p, 0, 1, -0.5)).toBeCloseTo(0.1);
    expect(profileAt(p, 0, 1, 0.4)).toBeCloseTo(0.15);
    expect(profileAt(p, 0, 1, 0)).toBeCloseTo(0.3);
    expect(profileAt(p, 0, 1, 0.6)).toBe(0);
  });
  it("ancho sobre el umbral y área por trapecios", () => {
    expect(profileWidth([0.3, 0.3, 0.3, 0.3, 0.3, 0.3], 1.5)).toBeCloseTo(1.5, 2);
    expect(profileWidth([0, 0.4, 0.8, 0.8, 0.4, 0], 1.5, 0.02)).toBeLessThan(1.5);
    expect(area([0.2, 0.2, 0.2, 0.2, 0.2, 0.2], 1.5)).toBeCloseTo(0.3);
  });
});

describe("orden de C1–C6", () => {
  const perfil = [1, 2, 3, 4, 5, 6];
  it("se respeta o se invierte según dónde empezó la medición", () => {
    expect(measuredInCroquisOrder(caso({ perfil_m: perfil, c1_extremo: "izquierda" }))).toEqual(
      perfil,
    );
    expect(measuredInCroquisOrder(caso({ perfil_m: perfil, c1_extremo: "derecha" }))).toEqual([
      6, 5, 4, 3, 2, 1,
    ]);
    expect(
      measuredInCroquisOrder(caso({ lado: "L", perfil_m: perfil, c1_extremo: "adelante" })),
    ).toEqual(perfil);
    expect(
      measuredInCroquisOrder(caso({ lado: "L", perfil_m: perfil, c1_extremo: "atras" })),
    ).toEqual([6, 5, 4, 3, 2, 1]);
    expect(measuredInCroquisOrder(caso({ perfil_m: perfil, c1_extremo: "" }))).toBeNull();
  });
});

describe("predicción de Croquis", () => {
  it("barrera rígida de frente: ½ m v² (1 − e²) en toda la cara, centrada", () => {
    const c = caso({
      fuente: "nhtsa",
      obstaculo: "barrera_rigida",
      velocidad_kmh: 56,
      dv_kmh: null,
    });
    const pred = predict(c);
    if (typeof pred === "string") throw new Error(pred);
    const v = 56 / 3.6;
    expect(pred.energiaJ).toBeCloseTo(0.5 * 1500 * v * v * (1 - 0.1 ** 2), 0);
    expect(pred.ancho).toBeCloseTo(1.8);
    expect(pred.centro).toBeCloseTo(0);
    expect(new Set(pred.perfil.map((x) => x.toFixed(9))).size).toBe(1); // uniforme
  });
  it("exclusiones: sin velocidad, sin otro vehículo, obstáculo desconocido", () => {
    expect(
      predict(caso({ fuente: "nhtsa", obstaculo: "barrera_rigida", velocidad_kmh: null })),
    ).toBe("sin_velocidad");
    expect(predict(caso({ obstaculo: "vehiculo" }))).toBe("sin_otro_vehiculo");
    expect(predict(caso({ obstaculo: "otro" }))).toBe("obstaculo_desconocido");
  });
});

describe("ida y vuelta: si lo medido es lo que predice Croquis, el error es mínimo", () => {
  it("frente (CISS, D desde el centro y + a la derecha)", () => {
    const base = caso({ zona: "Y" });
    const pred = predict(base);
    if (typeof pred === "string") throw new Error(pred);
    const r = evaluate({
      ...base,
      perfil_m: pred.perfil,
      ancho_dano_m: pred.ancho,
      centro_dano_m: -pred.centro,
    });
    if (typeof r === "string") throw new Error(r);
    expect(r.croquis.punto!).toBeLessThan(0.02);
    expect(r.croquis.maximo).toBeLessThan(0.02);
    // La forma de Croquis (zona Y) no es uniforme ni triangular: las líneas base se alejan más.
    expect(r.uniforme.punto!).toBeGreaterThan(r.croquis.punto!);
    expect(r.lineal.punto!).toBeGreaterThan(r.croquis.punto!);
  });

  it("costado (CISS, D desde la mitad de la batalla de la malla, + adelante)", () => {
    const base = caso({ lado: "L", zona: "P", c1_extremo: "adelante", obstaculo: "objeto_rigido" });
    const pred = predict(base);
    if (typeof pred === "string") throw new Error(pred);
    const g = buildVehicle(base.clase, dimensions(base)!);
    const xs: number[] = [];
    g.traverse((o) => {
      if (o.name.startsWith("wheel_")) xs.push(o.position.x);
    });
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    const r = evaluate({
      ...base,
      perfil_m: pred.perfil,
      ancho_dano_m: pred.ancho,
      centro_dano_m: pred.centro - mid,
    });
    if (typeof r === "string") throw new Error(r);
    expect(r.croquis.punto!).toBeLessThan(0.02);
  });

  it("NHTSA no reporta error por punto y se centra en lo predicho", () => {
    const c = caso({
      fuente: "nhtsa",
      obstaculo: "barrera_rigida",
      velocidad_kmh: 56,
      dv_kmh: null,
    });
    const r = evaluate(c);
    if (typeof r === "string") throw new Error(r);
    expect(r.croquis.punto).toBeNull();
    expect(r.croquis.ancho).toBeGreaterThanOrEqual(0);
  });
});
