/**
 * Imágenes de la página de historia (`public/historia/`): capturas del visor en la escena de
 * Toluca (vía de OpenStreetMap) en calidad alta, con la GPU real y la leyenda dentro del cuadro.
 *
 * Uso: con el sitio corriendo (`pnpm --filter @croquis/web build` y `start`),
 * `node scripts/capturas-historia.mjs [--base http://localhost:3000]`.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../public/historia");
const i = process.argv.indexOf("--base");
const BASE = i >= 0 ? process.argv[i + 1] : "http://localhost:3000";

const SHOTS = [
  { file: "toluca-cruce.jpg", query: "escena=interseccion_toluca&t=4&camara=libre&calidad=alta" },
  { file: "toluca-dano.jpg", query: "escena=interseccion_toluca&t=1.5&camara=dano&calidad=alta" },
];

mkdirSync(OUT, { recursive: true });
// Con interfaz y GPU real, como E6: el render por software se ve oscuro y sin detalle.
const browser = await chromium.launch({ headless: false, args: ["--use-angle=default"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  for (const s of SHOTS) {
    await page.goto(`${BASE}/visor?${s.query}`);
    await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
    await page.waitForTimeout(2500);
    const path = resolve(OUT, s.file);
    await page.getByTestId("visor-3d").screenshot({ path, type: "jpeg", quality: 85 });
    console.log(path);
  }
} finally {
  await browser.close();
}
