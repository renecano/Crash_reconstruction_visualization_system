/**
 * C0 (docs/cesvi/PLAN-CESVI.md §3): concordancia entre la etiqueta de la conclusión que propone
 * Claude en el corpus y la que pone a mano Claude Code al leer la conclusión del dictamen.
 *
 * La muestra sale solo de la partición de desarrollo (la de prueba no se mira), estratificada por
 * la etiqueta del modelo: hasta POR_ESTRATO dictámenes de cada una, en el orden del SHA-256 de
 * `concordancia:<id>`.
 *
 * Uso (desde packages/cesvi, con los lotes crudos en data/raw/cesvi/):
 *   pnpm exec tsx ../../eval/cesvi_concordancia.mts hoja     escribe la hoja ciega de revisión
 *                                                         (fuera de git: trae texto del dictamen)
 *   pnpm exec tsx ../../eval/cesvi_concordancia.mts medir    compara con data/cesvi/corpus/revision.json
 *                                                         → eval/results/cesvi_concordancia.json
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dividirLote, redactar, VEREDICTOS } from "../packages/cesvi/src/corpus";
import { sha256Hex } from "../packages/extraction/src/index";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = join(RAIZ, "data/cesvi/corpus");
const POR_ESTRATO = 10;

interface Registro {
  id: string;
  expediente: { resultado?: { conclusion?: { veredicto: string } } };
  problemas: string[];
}

const registros = (): Registro[] =>
  readFileSync(join(CORPUS, "expedientes.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Registro);

const etiqueta = (r: Registro) => r.expediente.resultado?.conclusion?.veredicto ?? "sin_conclusion";

function muestra(): Registro[] {
  const prueba = new Set(
    (JSON.parse(readFileSync(join(CORPUS, "particion.json"), "utf8")) as { prueba: string[] })
      .prueba,
  );
  const dev = registros().filter((r) => !prueba.has(r.id) && r.problemas.length === 0);
  const orden = (r: Registro) => sha256Hex(`concordancia:${r.id}`);
  return [...new Set(dev.map(etiqueta))]
    .sort()
    .flatMap((e) =>
      dev
        .filter((r) => etiqueta(r) === e)
        .sort((a, b) => (orden(a) < orden(b) ? -1 : 1))
        .slice(0, POR_ESTRATO),
    )
    .sort((a, b) => (orden(a) < orden(b) ? -1 : 1));
}

/** La parte de conclusiones del dictamen (o su final), redactada. */
function conclusionDe(texto: string): string {
  const i = texto.search(/\n#*\s*CONCLUSI[OÓ]N/i);
  const parte = i >= 0 ? texto.slice(i, i + 3500) : texto.slice(-3500);
  return redactar(parte);
}

function hoja() {
  const crudos = join(RAIZ, "data/raw/cesvi");
  const docs = new Map(
    readdirSync(crudos)
      .filter((f) => /^crash_reports_batch_\d+\.md$/.test(f))
      .flatMap((f) => dividirLote(readFileSync(join(crudos, f), "utf8")))
      .map((d) => [d.id, d.texto]),
  );
  const m = muestra();
  const salida = join(crudos, "revision-ciega.md");
  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(
    salida,
    `# Revisión ciega de la conclusión (${m.length} dictámenes)\n\nEtiquetas: ${VEREDICTOS.join(", ")}.\n\n` +
      m.map((r) => `## ${r.id}\n\n${conclusionDe(docs.get(r.id) ?? "")}\n`).join("\n"),
  );
  console.log(`${salida}: ${m.length} dictámenes`);
}

function kappa(pares: [string, string][]): number {
  const n = pares.length;
  const cats = [...new Set(pares.flat())];
  const po = pares.filter(([a, b]) => a === b).length / n;
  const pe = cats.reduce(
    (s, c) =>
      s +
      (pares.filter(([a]) => a === c).length / n) * (pares.filter(([, b]) => b === c).length / n),
    0,
  );
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

function medir() {
  const revision = JSON.parse(readFileSync(join(CORPUS, "revision.json"), "utf8")) as {
    etiquetas: Record<string, string>;
  };
  const m = muestra();
  const faltan = m.filter((r) => !(r.id in revision.etiquetas)).map((r) => r.id);
  if (faltan.length) throw new Error(`Faltan etiquetas a mano: ${faltan.join(", ")}`);
  const pares = m.map((r) => [etiqueta(r), revision.etiquetas[r.id]!] as [string, string]);
  const acuerdos = pares.filter(([a, b]) => a === b).length;
  const confusion: Record<string, Record<string, number>> = {};
  for (const [modelo, mano] of pares) {
    confusion[modelo] ??= {};
    confusion[modelo][mano] = (confusion[modelo][mano] ?? 0) + 1;
  }
  const resultado = {
    fecha: new Date().toISOString(),
    descripcion:
      "Concordancia de la etiqueta de la conclusión: la que propone Claude (corpus) contra la que puso Claude Code a mano, a ciegas, al leer la conclusión del dictamen. Muestra de la partición de desarrollo, estratificada por la etiqueta del modelo.",
    muestra: m.length,
    por_estrato: POR_ESTRATO,
    acuerdos,
    concordancia: Number((acuerdos / m.length).toFixed(4)),
    kappa_cohen: Number(kappa(pares).toFixed(4)),
    confusion_modelo_vs_mano: confusion,
    desacuerdos: m
      .map((r, i) => ({ id: r.id, modelo: pares[i]![0], mano: pares[i]![1] }))
      .filter((d) => d.modelo !== d.mano),
  };
  writeFileSync(
    join(RAIZ, "eval/results/cesvi_concordancia.json"),
    `${JSON.stringify(resultado, null, 2)}\n`,
  );
  console.log(
    `${acuerdos}/${m.length} de acuerdo (${(resultado.concordancia * 100).toFixed(1)} %), kappa ${resultado.kappa_cohen}`,
  );
}

const orden = process.argv[2];
if (orden === "hoja") hoja();
else if (orden === "medir") medir();
else {
  console.error("Uso: cesvi_concordancia.mts hoja | medir");
  process.exit(1);
}
