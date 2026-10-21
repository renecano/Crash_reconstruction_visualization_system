import { describe, expect, it } from "vitest";
import {
  avanzar,
  distanciaM,
  enMetros,
  rectanguloVehiculo,
  rumboCercano,
  rumboDeg,
  type LonLat,
} from "./geo";
import { moverPose, proponerVersiones, rumboHaciaElNorte } from "./versiones";

// Un punto cualquiera en Sinaloa: las pruebas solo usan distancias y rumbos relativos a él.
const P: LonLat = [-109.0, 25.8];

describe("geometría sobre el mapa", () => {
  it("avanzar y medir son inversos (al centímetro, a escala de un hecho de tránsito)", () => {
    for (const rumbo of [0, 37, 90, 181, 300]) {
      const q = avanzar(P, rumbo, 15.89);
      expect(distanciaM(P, q)).toBeCloseTo(15.89, 2);
      expect(rumboDeg(P, q)).toBeCloseTo(rumbo, 3);
    }
  });

  it("el rectángulo de un vehículo mide lo que debe y su frente apunta al rumbo", () => {
    const r = rectanguloVehiculo(P, 0, 5.34, 1.86);
    expect(r).toHaveLength(5);
    expect(distanciaM(r[0]!, r[3]!)).toBeCloseTo(5.34, 2); // lado izquierdo, de frente a atrás
    expect(distanciaM(r[0]!, r[1]!)).toBeCloseTo(1.86, 2); // frente
    expect(enMetros(r[0]!, P).norte).toBeCloseTo(2.67, 2);
  });

  it("toma el rumbo del tramo más cercano de la vía", () => {
    const via: LonLat[] = [avanzar(P, 180, 100), P, avanzar(P, 90, 100)];
    expect(rumboCercano(via, avanzar(P, 180, 50))!.rumbo).toBeCloseTo(0, 3);
    expect(rumboCercano(via, avanzar(P, 90, 40))!.rumbo).toBeCloseTo(90, 3);
  });

  it("de los dos sentidos de una vía toma el que va hacia el norte", () => {
    expect(rumboHaciaElNorte(190)).toBeCloseTo(10, 10);
    expect(rumboHaciaElNorte(10)).toBeCloseTo(10, 10);
    expect(rumboHaciaElNorte(-20)).toBeCloseTo(340, 10);
  });
});

describe("las dos versiones del caso", () => {
  const medidas = { A: { largo: 5.34, ancho: 1.86 }, B: { largo: 5.34, ancho: 1.86 } };
  const v = proponerVersiones({
    impacto: P,
    rumboVia: 0,
    medidas,
    distanciaRestos: 15.89,
    reversaM: 3,
  });

  it("en el impacto, la parte posterior de A y el frente de B quedan en el punto de impacto", () => {
    for (const version of [v.evidencia, v.declarada]) {
      const a = version.vehiculos.A.impacto;
      const b = version.vehiculos.B.impacto;
      expect(distanciaM(avanzar(a.punto, a.rumbo, -2.67), P)).toBeLessThan(0.01);
      expect(distanciaM(avanzar(b.punto, b.rumbo, 2.67), P)).toBeLessThan(0.01);
    }
  });

  it("evidencia: A termina a la separación de los restos del impacto, y los restos la cubren", () => {
    const a = v.evidencia.vehiculos.A;
    expect(distanciaM(a.impacto.punto, a.final.punto)).toBeCloseTo(15.89, 2);
    expect(a.final.fuente).toBe("dictamen");
    expect(distanciaM(v.evidencia.restos.inicio, v.evidencia.restos.fin)).toBeCloseTo(15.89, 2);
  });

  it("declarada: A retrocede los metros supuestos y no hay desplazamiento después del impacto", () => {
    const a = v.declarada.vehiculos.A;
    expect(distanciaM(a.inicial.punto, a.impacto.punto)).toBeCloseTo(3, 2);
    expect(distanciaM(a.impacto.punto, a.final.punto)).toBe(0);
    expect(distanciaM(v.declarada.restos.inicio, v.declarada.restos.fin)).toBe(0);
    expect(v.declarada.supuestos.join(" ")).toContain("3 m");
  });

  it("lo que mueve el perito queda con fuente «perito»", () => {
    const movida = moverPose(v.evidencia, "B", "final", { rumbo: 20 });
    expect(movida.vehiculos.B.final).toMatchObject({ rumbo: 20, fuente: "perito" });
    expect(movida.vehiculos.A.final.fuente).toBe("dictamen");
  });
});
