/**
 * Reproducción y memoria del 3D por nivel de calidad (René, 2026-11-04): abre el visor en Chromium
 * con GPU real en cada nivel pedido, lo deja correr `--segundos` con la cámara cinematográfica en
 * bucle y registra lo que dice el diagnóstico del visor (`window.__croquisDiagnostico`: backend,
 * GPU, memoria estimada, fps, pérdidas del dispositivo, errores), los errores de la página y si el
 * lienzo se quedó en blanco (fracción de píxeles casi blancos de una captura cada 5 s).
 *
 *   node eval/t1_memoria_gpu.mjs --etiqueta antes [--calidades media,alta,ultra]
 *       [--escenas lateral_interseccion,nocturno_lluvia] [--segundos 45] [--base http://localhost:3200]
 *     → eval/results/t1_memoria_gpu.json (una entrada por etiqueta; las demás se conservan)
 *       y docs/cesvi/t1/memoria-gpu/<etiqueta>-<escena>-<calidad>-<n>.png cuando hay blanco.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MEASURE_ARGS, round } from "./lib/viewer-measure.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const require = createRequire(join(WEB, "package.json"));
const { chromium } = require("@playwright/test");
// `sharp` llega con Next (no es dependencia directa de la app): se resuelve desde su carpeta.
const sharp = createRequire(require.resolve("next/package.json"))("sharp");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const ETIQUETA = arg("etiqueta", "despues");
const CALIDADES = arg("calidades", "media,alta,ultra").split(",");
const ESCENAS = arg("escenas", "lateral_interseccion,nocturno_lluvia").split(",");
const SEGUNDOS = Number(arg("segundos", "45"));
const PORT = Number(arg("port", "3200"));
const BASE = arg("base", null);
const RENDERER = arg("renderer", null);
/** Cuánto esperar a que el visor esté listo (s); en la laptop alta y ultra no llegan y no importa. */
const ESPERA_S = Number(arg("espera", "300"));
const SALIDA = join(ROOT, "eval", "results", "t1_memoria_gpu.json");
const CAPTURAS = join(ROOT, "docs", "cesvi", "t1", "memoria-gpu");

async function waitForServer(url, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* todavía no */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`El servidor no respondió en ${url}`);
}

