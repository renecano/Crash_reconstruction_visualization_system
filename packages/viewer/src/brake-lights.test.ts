import { loadResultado } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { BRAKE_DECEL_MS2, brakeOnsetTime, brakingAt, decelerationAt } from "./brake-lights";

/** Trayectoria recta: crucero a v0 y, desde tB, frenado constante a `a` hasta parar. */
function track(v0: number, tB: number, a: number, dt = 0.05, tEnd = 6) {
  const t: number[] = [];
  const x: number[] = [];
  const vx: number[] = [];
  let px = 0;
  for (let k = 0; k * dt <= tEnd; k++) {
    const tk = k * dt;
    const v = tk < tB ? v0 : Math.max(0, v0 - a * (tk - tB));
    t.push(tk);
    x.push(px);
    vx.push(v);
    px += v * dt;
  }
  const zeros = t.map(() => 0);
  return { t, x, y: zeros, vx, vy: zeros, rumbo: zeros, vel_angular: zeros, z: zeros };
}

describe("luces de freno (T1.4)", () => {
  it("encienden cuando la trayectoria desacelera antes del impacto y se apagan al parar", () => {
    const input = { track: track(15, 1, 6), tFirstImpact: null, bloqueadas: false };
    expect(brakingAt(input, 0.5)).toBe(false);
    expect(brakingAt(input, 1.5)).toBe(true);
    expect(decelerationAt(input.track, 1.5)).toBeCloseTo(6, 6);
    // Parado (15 m/s a 6 m/s² tarda 2.5 s): sin luces.
    expect(brakingAt(input, 4)).toBe(false);
    expect(brakeOnsetTime(input)).toBeCloseTo(1, 6);
  });

  it("el motor y el aire no encienden las luces", () => {
    const input = { track: track(15, 0, 0.4), tFirstImpact: null, bloqueadas: false };
    expect(0.4).toBeLessThan(BRAKE_DECEL_MS2);
    expect(brakeOnsetTime(input)).toBeNull();
  });

  it("después del impacto solo siguen si el conductor aplicó el freno, y mientras se mueve", () => {
    const tr = track(15, 1, 6);
    expect(brakingAt({ track: tr, tFirstImpact: 1.5, bloqueadas: false }, 2)).toBe(false);
    expect(brakingAt({ track: tr, tFirstImpact: 1.5, bloqueadas: true }, 2)).toBe(true);
    expect(brakingAt({ track: tr, tFirstImpact: 1.5, bloqueadas: true }, 4)).toBe(false);
  });

  it("en el alcance, encienden en el inicio de frenado que marca el solver", async () => {
    const r = await loadResultado("alcance");
    const ev = r.eventos.find((e) => e.tipo === "inicio_frenado");
    expect(ev).toBeDefined();
    if (!ev) return;
    const v = r.vehiculos.find((x) => x.id === ev.actores[0]);
    expect(v).toBeDefined();
    if (!v) return;
    const onset = brakeOnsetTime({ track: v.trayectoria, tFirstImpact: 0, bloqueadas: false });
    expect(onset).not.toBeNull();
    // La trayectoria va en pasos de dt: el primer tramo que frena empieza en el evento (± un paso).
    expect(Math.abs((onset ?? 0) - ev.t)).toBeLessThanOrEqual(r.dt + 1e-6);
  });
});
