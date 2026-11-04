/**
 * Capturas de la cámara del conductor (René, 2026-11-04): cada vehículo de cada escena pedida,
 * desde los ojos de su conductor un segundo antes del impacto, en media, 1080p.
 *
 *   node eval/t1_conductor.mjs [--etiqueta conductor] [--escenas alcance,lateral_interseccion|todas]
 *       [--t -1] [--port 3201]
 *     → docs/cesvi/t1/<etiqueta>/<escena>-<vehiculo>.jpg
 *       y eval/results/t1_conductor.json: fracción de la pantalla en negro por captura (René,
 *       2026-11-04: ninguna vista de conductor con más del 35 % en negro), sin la franja de la
 *       leyenda ni el panel de lecturas.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MEASURE_ARGS } from "./lib/viewer-measure.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const require = createRequire(join(WEB, "package.json"));
const { chromium } = require("@playwright/test");
const { loadResultado } = await import(
  `file://${join(ROOT, "packages", "scene-schema", "src", "index.ts").replace(/\\/g, "/")}`
).catch(() => ({ loadResultado: null }));

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const ETIQUETA = arg("etiqueta", "conductor");
const TODAS = [
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
  "carambola",
  "reversa",
];
const escenasArg = arg("escenas", "alcance,lateral_interseccion,interseccion_toluca,motociclista");
const ESCENAS = escenasArg === "todas" ? TODAS : escenasArg.split(",");
const NEGRO_MAX = 0.35;
const SALIDA = join(ROOT, "eval", "results", "t1_conductor.json");
// `sharp` llega con Next (no es dependencia directa de la app).
const sharp = createRequire(require.resolve("next/package.json"))("sharp");

/** Fracción de píxeles casi negros (los tres canales < 28) fuera del panel y de la leyenda. */
async function blackFraction(buf) {
  const img = sharp(buf);
  const meta = await img.metadata();
  const top = 110;
  const bottom = 80;
  const { data, info } = await img
    .extract({ left: 0, top, width: meta.width, height: meta.height - top - bottom })
    .resize(192, 100, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let black = 0;
  const n = info.width * info.height;
  for (let i = 0; i < n; i++) {
    const r = data[i * info.channels];
    const g = data[i * info.channels + 1];
    const b = data[i * info.channels + 2];
    if (r < 28 && g < 28 && b < 28) black += 1;
  }
  return black / n;
}
const T = arg("t", "-1");
const PORT = Number(arg("port", "3201"));
const BASE = arg("base", null);

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

async function main() {
  const base = BASE ?? `http://localhost:${PORT}`;
  const server = BASE
    ? null
    : spawn(
        process.execPath,
        [join(WEB, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)],
        { cwd: WEB, stdio: "ignore" },
      );
  const dir = join(ROOT, "docs", "cesvi", "t1", ETIQUETA);
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ headless: false, args: MEASURE_ARGS });
  const capturas = [];
  try {
    await waitForServer(`${base}/visor`, 90_000);
    for (const escena of ESCENAS) {
      // Los vehículos de la escena, leídos del visor mismo (los ids están en el selector de cámara).
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await context.newPage();
      await page.goto(`${base}/visor?escena=${escena}&calidad=media&t=${T}`);
      await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 180_000 });
      const ids = await page.evaluate(() =>
        [...document.querySelectorAll("button")]
          .map((b) => b.textContent ?? "")
          .filter((t) => /^(Conductor|Driver) /.test(t))
          .map((t) => t.replace(/^(Conductor|Driver) /, "")),
      );
      const vehiculos = await page.evaluate(() =>
        [...document.querySelectorAll("[data-vehiculo-id]")].map((e) =>
          e.getAttribute("data-vehiculo-id"),
        ),
      );
      await context.close();
      const roles = ids.length ? ids : ["A", "B"];
      void vehiculos;
      for (const rol of roles) {
        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const pg = await ctx.newPage();
        const params = new URLSearchParams({
          escena,
          calidad: "media",
          t: T,
          pantalla: "completa",
          camara: `conductor-veh-${rol.toLowerCase()}`,
          // Backend fijo: con «auto» la prueba de backend volvía a crear el lienzo justo al
          // capturar (una captura salía negra).
          renderer: "webgl",
        });
        await pg.goto(`${base}/visor?${params.toString()}`);
        await pg.waitForFunction(() => window.__croquisReady === true, null, { timeout: 180_000 });
        await pg.waitForFunction(
          () =>
            (window.__croquisVehicleModelsReady ?? true) && window.__croquisGraphReady !== false,
          null,
          { timeout: 300_000 },
        );
        await pg.waitForTimeout(1500);
        await pg.waitForFunction(() => window.__croquisReady === true, null, { timeout: 60_000 });
        const file = join(dir, `${escena}-${rol}.jpg`);
        const buf = await pg.screenshot({ path: file, type: "jpeg", quality: 85 });
        const negro = await blackFraction(buf);
        capturas.push({
          escena,
          vehiculo: rol,
          archivo: file
            .slice(ROOT.length + 1)
            .split("\\")
            .join("/"),
          negro: Math.round(negro * 1000) / 1000,
          cumple: negro <= NEGRO_MAX,
        });
        console.log(`${file} negro=${(negro * 100).toFixed(1)} %`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server?.kill();
  }
  const previo = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, "utf8")) : {};
  // Las capturas de corridas anteriores de la misma etiqueta se conservan (se corre por tandas);
  // una escena repetida reemplaza su entrada.
  const anteriores = (previo[ETIQUETA]?.capturas ?? []).filter(
    (a) => !capturas.some((c) => c.escena === a.escena && c.vehiculo === a.vehiculo),
  );
  capturas.unshift(...anteriores);
  let commit = null;
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    /* sin git */
  }
  const salida = {
    ...previo,
    name: "t1_conductor",
    descripcion:
      "Cámara del conductor en las escenas canónicas (t = −1 s, media, 1080p): fracción de la pantalla en negro (canales < 28, sin el panel de lecturas ni la leyenda); meta ≤ 35 % (René, 2026-11-04).",
    [ETIQUETA]: {
      generated_at: new Date().toISOString(),
      git_commit: commit,
      t: Number(T),
      negro_max: NEGRO_MAX,
      cumple: capturas.every((c) => c.cumple),
      peor: capturas.reduce((m, c) => (m === null || c.negro > m.negro ? c : m), null),
      capturas,
    },
  };
  writeFileSync(SALIDA, JSON.stringify(salida, null, 1) + "\n");
  console.log(
    SALIDA,
    "cumple:",
    salida[ETIQUETA].cumple,
    "peor:",
    JSON.stringify(salida[ETIQUETA].peor),
  );
}

await main();
