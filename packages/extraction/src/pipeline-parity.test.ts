/**
 * Paridad del pipeline TS con la referencia Python sobre todo Relatos-MX (dev y test,
 * contrafactuales y repeticiones): reglas y respuestas grabadas de Claude Haiku y Sonnet, sin
 * llamar a la API. Si estas pruebas pasan, las specs que mide E1 son las mismas en TS y en Python.
 * Las salidas doradas las escribe `uv run croquis-extraction golden build`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractSpec } from "./baseline";
import {
  factsFromOutput,
  PROMPT_VERSION,
  PROMPT_VERSIONS,
  promptFingerprint,
  type ClaudeOutput,
} from "./claude-output";
import { glossaryVersion } from "./glossary";
import { redact } from "./pii";
import { recordingPath } from "./server/recordings";
import { buildSpec } from "./spec-builder";
import { verifySpec } from "./verify";

type Json = Record<string, unknown>;

interface Case {
  metodo: string;
  prompt?: string;
  clave: string;
  spec: Json;
  verificador: { revisados: number; corregidos: number; degradados: number };
  conversion?: {
    citas: number;
    sin_cita_literal: number;
    valores_invalidos: number;
    preguntas: string[];
  };
  spec_verificada?: Json;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const golden = JSON.parse(
  readFileSync(join(root, "fixtures", "pipeline.golden.json"), "utf-8"),
) as {
  version_glosario: string;
  huella_prompt: string;
  huellas_prompt: Record<string, string>;
  casos: Case[];
};
const repo = join(root, "..", "..");
const lines = (split: string): Json[] =>
  readFileSync(join(repo, "data", "relatos-mx", "build", `${split}.jsonl`), "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Json);

/** Clave → texto sin redactar (igual que `pipeline_inputs` en Python). */
const texts = new Map<string, string>();
for (const split of ["dev", "test", "ciss"]) {
  for (const it of lines(split)) {
    texts.set(it.id as string, it.texto as string);
    texts.set(`${it.id as string}-rep`, it.texto as string);
  }
}
for (const c of lines("contrafactuales")) texts.set(c.id as string, c.texto as string);

function withoutStory(spec: Json): Json {
  const meta = { ...(spec.meta as Json) };
  delete meta.relato;
  return { ...spec, meta };
}

function run(c: Case): {
  spec: Json;
  stats: Case["verificador"];
  conv?: Case["conversion"];
  verified: Json;
} {
  const raw = texts.get(c.clave);
  if (raw === undefined) throw new Error(`Sin texto para ${c.clave}`);
  const text = redact(raw).text;
  let spec: Json;
  let conv: Case["conversion"];
  if (c.metodo === "reglas") {
    spec = extractSpec(text, c.clave);
  } else {
    const path = recordingPath(c.metodo, c.clave, join(root, "grabaciones"), c.prompt);
    const rec = JSON.parse(readFileSync(path, "utf-8")) as { salida: ClaudeOutput };
    const [facts, cv] = factsFromOutput(rec.salida, text);
    conv = cv;
    spec = buildSpec(facts, text, { specId: c.clave, origen: "escrito", sintetico: false });
  }
  const [verified, stats] = verifySpec(spec, text);
  return { spec, stats, conv, verified };
}

describe("paridad del pipeline con Python (fixtures/pipeline.golden.json)", () => {
  it("mismo glosario y misma huella del prompt que las grabaciones", () => {
    expect(glossaryVersion()).toBe(golden.version_glosario);
    expect(promptFingerprint()).toBe(golden.huella_prompt);
    for (const p of PROMPT_VERSIONS) expect(promptFingerprint(p)).toBe(golden.huellas_prompt[p]);
  });

  const runs = [
    ["reglas", undefined],
    ...PROMPT_VERSIONS.flatMap((p) =>
      ["claude-haiku-5-5", "claude-sonnet-5-5"].map((m) => [
        m,
        p === PROMPT_VERSION ? undefined : p,
      ]),
    ),
  ] as const;
  for (const [metodo, prompt] of runs) {
    const cases = golden.casos.filter((c) => c.metodo === metodo && c.prompt === prompt);
    if (metodo !== "reglas" && prompt !== undefined && cases.length === 0) continue;
    const label = prompt ? `${metodo} (${prompt})` : metodo;
    it(`${label}: ${cases.length} relatos dan la misma spec, conversión y verificación`, () => {
      const failures: string[] = [];
      for (const c of cases) {
        const got = run(c);
        try {
          expect(withoutStory(got.spec)).toEqual(c.spec);
          expect(got.stats).toEqual(c.verificador);
          if (c.conversion) expect(got.conv).toEqual(c.conversion);
          expect(withoutStory(got.verified)).toEqual(c.spec_verificada ?? c.spec);
        } catch (e) {
          failures.push(`${c.clave}: ${(e as Error).message.slice(0, 400)}`);
        }
      }
      expect(failures.slice(0, 5)).toEqual([]);
    });
  }
});
