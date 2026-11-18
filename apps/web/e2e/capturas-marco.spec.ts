import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";

/**
 * Capturas del visor de la reconstrucción, antes y después del marco (René, 2026-11-17): AXA en 3D
 * con el Unity real, en 2D y en 2D sobre el mapa; después, también el desplegable de notas, la
 * pantalla completa y los controles escondidos. No corre en CI (abre Unity).
 *
 *   CROQUIS_URL=http://localhost:3000 CROQUIS_FASE=antes|despues pnpm exec playwright test \
 *     -c playwright.produccion.config.ts e2e/capturas-marco.spec.ts --headed
 *     → docs/cesvi/ronda-3/evidencia/marco/<fase>-*.jpg
 */
const RAIZ = resolve(__dirname, "../../..");
const FASE = process.env.CROQUIS_FASE ?? "despues";
const DIR = join(RAIZ, "docs/cesvi/ronda-3/evidencia/marco");

test.use({ viewport: { width: 1440, height: 900 } });

test("capturas del visor de la reconstrucción", async ({ page }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const foto = (n: string) =>
    page.screenshot({ path: join(DIR, `${FASE}-${n}.jpg`), type: "jpeg", quality: 82 });
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
  });
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 30_000 });
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 180_000 });
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 240_000,
  });
  await page.getByTestId("reproducir-unity").click();
  await page.waitForTimeout(3500);
  await foto("3d");
  if (FASE === "despues") {
    await page.getByTestId("supuestos-y-notas").locator("summary").click();
    await page.waitForTimeout(400);
    await foto("3d-notas-abiertas");
    await page.getByTestId("supuestos-y-notas").locator("summary").click();
    await page.getByTestId("minimapa").click();
    await page.waitForTimeout(800);
    await foto("3d-sin-minimapa");
    await page.getByTestId("minimapa").click();
    await page.getByTestId("pantalla-completa").click();
    await expect(page.getByTestId("marco-vista")).toHaveAttribute("data-completa", "si");
    await page.waitForTimeout(800);
    await foto("3d-pantalla-completa");
    await page.mouse.move(700, 450);
    await page.waitForTimeout(3600);
    await expect(page.getByTestId("marco-vista")).toHaveAttribute("data-controles", "ocultos");
    await foto("3d-pantalla-completa-sin-controles");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("marco-vista")).toHaveAttribute("data-completa", "no");
  }
  await page.getByTestId("vista-maqueta").click();
  await page.waitForTimeout(2500);
  await foto("2d");
  await page.getByTestId("vista-mapa").click();
  await page.waitForTimeout(3500);
  await foto("2d-mapa");
});
