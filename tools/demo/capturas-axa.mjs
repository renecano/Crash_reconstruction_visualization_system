/**
 * Capturas de AXA A2010930 para un antes y después (Tanda 3 de la auditoría del 2026-11-15): la
 * Reconstrucción con sus hipótesis y Contra CESVI, a 1440 px, con las cifras que se leen en pantalla.
 *
 *   node tools/demo/capturas-axa.mjs <etiqueta> [url base]
 *     → docs/cesvi/t3/<etiqueta>/*.png y cifras.json
 *
 * Sin url base va contra producción. No llama a ninguna ruta de `/api` (AXA viene con su lectura).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = createRequire(join(RAIZ, "apps/web/package.json"))("@playwright/test");
const etiqueta = process.argv[2] ?? "antes";
const BASE = (process.argv[3] ?? "https://croquis-sage.vercel.app").replace(/\/$/, "");
const DIR = join(RAIZ, "docs/cesvi/t3", etiqueta);
mkdirSync(DIR, { recursive: true });

const navegador = await chromium.launch();
const cifras = { etiqueta, base: BASE, fecha: new Date().toISOString() };
try {
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await contexto.newPage();
  const texto = async (id) => {
    const n = page.getByTestId(id);
    return (await n.count()) ? (await n.first().innerText({ timeout: 5000 })).trim() : null;
  };
  const paso = async () => Number(await page.getByTestId("panel-paso").getAttribute("data-paso"));
  // Avanza un paso a la vez hasta `n` (como `irAPaso` de las e2e).
  const irA = async (n) => {
    for (let k = 0; k < 12 && (await paso()) !== n; k++) {
      const actual = await paso();
      const facil = page.getByTestId("avance-ver-reconstruccion");
      if (actual === 3 && (await facil.count()) && (await facil.isVisible())) await facil.click();
      else await page.getByTestId(actual < n ? "siguiente" : "anterior").click();
      await page.waitForTimeout(700);
    }
    if ((await paso()) !== n) throw new Error(`No llegué al paso ${n} (estoy en ${await paso()})`);
  };

  await page.goto(`${BASE}/cesvi`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForTimeout(2500);
  await page.getByTestId("ir-axa").click();
  await page.getByTestId("recorrido-caso").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);

  // La reconstrucción: la cifra, su rango y las hipótesis.
  await irA(3);
  await page.getByTestId("escena-lista").waitFor({ timeout: 60_000 });
  await irA(4);
  await page.getByTestId("reconstruir").click();
  await page.getByTestId("cifra-reconstruida").waitFor({ timeout: 240_000 });
  await page.getByTestId("panel-paso").getByTestId("hipotesis").waitFor({ timeout: 240_000 });
  await page.waitForTimeout(4000);
  cifras.reconstruccion = {
    cifra: await texto("cifra-reconstruida"),
    rango: await texto("cifra-rango"),
    mediana: await texto("fila-mediana"),
    hipotesis: await texto("hipotesis"),
  };
  await page.screenshot({ path: join(DIR, "reconstruccion.png") });
  const hip = page.getByTestId("panel-paso").getByTestId("hipotesis");
  await hip.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await hip.screenshot({ path: join(DIR, "hipotesis.png") });

  // Contra CESVI: las dos lecturas.
  await irA(7);
  await page.getByTestId("lectura-cesvi").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2500);
  cifras.contra_cesvi = {
    metodo_croquis: await texto("cifra-contra-croquis"),
    metodo_cesvi: await texto("cifra-contra-cesvi"),
    metodo_kmh: await texto("cifra-contra-kmh"),
    metodo_pct: await texto("cifra-contra-pct"),
    fisica_croquis: await texto("fisica-croquis"),
    fisica_rango: await texto("fisica-rango"),
    fisica_kmh: await texto("fisica-kmh"),
    fisica_pct: await texto("fisica-pct"),
  };
  await page.screenshot({ path: join(DIR, "contra-cesvi.png"), fullPage: true });
  await contexto.close();
} finally {
  await navegador.close();
}
writeFileSync(join(DIR, "cifras.json"), `${JSON.stringify(cifras, null, 2)}\n`);
console.log(JSON.stringify(cifras, null, 1));
