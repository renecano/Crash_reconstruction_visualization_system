/**
 * E8 (PLAN §8): determinismo del solver TS entre navegadores. Misma escena y misma semilla ⇒ el
 * mismo resultado, bit a bit, en Chromium (V8), Firefox (SpiderMonkey) y WebKit (JavaScriptCore).
 *
 * Se empaqueta con esbuild, sin la app:
 *
 * - `packages/solver-ts`: cada navegador calcula el resultado completo (`fullResult`:
 *   reconstrucción, Monte Carlo, inversión y consistencia) de las escenas canónicas;
 * - `eval/e8_hornear_entry.mjs`: el horneado del visor con Rapier (restos, volcaduras y ragdolls
 *   calibrados con los cuerpos de MakeHuman), sin GPU.
 *
 * Cada navegador lo hace dos veces, en una página con origen propio (`page.route`). Se comparan los
 * SHA-256 del resultado y de los cuadros horneados; si el resultado difiere, también el primer
 * número distinto y la diferencia máxima.
 *
 * Uso: `node eval/e8_determinism.mjs [--browsers chromium,firefox,webkit] [--scenes a,b]
 * [--repeats 2] [--out ruta.json] [--esperado ruta.json] [--check] [--sin-horneado]`. Salida:
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
const HORNEAR = !process.argv.includes("--sin-horneado");

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

const PERSONAS = join(ROOT, "apps", "web", "public", "modelos", "personas");
// https: crypto.subtle (los hashes del horneado) solo existe en contextos seguros.
const ORIGIN = "https://e8.croquis";

async function iife(entry, globalName) {
  const r = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "iife",
    globalName,
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
    nodePaths: [
      join(ROOT, "packages", "viewer", "node_modules"),
      join(ROOT, "packages", "scene-schema", "node_modules"),
      join(ROOT, "node_modules"),
    ],
  });
  return r.outputFiles[0].text;
}

/** Página en un origen propio (`page.route`): los dos paquetes y los cuerpos de MakeHuman. */
async function openPage(browser, files) {
  const page = await browser.newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") {
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>E8</title>" });
    }
    if (files[path]) return route.fulfill({ contentType: "text/javascript", body: files[path] });
    if (path.startsWith("/modelos/personas/")) {
      const name = path.slice("/modelos/personas/".length);
      const body = readFileSync(join(PERSONAS, name));
      const contentType = name.endsWith(".json") ? "application/json" : "model/gltf-binary";
      return route.fulfill({ contentType, body });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(`${ORIGIN}/`);
  return page;
}

/** Hashes de cada escena en todos los navegadores y repeticiones; las diferencias, si hay. */
function summarize(runs, scenes, describe) {
  const ref = BROWSERS[0];
  return scenes.map((scene) => {
    const hashes = Object.fromEntries(BROWSERS.map((b) => [b, runs[b].map((r) => sha(r[scene]))]));
    const base = runs[ref][0][scene];
    const diferencias = {};
    for (const b of BROWSERS) {
      for (let k = 0; k < REPEATS; k++) {
        const other = runs[b][k][scene];
        if (other !== base) diferencias[`${b}#${k + 1}`] = describe(base, other);
      }
    }
    const all = Object.values(hashes).flat();
    return { escena: scene, identico: all.every((h) => h === all[0]), hashes, diferencias };
  });
}

/** Escenas cuyo hash difiere del de un resultado anterior. */
function compareExpected(prevList, list) {
  const prevHash = Object.fromEntries(
    (prevList ?? []).map((e) => [e.escena, Object.values(e.hashes)[0][0]]),
  );
  const ref = BROWSERS[0];
  return list.filter((e) => prevHash[e.escena] !== e.hashes[ref][0]).map((e) => e.escena);
}

