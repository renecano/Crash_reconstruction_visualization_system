/**
 * E7 (PLAN §8): paridad numérica del solver TS con la referencia Python en las diez escenas
 * canónicas. Para cada escena compara el resultado completo (sin los bloques que llegan en F9) y
 * reporta cuántos números se compararon, la mayor diferencia absoluta y relativa, y cualquier
 * diferencia de estructura o de texto. Escribe `eval/results/e7_parity.json`.
 *
 * Uso: `pnpm --filter @croquis/solver-ts e7`.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_NAMES, loadFixture } from "@croquis/scene-schema";
import { reconstruct, reconstructionToDict } from "../src/reconstruct";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const RESULTS = resolve(repo, "packages", "scene-schema", "fixtures", "resultados");
const OUT = resolve(repo, "eval", "results", "e7_parity.json");
const F9_BLOCKS = ["incertidumbre", "inversion", "consistencia"];

interface Stats {
  numeros: number;
  max_abs: number;
  max_rel: number;
  peor_ruta: string;
  estructura: string[];
}

function walk(e: unknown, a: unknown, path: string, s: Stats): void {
  if (typeof e === "number" && typeof a === "number") {
    s.numeros++;
    const abs = Math.abs(e - a);
    const rel = abs === 0 ? 0 : abs / Math.max(Math.abs(e), Math.abs(a));
    if (abs > s.max_abs) {
      s.max_abs = abs;
      s.peor_ruta = path;
    }
    s.max_rel = Math.max(s.max_rel, Math.abs(e) >= 1e-3 ? rel : 0);
    return;
  }
  if (Array.isArray(e) && Array.isArray(a)) {
    if (e.length !== a.length) s.estructura.push(`${path}: longitud ${e.length} ≠ ${a.length}`);
    else e.forEach((x, i) => walk(x, a[i], `${path}/${i}`, s));
    return;
  }
  if (e !== null && a !== null && typeof e === "object" && typeof a === "object") {
    const eo = e as Record<string, unknown>;
    const ao = a as Record<string, unknown>;
    const keys = new Set([...Object.keys(eo), ...Object.keys(ao)]);
    for (const k of [...keys].sort()) {
      if (!(k in eo) || !(k in ao)) s.estructura.push(`${path}/${k}: falta en un lado`);
      else walk(eo[k], ao[k], `${path}/${k}`, s);
    }
    return;
  }
  if (e !== a) s.estructura.push(`${path}: ${JSON.stringify(e)} ≠ ${JSON.stringify(a)}`);
}

const escenas = FIXTURE_NAMES.map((name) => {
  const want = JSON.parse(readFileSync(resolve(RESULTS, `${name}.json`), "utf-8")) as Record<
    string,
    unknown
  >;
  for (const k of F9_BLOCKS) delete want[k];
  const t0 = performance.now();
  const got = reconstructionToDict(reconstruct(loadFixture(name)));
  const ms = performance.now() - t0;
  const s: Stats = { numeros: 0, max_abs: 0, max_rel: 0, peor_ruta: "", estructura: [] };
  walk(want, got, "", s);
  return { escena: name, ...s, ms_ts: Math.round(ms * 10) / 10 };
});

let commit: string | null;
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: repo }).toString().trim();
} catch {
  commit = null;
}
const payload = {
  name: "e7_parity",
  generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
  git_commit: commit,
  seed: null,
  descripcion:
    "E7: paridad del solver TS (packages/solver-ts) con la referencia Python en las 10 escenas " +
    "canónicas. Se comparan todos los números del resultado (trayectorias, impactos, daño, " +
    "personas, ocupantes, visibilidad, eventos y parámetros) y los textos; los bloques de Monte " +
    "Carlo, inversión y consistencia llegan al port en F9.",
  tolerancia: { relativa: 1e-6, absoluta: 1e-5 },
  numeros_comparados: escenas.reduce((n, e) => n + e.numeros, 0),
  max_abs: Math.max(...escenas.map((e) => e.max_abs)),
  max_rel_valores_mayores_a_una_milesima: Math.max(...escenas.map((e) => e.max_rel)),
  diferencias_de_estructura_o_texto: escenas.reduce((n, e) => n + e.estructura.length, 0),
  escenas,
};
writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf-8");
console.log(OUT);
