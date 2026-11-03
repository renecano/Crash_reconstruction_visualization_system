#!/usr/bin/env node
/**
 * T1 — Capturas y fps de las 4 escenas de referencia del escenario 3D (PLAN-CESVI v3, T1).
 *
 * Las escenas se miden siempre iguales: AXA (autopista federal de día, `demo/escenas-r11/axa.json`
 * como escena propia), `lateral_interseccion` (cruce urbano), `nocturno_lluvia` y `carambola`
 * (la de R11). De cada una, con la cámara cinematográfica y la del daño, en el instante t = 0.2 s
 * (el mismo que las capturas de R10), a 1920 × 1080 con la GPU real (Chromium con interfaz, como
 * E6), en la calidad pedida (media en la laptop; alta y ultra en la computadora de demo).
 *
 * Escribe:
 * - `docs/cesvi/t1/<etiqueta>/<escena>-<calidad>-<camara>.jpg` (las capturas que aprueba René);
 * - `eval/results/e6_t1_<etiqueta>_<calidad>.json` (fps por escena, protocolo de E6: navegador
 *   nuevo por medición, repetición mediana de `--repeticiones`, «Mejor rendimiento» durante la
 *   medición, condiciones del equipo);
 * - `eval/results/t1_capturas.json`: la lista de capturas por etiqueta, con su commit y sus fps.
 *
 * Requisito: `pnpm --filter @croquis/web build`. Uso:
 *   node eval/t1_capturas.mjs --etiqueta antes [--calidad media] [--repeticiones 3] [--sin-fps]
 *                             [--escenas axa,lateral_interseccion,nocturno_lluvia,carambola]
 *                             [--base http://localhost:3200] [--port 3200]
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { useBestPerformance } from "./lib/power-mode.mjs";
import { MEASURE_ARGS, measureViewer, round } from "./lib/viewer-measure.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const require = createRequire(join(WEB, "package.json"));
const { chromium } = require("@playwright/test");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const ETIQUETA = arg("etiqueta", null);
if (!ETIQUETA || !/^[a-z0-9][a-z0-9.-]*$/.test(ETIQUETA)) {
  console.error("Falta --etiqueta (antes, t1.1, t1.2, …), en minúsculas, con puntos o guiones.");
  process.exit(1);
}
const CALIDAD = arg("calidad", "media");
const REPETICIONES = Number(arg("repeticiones", "3"));
const PORT = Number(arg("port", "3200"));
const BASE = arg("base", null);
const CON_FPS = !flag("sin-fps");
/** Solo los fps (las capturas ya están): `--solo-fps`. */
const SOLO_FPS = flag("solo-fps");
/** El instante de las capturas (s): el de R10, poco después del primer impacto. */
export const T_CAPTURA = 0.2;
export const CAMARAS = ["cinematica", "dano"];

/** Las 4 escenas de referencia de T1. `propia` es el spec que se guarda en la pestaña. */
export const ESCENAS_T1 = {
  axa: { propia: "demo/escenas-r11/axa.json", nombre: "AXA, autopista federal de día" },
  lateral_interseccion: { nombre: "Cruce urbano (Toluca centro)" },
  nocturno_lluvia: { nombre: "Noche con lluvia (Tollocan)" },
  carambola: { nombre: "Carambola de R11 (Tollocan, semáforo)" },
  // Escenas extra (no entran por defecto): las clases con modelo nuevo de T1.4.
  flota_a: {
    propia: "eval/escenas/flota-a.json",
    nombre: "Flota T1.4: van y autobús",
    extra: true,
  },
  flota_b: {
    propia: "eval/escenas/flota-b.json",
    nombre: "Flota T1.4: combi y tractocamión",
    extra: true,
  },
};
const POR_DEFECTO = Object.keys(ESCENAS_T1).filter((e) => !ESCENAS_T1[e].extra);
const ESCENAS = arg("escenas", POR_DEFECTO.join(",")).split(",");
for (const e of ESCENAS) {
  if (!ESCENAS_T1[e]) {
    console.error(`Escena desconocida: ${e}. Son: ${Object.keys(ESCENAS_T1).join(", ")}.`);
    process.exit(1);
  }
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim();
  } catch {
    return null;
  }
}

const leerSpec = (ruta) => JSON.parse(readFileSync(join(ROOT, ruta), "utf8"));

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* todavía no */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`El servidor no respondió en ${url}`);
}

