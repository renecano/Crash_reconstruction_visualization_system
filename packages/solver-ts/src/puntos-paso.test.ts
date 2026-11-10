/**
 * C1 (W3): los puntos de paso y el punto inicial del choque como evidencia de la inversión.
 * Paridad con la referencia Python: `fixtures/inversion/lateral_puntos_paso.json` es la colisión
 * lateral con dos puntos de paso con hora por vehículo y el punto inicial marcado por el perito;
 * su resultado lo escribe `croquis-solver reconstruct --all`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  closestOnPath,
  evidenceFromSpec,
  impactPointFromSpec,
  invert,
  parameters,
  positionAt,
  waypointsFromSpec,
} from "./inversion";
import { differences } from "./parity-diff";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(here, "../../scene-schema/fixtures");
type Json = Record<string, unknown>;
const leer = (ruta: string) => JSON.parse(readFileSync(resolve(FIXTURES, ruta), "utf8")) as Json;

describe("geometría de la trayectoria", () => {
  const xs = [0, 10, 10];
  const ys = [0, 0, 10];
  const ts = [0, 1, 2];

  it("el punto más cercano de la poligonal", () => {
    expect(closestOnPath(xs, ys, 4, 3)).toEqual([4, 0]);
    expect(closestOnPath(xs, ys, 12, 6)).toEqual([10, 6]);
    expect(closestOnPath(xs, ys, -5, -1)).toEqual([0, 0]);
  });

  it("la posición en un instante, y su extremo fuera del tramo", () => {
    expect(positionAt(ts, xs, ys, 0.5)).toEqual([5, 0]);
    expect(positionAt(ts, xs, ys, 1.5)).toEqual([10, 5]);
    expect(positionAt(ts, xs, ys, -3)).toEqual([0, 0]);
    expect(positionAt(ts, xs, ys, 9)).toEqual([10, 10]);
  });
});

describe("la evidencia de C1", () => {
  it("sin puntos de paso ni punto marcado, la evidencia de siempre no cambia", () => {
    for (const n of ["alcance", "lateral_interseccion", "poste"]) {
      const spec = leer(`${n}.json`);
      expect(waypointsFromSpec(spec)).toEqual([]);
      // El punto de impacto del relato guía la geometría, pero no es una medición.
      expect(impactPointFromSpec(spec)).toBeNull();
      const etiquetas = evidenceFromSpec(spec, 1).labels();
      expect(etiquetas.some((e) => e.startsWith("paso:") || e.startsWith("punto_inicial:"))).toBe(
        false,
      );
    }
  });

  it("lee los puntos por su orden, sin los supuestos, y con la precisión por omisión", () => {
    const spec = leer("lateral_interseccion.json");
    const a = (spec.vehiculos as Json[])[0]!;
    const perito = { fuente: "usuario", confianza: 0.9 };
    a.puntos_paso = [
      { id: "pp-2", orden: 2, posicion: { x: 3, y: 4 }, t_s: 1.5, procedencia: perito },
      { id: "pp-1", orden: 1, posicion: { x: 1, y: 2 }, precision_m: 0.8, procedencia: perito },
      {
        id: "pp-3",
        orden: 3,
        posicion: { x: 9, y: 9 },
        procedencia: { fuente: "supuesto", confianza: 0.5 },
      },
    ];
    const ev = evidenceFromSpec(spec, 1);
    expect(ev.waypoints.map((w) => w.id)).toEqual(["pp-1", "pp-2"]);
    expect(ev.waypoints[0]).toEqual({
      id: "pp-1",
      vehicle: a.id,
      x: 1,
      y: 2,
      sigma: 0.8,
      tS: null,
    });
    expect(ev.waypoints[1]!.sigma).toBe(1.0);
    expect(ev.waypoints[1]!.tS).toBe(1.5);
    expect(ev.empty()).toBe(false);
    expect(ev.labels().slice(-2)).toEqual(["paso:pp-1", "paso:pp-2"]);
    expect(ev.asAssumedData().waypoints).toHaveLength(2);
  });
});

describe("paridad con Python: lateral_puntos_paso", () => {
  const spec = leer("inversion/lateral_puntos_paso.json");
  const golden = leer("inversion/resultados/lateral_puntos_paso.json");
  const ev = evidenceFromSpec(spec);

  it("la misma evidencia, y los rumbos entran al ajuste", () => {
    expect(ev.labels()).toEqual(golden.evidencia);
    expect(ev.waypoints).toHaveLength(4);
    expect(ev.impactPoint).not.toBeNull();
    expect(parameters(spec, ev).some((p) => p.kind === "rumbo")).toBe(true);
  });

  it("la inversión coincide con la referencia y pasa por los puntos dentro de su incertidumbre", () => {
    const inv = invert(spec);
    const ref = golden.inversion as Json;
    expect(differences(ref, JSON.parse(JSON.stringify(inv.toDict())))).toEqual([]);
    const residuos = (inv.toDict() as { residuos: { nombre: string; sigma: number }[] }).residuos;
    const dePaso = residuos.filter((r) => r.nombre.startsWith("paso:"));
    expect(dePaso.length).toBeGreaterThanOrEqual(8);
    for (const r of dePaso) expect(Math.abs(r.sigma)).toBeLessThan(1.0);
  }, 900_000);
});
