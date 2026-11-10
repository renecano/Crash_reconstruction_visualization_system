import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { colocarTodo, irAPaso } from "./ayuda-recorrido";

/**
 * W4b, «Menos ruido visual» (René, 2026-11-09): cada pantalla del caso de AXA, de día y de noche y
 * de página completa, antes y después de plegar lo que un perito no lee a primera vista. Corre a
 * mano (no lleva @flujo):
 *
 *   CAPTURAS_W4B=antes pnpm --filter @croquis/web exec playwright test e2e/capturas-w4b.spec.ts --project=chromium
 *
 * Salen en `docs/cesvi/w4b/<antes|despues>/`.
 */
const RAIZ = resolve(__dirname, "../../..");
const DIR = join(RAIZ, "docs/cesvi/w4b", process.env.CAPTURAS_W4B ?? "despues");
type Sharp = (input: Buffer) => {
  webp(o: { quality: number }): { toBuffer(): Promise<Buffer> };
};
const sharp: Sharp = (input) =>
  (createRequire(require.resolve("next/package.json"))("sharp") as Sharp)(input);

test.use({ reducedMotion: "reduce" });

for (const tema of ["claro", "oscuro"] as const) {
  test(`@capturas W4b: pantallas del caso de AXA (${tema})`, async ({ page }) => {
    test.setTimeout(400_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: tema === "claro" ? "light" : "dark" });
    mkdirSync(DIR, { recursive: true });
    const captura = async (nombre: string) => {
      await page.waitForTimeout(1200);
      writeFileSync(
        join(DIR, `${tema}-${nombre}.webp`),
        await sharp(await page.screenshot({ fullPage: true }))
          .webp({ quality: 82 })
          .toBuffer(),
      );
    };
    await page.goto("/cesvi");
    await captura("0-casos");
    await page.goto("/cesvi/casos/a2010930");
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    if ((await page.getByTestId("recorrido-caso").getAttribute("data-modo")) === "presentar")
      await page.getByTestId("modo-trabajar").click();
    await irAPaso(page, 2);
    await captura("1-hecho");
    await irAPaso(page, 3);
    await colocarTodo(page);
    await captura("2-escena");
    await irAPaso(page, 4);
    const reconstruir = page.getByTestId("reconstruir");
    if (await reconstruir.isVisible()) await reconstruir.click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
    await captura("3-reconstruccion");
    await irAPaso(page, 5);
    await captura("4-analisis");
    await irAPaso(page, 7);
    await captura("5-contraste");
    await irAPaso(page, 8);
    await captura("6-dictamen");
  });
}