/** Abre el visor en una escena y cámara, espera a que todo esté cargado y captura el lienzo. */
async function capturar(browser, base, escena, camara, destino) {
  const def = ESCENAS_T1[escena];
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message.slice(0, 300)));
  if (def.propia) {
    await page.addInitScript(
      (s) => sessionStorage.setItem("croquis:escena-propia", s),
      JSON.stringify(leerSpec(def.propia)),
    );
  }
  const params = new URLSearchParams({
    escena: def.propia ? "propia" : escena,
    calidad: CALIDAD,
    camara,
    t: String(T_CAPTURA),
    pantalla: "completa",
    renderer: "webgpu",
  });
  await page.goto(`${base}/visor?${params.toString()}`);
  const espera = { timeout: 600_000 };
  await page.waitForFunction(() => window.__croquisReady === true, null, espera);
  await page.waitForFunction(() => window.__croquisVehicleModelsReady === true, null, espera);
  // Y a que el grafo con los modelos esté precompilado y en pantalla (T1.1).
  await page.waitForFunction(() => window.__croquisGraphReady !== false, null, espera);
  // Unos cuadros más: los modelos recién llegados rearman la escena y las sombras se asientan
  // (con 1.5 s una captura salió en negro).
  await page.waitForTimeout(3000);
  const backend = await page
    .getByTestId("backend")
    .textContent()
    .catch(() => null);
  // El lienzo (la lluvia y el reloj lo cambian cada cuadro, así que no se espera a que «se
  // estabilice»): se recorta la pantalla a su caja.
  const caja = await page.getByTestId("visor-3d").locator("canvas").first().boundingBox();
  // De noche con lluvia en media, el cuadro tarda: el límite de la captura es generoso.
  await page.screenshot({
    path: destino,
    type: "jpeg",
    quality: 90,
    timeout: 180_000,
    ...(caja ? { clip: caja } : {}),
  });
  await context.close();
  return { backend: backend?.trim() ?? null, errores };
}

