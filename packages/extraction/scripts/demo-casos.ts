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
import { loadFixture } from "@croquis/scene-schema";
import { buildSpec } from "../src/spec-builder";
import { verifySpec } from "../src/verify";

const MODEL = "claude-sonnet-5-5";
/** Del dev de Relatos-MX (nunca del test): un caso por tipo de percance, sin contenido gráfico. */
const CASOS: { id: string; titulo: string; titulo_en: string }[] = [
  {
    id: "rmx-d001",
    titulo: "Alcance en Paseo Tollocan, con el piso mojado",
    titulo_en: "Rear-end collision on Paseo Tollocan, on a wet road",
  },
  {
    id: "rmx-d003",
    titulo: "Una moto y un taxi que da vuelta en la lateral de Periférico",
    titulo_en: "A motorcycle and a taxi turning on the Periférico service road",
  },
  {
    id: "rmx-d004",
    titulo: "Una camioneta contra un árbol en la carretera a Ixtlahuaca",
    titulo_en: "An SUV against a tree on the Ixtlahuaca highway",
  },
  {
    id: "rmx-d005",
    titulo: "Una peatona que cruza entre los autos en Hidalgo",
    titulo_en: "A woman crossing between cars on Hidalgo",
  },
  {
    id: "rmx-d007",
    titulo: "Volcadura en la autopista México-Querétaro",
    titulo_en: "Rollover on the México-Querétaro freeway",
  },
  {
    id: "rmx-d012",
    titulo: "Una ciclista y un auto que da vuelta en Insurgentes",
    titulo_en: "A cyclist and a car turning on Insurgentes",
  },
];

type Json = Record<string, unknown>;
const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT = join(repo, "apps", "web", "src", "data", "demo.json");
const OUT_PORTADA = join(repo, "apps", "web", "src", "data", "portada.json");

const rows = new Map(
  readFileSync(join(repo, "data", "relatos-mx", "build", "dev.jsonl"), "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Json)
    .map((r) => [String(r.id), r] as const),
);

const casos = CASOS.map(({ id, titulo, titulo_en }) => {
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
    titulo_en,
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
/**
 * La portada (PLAN §11.3) cuenta la escena canónica de Toluca: su relato y la pregunta que de verdad
 * haría Croquis con él (la misma función `ask` del servidor, sobre la escena).
 */
const toluca = loadFixture("interseccion_toluca") as unknown as Json;
const relatoToluca = String((toluca.meta as Json).relato);
const portada = {
  _generado_por: "pnpm --filter @croquis/extraction demo (scripts/demo-casos.ts)",
  escena: "interseccion_toluca",
  relato: relatoToluca,
  preguntas: ask(toluca, relatoToluca).map(preguntaToDict),
};

function escribir(out: string, data: unknown): void {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    let current: string;
    try {
      current = readFileSync(out, "utf-8");
    } catch {
      current = "";
    }
    if (current !== text) {
      // La primera línea distinta, para ver qué cambió sin tener que regenerar.
      const a = current.split("\n");
      const b = text.split("\n");
      const i = a.findIndex((l, k) => l !== b[k]);
      const at = i < 0 ? Math.min(a.length, b.length) : i;
      console.error(`línea ${at + 1}`);
      console.error(`  versionado: ${a[at]?.slice(0, 200)}`);
      console.error(`  generado:   ${b[at]?.slice(0, 200)}`);
      console.error(`${out} no está al día: corre pnpm --filter @croquis/extraction demo`);
      process.exit(1);
    }
  } else {
    writeFileSync(out, text, "utf-8");
    console.log(out);
  }
}

escribir(OUT, doc);
escribir(OUT_PORTADA, portada);
