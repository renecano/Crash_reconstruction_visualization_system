import { describe, expect, it } from "vitest";
import {
  cantidadMovimientoColineal,
  cantidadMovimientoPlano,
  compararConUmbral,
  distanciaDeFrenado,
  distanciaPorEnergia,
  distanciaReaccion,
  energiaCinetica,
  frenadoConArrastre,
  frenadoHuellas,
  friccionEquivalente,
  radioCurva,
  tiempoCaida,
  tiroParabolico,
  trabajoFriccion,
  velocidadComun,
  velocidadCriticaCurva,
  velocidadCriticaCurvaCesvi,
  velocidadPorEnergia,
  velocidadPorEnergias,
  velocidadVolcadura,
} from "./calculos";
import { ebs, velocidadDesplazamiento } from "./metodo";
import { rigidezPorVehiculo } from "./rigidez";
import { pruebasDeChoqueCitadas, umbralesBolsasDeAire } from "./referencias";

/**
 * Cada caso es un cálculo impreso en un dictamen de CESVI de la partición de desarrollo
 * (`data/cesvi/calculos/fichas.json`, ficha `id#n`), con sus valores tal como están impresos. La
 * tolerancia es la de E-C1: 0.5 % del valor impreso.
 */
const cerca = (calculado: number, impreso: number) =>
  expect(Math.abs(calculado - impreso) / Math.abs(impreso)).toBeLessThanOrEqual(0.005);

describe("cálculos de los dictámenes de CESVI (C1)", () => {
  it("frenado por huellas: √(2·μ·g·d) (cesvi-03e36e3e67#2)", () => {
    cerca(frenadoHuellas(0.7, 9.8, 2.53).kmh, 21.22);
    // Con velocidad al final de la huella, V² = Vf² + 2·μ·g·d.
    const v = frenadoHuellas(0.7, 9.8, 2.53, 3);
    expect(v.ms ** 2).toBeCloseTo(9 + 2 * 0.7 * 9.8 * 2.53, 9);
  });

  it("derrape con fricción equivalente μ' = μ·Σ sen θ/n (cesvi-f489cf7716#1)", () => {
    const mu = friccionEquivalente(0.7, 6.164, 10);
    expect(mu).toBeCloseTo(0.43148, 5);
    cerca(frenadoHuellas(mu, 9.81, 38).kmh, 64.4);
  });

  it("desplazamiento √(2·a·g·D) (cesvi-4dcc3ceaf6#3)", () => {
    cerca(velocidadDesplazamiento(0.9, 9.8, 15.89).kmh, 60.27);
  });

  it("EBS √(2·E/m) (cesvi-1133bc17f5#2)", () => {
    cerca(ebs(42813.45, 1200).kmh, 30.41);
  });

  it("radio por cuerda y flecha, y velocidad de vuelco (cesvi-77a5e61e03#1 y #2)", () => {
    const R = radioCurva(48.3, 3.46);
    cerca(R, 86.01);
    cerca(velocidadVolcadura(9.81, 1.003, 86.01, 0.974).kmh, 106.09);
  });

  it("velocidad crítica en curva con la constante 11.27 de CESVI (cesvi-f0e5fe25bf#2)", () => {
    const e = Math.tan((6 * Math.PI) / 180);
    cerca(velocidadCriticaCurvaCesvi(0.7, 9.8, 59.7, e).kmh, 78.1);
    // 11.27 = 3.6·√9.8: la forma de CESVI es √(g·R·(μ + e)).
    expect(3.6 * Math.sqrt(9.8)).toBeCloseTo(11.27, 2);
    // La forma completa tiene el denominador 1 − μ·e y da más; sin peralte coinciden.
    expect(velocidadCriticaCurva(0.7, 9.8, 59.7, e).kmh).toBeGreaterThan(78.1);
    expect(velocidadCriticaCurva(0.7, 9.8, 59.7).kmh).toBeCloseTo(
      velocidadCriticaCurvaCesvi(0.7, 9.8, 59.7).kmh,
      9,
    );
  });

  it("tiro parabólico y tiempo de caída (cesvi-31bfdf3ac3#1, cesvi-2881a624cf#1)", () => {
    cerca(tiroParabolico(5, 2.5, 9.8).kmh, 25.2);
    cerca(tiempoCaida(7, 9.81), 1.19);
  });

  it("trabajo de la fricción y velocidad por energías (cesvi-abd8e947a8#2 y #3)", () => {
    cerca(trabajoFriccion(0.8, 1021, 9.81, 48), 384614.78);
    cerca(velocidadPorEnergias([419776.31, 384614.78], 1021).kmh, 143);
  });

  it("velocidad por energía cinética (cesvi-9916453fee#2) y energía cinética (cesvi-73aef4cf09#1)", () => {
    cerca(velocidadPorEnergia(153820.8, 1400).kmh, 53.35);
    cerca(energiaCinetica(8000, 10 / 3.6), 30913);
  });

  it("distancia de reacción D = V·(tr + ta) (cesvi-89f891c2e0#2)", () => {
    cerca(distanciaReaccion(10 / 3.6, 0.75, 1.2), 5.4);
  });

  it("distancia tras un impacto colineal y por energía disipada (cesvi-380a1f4ce4#1, cesvi-03e36e3e67#1)", () => {
    const v = velocidadComun(9197, 30.55, 16782.9177, 0);
    cerca(distanciaDeFrenado(v.ms, 0.6, 9.8), 9.945);
    cerca(distanciaPorEnergia(energiaCinetica(1145, 8.3), 0.7, 2276, 9.8), 2.53);
  });

  it("frenado con arrastre: solo frena parte de la masa", () => {
    // Si frena toda la masa es el frenado normal; si frena la mitad, V² es la mitad.
    expect(frenadoConArrastre(0.8, 9.81, 35, 1000, 1000).ms).toBeCloseTo(
      frenadoHuellas(0.8, 9.81, 35).ms,
      12,
    );
    expect(frenadoConArrastre(0.8, 9.81, 35, 500, 1000).ms ** 2).toBeCloseTo(
      frenadoHuellas(0.8, 9.81, 35).ms ** 2 / 2,
      9,
    );
  });

  it("cantidad de movimiento: colineal y en el plano conservan el momento", () => {
    const v1 = cantidadMovimientoColineal(1500, 1000, 5, 12);
    expect(1500 * v1.ms + 1000 * 5).toBeCloseTo(2500 * 12, 9);
    // En el plano: salidas generadas con entradas conocidas, y el despeje las recupera.
    const [a, b] = cantidadMovimientoPlano(
      1500,
      1000,
      0,
      90,
      { v: 10, angulo: 30 },
      { v: 8, angulo: 60 },
    );
    const px = 1500 * 10 * Math.cos(Math.PI / 6) + 1000 * 8 * Math.cos(Math.PI / 3);
    const py = 1500 * 10 * Math.sin(Math.PI / 6) + 1000 * 8 * Math.sin(Math.PI / 3);
    expect(1500 * a.ms).toBeCloseTo(px, 6);
    expect(1000 * b.ms).toBeCloseTo(py, 6);
    expect(() =>
      cantidadMovimientoPlano(1, 1, 0, 180, { v: 1, angulo: 0 }, { v: 1, angulo: 0 }),
    ).toThrow(/paralelas/);
    // Perpendicular: el momento común es la hipotenusa.
    expect(velocidadComun(3, 4, 4, 3, true).ms).toBeCloseTo(Math.hypot(12, 12) / 7, 12);
  });

  it("compara con el umbral que cita el dictamen (bolsas de aire a 25 km/h, cesvi-1133bc17f5#3)", () => {
    const c = compararConUmbral(30.41, 25);
    expect(c.supera).toBe(true);
    expect(c.diferencia).toBeCloseTo(5.41, 9);
    expect(c.diferenciaPct).toBeCloseTo(21.64, 2);
  });

  it("rechaza datos imposibles en lugar de inventar un resultado", () => {
    expect(() => frenadoHuellas(0, 9.81, 10)).toThrow();
    expect(() => radioCurva(10, 0)).toThrow();
    expect(() => velocidadCriticaCurva(0.9, 9.81, 50, 1.2)).toThrow(/no hay velocidad crítica/);
    expect(() => compararConUmbral(10, 0)).toThrow();
  });
});

