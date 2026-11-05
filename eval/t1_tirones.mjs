#!/usr/bin/env node
/**
 * T1 — ¿Qué cuadros tardan? Diagnóstico de los tirones de media en la laptop: abre una escena como
 * E6 (1920 × 1080, cámara cinematográfica, bucle, GPU real) y anota, cuadro por cuadro durante
 * `--seconds`, cuánto tardó y qué instante de la línea de tiempo dibujó (`window.__croquisT`), más
 * las tareas largas del hilo principal con su inicio. Imprime los cuadros de más de `--umbral` ms
 * con el instante de la escena, para ver si el tirón cae siempre en el mismo momento (p. ej. al
 * reiniciar el bucle o al aparecer un material nuevo) o es ajeno a la escena.
 *
 * Requisito: `pnpm --filter @croquis/web build`. Uso:
 *   node eval/t1_tirones.mjs --escena nocturno_lluvia [--calidad media] [--seconds 14] [--umbral 100]
 *                            [--base http://localhost:3200] [--out eval/results/t1_tirones_<escena>.json]
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MEASURE_ARGS } from "./lib/viewer-measure.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const { chromium } = createRequire(join(WEB, "package.json"))("@playwright/test");
const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const ESCENA = arg("escena", "nocturno_lluvia");
const CALIDAD = arg("calidad", "media");
const SECONDS = Number(arg("seconds", "14"));
const UMBRAL = Number(arg("umbral", "100"));
const PORT = Number(arg("port", "3200"));
const BASE = arg("base", null);
const OUT = resolve(ROOT, arg("out", `eval/results/t1_tirones_${ESCENA}_${CALIDAD}.json`));
const PROPIA = { axa: "demo/escenas-r11/axa.json" }[ESCENA];
/** Interruptores de diagnóstico del visor (`window.__croquisDiag`), JSON; p. ej. '{"sinHdri":true}'. */
const DIAG = JSON.parse(arg("diag", "{}"));
/** Parámetros extra de la URL del visor (p. ej. `estado=seco&clima=despejado`, el ambiente forzado). */
const EXTRA = arg("extra", "");

async function waitForServer(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* todavía no */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`sin servidor en ${url}`);
}

const base = BASE ?? `http://localhost:${PORT}`;
const server = BASE
  ? null
  : spawn(
      process.execPath,
      [join(WEB, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)],
      { cwd: WEB, stdio: "ignore" },
    );
