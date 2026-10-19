/**
 * Casos de la demo «Tú eres…» (PLAN §11, F11): relatos de ejemplo del dev de Relatos-MX pasados
 * por el pipeline TS de producción con la respuesta **grabada** de Claude Sonnet (prompt vigente),
 * sin llamar a la API: redacción, extracción, constructor, verificador y la primera ronda de
 * preguntas. La demo los muestra y sigue sin servidor (las rondas siguientes y la reconstrucción
 * corren en el navegador).
 *
 * Uso: tsx scripts/demo-casos.ts [--check] → apps/web/src/data/demo.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { factsFromOutput, PROMPT_VERSION } from "../src/claude-output";
import { redact } from "../src/pii";
import { ask, preguntaToDict } from "../src/questions";
import { loadRecording, RECORDINGS } from "../src/server/recordings";
import { buildSpec } from "../src/spec-builder";
import { verifySpec } from "../src/verify";

const MODEL = "claude-sonnet-5-5";
/** Del dev de Relatos-MX (nunca del test): un caso por tipo de percance, sin contenido gráfico. */
const CASOS: { id: string; titulo: string }[] = [
  { id: "rmx-d001", titulo: "Alcance en Paseo Tollocan, con el piso mojado" },
  { id: "rmx-d003", titulo: "Una moto y un taxi que da vuelta en la lateral de Periférico" },
  { id: "rmx-d004", titulo: "Una camioneta contra un árbol en la carretera a Ixtlahuaca" },
  { id: "rmx-d005", titulo: "Una peatona que cruza entre los autos en Hidalgo" },
  { id: "rmx-d007", titulo: "Volcadura en la autopista México-Querétaro" },
  { id: "rmx-d012", titulo: "Una ciclista y un auto que da vuelta en Insurgentes" },
];

type Json = Record<string, unknown>;
const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT = join(repo, "apps", "web", "src", "data", "demo.json");

const rows = new Map(
  readFileSync(join(repo, "data", "relatos-mx", "build", "dev.jsonl"), "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Json)
    .map((r) => [String(r.id), r] as const),
);

const casos = CASOS.map(({ id, titulo }) => {
  const row = rows.get(id);
  if (!row) throw new Error(`Falta ${id} en el dev de Relatos-MX`);
  const texto = redact(String(row.texto)).text;
  const recording = loadRecording(MODEL, id, texto, RECORDINGS, PROMPT_VERSION);
  const [facts] = factsFromOutput(recording.salida, texto);
  const spec = buildSpec(facts, texto, {
    specId: `demo-${id}`,
    origen: "escrito",
    sintetico: true,
  });
  const [verificada, verificador] = verifySpec(spec, texto);
  return {
    id,
    titulo,
    tipo: String(row.tipo),
    texto,
    spec: verificada,
    verificador,
    preguntas: ask(verificada, texto).map(preguntaToDict),
  };
});

const doc = {
  _generado_por: "pnpm --filter @croquis/extraction demo (scripts/demo-casos.ts)",
  fuente:
    "Relatos-MX, partición de desarrollo: relatos sintéticos escritos por agentes de IA (data/relatos-mx)",
  metodo: `${MODEL}, prompt ${PROMPT_VERSION}, respuesta grabada (sin llamar a la API)`,
  casos,
};
const text = `${JSON.stringify(doc, null, 2)}\n`;
if (process.argv.includes("--check")) {
  let current: string;
  try {
    current = readFileSync(OUT, "utf-8");
  } catch {
    current = "";
  }
  if (current !== text) {
    console.error(`${OUT} no está al día: corre pnpm --filter @croquis/extraction demo`);
    process.exit(1);
  }
} else {
  writeFileSync(OUT, text, "utf-8");
  console.log(OUT);
}
