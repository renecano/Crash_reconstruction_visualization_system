import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { acercar, irAPaso } from "./ayuda-recorrido";

/**
 * El GIF corto de la colocación rehecha (René, 2026-11-04, B) para «Resumen para René»: el caso de
 * ejemplo, del toque del impacto a «Siguiente», en día. Corre a mano (no lleva @flujo):
 *
 *   pnpm --filter @croquis/web exec playwright test e2e/colocacion-gif.spec.ts --project=chromium --headed
 *
 * Sale `docs/cesvi/rediseno/laboratorio/colocacion.gif`.
 */
const RAIZ = resolve(__dirname, "../../..");
const GRABACION = JSON.parse(
  readFileSync(join(RAIZ, "data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"), "utf8"),
) as { salida: unknown };
const SALIDA = join(RAIZ, "docs/cesvi/rediseno/laboratorio/colocacion.gif");
type Sharp = (
  input: Buffer | Buffer[],
  opts?: { join?: { animated: boolean } },
) => {
  resize(w: number): ReturnType<Sharp>;
  png(): ReturnType<Sharp>;
  toBuffer(): Promise<Buffer>;
  gif(o: { delay: number[]; loop: number; effort: number }): {
    toFile(p: string): Promise<unknown>;
  };
};
/** sharp se carga al usarse: Playwright importa todos los archivos aunque `--grep` deje este fuera. */
const sharp: Sharp = (input, opts) =>
  (createRequire(require.resolve("next/package.json"))("sharp") as Sharp)(input, opts);

test("GIF de la colocación rehecha", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/cesvi/escena", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ metodo: "claude", salida: GRABACION.salida }),
    }),
  );
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await irAPaso(page, 2);
  await page.getByTestId("ejemplo-narracion").click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("vehiculos")).toContainText("V1 · VW Jetta 2002");
  await irAPaso(page, 3);
  await acercar(page);
  const mapa = page.getByTestId("mapa-escena");
  const escenario = page.getByTestId("escenario");
  const cuadros: { png: Buffer; ms: number }[] = [];
  const cuadro = async (ms: number) => {
    await page.waitForTimeout(250);
    cuadros.push({ png: await escenario.screenshot(), ms });
  };

  await cuadro(900);
  // 1. El toque del impacto.
  // Sobre Calle Naranjo (con los mosaicos reales, no los vacíos del e2e del flujo).
  await mapa.click({ position: { x: 283, y: 205 } });
  // Se acerca con la rueda sobre el impacto (se queda en su lugar), para que se vean los vehículos.
  const caja0 = (await mapa.boundingBox())!;
  await page.mouse.move(caja0.x + 283, caja0.y + 205);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(500);
  }
  await cuadro(1400);
  // 2. Por dónde venía cada uno: «Aceptar» V1 y la flecha de V2.
  await page.getByTestId("aceptar-V1").click();
  await cuadro(1100);
  await page.getByTestId("direcciones-V2").locator('[data-propuesta="si"]').click();
  await cuadro(1400);
  // 3. Dónde quedó: se arrastra la pieza fantasma de cada uno.
  const x1 = (await page.locator('[data-posicion="V1:impacto"]').boundingBox())!;
  const arrastrar = async (v: string, dx: number, dy: number) => {
    const pieza = page.getByTestId(`pieza-final:${v}`).locator("div").first();
    const b = (await pieza.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(x1.x + x1.width / 2 + dx, x1.y + x1.height / 2 + dy, { steps: 10 });
    await cuadro(700);
    await page.mouse.up();
    await page.getByTestId("listo-elemento").click();
    await cuadro(1200);
  };
  await arrastrar("V1", 70, -110);
  await arrastrar("V2", 120, -40);
  await expect(page.getByTestId("falta-para-seguir")).toHaveCount(0);
  await cuadro(2200);

  mkdirSync(join(RAIZ, "docs/cesvi/rediseno/laboratorio"), { recursive: true });
  const reducidos = await Promise.all(
    cuadros.map((c) => sharp(c.png).resize(720).png().toBuffer()),
  );
  await sharp(reducidos, { join: { animated: true } })
    .gif({ delay: cuadros.map((c) => c.ms), loop: 0, effort: 7 })
    .toFile(SALIDA);
});
