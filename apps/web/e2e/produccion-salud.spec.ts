import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";

/**
 * La salud de producción antes de publicar (René, 2026-11-26): AXA da su cifra del índice, el 3D de
 * Unity abre y Presentar funciona. El build de Unity sale de la copia local de su huella (`base.ts`,
 * `sin-blob.ts`): ninguna prueba lo baja de Blob. Solo AXA; sus capturas no se suben.
 *
 *   CROQUIS_URL=https://croquis-sage.vercel.app pnpm exec playwright test -c playwright.produccion.config.ts \
 *     e2e/produccion-salud.spec.ts --headed
 */
const RAIZ = resolve(__dirname, "../../..");
const CAPTURAS = resolve(
  RAIZ,
  process.env.CROQUIS_CAPTURAS ?? "trailer-salida/_revision/produccion-salud",
);

test.use({ actionTimeout: 20_000, viewport: { width: 1440, height: 900 }, locale: "es-MX" });

test("producción: AXA da su cifra, el 3D abre y Presentar funciona", async ({ page }) => {
  test.setTimeout(900_000);
  mkdirSync(CAPTURAS, { recursive: true });
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
  });
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible();
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  const cifra = page.getByTestId("cifra-reconstruccion");
  await expect(cifra).toBeVisible({ timeout: 240_000 });
  const texto = async () => ((await cifra.textContent()) ?? "").replace(/\s+/g, " ").trim();
  await expect
    .poll(
      async () => {
        const a = await texto();
        await page.waitForTimeout(700);
        return a === (await texto());
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const t = await texto();
  expect(t, "AXA: la cifra del índice").toMatch(/57\s*km\/h/);
  expect(t, "AXA: el rango del índice").toMatch(/55\s*–\s*78/);

  await page.getByTestId("vista-3d").click();
  const visor = page.getByTestId("visor-unity");
  await expect(visor).toHaveAttribute("data-fase", "listo", { timeout: 300_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(CAPTURAS, "axa-3d.jpg"), type: "jpeg", quality: 80 });

  await page.getByTestId("modo-presentar").click();
  await expect(page.getByTestId("presentar-caso")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-testid="visor-caso"][data-presentar="si"]')).toHaveCount(1);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(CAPTURAS, "axa-presentar.jpg"), type: "jpeg", quality: 80 });
  await page.keyboard.press("Escape");
  expect(errores, "errores de la página").toEqual([]);
});
