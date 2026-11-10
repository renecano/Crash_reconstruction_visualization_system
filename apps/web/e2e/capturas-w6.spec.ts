import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { colocarTodo, irAPaso } from "./ayuda-recorrido";

/**
 * W6, encuadre en 2D (O3): la maqueta del caso de AXA con «Ver todo», «Ir al impacto», la rueda y
 * el arrastre, la escala gráfica y el norte. Se corre a mano (no lleva @flujo):
 *
 *   pnpm --filter @croquis/web exec playwright test e2e/capturas-w6.spec.ts --project=chromium
 *
 * Salen en `docs/cesvi/w6/`.
 */
const DIR = resolve(__dirname, "../../../docs/cesvi/w6");
type Sharp = (input: Buffer) => { webp(o: { quality: number }): { toBuffer(): Promise<Buffer> } };
const sharp: Sharp = (input) =>
  (createRequire(require.resolve("next/package.json"))("sharp") as Sharp)(input);

test.use({ reducedMotion: "reduce" });

const vista = async (page: Page) =>
  ((await page.getByTestId("maqueta").getAttribute("data-vista")) ?? "").split(" ").map(Number);

test("@capturas W6: el encuadre de la maqueta en el caso de AXA", async ({ page }) => {
  test.setTimeout(400_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  mkdirSync(DIR, { recursive: true });
  const captura = async (nombre: string) => {
    await page.waitForTimeout(900);
    writeFileSync(
      join(DIR, `${nombre}.webp`),
      await sharp(await page.screenshot())
        .webp({ quality: 82 })
        .toBuffer(),
    );
  };
  await page.goto("/cesvi/casos/a2010930");
  await expect(page.getByTestId("recorrido-caso")).toBeVisible();
  if ((await page.getByTestId("recorrido-caso").getAttribute("data-modo")) === "presentar")
    await page.getByTestId("modo-trabajar").click();
  await irAPaso(page, 3);
  await colocarTodo(page);
  await irAPaso(page, 4);
  const reconstruir = page.getByTestId("reconstruir");
  if (await reconstruir.isVisible()) await reconstruir.click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  const maqueta = page.getByTestId("maqueta-navegable");
  await expect(maqueta).toBeVisible({ timeout: 60_000 });

  // Abre con «Ver todo».
  const todo = await vista(page);
  await captura("1-ver-todo");

  // «Ir al impacto»: más cerca.
  await page.getByTestId("maqueta-ir-impacto").click();
  const impacto = await vista(page);
  expect(impacto[2]! - impacto[0]!).toBeLessThan(todo[2]! - todo[0]!);
  await captura("2-ir-al-impacto");

  // La rueda acerca alrededor del puntero; arrastrar desplaza.
  const caja = (await maqueta.boundingBox())!;
  await page.mouse.move(caja.x + caja.width * 0.45, caja.y + caja.height * 0.5);
  for (let k = 0; k < 4; k++) await page.mouse.wheel(0, -240);
  const cerca = await vista(page);
  expect(cerca[2]! - cerca[0]!).toBeLessThan(impacto[2]! - impacto[0]!);
  await captura("3-rueda-acerca");
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width * 0.25, caja.y + caja.height * 0.4, { steps: 8 });
  await page.mouse.up();
  const movida = await vista(page);
  expect(movida[0]).not.toBeCloseTo(cerca[0]!, 1);
  // `data-vista` va al decímetro: el ancho se compara a esa precisión.
  expect(Math.abs(movida[2]! - movida[0]! - (cerca[2]! - cerca[0]!))).toBeLessThan(0.21);
  await captura("4-arrastre");

  // «Ver todo» regresa.
  await page.getByTestId("maqueta-ver-todo").click();
  expect(await vista(page)).toEqual(todo);

  // En Análisis, la vista cenital también se navega; en Contra CESVI, el lado a lado.
  await irAPaso(page, 7);
  await expect(page.getByTestId("maqueta-navegable").first()).toBeVisible({ timeout: 60_000 });
  await captura("5-contra-cesvi");
});
