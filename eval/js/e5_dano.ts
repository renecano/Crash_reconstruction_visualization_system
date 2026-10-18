/**
 * E5 (F10, ADR 0032): daño de Croquis contra autos reales. Reproduce cada caso (`e5/reproducir.ts`)
 * y agrega por fuente y tipo de impacto: n, exclusiones y, para Croquis y las dos líneas base,
 * mediana y media de cada métrica con su IC del 90 % por bootstrap, más la diferencia pareada
 * (línea base − Croquis) por caso.
 *
 * Uso:
 * - `pnpm --filter @croquis/eval-js e5` → desarrollo, `eval/results/e5_desarrollo.json`.
 * - `pnpm --filter @croquis/eval-js e5 -- --test-final` → el test congelado, **una sola vez** al
 *   final (ADR 0032), `eval/results/e5.json`.
 *
 * Antes: `uv run croquis-eval e5-casos` (exporta `eval/e5/casos.jsonl`).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mulberry32 } from "@croquis/viewer";
import { evaluate, type Caso, type Resultado } from "./e5/reproducir";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const CASES = resolve(ROOT, "eval/e5/casos.jsonl");
const SEED = 20261017;
const BOOT = 2000;
const TIPOS = ["frontal", "frontal_desplazado", "lateral", "alcance", "poste"] as const;
const METRICAS = ["punto", "maximo", "ancho", "area"] as const;
const MODELOS = ["croquis", "uniforme", "lineal"] as const;

const testFinal = process.argv.includes("--test-final");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** IC del 90 % por bootstrap (percentiles) de un estadístico. */
function bootstrap(xs: number[], stat: (s: number[]) => number, rand: () => number) {
  const est: number[] = [];
  for (let b = 0; b < BOOT; b++) {
    const s = Array.from({ length: xs.length }, () => xs[Math.floor(rand() * xs.length)]!);
    est.push(stat(s));
  }
  est.sort((a, b) => a - b);
  return [est[Math.floor(0.05 * BOOT)]!, est[Math.floor(0.95 * BOOT)]!] as const;
}

/** Valor reportado: m → cm (área: m² → cm·m), con dos decimales. */
const cm = (x: number) => Math.round(x * 100 * 100) / 100;

function summarize(rs: Resultado[], rand: () => number) {
  const out: Record<string, unknown> = { n: rs.length };
  for (const met of METRICAS) {
    const valid = rs.filter((r) => r.croquis[met] !== null);
    if (valid.length < 5) {
      out[met] = { n: valid.length, nota: "menos de 5 casos con esta métrica" };
      continue;
    }
    const block: Record<string, unknown> = { n: valid.length };
    for (const mod of MODELOS) {
      const xs = valid.map((r) => r[mod][met] ?? Number.NaN);
      const [lo, hi] = bootstrap(xs, median, rand);
      block[mod] = { mediana: cm(median(xs)), media: cm(mean(xs)), ic90_mediana: [cm(lo), cm(hi)] };
    }
    for (const base of ["uniforme", "lineal"] as const) {
      const diffs = valid.map((r) => (r[base][met] ?? Number.NaN) - (r.croquis[met] ?? Number.NaN));
      const [lo, hi] = bootstrap(diffs, median, rand);
      block[`${base}_menos_croquis`] = {
        mediana: cm(median(diffs)),
        ic90: [cm(lo), cm(hi)],
        croquis_mejor_en: valid.filter((_, i) => diffs[i]! > 0).length,
      };
    }
    out[met] = block;
  }
  return out;
}

function main() {
  if (!existsSync(CASES))
    throw new Error("Falta eval/e5/casos.jsonl: corre `uv run croquis-eval e5-casos`");
  const cases = readFileSync(CASES, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Caso)
    .filter((c) => c.test === testFinal)
    .slice(0, limit);
  const results: Resultado[] = [];
  const excl: Record<string, Record<string, number>> = {};
  const t0 = Date.now();
  cases.forEach((c, i) => {
    const r = evaluate(c);
    if (typeof r === "string") {
      const key = `${c.fuente}/${c.tipo}`;
      excl[key] ??= {};
      excl[key][r] = (excl[key][r] ?? 0) + 1;
    } else {
      results.push(r);
    }
    if ((i + 1) % 1000 === 0)
      console.log(`${i + 1}/${cases.length} casos (${Math.round((Date.now() - t0) / 1000)} s)`);
  });
  const rand = mulberry32(SEED);
  const resumen: Record<string, Record<string, unknown>> = {};
  for (const fuente of ["nhtsa", "ciss"]) {
    resumen[fuente] = {};
    for (const tipo of TIPOS) {
      const rs = results.filter((r) => r.fuente === fuente && r.tipo === tipo);
      resumen[fuente][tipo] = {
        ...summarize(rs, rand),
        exclusiones: excl[`${fuente}/${tipo}`] ?? {},
      };
    }
    resumen[fuente].todos = summarize(
      results.filter((r) => r.fuente === fuente),
      rand,
    );
  }
  let commit: string | null;
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim();
  } catch {
    commit = null;
  }
  const doc = {
    name: testFinal ? "e5" : "e5_desarrollo",
    generated_at: new Date().toISOString(),
    git_commit: commit,
    seed: SEED,
    particion: testFinal ? "test congelado (eval/e5/particion.json, ADR 0032)" : "desarrollo",
    metodo:
      "ADR 0032: Croquis (etapa de daño del solver TS + malla del visor, medida en las estaciones reales), " +
      "uniforme y lineal simple (misma energía, ancho y centro). Errores absolutos en cm (área en cm·m); " +
      "mediana y media por caso, IC 90 % de la mediana por bootstrap (2,000, semilla 20261017); diferencia " +
      "pareada línea base − Croquis (positiva: Croquis se equivoca menos). Error por punto solo en CISS con " +
      "el orden de C1–C6 conocido; NHTSA centrado en lo predicho (sin posición).",
    maquina: { cpus: cpus().length, ram_gb: Math.round(totalmem() / 1e9) },
    casos: cases.length,
    evaluados: results.length,
    segundos: Math.round((Date.now() - t0) / 1000),
    resumen,
  };
  const out = resolve(ROOT, `eval/results/${doc.name}.json`);
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`, "utf-8");
  console.log(out);
}

main();
