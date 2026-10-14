import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { searleDistanceBand, searleThrow, throwKinematics } from "./pedestrian";

const here = dirname(fileURLToPath(import.meta.url));
const RESULTS = resolve(here, "../../scene-schema/fixtures/resultados");

interface Proj {
  velocidad_lanzamiento_kmh: number;
  distancia_m: number;
  banda_searle_m: [number, number];
  friccion_cuerpo: { valor: number; rango: [number, number] };
  angulo_lanzamiento_deg: number;
  altura_cg_m: number;
}

describe("paridad con el solver Python (proyecciones de las escenas canónicas)", () => {
  for (const name of ["peaton_cruce", "motociclista"]) {
    it(name, () => {
      const r = JSON.parse(readFileSync(resolve(RESULTS, `${name}.json`), "utf-8")) as {
        personas: { proyeccion?: Proj }[];
      };
      const projs = r.personas.flatMap((p) => (p.proyeccion ? [p.proyeccion] : []));
      expect(projs.length).toBe(1);
      for (const p of projs) {
        const v = p.velocidad_lanzamiento_kmh / 3.6;
        const d = searleThrow(v, p.friccion_cuerpo.valor, p.angulo_lanzamiento_deg, p.altura_cg_m);
        // Los resultados guardan 6 decimales: tolerancia relativa 1e-6 (E7).
        expect(d).toBeCloseTo(p.distancia_m, 4);
        const b = searleDistanceBand(
          v,
          p.friccion_cuerpo.rango[0],
          p.friccion_cuerpo.rango[1],
          p.altura_cg_m,
        );
        expect(b.dMin).toBeCloseTo(p.banda_searle_m[0], 4);
        expect(b.dMax).toBeCloseTo(p.banda_searle_m[1], 4);
      }
    });
  }
});

describe("propiedades", () => {
  it("toda distancia de la forma cerrada cae en su banda", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 25, noNaN: true }),
        fc.double({ min: 0.3, max: 0.8, noNaN: true }),
        fc.double({ min: 0, max: 0.3, noNaN: true }),
        fc.double({ min: 0, max: 1.2, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (v, lo, span, h, fm, fa) => {
          const hi = lo + span;
          const b = searleDistanceBand(v, lo, hi, h);
          const m = lo + fm * span;
          const th = fa * 2 * Math.atan(m);
          const d = (v * v * (Math.cos(th) + m * Math.sin(th)) ** 2) / (2 * m * 9.80665) + m * h;
          expect(d).toBeGreaterThanOrEqual(b.dMin - 1e-9 * Math.max(1, d));
          expect(d).toBeLessThanOrEqual(b.dMax + 1e-9 * Math.max(1, d));
        },
      ),
    );
  });

  it("sin altura el modelo completo coincide con la forma cerrada", () => {
    const k = throwKinematics(10, 20, 0, 0.6);
    const th = (20 * Math.PI) / 180;
    const closed = (100 * (Math.cos(th) + 0.6 * Math.sin(th)) ** 2) / (2 * 0.6 * 9.80665);
    expect(k.totalDistance).toBeCloseTo(closed, 9);
  });
});
