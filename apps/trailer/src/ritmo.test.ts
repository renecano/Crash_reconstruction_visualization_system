import { describe, expect, it } from "vitest";
import { CUADROS, cuadroDe, enLaRejilla, entre, FPS, MOMENTOS, RITMO, tramo } from "./ritmo";

describe("el pulso del tráiler", () => {
  it("dura 28 s a 30 cuadros: entre los 22 y 30 s que pidió René", () => {
    expect(RITMO.duracion).toBeGreaterThanOrEqual(22);
    expect(RITMO.duracion).toBeLessThanOrEqual(30);
    expect(CUADROS).toBe(RITMO.duracion * FPS);
  });

  it("los tramos del storyboard van seguidos, sin huecos, y cubren todo", () => {
    let fin = 0;
    for (const t of RITMO.tramos) {
      expect(t.desde).toBe(fin);
      expect(t.hasta).toBeGreaterThan(t.desde);
      fin = t.hasta;
    }
    expect(fin).toBe(RITMO.duracion);
    expect(tramo("logo").hasta).toBe(CUADROS);
  });

  it("todo corte y todo golpe caen en la rejilla de pulsos y en un cuadro entero", () => {
    const instantes = [
      ...RITMO.tramos.flatMap((t) => [t.desde, t.hasta]),
      ...Object.values(MOMENTOS).flat(),
    ];
    for (const s of instantes) {
      // En un pulso, en medio pulso o en un sexto (los últimos latidos antes del contacto).
      expect(enLaRejilla(s, 2) || enLaRejilla(s, 6), `${s} s`).toBe(true);
      expect(Math.abs(s * FPS - cuadroDe(s))).toBeLessThan(1e-9);
    }
  });

  it("el silencio antes del golpe final dura medio segundo", () => {
    expect(MOMENTOS.golpe_final - MOMENTOS.corte_a_silencio).toBe(0.5);
    expect(tramo("logo").desde).toBe(cuadroDe(MOMENTOS.golpe_final));
  });

  it("entre() va de 0 a 1 sin salirse", () => {
    expect(entre(4, 5, 9)).toBe(0);
    expect(entre(7, 5, 9)).toBe(0.5);
    expect(entre(12, 5, 9)).toBe(1);
  });
});
