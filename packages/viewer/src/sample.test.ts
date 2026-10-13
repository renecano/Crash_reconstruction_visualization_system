import { FIXTURE_NAMES, loadResultado } from "@croquis/scene-schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { wrapAngle } from "./coords";
import { bracket, phaseAt, samplePerson, sampleVehicle, type VehicleTrack } from "./sample";

const track = (
  t: number[],
  vals: (i: number) => number,
  yaw?: (i: number) => number,
): VehicleTrack => ({
  t,
  x: t.map((_, i) => vals(i)),
  y: t.map((_, i) => -vals(i)),
  rumbo: t.map((_, i) => (yaw ? yaw(i) : 0)),
  vx: t.map(() => 1),
  vy: t.map(() => 0),
  vel_angular: t.map(() => 0),
});

const gridArb = fc
  .array(fc.double({ min: -50, max: 50, noNaN: true }), { minLength: 2, maxLength: 40 })
  .map((xs) => ({ t: xs.map((_, i) => -1 + i * 0.02), x: xs }));

describe("muestreo de trayectorias", () => {
  it("en los tiempos de la rejilla devuelve exactamente las muestras del solver", () => {
    fc.assert(
      fc.property(gridArb, ({ t, x }) => {
        const tr = track(t, (i) => x[i] ?? 0);
        t.forEach((ti, i) => {
          expect(sampleVehicle(tr, ti).x).toBeCloseTo(x[i] ?? 0, 9);
        });
      }),
      { numRuns: 200, seed: 13 },
    );
  });

  it("entre muestras interpola dentro del intervalo y fuera mantiene el extremo", () => {
    fc.assert(
      fc.property(gridArb, fc.double({ min: 0, max: 1, noNaN: true }), ({ t, x }, u) => {
        const tr = track(t, (i) => x[i] ?? 0);
        const i = Math.floor(u * (t.length - 1));
        const j = Math.min(i + 1, t.length - 1);
        const tm = ((t[i] ?? 0) + (t[j] ?? 0)) / 2;
        const v = sampleVehicle(tr, tm).x;
        const lo = Math.min(x[i] ?? 0, x[j] ?? 0);
        const hi = Math.max(x[i] ?? 0, x[j] ?? 0);
        expect(v).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(v).toBeLessThanOrEqual(hi + 1e-9);
        expect(sampleVehicle(tr, -100).x).toBe(x[0]);
        expect(sampleVehicle(tr, 100).x).toBe(x.at(-1));
      }),
      { numRuns: 200, seed: 14 },
    );
  });

  it("el rumbo se interpola por el camino corto al cruzar ±π", () => {
    const tr = track(
      [0, 1],
      () => 0,
      (i) => (i === 0 ? Math.PI - 0.1 : -Math.PI + 0.1),
    );
    const mid = sampleVehicle(tr, 0.5).yaw;
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(1e-9);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
  });

  it("bracket encuentra el intervalo con búsqueda binaria", () => {
    const t = [0, 0.02, 0.04, 0.06];
    expect(bracket(t, 0.03)).toEqual({ i: 1, f: expect.closeTo(0.5, 9) as number });
    expect(bracket(t, -1)).toEqual({ i: 0, f: 0 });
    expect(bracket(t, 1)).toEqual({ i: 2, f: 1 });
    expect(() => bracket([], 0)).toThrow();
  });

  it("phaseAt devuelve la fase vigente", () => {
    const fases = [
      { fase: "caminando", t_inicio: -3, t_fin: 0 },
      { fase: "vuelo", t_inicio: 0, t_fin: 0.4 },
      { fase: "reposo", t_inicio: 1.5, t_fin: 3 },
    ];
    expect(phaseAt(fases, -5)?.fase).toBe("caminando");
    expect(phaseAt(fases, 0.1)?.fase).toBe("vuelo");
    expect(phaseAt(fases, 2)?.fase).toBe("reposo");
    expect(phaseAt([], 0)).toBeNull();
  });

  for (const name of FIXTURE_NAMES) {
    it(`${name}: en t = 0 cada vehículo está donde el solver lo dejó`, async () => {
      const r = await loadResultado(name);
      for (const v of r.vehiculos) {
        const i = v.trayectoria.t.indexOf(0);
        expect(i).toBeGreaterThanOrEqual(0);
        const p = sampleVehicle(v.trayectoria, 0);
        expect(p.x).toBeCloseTo(v.trayectoria.x[i] ?? NaN, 9);
        expect(p.y).toBeCloseTo(v.trayectoria.y[i] ?? NaN, 9);
      }
      for (const p of r.personas) {
        const s = samplePerson(p.trayectoria, 0);
        if (p.vehiculo_id) expect(s).toBeNull();
      }
    });
  }
});
