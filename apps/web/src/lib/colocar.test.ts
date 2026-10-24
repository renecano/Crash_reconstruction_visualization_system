import { describe, expect, it } from "vitest";
import { metrosPorPixel, rumboDeCalle, rumboDesdePuntero } from "./colocar";

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
