// Exporta del visor, en calidad alta y con los modelos de R10, las escenas que renderiza el botón
// de la computadora de la demo (`demo/escenas-r11/*.glb`, ADR 0087):
//
// - carambola: la escena canónica;
// - axa: `demo/escenas-r11/axa.json` (de `tools/demo/escena-axa.mts`) como escena propia, con la
//   leyenda de CESVI (`leyenda=cesvi`).
//
// Necesita el sitio corriendo (por omisión, el servidor local) y Playwright de apps/web:
//
//   cd apps/web && node ../../tools/demo/exportar-escenas.mjs [http://localhost:3000]
//
// La ventana es pequeña: sin tarjeta de video cada cuadro se dibuja por software.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "../..");
// Playwright está en apps/web: se resuelve desde ahí, no desde esta carpeta.
const { chromium } = createRequire(join(raiz, "apps/web/package.json"))("@playwright/test");

const base = process.argv[2] ?? "http://localhost:3000";
const dir = join(raiz, "demo/escenas-r11");
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function exportar(browser, ruta, archivo, escenaPropia) {
  const p = await browser.newPage({ viewport: { width: 520, height: 360 }, acceptDownloads: true });
  p.on("pageerror", (e) => log("ERROR", e.message.slice(0, 300)));
  if (escenaPropia)
    await p.addInitScript((s) => sessionStorage.setItem("croquis:escena-propia", s), escenaPropia);
  await p.goto(`${base}${ruta}`);
  await p.waitForFunction(() => window.__croquisReady === true, null, { timeout: 600_000 });
  await p.waitForFunction(() => window.__croquisVehicleModelsReady === true, null, {
    timeout: 900_000,
  });
  const [d] = await Promise.all([
    p.waitForEvent("download", { timeout: 1_800_000 }),
    p.getByTestId("export-glb").click({ timeout: 900_000 }),
  ]);
  await d.saveAs(join(dir, archivo));
  log("exportado", archivo);
  await p.close();
}

const browser = await chromium.launch();
try {
  await exportar(
    browser,
    "/visor?escena=carambola&calidad=alta&renderer=webgl&t=0",
    "carambola.glb",
  );
  await exportar(
    browser,
    "/visor?escena=propia&calidad=alta&renderer=webgl&t=0&leyenda=cesvi",
    "axa.glb",
    readFileSync(join(dir, "axa.json"), "utf8"),
  );
} finally {
  await browser.close();
}
