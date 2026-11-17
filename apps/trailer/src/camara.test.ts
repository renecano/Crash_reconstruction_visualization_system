import { describe, expect, it } from "vitest";
import { mezclaCamaras, proyector, type Camara } from "./camara";

const PANTALLA = { ancho: 1920, alto: 1080 };
const cenital: Camara = {
  x: 10,
  y: 20,
  dist: 50,
  inclinacion: Math.PI / 2,
  giro: Math.PI / 2,
  focal: 1,
};

describe("la cámara sobre la hoja", () => {
  it("en cenital, el centro va al centro, el norte arriba y el este a la derecha, a escala", () => {
    const p = proyector(cenital, PANTALLA);
    const centro = p.punto(10, 20)!;
    expect(centro.x).toBeCloseTo(960);
    expect(centro.y).toBeCloseTo(540);
    // 1080 px de focal a 50 m: 21.6 px por metro.
    expect(p.pxPorMetro(centro.prof)).toBeCloseTo(21.6);
    const norte = p.punto(10, 30)!;
    expect(norte.x).toBeCloseTo(960);
    expect(norte.y).toBeCloseTo(540 - 216);
    const este = p.punto(20, 20)!;
    expect(este.x).toBeCloseTo(960 + 216);
    expect(este.y).toBeCloseTo(540);
    expect(p.horizonte).toBeNull();
  });

  it("inclinada, lo de adelante sube en la pantalla y se achica; el horizonte queda arriba", () => {
    const p = proyector({ ...cenital, inclinacion: Math.PI / 6 }, PANTALLA);
    const cerca = p.punto(10, 20)!;
    const lejos = p.punto(10, 120)!;
    expect(cerca.y).toBeCloseTo(540);
    expect(lejos.y).toBeLessThan(cerca.y);
    expect(lejos.prof).toBeGreaterThan(cerca.prof);
    expect(p.pxPorMetro(lejos.prof)).toBeLessThan(p.pxPorMetro(cerca.prof));
    expect(p.horizonte).not.toBeNull();
    expect(p.horizonte!).toBeLessThan(lejos.y);
    // Algo levantado del piso se ve más arriba que su pie.
    expect(p.punto(10, 20, 2)!.y).toBeLessThan(cerca.y);
  });

  it("recorta lo que queda detrás de la cámara", () => {
    const p = proyector({ ...cenital, inclinacion: 0.2, dist: 10 }, PANTALLA);
    // La cámara mira al norte desde el sur del centro: un punto muy al sur queda detrás.
    expect(p.punto(10, -500)).toBeNull();
    const s = p.segmento([10, -500], [10, 60]);
    expect(s).not.toBeNull();
    expect(Number.isFinite(s![0].x) && Number.isFinite(s![0].y)).toBe(true);
    expect(p.segmento([10, -500], [10, -400])).toBeNull();
  });

  it("mezcla dos cámaras por el camino corto del giro y en logaritmo la distancia", () => {
    const a: Camara = { ...cenital, giro: 0.1, dist: 10 };
    const b: Camara = { ...cenital, giro: Math.PI * 2 - 0.1, dist: 1000 };
    const m = mezclaCamaras(a, b, 0.5);
    expect(m.giro).toBeCloseTo(0);
    expect(m.dist).toBeCloseTo(100);
    expect(mezclaCamaras(a, b, 0).dist).toBeCloseTo(a.dist);
    expect(mezclaCamaras(a, b, 1).inclinacion).toBe(b.inclinacion);
  });
});
