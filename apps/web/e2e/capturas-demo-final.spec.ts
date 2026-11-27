import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { colocarComoPerito, conLaEscenaNueva } from "./recetas-perito";

/**
 * Capturas de antes y después para los PR de la demo (2026-11-27), con el Unity real. A mano, nunca
 * en CI. Solo ejemplos (nada de AXA). Antes: contra producción; después: contra `pnpm start`.
 *
 *   CROQUIS_URL=https://croquis-sage.vercel.app CAPTURAS=docs/progress/capturas/demo/antes \
 *     pnpm exec playwright test -c playwright.produccion.config.ts e2e/capturas-demo-final.spec.ts \
 *     -g presentar --headed
 */
const SALIDA = resolve(__dirname, "../../..", process.env.CAPTURAS ?? "docs/progress/capturas/demo");

test.use({ viewport: { width: 1366, height: 768 }, locale: "es-MX" });

async function ejemploEnElTresD(page: Page, ejemplo: string) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
  });
  await conLaEscenaNueva(page);
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await irAPaso(page, 2);
  await page.locator(`[data-ejemplo="${ejemplo}"]`).click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
  await irAPaso(page, 3);
  const notas: string[] = [];
  expect(await colocarComoPerito(page, ejemplo, notas), notas.join(" ")).toBe(true);
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruida")).toBeVisible({ timeout: 240_000 });
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 240_000,
  });
}

test("presentar: el aviso de deformación medida no se encima al encabezado", async ({ page }) => {
  test.setTimeout(900_000);
  mkdirSync(SALIDA, { recursive: true });
  await ejemploEnElTresD(page, "alcance-deformacion");
  await page.screenshot({ path: join(SALIDA, "presentar-0-trabajar.jpg"), quality: 80 });
  await page.getByTestId("modo-presentar").click();
  await expect(page.getByTestId("capitulo-titulo")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(SALIDA, "presentar-1.jpg"), quality: 80 });
});
