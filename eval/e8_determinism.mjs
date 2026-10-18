/**
 * E8 (PLAN §8): determinismo del solver TS entre navegadores. Misma escena y misma semilla ⇒ el
 * mismo resultado, bit a bit, en Chromium (V8), Firefox (SpiderMonkey) y WebKit (JavaScriptCore).
 *
 * Se empaqueta `packages/solver-ts` con esbuild para el navegador, sin la app, y cada navegador
 * calcula el resultado completo (`fullResult`: reconstrucción, Monte Carlo, inversión y
 * consistencia) de las escenas canónicas, dos veces. Se comparan los SHA-256 del JSON del resultado
 * y, si difieren, el primer número distinto y la diferencia máxima.
 *
 * Uso: `node eval/e8_determinism.mjs [--browsers chromium,firefox,webkit] [--scenes a,b]
 * [--repeats 2] [--out ruta.json] [--esperado ruta.json] [--check]`. Salida:
 * eval/results/e8_determinism.json.
 *
 * - `--esperado`: compara los hashes con los de un resultado anterior (en CI, el versionado, medido
 *   en Windows): el mismo resultado en otro sistema operativo y `eval/results` al día con el solver.
 * - `--check`: termina con error si algo difiere (para CI).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "apps", "web", "package.json"));
const playwright = require("@playwright/test");
const esbuild = createRequire(join(ROOT, "package.json"))("esbuild");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const FIXTURES = join(ROOT, "packages", "scene-schema", "fixtures");
const ALL = readdirSync(FIXTURES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -5))
  .sort();
const BROWSERS = arg("browsers", "chromium,firefox,webkit").split(",");
const SCENES = arg("scenes", ALL.join(",")).split(",");
const REPEATS = Number(arg("repeats", "2"));
const OUT = resolve(ROOT, arg("out", join("eval", "results", "e8_determinism.json")));
const ESPERADO = arg("esperado", null);
const CHECK = process.argv.includes("--check");

const sha = (s) => createHash("sha256").update(s).digest("hex");

/** Primer número distinto y diferencia máxima entre dos resultados. */
function compare(a, b, path = "", acc = { n: 0, first: null, maxAbs: 0, maxPath: "" }) {
  if (typeof a === "number" && typeof b === "number") {
    if (!Object.is(a + 0, b + 0)) {
      acc.n++;
      acc.first ??= { ruta: path, a, b };
      const d = Math.abs(a - b);
      if (d > acc.maxAbs) {
        acc.maxAbs = d;
        acc.maxPath = path;
      }
    }
  } else if (Array.isArray(a) && Array.isArray(b)) {
    a.forEach((x, i) => compare(x, b[i], `${path}/${i}`, acc));
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of Object.keys(a)) compare(a[k], b[k], `${path}/${k}`, acc);
  } else if (a !== b) {
    acc.n++;
    acc.first ??= { ruta: path, a, b };
  }
  return acc;
}

async function main() {
  const bundle = await esbuild.build({
    entryPoints: [join(ROOT, "packages", "solver-ts", "src", "index.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "CroquisSolver",
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
  });
  const code = bundle.outputFiles[0].text;
  const specs = Object.fromEntries(
    SCENES.map((s) => [s, JSON.parse(readFileSync(join(FIXTURES, `${s}.json`), "utf8"))]),
  );
  const runs = {};
  const versions = {};
  for (const name of BROWSERS) {
    const browser = await playwright[name].launch();
    versions[name] = browser.version();
    runs[name] = [];
    for (let k = 0; k < REPEATS; k++) {
      const page = await browser.newPage();
      await page.setContent("<!doctype html><title>E8</title>");
      await page.addScriptTag({ content: code });
      const out = await page.evaluate((all) => {
        const res = {};
        for (const [scene, spec] of Object.entries(all)) {
          // eslint-disable-next-line no-undef
          res[scene] = JSON.stringify(CroquisSolver.fullResult(spec));
        }
        return res;
      }, specs);
      runs[name].push(out);
      await page.close();
      console.log(`${name} repetición ${k + 1}: ${Object.keys(out).length} escenas`);
    }
    await browser.close();
  }
  const ref = BROWSERS[0];
  const escenas = SCENES.map((scene) => {
    const hashes = Object.fromEntries(BROWSERS.map((b) => [b, runs[b].map((r) => sha(r[scene]))]));
    const base = runs[ref][0][scene];
    const diferencias = {};
    for (const b of BROWSERS) {
      for (let k = 0; k < REPEATS; k++) {
        if (runs[b][k][scene] === base) continue;
        const c = compare(JSON.parse(base), JSON.parse(runs[b][k][scene]));
        diferencias[`${b}#${k + 1}`] = {
          numeros_distintos: c.n,
          primera: c.first,
          max_abs: c.maxAbs,
          ruta_max: c.maxPath,
        };
      }
    }
    const all = Object.values(hashes).flat();
    return { escena: scene, identico: all.every((h) => h === all[0]), hashes, diferencias };
  });
  let commit = null;
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim();
  } catch {
    commit = null;
  }
  let comparacion = null;
  if (ESPERADO) {
    const prev = JSON.parse(readFileSync(resolve(ROOT, ESPERADO), "utf8"));
    const prevHash = Object.fromEntries(
      prev.escenas.map((e) => [e.escena, Object.values(e.hashes)[0][0]]),
    );
    const distintas = escenas
      .filter((e) => prevHash[e.escena] !== e.hashes[ref][0])
      .map((e) => e.escena);
    comparacion = {
      archivo: ESPERADO,
      git_commit: prev.git_commit,
      iguales: distintas.length === 0,
      distintas,
    };
  }
  const doc = {
    name: "e8_determinism",
    generated_at: new Date().toISOString(),
    git_commit: commit,
    criterio: "PLAN §8: igualdad exacta del resultado completo entre navegadores y repeticiones",
    navegadores: versions,
    repeticiones: REPEATS,
    escenas_identicas: escenas.filter((e) => e.identico).length,
    escenas_total: escenas.length,
    cumple: escenas.every((e) => e.identico),
    ...(comparacion ? { comparacion_esperado: comparacion } : {}),
    escenas,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  console.log(OUT);
  console.log(
    JSON.stringify({
      cumple: doc.cumple,
      identicas: `${doc.escenas_identicas}/${doc.escenas_total}`,
    }),
  );
  for (const e of escenas.filter((x) => !x.identico)) {
    console.log(e.escena, JSON.stringify(e.diferencias).slice(0, 400));
  }
  if (comparacion) {
    console.log(
      comparacion.iguales
        ? `Mismos hashes que ${comparacion.archivo}.`
        : `Distinto de ${comparacion.archivo} en: ${comparacion.distintas.join(", ")}. Si el solver cambió, vuelve a correr E8 y versiona el resultado.`,
    );
  }
  if (CHECK && (!doc.cumple || (comparacion && !comparacion.iguales))) process.exitCode = 1;
}

await main();
