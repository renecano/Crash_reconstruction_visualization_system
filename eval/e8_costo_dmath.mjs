/**
 * Costo de las funciones trascendentes deterministas (E8, ADR 0029): `dmath` contra `Math` nativo.
 *
 * 1. Por función: nanosegundos por llamada de `dmath.f` y `Math.f` sobre los mismos 2 millones de
 *    argumentos, y la máxima diferencia en ulps (0 = idénticas bit a bit a V8).
 * 2. Solver completo: `fullResult` de las escenas canónicas con el solver de un commit anterior
 *    (`--antes`, con `Math` nativo) y con el del árbol de trabajo, en rondas alternadas; mediana
 *    por escena. Comprueba además que en V8 los dos dan el mismo resultado, bit a bit: el cambio no
 *    mueve ningún número en Chromium.
 *
 * Corre en Node (V8). Uso: `node eval/e8_costo_dmath.mjs [--antes 800d41b] [--rondas 5]
 * [--out ruta.json]`. Salida: eval/results/e8_costo_dmath.json.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const esbuild = createRequire(join(ROOT, "package.json"))("esbuild");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const ANTES = arg("antes", "800d41b");
const RONDAS = Number(arg("rondas", "5"));
const OUT = resolve(ROOT, arg("out", join("eval", "results", "e8_costo_dmath.json")));

async function load(entry, base) {
  const r = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    alias: { "@croquis/scene-schema": join(base, "packages", "scene-schema", "src", "index.ts") },
    nodePaths: [join(ROOT, "packages", "scene-schema", "node_modules"), join(ROOT, "node_modules")],
  });
  const code = Buffer.from(r.outputFiles[0].text).toString("base64");
  return import(`data:text/javascript;base64,${code}`);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const view = new DataView(new ArrayBuffer(8));
function ulps(a, b) {
  if (Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b))) return 0;
  view.setFloat64(0, a);
  let x = view.getBigInt64(0);
  view.setFloat64(0, b);
  let y = view.getBigInt64(0);
  if (x < 0n) x = -(x & 0x7fffffffffffffffn);
  if (y < 0n) y = -(y & 0x7fffffffffffffffn);
  return Number(x > y ? x - y : y - x);
}

function porFuncion(D) {
  const N = 2_000_000;
  const xs = new Float64Array(N);
  const ys = new Float64Array(N);
  // Argumentos pseudoaleatorios con semilla fija en [−8, 8).
  let seed = 20261017;
  const rnd = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 2 ** 32;
  };
  for (let i = 0; i < N; i++) {
    xs[i] = (rnd() - 0.5) * 16;
    ys[i] = (rnd() - 0.5) * 16;
  }
  const fns = {
    sin: [Math.sin, D.sin, 1],
    cos: [Math.cos, D.cos, 1],
    tan: [Math.tan, D.tan, 1],
    atan: [Math.atan, D.atan, 1],
    acos: [(x) => Math.acos(x / 8), (x) => D.acos(x / 8), 1],
    atan2: [Math.atan2, D.atan2, 2],
    exp: [Math.exp, D.exp, 1],
    log: [(x) => Math.log(Math.abs(x)), (x) => D.log(Math.abs(x)), 1],
    hypot: [Math.hypot, D.hypot, 2],
  };
  const time = (f, two) => {
    let acc = 0;
    const t0 = performance.now();
    if (two) for (let i = 0; i < N; i++) acc += f(xs[i], ys[i]);
    else for (let i = 0; i < N; i++) acc += f(xs[i]);
    return [((performance.now() - t0) * 1e6) / N, acc];
  };
  const out = {};
  for (const [name, [m, d, arity]] of Object.entries(fns)) {
    const two = arity === 2;
    let maxUlps = 0;
    for (let i = 0; i < N; i += 7) {
      const u = two ? ulps(m(xs[i], ys[i]), d(xs[i], ys[i])) : ulps(m(xs[i]), d(xs[i]));
      if (u > maxUlps) maxUlps = u;
    }
    const tm = [];
    const td = [];
    for (let k = 0; k < 5; k++) {
      tm.push(time(m, two)[0]);
      td.push(time(d, two)[0]);
    }
    out[name] = {
      math_ns: Number(median(tm).toFixed(1)),
      dmath_ns: Number(median(td).toFixed(1)),
      max_ulps_vs_v8: maxUlps,
    };
  }
  return out;
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), "croquis-e8-"));
  try {
    const tar = execFileSync(
      "git",
      ["archive", ANTES, "packages/solver-ts/src", "packages/scene-schema"],
      {
        cwd: ROOT,
        maxBuffer: 1 << 28,
      },
    );
    execFileSync("tar", ["-x", "-C", tmp], { input: tar });
    const antes = await load(join(tmp, "packages", "solver-ts", "src", "index.ts"), tmp);
    const despues = await load(join(ROOT, "packages", "solver-ts", "src", "index.ts"), ROOT);
    const D = await load(join(ROOT, "packages", "solver-ts", "src", "dmath.ts"), ROOT);

    const FIX = join(ROOT, "packages", "scene-schema", "fixtures");
    const specs = readdirSync(FIX)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(FIX, f), "utf8"))]);

    // Mismo resultado bit a bit en V8 (y calentamiento de los dos).
    const identicos = {};
    for (const [n, s] of specs) {
      identicos[n] = JSON.stringify(antes.fullResult(s)) === JSON.stringify(despues.fullResult(s));
    }
    const t = { antes: {}, despues: {} };
    for (const [n] of specs) {
      t.antes[n] = [];
      t.despues[n] = [];
    }
    for (let r = 0; r < RONDAS; r++) {
      const orden = r % 2 === 0 ? ["antes", "despues"] : ["despues", "antes"];
      for (const v of orden) {
        const S = v === "antes" ? antes : despues;
        for (const [n, s] of specs) {
          const t0 = performance.now();
          S.fullResult(s);
          t[v][n].push(performance.now() - t0);
        }
      }
      console.log(`ronda ${r + 1}/${RONDAS}`);
    }
    const escenas = specs.map(([n]) => {
      const a = median(t.antes[n]);
      const d = median(t.despues[n]);
      return {
        escena: n,
        antes_ms: Number(a.toFixed(1)),
        despues_ms: Number(d.toFixed(1)),
        razon: Number((d / a).toFixed(3)),
        identico_v8: identicos[n],
      };
    });
    const totalA = escenas.reduce((s, e) => s + e.antes_ms, 0);
    const totalD = escenas.reduce((s, e) => s + e.despues_ms, 0);
    const doc = {
      name: "e8_costo_dmath",
      generated_at: new Date().toISOString(),
      git_commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT })
        .toString()
        .trim(),
      antes: ANTES,
      motor: `Node ${process.version} (V8 ${process.versions.v8})`,
      rondas: RONDAS,
      por_funcion: porFuncion(D),
      solver_completo: {
        total_antes_ms: Number(totalA.toFixed(0)),
        total_despues_ms: Number(totalD.toFixed(0)),
        razon_total: Number((totalD / totalA).toFixed(3)),
        resultado_identico_en_v8: escenas.every((e) => e.identico_v8),
        escenas,
      },
    };
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    console.log(OUT);
    console.log(
      JSON.stringify(doc.solver_completo, [
        "total_antes_ms",
        "total_despues_ms",
        "razon_total",
        "resultado_identico_en_v8",
      ]),
    );
    console.log(JSON.stringify(doc.por_funcion));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

await main();