function medianRun(list) {
  const sorted = [...list].sort((a, b) => (a.fps_promedio ?? 0) - (b.fps_promedio ?? 0));
  return sorted[Math.floor((sorted.length - 1) / 2)];
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
  const dirCapturas = join(ROOT, "docs", "cesvi", "t1", ETIQUETA);
  mkdirSync(dirCapturas, { recursive: true });
  const commit = gitCommit();
  const launch = () => chromium.launch({ headless: false, args: MEASURE_ARGS });
  let energia = null;
  try {
    await waitForServer(`${base}/visor`, 90_000);
    // Capturas: un navegador para todas (lo que importa es la imagen, no el tiempo).
    const browser = await launch();
    const navegador = browser.version();
    const capturas = [];
    for (const escena of SOLO_FPS ? [] : ESCENAS) {
      for (const camara of CAMARAS) {
        const archivo = join(dirCapturas, `${escena}-${CALIDAD}-${camara}.jpg`);
        log("captura", escena, camara);
        const r = await capturar(browser, base, escena, camara, archivo);
        if (r.errores.length) log("  errores de página:", r.errores.join(" | "));
        capturas.push({
          escena,
          camara,
          archivo: relative(ROOT, archivo).replaceAll("\\", "/"),
          backend: r.backend,
          errores: r.errores,
        });
      }
    }
    await browser.close();

    // fps: protocolo de E6 (navegador nuevo por medición, mediana de las repeticiones).
    let fps = null;
    if (CON_FPS) {
      energia = useBestPerformance();
      const runs = [];
      for (const escena of ESCENAS) {
        const def = ESCENAS_T1[escena];
        const reps = [];
        for (let k = 0; k < REPETICIONES; k++) {
          const fresh = await launch();
          try {
            reps.push(
              await measureViewer(fresh, base, {
                scene: def.propia ? "propia" : escena,
                quality: CALIDAD,
                renderer: "webgpu",
                propia: def.propia ? leerSpec(def.propia) : undefined,
              }),
            );
          } finally {
            await fresh.close();
          }
          await new Promise((r) => setTimeout(r, 8000));
        }
        const r = medianRun(reps);
        r.escena = escena;
        r.repeticiones_fps = reps.map((x) => x.fps_promedio);
        runs.push(r);
        log(
          `fps ${escena}: ${r.backend} ${r.fps_promedio} promedio, ${r.fps_mediana} mediana, p1 ${r.fps_p1_bajo}; ${r.llamadas_dibujo} llamadas, ${r.triangulos} triángulos`,
        );
      }
      const registroEnergia = energia.registro;
      energia.restore();
      energia = null;
      fps = {
        etiqueta: ETIQUETA,
        calidad: CALIDAD,
        commit,
        fecha: new Date().toISOString(),
        protocolo:
          "E6: 1920×1080 a pantalla completa, cámara cinematográfica en movimiento, escena en bucle, GPU real, sin vsync; navegador nuevo por medición; se reporta la repetición mediana por fps promedio.",
        equipo: {
          plataforma: `${os.platform()} ${os.release()}`,
          cpu: os.cpus()[0]?.model ?? null,
          memoria_total_mb: Math.round(os.totalmem() / 1048576),
          energia: registroEnergia,
        },
        navegador,
        repeticiones: REPETICIONES,
        meta_media_fps: 60,
        escenas: runs,
      };
      // Con --escenas se conservan las medidas anteriores de las demás escenas (misma etiqueta).
      const salidaFps = join(ROOT, "eval", "results", `e6_t1_${ETIQUETA}_${CALIDAD}.json`);
      if (existsSync(salidaFps)) {
        const previas = JSON.parse(readFileSync(salidaFps, "utf8")).escenas ?? [];
        const orden = Object.keys(ESCENAS_T1);
        fps.escenas = [
          ...previas.filter((p) => !runs.some((r) => r.escena === p.escena)),
          ...runs,
        ].sort((a, b) => orden.indexOf(a.escena) - orden.indexOf(b.escena));
      }
      fps.cumple_media =
        CALIDAD === "media" ? fps.escenas.every((r) => (r.fps_mediana ?? 0) >= 60) : null;
      writeFileSync(salidaFps, `${JSON.stringify(fps, null, 2)}\n`);
      log("fps en", relative(ROOT, salidaFps));
    }

    // El índice de capturas por etiqueta (se conserva lo de las otras etiquetas).
    const indice = join(ROOT, "eval", "results", "t1_capturas.json");
    const previo = existsSync(indice)
      ? JSON.parse(readFileSync(indice, "utf8"))
      : { etiquetas: {} };
    previo.descripcion =
      "T1 (PLAN-CESVI v3): capturas de las 4 escenas de referencia con la cámara cinematográfica y la del daño, antes y después de cada subtramo, y sus fps (protocolo de E6). René las aprueba a ojo; los fps son de CI manual.";
    previo.escenas = Object.fromEntries(Object.entries(ESCENAS_T1).map(([k, v]) => [k, v.nombre]));
    previo.t_captura_s = T_CAPTURA;
    const anterior = previo.etiquetas[`${ETIQUETA}/${CALIDAD}`];
    previo.etiquetas[`${ETIQUETA}/${CALIDAD}`] = {
      etiqueta: ETIQUETA,
      calidad: CALIDAD,
      fecha: new Date().toISOString(),
      commit,
      navegador,
      // Con --solo-fps o --escenas se conservan las capturas anteriores de las demás escenas.
      capturas: [
        ...(anterior?.capturas ?? []).filter(
          (c) => !capturas.some((n) => n.escena === c.escena && n.camara === c.camara),
        ),
        ...capturas,
      ].sort((a, b) => a.escena.localeCompare(b.escena) || a.camara.localeCompare(b.camara)),
      fps: fps
        ? Object.fromEntries(
            fps.escenas.map((r) => [
              r.escena,
              {
                backend: r.backend,
                fps_promedio: r.fps_promedio,
                fps_mediana: r.fps_mediana,
                fps_p1_bajo: r.fps_p1_bajo,
                llamadas_dibujo: r.llamadas_dibujo,
                triangulos: r.triangulos,
                tiempo_hasta_listo_ms: r.tiempo_hasta_listo_ms,
              },
            ]),
          )
        : null,
      cumple_media: fps?.cumple_media ?? anterior?.cumple_media ?? null,
    };
    // Sin fps en esta corrida (--sin-fps), se conservan los de la etiqueta.
    if (!fps && anterior?.fps) previo.etiquetas[`${ETIQUETA}/${CALIDAD}`].fps = anterior.fps;
    writeFileSync(indice, `${JSON.stringify(previo, null, 2)}\n`);
    log("índice en", relative(ROOT, indice));
    if (fps) {
      const minimo = Math.min(...fps.escenas.map((r) => r.fps_mediana ?? 0));
      log(`fps mediana mínimo entre escenas: ${round(minimo, 1)} (meta en media: 60)`);
    }
  } finally {
    energia?.restore();
    server?.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