async function main() {
  const files = {
    "/solver.js": await iife(
      join(ROOT, "packages", "solver-ts", "src", "index.ts"),
      "CroquisSolver",
    ),
  };
  if (HORNEAR) {
    files["/hornear.js"] = await iife(join(ROOT, "eval", "e8_hornear_entry.mjs"), "CroquisHornear");
  }
  const specs = Object.fromEntries(
    SCENES.map((s) => [s, JSON.parse(readFileSync(join(FIXTURES, `${s}.json`), "utf8"))]),
  );
  const runs = {};
  const bakes = {};
  let porCalidad = null;
  const versions = {};
  for (const name of BROWSERS) {
    const browser = await playwright[name].launch();
    versions[name] = browser.version();
    runs[name] = [];
    bakes[name] = [];
    for (let k = 0; k < REPEATS; k++) {
      const page = await openPage(browser, files);
      await page.addScriptTag({ url: `${ORIGIN}/solver.js` });
      const out = await page.evaluate((all) => {
        const res = {};
        for (const [scene, spec] of Object.entries(all)) {
          // eslint-disable-next-line no-undef
          res[scene] = JSON.stringify(CroquisSolver.fullResult(spec));
        }
        return res;
      }, specs);
      runs[name].push(out);
      if (HORNEAR) {
        await page.addScriptTag({ url: `${ORIGIN}/hornear.js` });
        const baked = await page.evaluate(
          async ({ scenes, url }) => {
            const res = {};
            for (const scene of scenes) {
              // eslint-disable-next-line no-undef
              res[scene] = JSON.stringify(await CroquisHornear.hornear(scene, url));
            }
            return res;
          },
          { scenes: SCENES, url: `${ORIGIN}/modelos/personas/` },
        );
        bakes[name].push(baked);
        // El horneado no depende del nivel de calidad (sus colisionadores salen del resultado, no
        // de la decoración): se comprueba una vez, en el primer navegador.
        if (name === BROWSERS[0] && k === 0) {
          porCalidad = await page.evaluate(
            async ({ scenes, url }) => {
              const res = {};
              for (const q of ["baja", "ultra"]) {
                res[q] = {};
                for (const scene of scenes) {
                  // eslint-disable-next-line no-undef
                  res[q][scene] = JSON.stringify(await CroquisHornear.hornear(scene, url, q));
                }
              }
              return res;
            },
            { scenes: SCENES, url: `${ORIGIN}/modelos/personas/` },
          );
        }
      }
      await page.close();
      const what = HORNEAR ? "solver y horneado" : "solver";
      console.log(`${name} repetición ${k + 1}: ${SCENES.length} escenas (${what})`);
    }
    await browser.close();
  }
  const escenas = summarize(runs, SCENES, (a, b) => {
    const c = compare(JSON.parse(a), JSON.parse(b));
    return { numeros_distintos: c.n, primera: c.first, max_abs: c.maxAbs, ruta_max: c.maxPath };
  });
  const horneado = HORNEAR
    ? summarize(bakes, SCENES, (a, b) => ({ referencia: JSON.parse(a), este: JSON.parse(b) })).map(
        (e) => ({ ...e, contenido: JSON.parse(bakes[BROWSERS[0]][0][e.escena]) }),
      )
    : null;
  let commit = null;
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim();
  } catch {
    commit = null;
  }
  let comparacion = null;
  if (ESPERADO) {
    const prev = JSON.parse(readFileSync(resolve(ROOT, ESPERADO), "utf8"));
    const distintas = compareExpected(prev.escenas, escenas);
    const horneadoDistinto = horneado ? compareExpected(prev.horneado, horneado) : [];
    comparacion = {
      archivo: ESPERADO,
      git_commit: prev.git_commit,
      iguales: distintas.length === 0 && horneadoDistinto.length === 0,
      distintas,
      horneado_distinto: horneadoDistinto,
    };
  }
  const calidad = porCalidad
    ? Object.fromEntries(
        Object.entries(porCalidad).map(([q, res]) => [
          q,
          SCENES.filter((sc) => res[sc] !== bakes[BROWSERS[0]][0][sc]),
        ]),
      )
    : null;
  const calidadOk = !calidad || Object.values(calidad).every((d) => d.length === 0);
  const solverOk = escenas.every((e) => e.identico);
  const horneadoOk = !horneado || horneado.every((e) => e.identico);
  const doc = {
    name: "e8_determinism",
    generated_at: new Date().toISOString(),
    git_commit: commit,
    criterio:
      "PLAN §8: igualdad exacta entre navegadores y repeticiones del resultado completo del solver y del horneado con Rapier (restos, volcaduras y ragdolls)",
    navegadores: versions,
    repeticiones: REPEATS,
    escenas_identicas: escenas.filter((e) => e.identico).length,
    escenas_total: escenas.length,
    ...(horneado
      ? {
          horneados_identicos: horneado.filter((e) => e.identico).length,
          calidad_horneado: "media",
          horneado_igual_en_baja_y_ultra: calidadOk,
          ...(calidadOk ? {} : { horneado_distinto_por_calidad: calidad }),
        }
      : {}),
    cumple: solverOk && horneadoOk && calidadOk,
    ...(comparacion ? { comparacion_esperado: comparacion } : {}),
    escenas,
    ...(horneado ? { horneado } : {}),
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  console.log(OUT);
  console.log(
    JSON.stringify({
      cumple: doc.cumple,
      solver: `${doc.escenas_identicas}/${doc.escenas_total}`,
      ...(horneado
        ? {
            horneado: `${doc.horneados_identicos}/${horneado.length}`,
            igual_por_calidad: calidadOk,
          }
        : {}),
    }),
  );
  for (const e of escenas.filter((x) => !x.identico)) {
    console.log("solver", e.escena, JSON.stringify(e.diferencias).slice(0, 400));
  }
  for (const e of (horneado ?? []).filter((x) => !x.identico)) {
    console.log("horneado", e.escena, JSON.stringify(e.diferencias).slice(0, 600));
  }
  if (comparacion) {
    const lista = (xs) => (xs.length ? xs.join(", ") : "—");
    console.log(
      comparacion.iguales
        ? `Mismos hashes que ${comparacion.archivo}.`
        : `Distinto de ${comparacion.archivo}: solver ${lista(comparacion.distintas)}; horneado ${lista(comparacion.horneado_distinto)}. Si el solver o el visor cambiaron, vuelve a correr E8 y versiona el resultado.`,
    );
  }
  if (CHECK && (!doc.cumple || (comparacion && !comparacion.iguales))) process.exitCode = 1;
}

await main();
