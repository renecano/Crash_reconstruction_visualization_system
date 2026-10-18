/**
 * E6 antes/después: compara variantes del visor en las mismas condiciones (ADR 0026).
 *
 * Cada variante es un juego de interruptores de diagnóstico (`window.__croquisDiag`) o el visor tal
 * cual; la clave `_serviceWorkers` ("allow" o "block") se aplica al contexto del navegador. Las
 * variantes se miden intercaladas ronda por ronda (A, B, C, A, B, C…, rotando el orden),
 * cada medición en un navegador nuevo y con el modo de energía «Mejor rendimiento» (restaurado al
 * terminar). La diferencia se calcula **por pares dentro de cada ronda** (ms por cuadro de la
 * variante menos los de la base), lo que cancela la deriva térmica entre rondas, y se reporta su
 * mediana con un intervalo de confianza del 90 % por bootstrap con semilla fija.
 *
 * Requisito previo: `pnpm --filter @croquis/web build`. Uso:
 * `node eval/e6_ab.mjs --variants '{"base":{},"sin_x":{"x":true}}' [--scenes glorieta]
 * [--quality media] [--renderer webgl] [--rounds 5] [--seconds 6] [--out ruta.json]`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { useBestPerformance } from "./lib/power-mode.mjs";
import { MEASURE_ARGS, measureViewer, round } from "./lib/viewer-measure.mjs";
import { chromiumFrom, startServer } from "./lib/visual-diff.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const PORT = 3212;
const SEED = 20261017;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const VARIANTS = JSON.parse(arg("variants", '{"base":{}}'));
const SCENES = arg("scenes", "glorieta").split(",");
const QUALITY = arg("quality", "media");
const RENDERER = arg("renderer", "webgl");
const ROUNDS = Number(arg("rounds", "5"));
const SECONDS = Number(arg("seconds", "6"));
const OUT = resolve(ROOT, arg("out", join("eval", "results", "e6_ab.json")));
const names = Object.keys(VARIANTS);
if (!names.includes("base")) throw new Error('Las variantes deben incluir "base"');

/** Generador congruencial (Numerical Recipes) para el bootstrap: reproducible con la semilla. */
function lcg(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(1664525, x) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n === 0 ? NaN : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** Mediana de las diferencias y su intervalo del 90 % por bootstrap (2000 remuestreos). */
function bootstrapMedian(diffs, rand) {
  const meds = [];
  for (let b = 0; b < 2000; b++) {
    const sample = diffs.map(() => diffs[Math.floor(rand() * diffs.length)]);
    meds.push(median(sample));
  }
  meds.sort((a, b) => a - b);
  return { mediana: median(diffs), ic90: [meds[100], meds[1899]] };
}

const server = await startServer(WEB, PORT);
const energia = useBestPerformance();
try {
  const chromium = chromiumFrom(WEB);
  const base = `http://localhost:${PORT}`;
  // ms por cuadro: [escena][variante][ronda]
  const ms = Object.fromEntries(
    SCENES.map((s) => [s, Object.fromEntries(names.map((n) => [n, []]))]),
  );
  for (let r = 0; r < ROUNDS; r++) {
    for (const scene of SCENES) {
      const order = names.map((_, k) => names[(k + r) % names.length]);
      for (const name of order) {
        const browser = await chromium.launch({ headless: false, args: MEASURE_ARGS });
        try {
          const m = await measureViewer(browser, base, {
            scene,
            quality: QUALITY,
            renderer: RENDERER,
            diag: VARIANTS[name],
            seconds: SECONDS,
          });
          if (m.errores.length > 0) throw new Error(`${scene}/${name}: ${m.errores.join(" | ")}`);
          ms[scene][name].push(1000 / m.fps_promedio);
          console.log(`ronda ${r + 1} ${scene} ${name}: ${m.fps_promedio} fps`);
        } finally {
          await browser.close();
        }
      }
    }
  }
  energia.restore();
  const rand = lcg(SEED);
  const escenas = {};
  for (const scene of SCENES) {
    const baseMs = ms[scene].base;
    escenas[scene] = Object.fromEntries(
      names.map((n) => {
        const xs = ms[scene][n];
        const diffs = xs.map((x, k) => x - baseMs[k]);
        const b = bootstrapMedian(diffs, rand);
        return [
          n,
          {
            fps_mediana_rondas: round(1000 / median(xs), 1),
            ms_por_cuadro_rondas: xs.map((x) => round(x, 2)),
            dif_ms_vs_base: round(b.mediana, 2),
            dif_ms_ic90: b.ic90.map((x) => round(x, 2)),
          },
        ];
      }),
    );
  }
  const doc = {
    name: "e6_ab",
    generated_at: new Date().toISOString(),
    git_commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT })
      .toString()
      .trim(),
    seed: SEED,
    metodo:
      "Variantes intercaladas por ronda con orden rotado, navegador nuevo por medición, 1920×1080, cámara cinematográfica; diferencia en ms por cuadro contra la base pareada por ronda, mediana e IC 90 % por bootstrap (2000).",
    calidad: QUALITY,
    renderer: RENDERER,
    rondas: ROUNDS,
    variantes: VARIANTS,
    modo_energia: energia.registro,
    escenas,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  for (const scene of SCENES) {
    for (const [n, v] of Object.entries(escenas[scene])) {
      console.log(
        `${scene} ${n}: ${v.fps_mediana_rondas} fps; ${v.dif_ms_vs_base} ms vs base (IC 90 % ${v.dif_ms_ic90.join(" a ")})`,
      );
    }
  }
} finally {
  energia.restore();
  server.kill();
}
