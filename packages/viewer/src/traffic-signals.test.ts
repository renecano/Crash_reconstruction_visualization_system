import { describe, expect, it } from "vitest";
import { AMBER_S, FLASHES_PER_MIN, lampAt, pedLampAt, phaseChanges } from "./traffic-signals";

describe("semáforo en el tiempo", () => {
  it("sin tiempo en fase el color declarado se mantiene toda la escena", () => {
    for (const color of ["verde", "amarillo", "rojo"] as const) {
      for (const t of [-5, -0.1, 0, 2.5, 9]) {
        expect(lampAt({ color }, t)).toBe(color);
      }
      expect(phaseChanges({ color }, -10, 10)).toEqual([]);
    }
    expect(lampAt({ color: "apagado" }, 0)).toBeNull();
  });

  it("ámbar que lleva 1 s al impacto: venía de verde y pasa a rojo a los 2 s", () => {
    const p = { color: "amarillo" as const, tiempoEnFaseS: 1 };
    expect(lampAt(p, -1.5)).toBe("verde");
    expect(lampAt(p, -1)).toBe("amarillo");
    expect(lampAt(p, 0)).toBe("amarillo");
    expect(lampAt(p, AMBER_S - 1 - 1e-9)).toBe("amarillo");
    expect(lampAt(p, AMBER_S - 1)).toBe("rojo");
    expect(phaseChanges(p, -5, 5)).toEqual([-1, AMBER_S - 1]);
  });

  it("rojo que lleva 2 s: el ámbar fue de −5 a −2 s y antes era verde", () => {
    const p = { color: "rojo" as const, tiempoEnFaseS: 2 };
    expect(lampAt(p, -5.5)).toBe("verde");
    expect(lampAt(p, -5)).toBe("amarillo");
    expect(lampAt(p, -2.01)).toBe("amarillo");
    expect(lampAt(p, -2)).toBe("rojo");
    expect(lampAt(p, 3)).toBe("rojo");
    expect(phaseChanges(p, -3, 3)).toEqual([-2]);
  });

  it("el intermitente destella de 50 a 60 veces por minuto, mitad del ciclo encendido", () => {
    expect(FLASHES_PER_MIN).toBeGreaterThanOrEqual(50);
    expect(FLASHES_PER_MIN).toBeLessThanOrEqual(60);
    const period = 60 / FLASHES_PER_MIN;
    expect(lampAt({ color: "intermitente" }, 0)).toBe("amarillo");
    expect(lampAt({ color: "intermitente" }, period * 0.6)).toBeNull();
    expect(lampAt({ color: "intermitente" }, period * 1.2)).toBe("amarillo");
    let on = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) if (lampAt({ color: "intermitente" }, (i / n) * 60) !== null) on++;
    expect(on / n).toBeCloseTo(0.5, 2);
  });
});

describe("semáforo peatonal (contrato 1.3.0, ADR 0038)", () => {
  it("verde camina, rojo detenido y apagado nada, toda la escena", () => {
    for (const t of [-5, 0, 3]) {
      expect(pedLampAt({ color: "verde" }, t)).toBe("camina");
      expect(pedLampAt({ color: "rojo", tiempoEnFaseS: 2 }, t)).toBe("detenido");
      expect(pedLampAt({ color: "apagado" }, t)).toBeNull();
    }
  });

  it("intermitente (y amarillo, que no existe para peatones) es la figura que camina destellando", () => {
    const half = 60 / FLASHES_PER_MIN / 2;
    for (const color of ["intermitente", "amarillo"] as const) {
      expect(pedLampAt({ color }, 0)).toBe("camina");
      expect(pedLampAt({ color }, half + 0.01)).toBeNull();
      expect(pedLampAt({ color }, 2 * half + 0.01)).toBe("camina");
    }
  });
});
