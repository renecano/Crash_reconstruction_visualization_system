import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";

/**
 * Capturas antes y después del bloque B de la ronda 4 (René, 2026-11-18), en el ejemplo «Carambola de
 * noche con lluvia» (Monterrey):
 * - B5, «Buscar el lugar»: la misma búsqueda de una calle de San Luis Potosí; antes saltaba al primer
 *   resultado, después muestra opciones con municipio y estado.
 * - B6, los nombres de las calles al alejar el mapa de La escena (6 y 8 niveles con «Alejar»).
 * Busca en Nominatim de verdad (dos búsquedas). No corre en CI.
 *
 *   CROQUIS_URL=<sitio> CROQUIS_FASE=antes|despues pnpm exec playwright test \
 *     -c playwright.produccion.config.ts e2e/capturas-ronda4-b.spec.ts
 *     → docs/cesvi/ronda-4/evidencia/b/<fase>-*.jpg
 */
const RAIZ = resolve(__dirname, "../../..");
const FASE = process.env.CROQUIS_FASE ?? "despues";
const DIR = join(RAIZ, "docs/cesvi/ronda-4/evidencia/b");

test.use({ viewport: { width: 1440, height: 900 } });

test("capturas del bloque B: buscar el lugar y los nombres de las calles", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const foto = (n: string) =>
    page.screenshot({ path: join(DIR, `${FASE}-${n}.jpg`), type: "jpeg", quality: 82 });
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible();
  await irAPaso(page, 2);
  await page.locator('[data-ejemplo="carambola-lluvia"]').click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
  await irAPaso(page, 3);
  const buscar = page.getByTestId("escena-buscar");
  await expect(buscar).toBeVisible({ timeout: 60_000 });
  // El mapa ya en el lugar narrado (la búsqueda automática).
  await page.waitForTimeout(6000);

  // B6: los nombres al alejar, con el botón «Alejar» (un nivel por clic): 6 y 8 niveles.
  for (const [n, clics] of [
    ["b6-zoom-medio", 6],
    ["b6-zoom-lejos", 2],
  ] as const) {
    for (let k = 0; k < clics; k++) {
      await page.getByTestId("alejar").click();
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(4000);
    await foto(n);
  }

  // B5: una calle de San Luis Potosí desde un caso de Monterrey.
  await buscar.fill("Avenida Venustiano Carranza, San Luis Potosí, San Luis Potosí");
  await buscar.press("Enter");
  await expect(page.getByText("Buscando…")).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(3000);
  await foto("b5-buscar-lugar");
});
