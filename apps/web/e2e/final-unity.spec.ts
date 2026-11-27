import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { colocarComoPerito, conLaEscenaNueva } from "./recetas-perito";

/**
 * La tanda final (René, 2026-11-26), con el Unity real del build nuevo: lo que se valida en la RTX y
 * no en CI. No lleva @flujo: necesita GPU y el build.
 *
 * - **¿Y si…?** en 3D: el crucero con el Jetta 40 km/h más rápido, la hipótesis translúcida encima.
 * - **Daños:** el alcance (la deformación C1–C6 medida), de cerca en los dos vehículos.
 * - **Entorno y satélite:** el alcance en la MEX 57 (carretera, desierto) con el entorno de Unity y
 *   con la foto satelital de piso.
 * - **Presentar** con el Unity real: la carambola.
 *
 * Solo ejemplos públicos: nada de AXA (sus fotos nunca se suben). Capturas en
 * `docs/cesvi/ronda-4/evidencia/final/` y lo medido en `eval/results/final/unity.json`.
 *
 *   CROQUIS_URL=<demo local> pnpm exec playwright test -c playwright.produccion.config.ts e2e/final-unity.spec.ts
 */
const RAIZ = resolve(__dirname, "../../..");
const CAPTURAS = resolve(
  RAIZ,
  process.env.CROQUIS_CAPTURAS ?? "docs/cesvi/ronda-4/evidencia/final",
);
const SALIDA = resolve(RAIZ, process.env.CROQUIS_SALIDA ?? "eval/results/final/unity.json");
const filas: Record<string, unknown>[] = [];

test.use({
  actionTimeout: 20_000,
  viewport: { width: 1920, height: 1080 },
  locale: "es-MX",
  ...(process.env.CROQUIS_CANAL ? { channel: process.env.CROQUIS_CANAL } : {}),
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
  });
  await conLaEscenaNueva(page);
});

test.afterAll(() => {
  mkdirSync(join(SALIDA, ".."), { recursive: true });
  writeFileSync(SALIDA, `${JSON.stringify({ fecha: new Date().toISOString(), filas }, null, 2)}\n`);
});

const foto = async (page: Page, nombre: string) => {
  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: join(CAPTURAS, `${nombre}.jpg`), type: "jpeg", quality: 85 });
};

/** El ejemplo armado como perito y reconstruido; devuelve en cuántos segundos. */
async function reconstruido(page: Page, clave: string) {
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await irAPaso(page, 2);
  await page.locator(`[data-ejemplo="${clave}"]`).click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
  await irAPaso(page, 3);
  const notas: string[] = [];
  expect(await colocarComoPerito(page, clave, notas), notas.join(" ")).toBe(true);
  await irAPaso(page, 4);
  const t0 = Date.now();
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
  return (Date.now() - t0) / 1000;
}

/** El 3D de Unity a la vista y listo; con qué tarjeta corrió. */
async function en3d(page: Page) {
  await page.getByTestId("vista-3d").click();
  const visor = page.getByTestId("visor-unity");
  await expect(visor).toHaveAttribute("data-fase", "listo", { timeout: 240_000 });
  await page.waitForTimeout(3000);
  return page
    .evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
    })
    .catch(() => null);
}

test("¿Y si…? en el 3D: la hipótesis translúcida encima de la reconstrucción", async ({ page }) => {
  test.setTimeout(600_000);
  const s = await reconstruido(page, "crucero-noche");
  await page.getByTestId("abrir-ysi").click();
  const campo = page.getByTestId("ysi-kmh-V1");
  const kmh = Number(await campo.inputValue()) + 40;
  await campo.fill(String(kmh));
  await page.getByTestId("ysi-simular").click();
  await expect(page.getByTestId("ysi-aviso")).toBeVisible({ timeout: 60_000 });
  const gpu = await en3d(page);
  await foto(page, "ysi-3d");
  await page.getByTestId("ysi-ocultar").click();
  await page.waitForTimeout(1500);
  await foto(page, "ysi-3d-sin");
  filas.push({ prueba: "ysi", segundos_reconstruir: s, kmh, gpu });
});

test("daños y entorno: el alcance en la MEX 57, de cerca y con la foto satelital", async ({
  page,
}) => {
  test.setTimeout(600_000);
  const s = await reconstruido(page, "alcance-deformacion");
  const gpu = await en3d(page);
  await foto(page, "entorno-alcance");
  for (const v of ["V1", "V2"]) {
    const menu = page.getByTestId(`camaras-de-${v}`);
    if (await menu.count()) await menu.click();
    const cerca = page.locator('[data-testid^="camara-cerca"]').first();
    if (await cerca.count()) {
      await cerca.click();
      await page.waitForTimeout(2500);
      await foto(page, `danos-alcance-${v}`);
    }
  }
  await page.getByTestId("mapa-real").click();
  const satelital = page.getByTestId("foto-satelital");
  await expect(satelital).toBeVisible({ timeout: 30_000 });
  await satelital.click();
  await page.waitForTimeout(8000);
  await foto(page, "satelite-alcance");
  filas.push({ prueba: "danos-entorno-satelite", segundos_reconstruir: s, gpu });
});

test("Presentar con el Unity real: la carambola", async ({ page }) => {
  test.setTimeout(600_000);
  const s = await reconstruido(page, "carambola-lluvia");
  const gpu = await en3d(page);
  await page.getByTestId("presentar-caso").click();
  await page.waitForTimeout(4000);
  await foto(page, "presentar-1");
  for (let k = 2; k <= 4; k++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(3000);
    await foto(page, `presentar-${k}`);
  }
  filas.push({ prueba: "presentar", segundos_reconstruir: s, gpu });
});
