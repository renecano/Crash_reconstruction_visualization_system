import { describe, expect, it } from "vitest";
import {
  contornoClase,
  contornoVehiculo,
  direccionesCandidatas,
  metrosPorPixel,
  rumboDeCalle,
  rumboDesdePuntero,
  siluetaClase,
  subpasoLugar,
} from "./colocar";

describe("colocar en el mapa (comentario de René, punto 3)", () => {
  it("el anillo da el rumbo absoluto del cursor, 1:1, con imán de 15°", () => {
    // Arriba, derecha, abajo, izquierda (pantalla con y hacia abajo), mapa sin girar.
    expect(rumboDesdePuntero(0, -50, 0, false)).toBe(0);
    expect(rumboDesdePuntero(50, 0, 0, false)).toBe(90);
    expect(rumboDesdePuntero(0, 50, 0, false)).toBe(180);
    expect(rumboDesdePuntero(-50, 0, 0, false)).toBe(270);
    // 1:1: el ángulo no depende de la distancia del cursor al centro.
    expect(rumboDesdePuntero(10, -10, 0, false)).toBe(rumboDesdePuntero(100, -100, 0, false));
    // Imán: 40° va a 45°; con Shift queda libre.
    const dx = Math.sin((40 * Math.PI) / 180);
    const dy = -Math.cos((40 * Math.PI) / 180);
    expect(rumboDesdePuntero(dx, dy, 0, false)).toBe(45);
    expect(rumboDesdePuntero(dx, dy, 0, true)).toBe(40);
    // Con el mapa girado 30°, arriba en la pantalla es el rumbo 30°.
    expect(rumboDesdePuntero(0, -50, 30, false)).toBe(30);
  });

  it("los metros por pixel siguen al zoom y a la latitud", () => {
    expect(metrosPorPixel(0, 0)).toBeCloseTo(78271.517, 2);
    expect(metrosPorPixel(0, 1)).toBeCloseTo(metrosPorPixel(0, 0) / 2, 6);
    expect(metrosPorPixel(60, 0)).toBeCloseTo(metrosPorPixel(0, 0) / 2, 4);
  });

  it("al soltar, el vehículo toma el rumbo de la calle más cercana, en el sentido preferido", () => {
    // Una calle sur-norte a ~5 m al este de p (1e-5° de longitud ≈ 1.1 m en el ecuador).
    const calle: [number, number][] = [
      [0.00005, -0.001],
      [0.00005, 0.001],
    ];
    const p: [number, number] = [0, 0];
    expect(rumboDeCalle([calle], p, null)).toBe(0);
    expect(rumboDeCalle([calle], p, 170)).toBe(180);
    expect(rumboDeCalle([calle], p, 20)).toBe(0);
    // Lejos de toda calle, nada.
    expect(rumboDeCalle([calle], [0.01, 0], null)).toBeNull();
    // De dos calles, la más cercana.
    const esteOeste: [number, number][] = [
      [-0.001, 0.0001],
      [0.001, 0.0001],
    ];
    expect(rumboDeCalle([calle, esteOeste], p, null)).toBe(0);
    expect(rumboDeCalle([esteOeste], p, 100)).toBe(90);
  });
});

describe("colocación rehecha (René, B)", () => {
  // Una calle norte–sur y otra este–oeste que se cruzan en el punto.
  const p: [number, number] = [-99.65, 19.28];
  const ns: [number, number][] = [
    [-99.65, 19.279],
    [-99.65, 19.281],
  ];
  const eo: [number, number][] = [
    [-99.651, 19.28],
    [-99.649, 19.28],
  ];

  it("las flechas son los dos sentidos de cada calle cercana, con la propuesta marcada", () => {
    const d = direccionesCandidatas([ns, eo], p, 95);
    expect(d.map((x) => x.rumbo)).toEqual([0, 90, 180, 270]);
    expect(d.filter((x) => x.propuesta).map((x) => x.rumbo)).toEqual([90]);
  });

  it("sin calles cerca, solo la propuesta de Croquis", () => {
    expect(direccionesCandidatas([], p, 37)).toEqual([{ rumbo: 37, propuesta: true }]);
    expect(direccionesCandidatas([], p, null)).toEqual([]);
  });

  it("Paso 1 de 3: el impacto; 2: por dónde venía cada uno; 3: dónde quedó", () => {
    expect(subpasoLugar({ impactoColocado: false, sinConfirmar: [], sinFinal: ["V1"] })?.n).toBe(1);
    expect(
      subpasoLugar({ impactoColocado: true, sinConfirmar: ["V2"], sinFinal: ["V1", "V2"] }),
    ).toEqual({ n: 2, titulo: "¿Por dónde venía V2?", vehiculo: "V2" });
    expect(
      subpasoLugar({ impactoColocado: true, sinConfirmar: [], sinFinal: ["V1"] })?.titulo,
    ).toBe("¿Dónde quedó V1?");
    expect(subpasoLugar({ impactoColocado: true, sinConfirmar: [], sinFinal: [] })).toBeNull();
  });

  it("cada clase tiene su silueta dentro de la caja de 1 × 1", () => {
    for (const c of ["sedan_compacto", "pickup", "autobus", "motocicleta"]) {
      const nums = siluetaClase(c)
        .match(/-?\d+(\.\d+)?/g)!
        .map(Number);
      expect(nums.every((n) => Math.abs(n) <= 0.55)).toBe(true);
    }
    expect(siluetaClase("pickup")).not.toBe(siluetaClase("sedan_compacto"));
  });
});

describe("las huellas con la silueta de su clase (B)", () => {
  it("el contorno es cerrado y cabe en la caja", () => {
    for (const c of ["sedan_compacto", "pickup", "autobus", "motocicleta"]) {
      const k = contornoClase(c);
      expect(k[0]).toEqual(k[k.length - 1]);
      expect(k.every(([x, y]) => Math.abs(x) <= 0.55 && Math.abs(y) <= 0.55)).toBe(true);
    }
  });

  it("con rumbo 0 el frente queda al norte y el ancho de este a oeste", () => {
    const k = contornoVehiculo([-99.65, 19.28], 0, 4.5, 1.8, "sedan_compacto");
    const lats = k.map((p) => p[1]);
    const lons = k.map((p) => p[0]);
    // ~4.5 m de norte a sur y ~1.8 m de este a oeste (1° de latitud ≈ 111 km).
    expect((Math.max(...lats) - Math.min(...lats)) * 111_000).toBeGreaterThan(4.4);
    expect((Math.max(...lats) - Math.min(...lats)) * 111_000).toBeLessThan(4.9);
    const mPorGradoLon = 111_000 * Math.cos((19.28 * Math.PI) / 180);
    expect((Math.max(...lons) - Math.min(...lons)) * mPorGradoLon).toBeCloseTo(1.8, 1);
  });
});
