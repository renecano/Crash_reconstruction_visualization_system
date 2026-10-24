import { expect, test, type Page } from "@playwright/test";
import { simularApi } from "./api-simulada";

/**
 * Capturas visuales del diseño (criterio de F11a): cada capítulo de la portada y cada paso del
 * flujo guiado, en escritorio y en celular (proyecto `movil`). Como las demás referencias, se
 * generan y comparan en Linux (CI), donde el render por software es el mismo cada vez.
 *
 * Lo que cambia de una corrida a otra se tapa: el relato que se escribe en vivo y el visor del
 * paso «Simula», que corre su propio reloj.
 */
test.skip(process.platform !== "linux", "Las referencias visuales se generan y comparan en Linux");
test.setTimeout(240_000);

const CAPITULOS = [
  "apertura",
  "problema",
  "c",
  "r",
  "o",
  "q",
  "u",
  "i",
  "s",
  "pruebas",
  "noes",
  "cierre",
] as const;

const COMPARAR = { maxDiffPixelRatio: 0.02, timeout: 30_000 };

async function copiaCompleta(page: Page, c: string) {
  await expect
    .poll(
      () =>
        page
          .locator(`section[data-capitulo="${c}"] .pagina`)
          .evaluate((el) => Number(getComputedStyle(el).opacity)),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0.99);
}

test("portada: cada capítulo", async ({ page }) => {
  await page.goto("/publico");
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 180_000 });
  for (const [i, c] of CAPITULOS.entries()) {
    await page.evaluate((p) => window.scrollTo(0, p * window.innerHeight * 1.5), i + 0.5);
    await expect(page.getByTestId("portada")).toHaveAttribute("data-capitulo", c);
    await copiaCompleta(page, c);
    if (c === "s") await expect(page.getByText(/hipótesis de A a \d+ km\/h/)).toBeVisible();
    // La cámara se asienta (suavizado) y la escena dibuja el cuadro de ese instante.
    await page.waitForTimeout(2500);
    await expect(page).toHaveScreenshot(`portada-${c}.png`, {
      ...COMPARAR,
      mask: [page.getByTestId("relato-en-vivo")],
    });
  }
});

test("portada con movimiento reducido: apertura", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/publico");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("portada-reducido-apertura.png", COMPARAR);
  await ctx.close();
});

test("flujo guiado: cada paso", async ({ page }) => {
  await simularApi(page);
  await page.goto("/cuenta");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("flujo-cuenta-vacio.png", { ...COMPARAR, fullPage: true });
  await page
    .getByTestId("relato")
    .fill(
      "Iba por la glorieta, un auto se me cerró y le pegué en la defensa. El piso estaba mojado.",
    );
  await expect(page).toHaveScreenshot("flujo-cuenta.png", { ...COMPARAR, fullPage: true });
  await page.getByRole("button", { name: "Leer mi relato" }).click();
  await expect(page.getByTestId("hechos")).toBeVisible();
  await expect(page).toHaveScreenshot("flujo-falta.png", { ...COMPARAR, fullPage: true });
  await page.getByTestId("abrir-croquis").click();
  await expect(page.getByTestId("croquis-flujo")).toBeVisible();
  await expect(page).toHaveScreenshot("flujo-ubica.png", { ...COMPARAR, fullPage: true });
  await page.getByRole("button", { name: "Ver tu reconstrucción" }).click();
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 180_000 });
  await expect(page).toHaveScreenshot("flujo-simula.png", {
    ...COMPARAR,
    fullPage: true,
    mask: [page.getByTestId("visor-3d"), page.getByTestId("lecturas"), page.getByTestId("traza")],
  });
});
