import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const raiz = join(__dirname, "../../..");
const leer = <T>(ruta: string) => JSON.parse(readFileSync(join(raiz, ruta), "utf8")) as T;

function errores(page: Page): string[] {
  const out: string[] = [];
  page.on("pageerror", (e) => out.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") out.push(m.text());
  });
  return out;
}

/** La intro se retira cuando la primera toma está lista (o a los 6 s). */
const sinIntro = (page: Page) => expect(page.locator("#intro")).toBeHidden({ timeout: 15_000 });

/**
 * La portada v3 (`docs/cesvi/rediseno/Portada-v3.html`): carga sin errores de consola, con las
 * cifras de `eval/results` (aquí se leen de los mismos archivos, no se escriben), y cada «Entrar a
 * Croquis» (barra, encabezado y cierre) lleva a /cesvi. «Cómo funciona» baja a su sección, la
 * portada para el público queda en /publico con su liga en el pie y, con movimiento reducido, el
 * fondo es solo el póster.
 */
test("@flujo la portada v3 carga sin errores y lleva a /cesvi", async ({ page }) => {
  // Varias cargas de la portada (con su intro) y de /cesvi.
  test.setTimeout(180_000);
  const errs = errores(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es-MX");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Reconstruye el hecho.");
  await sinIntro(page);

  const corpus = leer<{ dictamenes: number }>("eval/results/cesvi_corpus_extraccion.json");
  await page.getByTestId("cifra-0").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("cifra-0")).toHaveText(String(corpus.dictamenes), {
    timeout: 10_000,
  });
  const tabla = page.getByTestId("tabla-axa");
  await expect(tabla).toContainText("Alcance");
  await expect(tabla).toContainText("60.27");

  // «Cómo funciona» baja a su sección.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("#hecho").getByRole("link", { name: "Cómo funciona" }).click();
  await expect
    .poll(() => page.locator("#metodo").evaluate((el) => el.getBoundingClientRect().top), {
      timeout: 10_000,
    })
    .toBeLessThan(200);

  const entrar = page.getByTestId("entrar");
  await expect(entrar).toHaveCount(3);
  for (const k of [0, 1, 2]) {
    await page.goto("/");
    await sinIntro(page);
    await expect(entrar.nth(k)).toContainText("Entrar a Croquis");
    await entrar.nth(k).click();
    await expect(page).toHaveURL(/\/cesvi$/);
    await expect(page.getByTestId("lista-casos")).toBeVisible();
  }
  expect(errs).toEqual([]);

  // En inglés.
  await page.goto("/en");
  await sinIntro(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Reconstruct the crash.");
  await page.getByTestId("entrar").nth(1).click();
  await expect(page).toHaveURL(/\/cesvi$/);

  // La portada de antes, para el público, desde el pie.
  await page.goto("/");
  await sinIntro(page);
  await page.getByRole("link", { name: "Portada anterior" }).click();
  await expect(page).toHaveURL(/\/publico$/);
  await expect(page.getByTestId("cta-publico")).toHaveText("Cuenta qué pasó");

  // Movimiento reducido: sin video, solo el póster de la primera toma.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await sinIntro(page);
  const video = page.locator("#vA");
  await expect(video).toHaveAttribute("poster", "/portada/toma-1.jpg");
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentSrc)).toBe("");
});
