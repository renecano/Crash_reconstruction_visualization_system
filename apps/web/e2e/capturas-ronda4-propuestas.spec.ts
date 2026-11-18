import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "./base";

/**
 * Ronda 4, punto 8: capturas de las tres propuestas de «versiones del caso» (el prototipo de
 * `/cesvi/propuestas/hipotesis`), con la declaración y con la hipótesis. No corre en CI.
 *
 *   CROQUIS_URL=http://localhost:3000 pnpm exec playwright test -c playwright.produccion.config.ts \
 *     e2e/capturas-ronda4-propuestas.spec.ts → docs/cesvi/ronda-4/evidencia/hipotesis/propuesta-*.jpg
 */
const DIR = join(resolve(__dirname, "../../.."), "docs/cesvi/ronda-4/evidencia/hipotesis");

test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

test("las tres propuestas, en capturas", async ({ page }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  for (const p of ["1", "2", "3"])
    for (const v of ["declaracion", "hipotesis"]) {
      await page.goto(`/cesvi/propuestas/hipotesis?p=${p}&v=${v}`);
      await expect(page.getByTestId("propuesta-hipotesis")).toHaveAttribute("data-listo", "si", {
        timeout: 180_000,
      });
      await expect(page.getByTestId("maqueta-calculando")).toHaveCount(0, { timeout: 60_000 });
      await page.waitForTimeout(2500);
      await page.screenshot({
        path: join(DIR, `propuesta-${p}-${v}.jpg`),
        type: "jpeg",
        quality: 84,
      });
    }
  expect(errores).toEqual([]);
});
