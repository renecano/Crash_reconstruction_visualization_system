/**
 * E7 (PLAN §8): paridad numérica del solver TS con la referencia Python en las escenas
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
import { fullResult } from "../src/full-result";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const RESULTS = resolve(repo, "packages", "scene-schema", "fixtures", "resultados");
const OUT = resolve(repo, "eval", "results", "e7_parity.json");
/**
 * Bloques de ajuste: la inversión y las banderas que dependen de ella. `gauss` usa cos, sin y log,
 * que pueden diferir en el último bit entre V8 y la biblioteca matemática de CPython; el camino del
 * optimizador lo amplifica hasta mover un percentil reportado en su último decimal. Se comparan con
 * una unidad de su resolución reportada (centésimas); todo lo demás, a 1e-6.
 */
const FIT_PREFIXES = ["/inversion", "/consistencia"];
const FIT_ABS_TOL = 0.011;

interface Stats {
  numeros: number;
  max_abs: number;
  max_rel: number;
  peor_ruta: string;
  estructura: string[];
}

function walk(e: unknown, a: unknown, path: string, s: Stats, fit?: Stats): void {
  if (fit && FIT_PREFIXES.some((p) => path.startsWith(p))) {
    walk(e, a, path, fit);
    return;
  }
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
    else e.forEach((x, i) => walk(x, a[i], `${path}/${i}`, s, fit));
    return;
  }
  if (e !== null && a !== null && typeof e === "object" && typeof a === "object") {
    const eo = e as Record<string, unknown>;
    const ao = a as Record<string, unknown>;
    const keys = new Set([...Object.keys(eo), ...Object.keys(ao)]);
    for (const k of [...keys].sort()) {
      if (!(k in eo) || !(k in ao)) s.estructura.push(`${path}/${k}: falta en un lado`);
      else walk(eo[k], ao[k], `${path}/${k}`, s, fit);
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
  const t0 = performance.now();
  const got = JSON.parse(JSON.stringify(fullResult(loadFixture(name)))) as Record<string, unknown>;
  const ms = performance.now() - t0;
  const s: Stats = { numeros: 0, max_abs: 0, max_rel: 0, peor_ruta: "", estructura: [] };
  const f: Stats = { numeros: 0, max_abs: 0, max_rel: 0, peor_ruta: "", estructura: [] };
  walk(want, got, "", s, f);
  return { escena: name, ...s, ajuste: f, ms_ts: Math.round(ms * 10) / 10 };
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
    "E7: paridad del solver TS (packages/solver-ts) con la referencia Python en las escenas " +
    "canónicas. Se comparan todos los números del resultado completo (trayectorias, impactos, " +
    "daño, personas, ocupantes, visibilidad, eventos, parámetros, Monte Carlo, inversión y " +
    "consistencia) y los textos.",
  tolerancia: { relativa: 1e-6, absoluta: 1e-5 },
  tolerancia_bloques_de_ajuste: {
    rutas: FIT_PREFIXES,
    absoluta: FIT_ABS_TOL,
    motivo:
      "gauss usa cos, sin y log, que pueden diferir en el último bit entre V8 y CPython; el " +
      "optimizador lo amplifica hasta el último decimal reportado (ADR 0027)",
  },
  numeros_comparados: escenas.reduce((n, e) => n + e.numeros, 0),
  max_abs: Math.max(...escenas.map((e) => e.max_abs)),
  max_rel_valores_mayores_a_una_milesima: Math.max(...escenas.map((e) => e.max_rel)),
  diferencias_de_estructura_o_texto: escenas.reduce(
    (n, e) => n + e.estructura.length + e.ajuste.estructura.length,
    0,
  ),
  bloques_de_ajuste: {
    numeros_comparados: escenas.reduce((n, e) => n + e.ajuste.numeros, 0),
    max_abs: Math.max(...escenas.map((e) => e.ajuste.max_abs)),
    peor_ruta: escenas.reduce(
      (w, e) =>
        e.ajuste.max_abs > w.abs
          ? { abs: e.ajuste.max_abs, ruta: `${e.escena}${e.ajuste.peor_ruta}` }
          : w,
      { abs: 0, ruta: "" },
    ).ruta,
  },
  escenas,
};
writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf-8");
console.log(OUT);
