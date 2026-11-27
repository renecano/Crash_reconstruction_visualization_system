import { loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { evidenceFromSpec, invert, parameters, withMarks } from "./inversion";

type Json = Record<string, unknown>;

/**
 * La velocidad que midió un instrumento (cámara, GPS, tacógrafo) es una restricción dura (René,
 * 2026-11-27): la inversión no la ajusta y ajusta lo demás a ella. Paridad con
 * `solver/tests/test_velocidad_medida.py`.
 */
function conMedida(kmh: number): Json {
  const spec = structuredClone(loadFixture("lateral_interseccion")) as unknown as Json;
  const a = (spec.vehiculos as Json[])[0]!;
  a.velocidad_previa = {
    valor: kmh,
    unidad: "km/h",
    fuente: "usuario",
    confianza: 0.9,
    medida: true,
    nota: "Medida por la cámara.",
  };
  return spec;
}

describe("la velocidad medida", () => {
  it("no es una incógnita; las demás siguen libres", () => {
    const spec = conMedida(50);
    const ev = evidenceFromSpec(spec);
    const nombres = parameters(withMarks(spec as never, ev) as never, ev).map((p) => p.name);
    const vid = String(((spec.vehiculos as Json[])[0] as Json).id);
    expect(nombres).not.toContain(`velocidad:${vid}`);
    expect(nombres.some((n) => n.startsWith("velocidad:"))).toBe(true);
  });

  it("la inversión la respeta y ajusta lo demás", () => {
    const spec = conMedida(50);
    const res = invert(spec, { samples: 4 }) as unknown as {
      best: { values: Map<string, number> };
      estimates: { param: { name: string } }[];
    };
    const vid = String(((spec.vehiculos as Json[])[0] as Json).id);
    expect(res.best.values.has(`velocidad:${vid}`)).toBe(false);
    expect(res.estimates.some((e) => e.param.name === `velocidad:${vid}`)).toBe(false);
  }, 300_000);
});
