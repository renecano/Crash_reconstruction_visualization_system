#!/usr/bin/env node
/**
 * E6 — Rendimiento del visor en la laptop de referencia (PLAN §7.8 y §8).
 *
 * Mide, para cada escena canónica, calidad (baja, media, alta) y backend (WebGPU y WebGL 2,
 * ambos forzados): cuadros por segundo a 1920×1080 en pantalla completa con la cámara
 * cinematográfica en movimiento y la escena reproduciéndose en bucle; cuadros lentos (percentil
 * 99 del tiempo de cuadro); bytes transferidos antes del primer cuadro listo; tiempo hasta ese
 * cuadro; memoria JS; llamadas de dibujo y triángulos.
 *
 * Chromium corre con interfaz y la GPU real, con el límite de vsync desactivado para medir la
 * capacidad real (con vsync el máximo sería la frecuencia de la pantalla). Requisito previo:
 * `pnpm --filter @croquis/web build`. Cada configuración se mide `--repeats` veces (2 por omisión)
 * y se reporta la mejor: la laptop comparte recursos con otras aplicaciones y la variación entre
 * corridas llega a ±15 %. Uso: `node eval/e6_performance.mjs [--seconds 6]
 * [--warmup 2] [--repeats 2] [--cooldown 8] [--scenes a,b] [--qualities media,alta] [--renderers webgpu,webgl]`.
 * Salida: eval/results/e6_performance.json.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const require = createRequire(join(WEB, "package.json"));
const { chromium } = require("@playwright/test");

const ALL_SCENES = [
  "alcance",
  "lateral_interseccion",
  "frontal_curva",
  "peaton_cruce",
  "motociclista",
  "objeto_fijo_arbol",
  "poste",
  "volcadura",
  "nocturno_lluvia",
  "glorieta",
  "interseccion_toluca",
];
/** Presupuesto de PLAN §7.8. */
const BUDGET = { fpsMedia: 60, fpsAlta: 30, initialLoadMB: 8 };

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const SECONDS = Number(arg("seconds", "6"));
const WARMUP = Number(arg("warmup", "2"));
const SCENES = arg("scenes", ALL_SCENES.join(",")).split(",");
const QUALITIES = arg("qualities", "baja,media,alta").split(",");
const RENDERERS = arg("renderers", "webgpu,webgl").split(",");
const PORT = Number(arg("port", "3200"));
/** Repeticiones por configuración: se reporta la mejor (la máquina comparte recursos con otras apps). */
const REPEATS = Number(arg("repeats", "2"));
/** Pausa entre mediciones (s) para que el equipo no acumule calor entre escenas. */
const COOLDOWN_S = Number(arg("cooldown", "8"));

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* todavía no */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`El servidor no respondió en ${url}`);
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim();
  } catch {
    return null;
  }
}

async function gpuInfo(browser, base) {
  const page = await browser.newPage();
  await page.goto(base);
  const info = await page.evaluate(async () => {
    const out = { webgpu: null, webgl: null };
    if ("gpu" in navigator && navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        const i = adapter.info ?? {};
        out.webgpu = { vendor: i.vendor, architecture: i.architecture, description: i.description };
      }
    }
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl && ext) out.webgl = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return out;
  });
  await page.close();
  return info;
}