/** Fracción de píxeles casi blancos (los tres canales > 245) de una captura PNG. */
async function whiteFraction(png) {
  const { data, info } = await sharp(png)
    .resize(192, 108, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let white = 0;
  const n = info.width * info.height;
  for (let i = 0; i < n; i++) {
    const r = data[i * info.channels];
    const g = data[i * info.channels + 1];
    const b = data[i * info.channels + 2];
    if (r > 245 && g > 245 && b > 245) white += 1;
  }
  return white / n;
}

async function runOne(browser, base, escena, calidad) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errores = [];
  const consola = [];
  let crash = false;
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("crash", () => {
    crash = true;
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      consola.push(`${m.type()}: ${m.text()}`.slice(0, 300));
  });
  const params = new URLSearchParams({
    escena,
    calidad,
    camara: "cinematica",
    pantalla: "completa",
    auto: "1",
    bucle: "1",
    diag: "1",
  });
  if (RENDERER) params.set("renderer", RENDERER);
  const t0 = Date.now();
  await page.goto(`${base}/visor?${params.toString()}`);
  let listo = true;
  try {
    await page.waitForFunction(() => window.__croquisReady === true, null, {
      timeout: ESPERA_S * 1000,
    });
    await page.waitForFunction(
      () =>
        (window.__croquisVehicleModelsReady ?? true) &&
        (window.__croquisTreesReady ?? true) &&
        window.__croquisGraphReady !== false,
      null,
      { timeout: ESPERA_S * 1000 },
    );
  } catch (e) {
    listo = false;
    errores.push(`no llegó a listo: ${e.message.slice(0, 200)}`);
  }
  const listoMs = Date.now() - t0;
  const muestras = [];
  let n = 0;
  const fin = Date.now() + SEGUNDOS * 1000;
  while (Date.now() < fin && !crash) {
    await page.waitForTimeout(5000);
    n += 1;
    let diag = null;
    try {
      diag = await page.evaluate(() => {
        const d = window.__croquisDiagnostico;
        if (!d) return null;
        return {
          backend: d.backend,
          adaptador: d.adaptador,
          calidad: d.calidad,
          dpr: d.dpr,
          lienzo: d.lienzo,
          fps: d.fps,
          memoria: d.memoria,
          perdida: d.perdida,
          perdidas: d.perdidas,
          recuperaciones: d.recuperaciones,
          generacion: d.generacion,
          ultimoError: d.ultimoError
            ? { origen: d.ultimoError.origen, mensaje: d.ultimoError.mensaje }
            : null,
          fallo: Boolean(document.querySelector('[data-testid="visor-fallo"]')),
          // Qué falta para «listo» (cuando no llega).
          banderas: {
            listo: window.__croquisReady ?? null,
            restos: window.__croquisDebrisReady ?? null,
            personas: window.__croquisPeopleReady ?? null,
            texturas: window.__croquisTexturesReady ?? null,
            cielo: window.__croquisSkyReady ?? null,
            grafo: window.__croquisGraphReady ?? null,
            arboles: window.__croquisTreesReady ?? null,
            modelos: window.__croquisVehicleModelsReady ?? null,
          },
        };
      });
    } catch (e) {
      errores.push(`evaluate: ${e.message.slice(0, 200)}`);
    }
    let blanco = null;
    try {
      const png = await page.screenshot({ type: "png" });
      blanco = await whiteFraction(png);
      if (blanco > 0.9) {
        mkdirSync(CAPTURAS, { recursive: true });
        writeFileSync(join(CAPTURAS, `${ETIQUETA}-${escena}-${calidad}-${n}.png`), png);
      }
    } catch (e) {
      errores.push(`captura: ${e.message.slice(0, 200)}`);
    }
    muestras.push({ s: n * 5, blanco: round(blanco, 3), ...(diag ?? {}) });
    process.stdout.write(
      `  ${escena} ${calidad} t=${n * 5}s fps=${diag?.fps ?? "?"} blanco=${round(blanco, 2)} total=${diag?.memoria?.totalMB ?? "?"}MB perdidas=${diag?.perdidas ?? "?"}\n`,
    );
  }
  await context.close();
  const ultimo = muestras.at(-1) ?? {};
  const memorias = muestras.map((m) => m.memoria?.totalMB ?? null).filter((x) => x !== null);
  const texturas = muestras.map((m) => m.memoria?.texturasMB ?? null).filter((x) => x !== null);
  return {
    escena,
    calidad,
    listo,
    listo_ms: listoMs,
    crash,
    backend: ultimo.backend ?? null,
    adaptador: ultimo.adaptador ?? null,
    lienzo: ultimo.lienzo ?? null,
    fps_mediana: median(muestras.map((m) => m.fps).filter((x) => typeof x === "number")),
    memoria_total_max_mb: memorias.length ? Math.max(...memorias) : null,
    memoria_texturas_max_mb: texturas.length ? Math.max(...texturas) : null,
    memoria_ultima: ultimo.memoria ?? null,
    blanco_max: Math.max(0, ...muestras.map((m) => m.blanco ?? 0)),
    perdidas: ultimo.perdidas ?? null,
    recuperaciones: ultimo.recuperaciones ?? null,
    perdida: ultimo.perdida ?? null,
    generacion: ultimo.generacion ?? null,
    fallo_en_pantalla: Boolean(ultimo.fallo),
    ultimo_error: ultimo.ultimoError ?? null,
    errores_pagina: errores.slice(0, 20),
    consola: consola.slice(0, 20),
    muestras,
  };
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const base = BASE ?? `http://localhost:${PORT}`;
  const server = BASE
    ? null
    : spawn(
        process.execPath,
        [join(WEB, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)],
        { cwd: WEB, stdio: "ignore" },
      );
  const corridas = [];
  try {
    await waitForServer(`${base}/visor`, 90_000);
    for (const escena of ESCENAS) {
      for (const calidad of CALIDADES) {
        // Un navegador nuevo por corrida: la memoria de video de una no cuenta en la siguiente.
        const browser = await chromium.launch({ headless: false, args: MEASURE_ARGS });
        try {
          corridas.push(await runOne(browser, base, escena, calidad));
        } finally {
          await browser.close();
        }
      }
    }
  } finally {
    server?.kill();
  }
  const previo = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, "utf8")) : {};
  const salida = {
    ...previo,
    name: "t1_memoria_gpu",
    descripcion:
      "Memoria de video estimada por el visor (texturas de la escena, búferes de pantalla y sombras), fps, pérdidas del dispositivo y lienzo en blanco por nivel de calidad, en Chromium con GPU real, cámara cinematográfica en bucle.",
    [ETIQUETA]: {
      generated_at: new Date().toISOString(),
      renderer: RENDERER ?? "auto",
      git_commit: gitCommit(),
      segundos: SEGUNDOS,
      maquina: corridas[0]?.adaptador ?? null,
      corridas,
    },
  };
  writeFileSync(SALIDA, JSON.stringify(salida, null, 1) + "\n");
  console.log(SALIDA);
  for (const c of corridas)
    console.log(
      `${c.escena} ${c.calidad}: listo=${c.listo} fps=${c.fps_mediana} total=${c.memoria_total_max_mb}MB texturas=${c.memoria_texturas_max_mb}MB blanco_max=${round(c.blanco_max, 2)} perdidas=${c.perdidas} errores=${c.errores_pagina.length}`,
    );
}

await main();
