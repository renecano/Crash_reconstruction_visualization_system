import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./base";
import { contestarC1, irAPaso, mapaFacil } from "./ayuda-recorrido";

/**
 * Ronda 4 (René, 2026-11-18): el 2D de Reconstrucción, para rediseñarlo como el croquis de un perito.
 * AXA y cesvi-cf708e9fed (el Periférico a la altura de Viaducto; la escena se arma con lo que propone
 * Croquis: el choque al centro, la flecha propuesta y «quedó junto al choque»). Con y sin el mapa de
 * fondo. Sale a internet (mapa y calles). No corre en CI.
 *
 *   CROQUIS_CAPTURAS=<prefijo> CROQUIS_CROQUIS=<n> pnpm exec playwright test \
 *     e2e/capturas-ronda4-2d.spec.ts --project=chromium
 *     → docs/cesvi/ronda-4/evidencia/2d/<prefijo>-*.jpg
 */
const DIR = resolve(__dirname, "../../../docs/cesvi/ronda-4/evidencia/2d");
const PREFIJO = process.env.CROQUIS_CAPTURAS ?? "antes";
const VARIANTE = process.env.CROQUIS_CROQUIS ? `?croquis=${process.env.CROQUIS_CROQUIS}` : "";

test.use({ viewport: { width: 1440, height: 900 } });

async function fotos(page: Page, caso: string) {
  mkdirSync(DIR, { recursive: true });
  const foto = (n: string) =>
    page.screenshot({ path: join(DIR, `${PREFIJO}-${caso}-${n}.jpg`), type: "jpeg", quality: 82 });
  await page.getByTestId("vista-maqueta").click();
  // Al reposo: ahí se ven las posiciones finales.
  await page
    .getByRole("button", { name: "Ver todo", exact: true })
    .first()
    .click({ timeout: 3000 })
    .catch(() => undefined);
  await page.waitForTimeout(3000);
  // Con fondo (variantes 1 y 3), a que el mapa o la foto ya estén dibujados.
  if (/croquis=[13]/.test(VARIANTE))
    await page
      .getByTestId("maqueta-fondo")
      .waitFor({ timeout: 40_000 })
      .catch(() => undefined);
  await foto("1-2d");
  const mapa = page.getByTestId("vista-mapa");
  if ((await mapa.getAttribute("aria-checked")) !== "true") await mapa.click();
  await page.waitForTimeout(6000);
  await foto("2-2d-con-mapa");
}

test("2D de AXA", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(`/cesvi/casos/a2010930/reconstruccion${VARIANTE}`);
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("modo-trabajar").click();
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  await fotos(page, "axa");
});

test("2D de cf708", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(`/cesvi/casos/reporte/cesvi-cf708e9fed/escena${VARIANTE}`);
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("modo-trabajar").click();
  await page.getByRole("textbox").first().fill("19.4085338, -99.1944592");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const m = await mapaFacil(page);
  await page.waitForTimeout(6000);
  const caja = (await m.boundingBox())!;
  await m.click({ position: { x: caja.width * 0.5, y: caja.height * 0.5 } });
  await page.waitForTimeout(4000);
  await page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]').first().click();
  await page.getByTestId("final-junto").click();
  await page.getByTestId("listo-final").click();
  await contestarC1(page);
  await expect(page.getByTestId("escena-lista")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("avance-ver-reconstruccion").click();
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  await fotos(page, "cf708");
});
