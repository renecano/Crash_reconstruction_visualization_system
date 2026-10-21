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
import {
  FASES,
  giroEntreVias,
  moverPose,
  proponerVersiones,
  rumboHaciaElNorte,
  trasladarVersion,
} from "./versiones";

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

  it("B llega desde dos largos atrás del impacto (supuesto para verlo llegar)", () => {
    for (const version of [v.evidencia, v.declarada]) {
      const b = version.vehiculos.B;
      expect(distanciaM(b.inicial.punto, b.impacto.punto)).toBeCloseTo(2 * 5.34, 2);
      expect(b.inicial.fuente).toBe("croquis");
    }
  });

  it("lo que mueve el perito queda con fuente «perito»", () => {
    const movida = moverPose(v.evidencia, "B", "final", { rumbo: 20 });
    expect(movida.vehiculos.B.final).toMatchObject({ rumbo: 20, fuente: "perito" });
    expect(movida.vehiculos.A.final.fuente).toBe("dictamen");
  });
});

describe("mover el punto de impacto (ADR 0055)", () => {
  const P: LonLat = [-109.0354, 25.9738];
  const medidas = { A: { largo: 5.34, ancho: 1.86 }, B: { largo: 5.34, ancho: 1.86 } };
  const v = proponerVersiones({
    impacto: P,
    rumboVia: 30,
    rumboDeclarada: 30,
    medidas,
    distanciaRestos: 15.89,
    reversaM: 3,
  }).evidencia;

  it("las posiciones se mueven con el punto: mismas distancias al impacto y entre sí", () => {
    const nuevo = avanzar(P, 120, 250);
    const m = trasladarVersion(v, nuevo, 25);
    expect(distanciaM(m.impacto.punto, nuevo)).toBeLessThan(1e-6);
    for (const l of ["A", "B"] as const) {
      for (const f of FASES) {
        expect(distanciaM(m.vehiculos[l][f].punto, nuevo)).toBeCloseTo(
          distanciaM(v.vehiculos[l][f].punto, P),
          3,
        );
        expect(m.vehiculos[l][f].rumbo).toBeCloseTo((v.vehiculos[l][f].rumbo + 25) % 360, 6);
      }
    }
    expect(distanciaM(m.restos.inicio, m.restos.fin)).toBeCloseTo(15.89, 3);
    expect(rumboDeg(m.restos.inicio, m.restos.fin)).toBeCloseTo(55, 1);
  });

  it("sin giro, solo se trasladan", () => {
    const m = trasladarVersion(v, avanzar(P, 0, 10));
    expect(rumboDeg(m.vehiculos.A.impacto.punto, m.vehiculos.A.final.punto)).toBeCloseTo(30, 1);
  });

  it("el giro entre dos vías es el más chico y no voltea el sentido", () => {
    expect(giroEntreVias(10, 40)).toBeCloseTo(30);
    expect(giroEntreVias(10, 190)).toBeCloseTo(0);
    expect(giroEntreVias(350, 20)).toBeCloseTo(30);
    expect(giroEntreVias(0, 100)).toBeCloseTo(-80);
  });

  it("la versión declarada puede ir en otro sentido que la de la evidencia", () => {
    const vs = proponerVersiones({
      impacto: P,
      rumboVia: 0,
      rumboDeclarada: 180,
      medidas,
      distanciaRestos: 15.89,
      reversaM: 3,
    });
    expect(vs.declarada.vehiculos.A.impacto.rumbo).toBe(180);
    expect(vs.evidencia.vehiculos.A.impacto.rumbo).toBe(0);
  });
});
