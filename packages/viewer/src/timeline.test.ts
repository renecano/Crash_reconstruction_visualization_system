import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  advance,
  createTimeline,
  eventMarkers,
  formatTime,
  seek,
  setSpeed,
  step,
  togglePlay,
} from "./timeline";

describe("línea de tiempo", () => {
  it("avanza con el tiempo real por la velocidad y se detiene al final", () => {
    let s = togglePlay(createTimeline(-3, 2, 0.02));
    s = advance(s, 1);
    expect(s.t).toBeCloseTo(-2, 12);
    s = advance(setSpeed(s, 0.25), 2);
    expect(s.t).toBeCloseTo(-1.5, 12);
    s = advance(s, 100);
    expect(s.t).toBe(2);
    expect(s.playing).toBe(false);
    // Volver a reproducir desde el final reinicia.
    expect(togglePlay(s).t).toBe(-3);
  });

  it("con bucle vuelve al inicio sin salir del intervalo", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 50, noNaN: true }), (wall) => {
        const s = advance(createTimeline(-3, 2, 0.02, { playing: true, loop: true }), wall);
        expect(s.t).toBeGreaterThanOrEqual(-3);
        expect(s.t).toBeLessThan(2 + 1e-9);
      }),
      { numRuns: 200, seed: 7 },
    );
  });

  it("cuadro por cuadro cae en la rejilla del solver y pausa", () => {
    let s = createTimeline(-3, 2, 0.02, { t: 0.013, playing: true });
    s = step(s, 1);
    expect(s.playing).toBe(false);
    expect((s.t + 3) / 0.02).toBeCloseTo(Math.round((s.t + 3) / 0.02), 9);
    expect(step(createTimeline(-3, 2, 0.02, { t: 2 }), 5).t).toBe(2);
    expect(step(createTimeline(-3, 2, 0.02), -5).t).toBe(-3);
  });

  it("seek acota al intervalo y no reproduce si está en pausa", () => {
    const s = createTimeline(-1, 1, 0.02);
    expect(seek(s, 5).t).toBe(1);
    expect(seek(s, -5).t).toBe(-1);
    expect(advance(s, 1)).toBe(s);
    expect(() => createTimeline(1, 1, 0.02)).toThrow();
  });

  it("los marcadores de eventos llevan etiqueta en español y van ordenados", () => {
    const m = eventMarkers(
      [
        { id: "reposo-veh-a", tipo: "reposo", t: 1.2, actores: ["veh-a"] },
        { id: "ev-1", tipo: "impacto_vehiculo_vehiculo", t: 0, actores: ["veh-a", "veh-b"] },
        { id: "frenado-veh-a", tipo: "inicio_frenado", t: -0.6, actores: ["veh-a"] },
        { id: "fuera", tipo: "reposo", t: 99, actores: ["veh-b"] },
      ],
      -3,
      2,
      (id) => (id === "veh-a" ? "A" : undefined),
    );
    expect(m.map((x) => x.etiqueta)).toEqual(["Inicio de frenado (A)", "Impacto", "Reposo (A)"]);
  });

  it("numera los impactos de una carambola en orden", () => {
    const m = eventMarkers(
      [
        { id: "ev-2", tipo: "impacto_vehiculo_vehiculo", t: 0.29, actores: ["veh-b", "veh-c"] },
        { id: "ev-1", tipo: "impacto_vehiculo_vehiculo", t: 0, actores: ["veh-a", "veh-b"] },
        { id: "reposo-veh-c", tipo: "reposo", t: 1.8, actores: ["veh-c"] },
      ],
      -3,
      2,
    );
    expect(m.map((x) => [x.etiqueta, x.numero])).toEqual([
      ["Impacto 1", 1],
      ["Impacto 2", 2],
      ["Reposo", undefined],
    ]);
  });

  it("formatea el tiempo relativo al impacto", () => {
    expect(formatTime(-1.234)).toBe("−1.23 s");
    expect(formatTime(0.001)).toBe("0.00 s");
    expect(formatTime(0.5)).toBe("+0.50 s");
  });
});