describe("rigidez por vehículo", () => {
  it("toma la del perito, luego la del dictamen, luego la tabla de CESVI y al final E2", () => {
    const base = { clase: "sedan", zona: "frontal" };
    const dictamen = { A: 55405, B: 385336, cita: "A = 55.405 kN/m" };
    const tabla = { A: 50000, B: 300000, referencia: "tabla de prueba" };
    expect(rigidezPorVehiculo({ ...base, perito: { A: 1, B: 2 }, dictamen }).fuente).toBe("perito");
    expect(rigidezPorVehiculo({ ...base, dictamen, tablaCesvi: tabla })).toMatchObject({
      fuente: "dictamen",
      cita: "A = 55.405 kN/m",
    });
    expect(rigidezPorVehiculo({ ...base, tablaCesvi: tabla }).fuente).toBe("tabla_cesvi");
    const e2 = rigidezPorVehiculo(base);
    expect(["nhtsa_e2", "supuesto"]).toContain(e2.fuente);
    expect(e2.nota).toMatch(/no es un valor de CESVI|supuesto/);
  });

  it("ignora una rigidez sin B positiva y sigue con la siguiente fuente", () => {
    expect(
      rigidezPorVehiculo({ clase: "sedan", zona: "frontal", perito: { A: 1, B: 0 } }).fuente,
    ).not.toBe("perito");
  });
});

describe("referencias citadas en los dictámenes", () => {
  it("el umbral de bolsas de aire más citado es 25 km/h, y cada referencia trae quién la cita", () => {
    const [primero] = umbralesBolsasDeAire();
    expect(primero!.kmh).toBe(25);
    for (const r of [...umbralesBolsasDeAire(), ...pruebasDeChoqueCitadas()]) {
      expect(r.dictamenes.length).toBeGreaterThan(0);
      for (const id of r.dictamenes) expect(id).toMatch(/^cesvi-[0-9a-f]{10}$/);
    }
  });
});
