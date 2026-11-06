import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { colocarTodo, irAPaso } from "./ayuda-recorrido";

/**
 * Capturas de la maqueta del caso AXA (Laboratorio §7) de día y de noche, para «Resumen para
 * René». Corre a mano (no lleva @flujo):
 *
 *   pnpm --filter @croquis/web exec playwright test e2e/maqueta-capturas.spec.ts --project=chromium --headed
 */
const SALIDA = resolve(__dirname, "../../../docs/cesvi/rediseno/laboratorio/capturas");

/** sharp se carga al usarse: Playwright importa todos los archivos aunque `--grep` deje este fuera. */
const aWebp = async (png: Buffer, ruta: string) => {
  const sharp = createRequire(require.resolve("next/package.json"))("sharp") as (b: Buffer) => {
    webp(o: { quality: number }): { toFile(p: string): Promise<unknown> };
  };
  await sharp(png).webp({ quality: 82 }).toFile(ruta);
};

for (const [nombre, esquema] of [
  ["dia", "light"],
  ["noche", "dark"],
] as const) {
  test(`maqueta de AXA (${nombre})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const contexto = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: esquema,
      reducedMotion: "reduce",
    });
    const page = await contexto.newPage();
    await page.goto("/cesvi/casos/a2010930");
    await irAPaso(page, 3);
    await colocarTodo(page);
    await irAPaso(page, 4);
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("vista-maqueta").click();
    await expect(page.getByTestId("maqueta")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("maqueta-impacto")).toHaveCount(1);
    await page.waitForTimeout(800);
    mkdirSync(SALIDA, { recursive: true });
    await aWebp(await page.screenshot(), join(SALIDA, `maqueta-${nombre}.webp`));
    await contexto.close();
  });
}
