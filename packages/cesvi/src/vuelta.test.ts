import { describe, expect, it } from "vitest";
import { rectoTrasLaVuelta } from "./reconstruccion";
import { cruceDeLaVuelta } from "./vuelta";

/**
 * La vuelta en un cruce real (René, 2026-11-27): una avenida de dos cuerpos (y = ±6) y dos calles
 * que bajan del norte: una cruza la avenida (x = 0) y otra termina antes de llegar a ella (x = −10).
 * El camión baja al sur y da vuelta a la derecha (al poniente); el choque está en el cuerpo sur.
 */
const vias = [
  {
    tipo: "primary",
    nombre: "Avenida, cuerpo norte",
    puntos: [
      { x: 200, y: 6 },
      { x: -200, y: 6 },
    ],
  },
  {
    tipo: "primary",
    nombre: "Avenida, cuerpo sur",
    puntos: [
      { x: 200, y: -6 },
      { x: -200, y: -6 },
    ],
  },
  {
    tipo: "residential",
    nombre: "Calle que cruza",
    puntos: [
      { x: 0, y: 100 },
      { x: 0, y: -100 },
    ],
  },
  {
    tipo: "residential",
    nombre: "Calle cerrada",
    puntos: [
      { x: -10, y: 100 },
      { x: -10, y: 20 },
    ],
  },
];
const choque = { x: -15, y: -6 };
const llegada = -Math.PI / 2; // al sur
const salida = Math.PI; // al poniente

describe("la vuelta en un cruce real de la red vial", () => {
  it("es en la esquina donde la calle de llegada toca la calzada del choque", () => {
    const c = cruceDeLaVuelta(vias, choque, llegada, salida)!;
    expect(c.cruce.x).toBeCloseTo(0, 6);
    expect(c.cruce.y).toBeCloseTo(-6, 6);
    expect(c.distanciaM).toBeCloseTo(15, 6);
    expect(c.llegaPor).toBe("Calle que cruza");
  });

  it("la regla de antes se anclaba en la calle cerrada, donde no hay esquina", () => {
    const recto = rectoTrasLaVuelta(
      vias.map((v) => v.puntos),
      choque,
      llegada,
      salida,
    );
    // 5 m (la paralela más cercana), menos el radio: el arco salía de la calle cerrada.
    expect(recto).toBeLessThan(15 - 6);
  });

  it("sin una calle que llegue al choque en esa dirección, no inventa un cruce", () => {
    const sinCruce = vias.filter((v) => v.nombre !== "Calle que cruza");
    expect(cruceDeLaVuelta(sinCruce, choque, llegada, salida)).toBeNull();
  });
});
