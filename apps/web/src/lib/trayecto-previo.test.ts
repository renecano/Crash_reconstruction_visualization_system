import { describe, expect, it } from "vitest";
import {
  ACELERACION_LATERAL,
  FRENADO,
  perfilDelTrayecto,
  textoDelTrayecto,
  type Punto,
} from "./trayecto-previo";

describe("el trayecto previo ilustrativo (René, 2026-11-27)", () => {
  it("en línea recta va a la velocidad reconstruida y termina en el inicio de la reconstrucción", () => {
    const tr = perfilDelTrayecto(
      [
        [-1000, 0],
        [0, 0],
      ],
      15,
      -4,
    );
    expect(tr.distancia_m).toBeCloseTo(1000, 6);
    expect(tr.v.every((v) => Math.abs(v - 15) < 1e-9)).toBe(true);
    expect(tr.duracion_s).toBeCloseTo(1000 / 15, 6);
    expect(tr.t.at(-1)).toBe(-4);
    expect(tr.puntos.at(-1)).toEqual([0, 0]);
  });

  it("frena en una vuelta de 90° y nunca va más rápido que la reconstruida", () => {
    // Una calle al norte y vuelta a la derecha (al este) con un radio de ~10 m.
    const ruta: Punto[] = [[0, -300]];
    for (let a = 0; a <= 90; a += 10) {
      const r = (a * Math.PI) / 180;
      ruta.push([10 - 10 * Math.cos(r), 10 * Math.sin(r)]);
    }
    ruta.push([300, 10]);
    const vFin = 16.7; // 60 km/h
    const tr = perfilDelTrayecto(ruta, vFin, -3);
    const enVuelta = Math.sqrt(ACELERACION_LATERAL * 10);
    const minimo = Math.min(...tr.v);
    expect(minimo).toBeLessThanOrEqual(enVuelta * 1.15);
    expect(Math.max(...tr.v)).toBeLessThanOrEqual(vFin + 1e-9);
    expect(tr.v.at(-1)).toBe(vFin);
    // Frena a lo más 3.4 m/s² (con la tolerancia del paso de 5 m).
    for (let i = 1; i < tr.v.length; i++) {
      const d = Math.hypot(
        tr.puntos[i]![0] - tr.puntos[i - 1]![0],
        tr.puntos[i]![1] - tr.puntos[i - 1]![1],
      );
      expect(tr.v[i - 1]! ** 2 - tr.v[i]! ** 2).toBeLessThanOrEqual(2 * FRENADO * d + 1e-6);
    }
    // El tiempo siempre avanza.
    expect(tr.t.every((t, i) => i === 0 || t > tr.t[i - 1]!)).toBe(true);
  });

  it("dice la distancia y la duración", () => {
    expect(textoDelTrayecto({ distancia_m: 2140, duracion_s: 220 })).toBe("2.1 km · ~3 min 40 s");
    expect(textoDelTrayecto({ distancia_m: 480, duracion_s: 35 })).toBe("480 m · ~35 s");
  });
});