async function measure(browser, base, scene, quality, renderer) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  let bytes = 0;
  let ready = false;
  cdp.on("Network.loadingFinished", (e) => {
    if (!ready) bytes += e.encodedDataLength;
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const params = new URLSearchParams({
    escena: scene,
    calidad: quality,
    camara: "cinematica",
    pantalla: "completa",
    auto: "1",
    bucle: "1",
  });
  params.set("renderer", renderer);
  await page.goto(`${base}/visor?${params.toString()}`);
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
  ready = true;
  const readyAt = await page.evaluate(() => window.__croquisReadyAt ?? null);
  await page.waitForTimeout(WARMUP * 1000);
  await page.evaluate(() => {
    if (window.__croquisPerf) window.__croquisPerf.frameMs = [];
  });
  await page.waitForTimeout(SECONDS * 1000);
  const sample = await page.evaluate(() => {
    const p = window.__croquisPerf;
    const mem = performance.memory;
    return {
      frameMs: p ? [...p.frameMs] : [],
      backend: p?.backend ?? null,
      drawCalls: p?.drawCalls ?? null,
      triangles: p?.triangles ?? null,
      jsHeapMB: mem ? mem.usedJSHeapSize / 1048576 : null,
    };
  });
  await context.close();
  const ms = sample.frameMs.filter((x) => x > 0).sort((a, b) => a - b);
  const mean = ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length);
  return {
    escena: scene,
    calidad: quality,
    renderer_pedido: renderer,
    backend: sample.backend,
    cuadros: ms.length,
    fps_promedio: round(1000 / mean, 1),
    fps_mediana: round(1000 / percentile(ms, 50), 1),
    fps_p1_bajo: round(1000 / percentile(ms, 99), 1),
    cuadro_p95_ms: round(percentile(ms, 95), 2),
    llamadas_dibujo: sample.drawCalls,
    triangulos: sample.triangles,
    memoria_js_mb: round(sample.jsHeapMB, 1),
    carga_inicial_mb: round(bytes / 1048576, 2),
    tiempo_hasta_listo_ms: round(readyAt, 0),
    errores: errors,
  };
}

/** Abre el visor en modo automático y lee qué backend eligió por medición. */
async function autoChoice(browser, base) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(
    `${base}/visor?escena=lateral_interseccion&calidad=media&camara=cinematica&auto=1&bucle=1&pantalla=completa`,
  );
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-testid=backend]")
        ?.textContent?.includes("elegido por medición") ?? false,
    null,
    { timeout: 120_000 },
  );
  const text = await page.getByTestId("backend").textContent();
  await context.close();
  return text;
}

