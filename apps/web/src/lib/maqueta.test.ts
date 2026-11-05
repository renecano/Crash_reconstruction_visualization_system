import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cajaDe,
  encuadre,
  estela,
  poseEn,
  type ResultadoMaqueta,
  tImpacto,
  tramosPorVelocidad,
} from "./maqueta";

const r = JSON.parse(
  readFileSync(
    join(__dirname, "../../../../packages/scene-schema/fixtures/resultados/alcance.json"),
    "utf8",
  ),
) as ResultadoMaqueta;

describe("la maqueta generada del resultado (Laboratorio §7)", () => {
  it("el impacto sale de los eventos del solver", () => {
    expect(tImpacto(r)).toBe(0);
    expect(tImpacto({ ...r, eventos: [] })).toBe(0);
  });

  it("la pose se interpola y se queda en los extremos", () => {
    const tr = r.vehiculos[0]!.trayectoria;
    expect(poseEn(tr, -100)).toEqual({ x: tr.x[0], y: tr.y[0], rumbo: tr.rumbo[0] });
    const medio = poseEn(tr, (tr.t[10]! + tr.t[11]!) / 2);
    expect(medio.x).toBeCloseTo((tr.x[10]! + tr.x[11]!) / 2, 9);
  });

  it("la estela va cada 0.4 s antes del impacto, más visible al acercarse; nada si no se movía", () => {
    const a = r.vehiculos.find((v) => v.rol === "A")!;
    const e = estela(a.trayectoria, r.t_inicio, tImpacto(r));
    expect(e.length).toBe(7);
    expect(e.at(-1)!.t).toBeCloseTo(-0.4, 9);
    expect(e[0]!.opacidad).toBeLessThan(e.at(-1)!.opacidad);
    const quieto = {
      ...a.trayectoria,
      x: a.trayectoria.x.map(() => 1),
      y: a.trayectoria.y.map(() => 2),
    };
    expect(estela(quieto, r.t_inicio, 0)).toEqual([]);
  });

  it("los tramos hasta el impacto llevan su fracción de rapidez entre 0 y 1", () => {
    const a = r.vehiculos.find((v) => v.rol === "A")!;
    const tramos = tramosPorVelocidad(a.trayectoria, 0);
    expect(tramos.length).toBeGreaterThan(10);
    expect(tramos.every((t) => t.f >= 0 && t.f <= 1)).toBe(true);
    expect(tramos.at(-1)!.x2).toBeLessThanOrEqual(
      a.trayectoria.x[a.trayectoria.t.findIndex((t) => t > 0)]!,
    );
  });

  it("la caja contiene las trayectorias con su margen", () => {
    const [x0, y0, x1, y1] = cajaDe(r, 6);
    for (const v of r.vehiculos)
      for (let i = 0; i < v.trayectoria.x.length; i++) {
        expect(v.trayectoria.x[i]!).toBeGreaterThanOrEqual(x0 + 6 - 1e-9);
        expect(v.trayectoria.y[i]!).toBeLessThanOrEqual(y1 - 6 + 1e-9);
      }
    expect(x1 - x0).toBeGreaterThan(12);
    expect(y1 - y0).toBeGreaterThan(12);
  });
});

describe("el encuadre de la maqueta", () => {
  it("rodea el impacto y el reposo con al menos 30 m por lado", () => {
    const [x0, y0, x1, y1] = encuadre(r);
    expect(x1 - x0).toBeGreaterThanOrEqual(30);
    expect(y1 - y0).toBeGreaterThanOrEqual(30);
    const pi = r.punto_impacto!;
    expect(pi.x).toBeGreaterThan(x0);
    expect(pi.x).toBeLessThan(x1);
    for (const v of r.vehiculos) {
      expect(v.pose_final!.x).toBeLessThan(x1);
      expect(v.pose_final!.x).toBeGreaterThan(x0);
    }
    // Es más chico que la caja de toda la aproximación (desde t_inicio).
    const [c0, , c1] = cajaDe(r, 8);
    expect(x1 - x0).toBeLessThan(c1 - c0);
  });
});
