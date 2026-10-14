/**
 * Corre el pipeline TS sobre Relatos-MX para E1 (`eval/croquis_eval/e1_extraction.py` lo llama y
 * solo puntúa): redacción en el dispositivo, extracción (reglas y respuestas grabadas de Claude
 * Haiku y Sonnet), constructor, verificador y la ronda de preguntas. Escribe JSONL, una línea por
 * relato y método, sin llamar a la API.
 *
 * Uso: tsx scripts/e1-predict.ts --split test --out <archivo.jsonl>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractSpec } from "../src/baseline";
import { factsFromOutput, LLMError, MODELS } from "../src/claude-output";
import { cpIndex } from "../src/codepoints";
import { redact } from "../src/pii";
import { ask, topic } from "../src/questions";
import { loadRecording } from "../src/server/recordings";
import { buildSpec } from "../src/spec-builder";
import { verifySpec } from "../src/verify";

type Json = Record<string, unknown>;

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : dflt;
}

const split = arg("split", "test");
const out = arg("out", "");
if (!out) throw new Error("Falta --out");
const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const load = (name: string): Json[] =>
  readFileSync(join(repo, "data", "relatos-mx", "build", `${name}.jsonl`), "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Json);

const items = load(split);
const cfs = load("contrafactuales").filter((c) => c.split === split);
const lines: string[] = [];
const emit = (o: Json): void => {
  lines.push(JSON.stringify(o));
};

// Redacción en el dispositivo (posiciones en puntos de código, como la verdad de Relatos-MX).
for (const it of [...items, ...cfs]) {
  const raw = String(it.texto);
  const r = redact(raw);
  emit({
    tipo: "redaccion",
    clave: it.id,
    texto: r.text,
    tramos: r.spans.map((s) => [cpIndex(raw, s.start), cpIndex(raw, s.end)]),
  });
}

function run(metodo: string, clave: string, raw: string, withQuestions: boolean): void {
  const text = redact(raw).text;
  let spec: Json;
  const rec: Json = { tipo: "corrida", metodo, clave };
  if (metodo === "reglas") {
    const t0 = performance.now();
    spec = extractSpec(text, clave);
    rec.latencia_ms = performance.now() - t0;
    rec.costo_usd = 0;
  } else {
    let recording;
    try {
      recording = loadRecording(metodo, clave, text);
    } catch (e) {
      if (!(e instanceof LLMError)) throw e;
      emit({ ...rec, ausente: true });
      return;
    }
    const [facts, conv] = factsFromOutput(recording.salida, text);
    spec = buildSpec(facts, text, { specId: clave, origen: "escrito", sintetico: false });
    rec.citas = conv.citas;
    rec.sin_cita_literal = conv.sin_cita_literal;
    rec.latencia_ms = recording.latencia_ms;
    rec.costo_usd = recording.costo_usd;
  }
  const [verified, stats] = verifySpec(spec, text);
  rec.spec = spec;
  rec.spec_verificada = verified;
  rec.verificador = stats;
  if (withQuestions) {
    try {
      rec.temas_preguntados = ask(spec, text, { samples: 4 }).map((q) => topic(q.id));
    } catch (e) {
      rec.temas_preguntados = null;
      rec.error_preguntas = e instanceof Error ? e.message : String(e);
    }
  }
  emit(rec);
}

for (const metodo of ["reglas", ...MODELS]) {
  for (const it of items) run(metodo, String(it.id), String(it.texto), true);
  for (const c of cfs) run(metodo, String(c.id), String(c.texto), false);
  if (metodo !== "reglas") {
    for (const it of items) run(metodo, `${String(it.id)}-rep`, String(it.texto), false);
  }
}
writeFileSync(out, lines.join("\n") + "\n", "utf-8");
console.log(`${lines.length} líneas en ${out}`);