async function main() {
  const base = `http://localhost:${PORT}`;
  const server = spawn(
    process.execPath,
    [join(WEB, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)],
    {
      cwd: WEB,
      stdio: "ignore",
    },
  );
  try {
    await waitForServer(`${base}/visor`, 60_000);
    const browser = await chromium.launch({
      headless: false,
      args: [
        "--enable-unsafe-webgpu",
        "--ignore-gpu-blocklist",
        "--disable-gpu-vsync",
        "--disable-frame-rate-limit",
      ],
    });
    const gpu = await gpuInfo(browser, base);
    const runs = [];
    // Cada repetición recorre todas las escenas, en orden directo e inverso alternados, con una
    // pausa entre mediciones: la laptop se calienta durante la corrida y, sin esto, las escenas
    // del final de cada calidad se medirían siempre con el equipo más caliente.
    for (const renderer of RENDERERS) {
      for (const quality of QUALITIES) {
        const reps = new Map(SCENES.map((sc) => [sc, []]));
        for (let k = 0; k < REPEATS; k++) {
          const order = k % 2 === 0 ? SCENES : [...SCENES].reverse();
          for (const scene of order) {
            reps.get(scene).push(await measure(browser, base, scene, quality, renderer));
            await new Promise((resolve) => setTimeout(resolve, COOLDOWN_S * 1000));
          }
        }
        for (const scene of SCENES) {
          const list = reps.get(scene);
          const r = list.reduce((a, b) => ((b.fps_promedio ?? 0) > (a.fps_promedio ?? 0) ? b : a));
          r.repeticiones_fps = list.map((x) => x.fps_promedio);
          runs.push(r);
          console.log(
            `${renderer}/${quality}/${scene}: ${r.backend} ${r.fps_promedio} fps (p1 ${r.fps_p1_bajo}), ${r.carga_inicial_mb} MB, ${r.tiempo_hasta_listo_ms} ms, ${r.llamadas_dibujo} llamadas`,
          );
        }
      }
    }
    const verificacionAuto = await autoChoice(browser, base);
    await browser.close();
    const summary = {};
    for (const renderer of RENDERERS) {
      for (const quality of QUALITIES) {
        const sel = runs.filter((r) => r.renderer_pedido === renderer && r.calidad === quality);
        const fps = sel.map((r) => r.fps_promedio).filter((v) => v !== null);
        summary[`${renderer}/${quality}`] = {
          backend: [...new Set(sel.map((r) => r.backend))].join(","),
          fps_min_entre_escenas: round(Math.min(...fps), 1),
          fps_mediana_entre_escenas: round(
            [...fps].sort((a, b) => a - b)[Math.floor(fps.length / 2)],
            1,
          ),
          escena_mas_lenta: sel.find((r) => r.fps_promedio === Math.min(...fps))?.escena ?? null,
          carga_inicial_max_mb: round(Math.max(...sel.map((r) => r.carga_inicial_mb ?? 0)), 2),
        };
      }
    }
    // Misma política que el visor (backend-choice.ts), escena por escena: WebGPU si alcanza 60 fps;
    // si no, el más rápido de los dos. Así se evalúa lo que el usuario ve en modo automático.
    const run = (r, q, e) =>
      runs.find((x) => x.renderer_pedido === r && x.calidad === q && x.escena === e);
    const automatico = {};
    for (const q of QUALITIES) {
      const porEscena = SCENES.map((e) => {
        const gpu = run("webgpu", q, e);
        const gl = run("webgl", q, e);
        const fpsGpu = gpu?.fps_promedio ?? 0;
        const fpsGl = gl?.fps_promedio ?? 0;
        const backend = gpu && fpsGpu >= 60 ? "webgpu" : fpsGl >= fpsGpu ? "webgl" : "webgpu";
        return { escena: e, backend, fps: backend === "webgpu" ? fpsGpu : fpsGl };
      });
      const min = porEscena.reduce((a, b) => (b.fps < a.fps ? b : a), porEscena[0]);
      automatico[q] = {
        fps_min_entre_escenas: round(min?.fps ?? 0, 1),
        escena_mas_lenta: min?.escena ?? null,
        por_escena: porEscena,
      };
    }
    const auto = (q) => automatico[q];
    const doc = {
      name: "e6_performance",
      generated_at: new Date().toISOString().replace(/\.\d+Z$/, "+00:00"),
      git_commit: gitCommit(),
      seed: null,
      maquina: {
        so: `${os.type()} ${os.release()}`,
        cpu: os.cpus()[0]?.model ?? null,
        nucleos: os.cpus().length,
        memoria_gb: round(os.totalmem() / 1073741824, 1),
        gpu,
      },
      metodo: {
        resolucion: "1920x1080, deviceScaleFactor 1, visor a pantalla completa",
        camara: "cinematográfica (en movimiento), reproducción en bucle a 1×",
        segundos_medidos: SECONDS,
        calentamiento_s: WARMUP,
        vsync: "desactivado (--disable-gpu-vsync --disable-frame-rate-limit) para medir capacidad",
        navegador: "Chromium de Playwright con interfaz y GPU real",
        repeticiones: `${REPEATS} por configuración, cada una recorre las escenas en orden alterno (directo e inverso) con ${COOLDOWN_S} s de pausa entre mediciones; se reporta la de mayor fps promedio (todas en repeticiones_fps)`,
      },
      presupuesto: BUDGET,
      modo_automatico: automatico,
      backend_modo_automatico: {
        observado_en_el_visor: verificacionAuto,
      },
      cumple: {
        media_60fps: (auto("media")?.fps_min_entre_escenas ?? 0) >= BUDGET.fpsMedia,
        alta_30fps: (auto("alta")?.fps_min_entre_escenas ?? 0) >= BUDGET.fpsAlta,
        carga_inicial_8mb:
          Math.max(...runs.map((r) => r.carga_inicial_mb ?? 0)) <= BUDGET.initialLoadMB,
      },
      resumen: summary,
      corridas: runs,
    };
    const out = join(ROOT, "eval", "results", "e6_performance.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    console.log(out);
    console.log(JSON.stringify({ cumple: doc.cumple, resumen: summary }, null, 2));
  } finally {
    server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
