/**
 * Capturas de la cámara del conductor (René, 2026-11-04): cada vehículo de cada escena pedida,
 * desde los ojos de su conductor un segundo antes del impacto, en media, 1080p.
 *
 *   node eval/t1_conductor.mjs [--etiqueta conductor] [--escenas alcance,lateral_interseccion]
 *       [--t -1] [--port 3201]
 *     → docs/cesvi/t1/<etiqueta>/<escena>-<vehiculo>.jpg
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
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
const ESCENAS = arg("escenas", "alcance,lateral_interseccion,interseccion_toluca,motociclista").split(",");
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
        const file = join(dir, `${escena}-${rol}.jpg`);
        await pg.screenshot({ path: file, type: "jpeg", quality: 85 });
        console.log(file);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server?.kill();
  }
}

await main();
