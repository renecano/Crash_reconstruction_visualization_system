/**
 * Paridad de la ronda de preguntas con la referencia Python (`sampled=False`): mismas preguntas,
 * mismo orden, mismo texto y misma participación en la varianza, con el solver TS, el generador de
 * Python y la varianza exacta. Salidas doradas de `uv run croquis-extraction golden build`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyAnswers, ask, preguntaToDict, topic } from "./questions";

interface Case {
  clave: string;
  spec: Record<string, unknown>;
  texto: string | null;
  muestras: number;
  preguntas: Record<string, unknown>[];
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const golden = JSON.parse(
  readFileSync(join(root, "fixtures", "questions.golden.json"), "utf-8"),
) as { casos: Case[] };

const BLAME = /culpa|culpable|responsable|irresponsable|imprudente|debió|deberías/i;

// Cada ronda reconstruye la escena decenas de veces: 70 rondas tardan segundos.
describe("preguntas: paridad con Python", { timeout: 60_000 }, () => {
  it(`${golden.casos.length} escenas dan la misma ronda`, () => {
    const failures: string[] = [];
    for (const c of golden.casos) {
      const got = ask(c.spec, c.texto, { samples: c.muestras }).map(preguntaToDict);
      try {
        expect(got).toEqual(c.preguntas);
      } catch (e) {
        failures.push(`${c.clave}: ${(e as Error).message.slice(0, 600)}`);
      }
      for (const q of got) expect(String(q.texto)).not.toMatch(BLAME);
    }
    expect(failures.slice(0, 4)).toEqual([]);
  });
});

describe("respuestas", () => {
  const spec = golden.casos[0]!.spec;
  const vid = String((spec.vehiculos as Record<string, unknown>[])[0]!.id);

  it("las respuestas quedan como dato de la persona y se ignora 'no sé'", () => {
    const [out, applied] = applyAnswers(spec, {
      [`velocidad:${vid}`]: "como a 60",
      [`frenado:${vid}`]: "sí",
      estado_superficie: "mojado",
      [`maniobra:${vid}`]: "no sé",
    });
    const v = (out.vehiculos as Record<string, Record<string, unknown>>[])[0]!;
    expect(v.velocidad_previa).toMatchObject({ valor: 60, fuente: "usuario", unidad: "km/h" });
    expect((v.frenado as Record<string, unknown>).aplico).toMatchObject({ valor: true });
    expect(applied).toEqual([`velocidad:${vid}`, `frenado:${vid}`, "estado_superficie"]);
    expect(spec).not.toBe(out);
  });

  it("el tema une la distancia de frenado con el frenado", () => {
    expect(topic("frenado_distancia:veh-a")).toBe("frenado:veh-a");
    expect(topic("zonas_impacto")).toBe("zonas_impacto:");
  });
});