try {
  await waitForServer(`${base}/visor`, 90_000);
  const browser = await chromium.launch({ headless: false, args: MEASURE_ARGS });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  if (Object.keys(DIAG).length > 0) {
    await page.addInitScript((d) => {
      window.__croquisDiag = d;
    }, DIAG);
  }
  // Cuánto tarda cada pipeline de WebGPU (el compilado de sombreadores es síncrono y bloquea el hilo).
  await page.addInitScript(() => {
    const w = window;
    w.__pipelines = [];
    const proto = globalThis.GPUDevice?.prototype;
    if (!proto) return;
    const orig = proto.createRenderPipeline;
    proto.createRenderPipeline = function (desc) {
      const t0 = performance.now();
      const out = orig.call(this, desc);
      w.__pipelines.push([t0, performance.now() - t0, desc?.label ?? ""]);
      return out;
    };
    // Los asíncronos (precompilado): cuándo se pidió y cuánto tardó en resolverse.
    w.__pipelinesAsync = [];
    const origAsync = proto.createRenderPipelineAsync;
    proto.createRenderPipelineAsync = function (desc) {
      const t0 = performance.now();
      const p = origAsync.call(this, desc);
      p.then(
        () => w.__pipelinesAsync.push([t0, performance.now() - t0]),
        () => {},
      );
      return p;
    };
  });
  if (PROPIA) {
    await page.addInitScript(
      (s) => sessionStorage.setItem("croquis:escena-propia", s),
      readFileSync(join(ROOT, PROPIA), "utf8"),
    );
  }
  const params = new URLSearchParams({
    escena: PROPIA ? "propia" : ESCENA,
    calidad: CALIDAD,
    camara: "cinematica",
    pantalla: "completa",
    auto: "1",
    bucle: "1",
    renderer: "webgpu",
  });
  await page.goto(`${base}/visor?${params}${EXTRA ? `&${EXTRA}` : ""}`);
  const espera = { timeout: 600_000 };
  await page.waitForFunction(() => window.__croquisReady === true, null, espera);
  await page.waitForFunction(() => window.__croquisVehicleModelsReady !== false, null, espera);
  // Cuánto tardó el grafo con modelos en quedar precompilado y en pantalla (T1.1).
  const tModelos = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => window.__croquisGraphReady !== false, null, espera);
  const tCompilado = await page.evaluate(() => performance.now());
  await page.waitForTimeout(2000);
  // Perfil de CPU durante la medición (René, 2026-11-04): qué funciones llenan las tareas largas.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await cdp.send("Profiler.start");
  const muestra = await page.evaluate(
    (seconds) =>
      new Promise((done) => {
        const frames = [];
        const largas = [];
        const banderas = [];
        const t0 = performance.now();
        let prev = t0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            largas.push({ inicio_ms: e.startTime - t0, duracion_ms: e.duration });
        }).observe({ type: "longtask" });
        // Transiciones de las banderas de carga (qué llegó durante la medición).
        const claves = [
          "__croquisGraphReady",
          "__croquisTreesReady",
          "__croquisSkyReady",
          "__croquisTexturesReady",
          "__croquisDebrisReady",
          "__croquisPeopleReady",
          "__croquisVehicleModelsReady",
        ];
        let previo = Object.fromEntries(claves.map((k) => [k, window[k]]));
        const poll = setInterval(() => {
          for (const k of claves) {
            if (window[k] !== previo[k]) {
              banderas.push({
                en_ms: Math.round(performance.now() - t0),
                bandera: k,
                valor: window[k],
              });
              previo[k] = window[k];
            }
          }
        }, 50);
        const tick = () => {
          const now = performance.now();
          frames.push([now - t0, now - prev, window.__croquisT ?? null]);
          prev = now;
          if (now - t0 < seconds * 1000) requestAnimationFrame(tick);
          else {
            clearInterval(poll);
            done({ frames, largas, banderas });
          }
        };
        requestAnimationFrame(tick);
      }),
    SECONDS,
  );
  const { profile } = await cdp.send("Profiler.stop");
  // Tiempo propio por función (muestras × intervalo), las 15 que más suman.
  const porNodo = new Map();
  const nodos = new Map(profile.nodes.map((n) => [n.id, n]));
  const dts = profile.timeDeltas ?? [];
  profile.samples.forEach((id, i) => {
    porNodo.set(id, (porNodo.get(id) ?? 0) + (dts[i] ?? 0) / 1000);
  });
  const funciones = [...porNodo.entries()]
    .map(([id, ms]) => {
      const n = nodos.get(id);
      const f = n?.callFrame ?? {};
      return {
        funcion: f.functionName || "(anónima)",
        archivo:
          (f.url || "").split("/").slice(-1)[0] + (f.lineNumber >= 0 ? `:${f.lineNumber + 1}` : ""),
        ms: Math.round(ms),
      };
    })
    .filter((x) => x.ms >= 20)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 15);
  const pipelines = await page.evaluate(() => window.__pipelines ?? []);
  const asincronos = await page.evaluate(() => window.__pipelinesAsync ?? []);
  await browser.close();
  const lentos = muestra.frames
    .filter(([, dt]) => dt > UMBRAL)
    .map(([en, dt, t]) => ({ en_ms: Math.round(en), cuadro_ms: Math.round(dt), t_escena_s: t }));
  const ms = muestra.frames.map(([, dt]) => dt).slice(1);
  const sorted = [...ms].sort((a, b) => a - b);
  const total = ms.reduce((a, b) => a + b, 0);
  const resumen = {
    escena: ESCENA,
    calidad: CALIDAD,
    diag: DIAG,
    extra: EXTRA,
    segundos: SECONDS,
    cuadros: ms.length,
    fps_promedio: Math.round(((1000 * ms.length) / total) * 10) / 10,
    fps_mediana: Math.round((1000 / sorted[Math.floor(sorted.length / 2)]) * 10) / 10,
    ms_en_cuadros_lentos: Math.round(lentos.reduce((a, l) => a + l.cuadro_ms, 0)),
    cuadros_lentos: lentos,
    tareas_largas: muestra.largas.map((l) => ({
      inicio_ms: Math.round(l.inicio_ms),
      duracion_ms: Math.round(l.duracion_ms),
    })),
    banderas: muestra.banderas,
    funciones_mas_pesadas: funciones,
    precompilado_ms: Math.round(tCompilado - tModelos),
    pipelines_asincronos: asincronos.length,
    pipelines_asincronos_ms_max: Math.round(Math.max(0, ...asincronos.map(([, ms]) => ms))),
    pipelines: pipelines.length,
    pipelines_ms: Math.round(pipelines.reduce((a, [, ms]) => a + ms, 0)),
    pipelines_lentos: pipelines
      .filter(([, ms]) => ms > 100)
      .map(([t0, ms, label]) => ({ en_ms: Math.round(t0), ms: Math.round(ms), label })),
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(resumen, null, 2)}\n`);
  console.log(
    `${ESCENA}/${CALIDAD}: ${resumen.fps_promedio} fps promedio, ${resumen.fps_mediana} mediana; ${lentos.length} cuadros de más de ${UMBRAL} ms (${resumen.ms_en_cuadros_lentos} ms en total):`,
  );
  for (const l of lentos)
    console.log(`  a los ${l.en_ms} ms: ${l.cuadro_ms} ms, t = ${l.t_escena_s}`);
  console.log(
    `tareas largas: ${resumen.tareas_largas.map((l) => `${l.inicio_ms}+${l.duracion_ms}`).join(", ")}`,
  );
  console.log(
    `precompilado del grafo con modelos: ${resumen.precompilado_ms} ms; pipelines asíncronos: ${resumen.pipelines_asincronos} (el más lento ${resumen.pipelines_asincronos_ms_max} ms)`,
  );
  console.log(
    `pipelines de WebGPU: ${resumen.pipelines} en ${resumen.pipelines_ms} ms; lentos (> 100 ms): ${resumen.pipelines_lentos.map((p) => `${p.ms} ms «${p.label}»`).join(", ") || "ninguno"}`,
  );
} finally {
  server?.kill();
}
