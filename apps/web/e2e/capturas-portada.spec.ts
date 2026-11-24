import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { colocar, RECETAS } from "./recetas-ejemplos";

/**
 * Las capturas de la app que usa la portada (René, 2026-11-24): una narración de ejemplo de la app
 * (inventada, sin AXA ni reportes de CESVI; con su lectura guardada, no llama a Claude), de día y de
 * noche, en la demo local con el Unity real. No lleva @flujo y no corre en CI. Con `CROQUIS_CAPTURAS`,
 * `playwright.recorrido.config.ts` corre solo este archivo:
 *
 *   bash tools/demo-local/demo-local.sh --solo-preparar && pnpm --filter @croquis/web exec next start
 *   CROQUIS_CAPTURAS=<carpeta> CROQUIS_EJEMPLO=<clave> pnpm --filter @croquis/web exec playwright test \
 *     --config playwright.recorrido.config.ts --headed
 *   node apps/web/scripts/portada-capturas.mjs …   (las reduce a AVIF; una carpeta por ejemplo)
 */
const SALIDA = process.env.CROQUIS_CAPTURAS ?? "capturas-portada";
const CLAVE = process.env.CROQUIS_EJEMPLO ?? "poste-terraceria";

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const quieta = async (page: Page, ms = 3000) => {
  await page.waitForTimeout(ms);
  await expect(page.getByTestId("maqueta-calculando")).toHaveCount(0, { timeout: 120_000 });
};

for (const tema of ["claro", "oscuro"] as const)
  test(`el recorrido (${tema})`, async ({ page }) => {
    test.setTimeout(1_200_000);
    const dir = join(SALIDA, tema);
    mkdirSync(dir, { recursive: true });
    const foto = async (nombre: string) => {
      for (const b of await page.locator('button[aria-label="Cerrar el mensaje"]:visible').all())
        await b.click();
      writeFileSync(join(dir, `${nombre}.png`), await page.screenshot());
    };
    await page.emulateMedia({ colorScheme: tema === "claro" ? "light" : "dark" });
    await page.addInitScript((t) => {
      (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
      localStorage.setItem("croquis.cesvi.tema.trabajar", t);
      localStorage.setItem("croquis.cesvi.tema.presentar", t);
      localStorage.setItem("croquis.escena", "anterior");
    }, tema);
    await page.goto("/cesvi?calidad=alta");
    await page.getByTestId("ir-caso-nuevo").click();
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    await irAPaso(page, 2);
    await page.locator(`[data-ejemplo="${CLAVE}"]`).click();
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
    await quieta(page);
    await page.evaluate(() =>
      document.querySelectorAll("*").forEach((e) => {
        if (e.scrollTop) e.scrollTop = 0;
      }),
    );
    await page.waitForTimeout(800);
    await foto("1-hecho");
    await irAPaso(page, 3);
    const receta = RECETAS.find((r) => r.clave === CLAVE)!;
    expect(await colocar(page, receta, [])).toBe(true);
    await quieta(page);
    // Sin la tarjeta «¡La escena está lista!», que tapa el mapa.
    await page
      .getByTestId("cambiar-algo")
      .click({ timeout: 5000 })
      .catch(() => undefined);
    await page.waitForTimeout(1500);
    await foto("2-escena");
    await page.getByTestId("avance-ver-reconstruccion").click();
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
    await quieta(page, 4000);
    await foto("3-reconstruccion-2d");
    await page.getByTestId("vista-3d").first().click();
    await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
      timeout: 300_000,
    });
    await page.waitForTimeout(5000);
    const minimapa = page.getByRole("button", { name: "Ocultar minimapa" });
    if (await minimapa.isVisible().catch(() => false)) await minimapa.click();
    await page.getByTestId("ir-al-impacto-unity").click();
    await page.waitForTimeout(3500);
    await foto("3-reconstruccion");
    await irAPaso(page, 5);
    await quieta(page);
    await foto("4-versiones");
    const probar = page.getByTestId("acto-versiones").getByRole("button", { name: /^Probar$/ });
    if (await probar.isEnabled().catch(() => false)) {
      await probar.click();
      await quieta(page, 15_000);
      await foto("4-versiones-hipotesis");
    }
    await irAPaso(page, 6);
    await quieta(page);
    await foto("5-analisis");
    await irAPaso(page, 7);
    await quieta(page);
    await foto("5-analisis-numeros");
    await irAPaso(page, 9);
    await quieta(page, 9000);
    await foto("6-dictamen");
    await page.getByTestId("modo-presentar").click();
    await expect(page.getByTestId("presentar-caso")).toBeVisible({ timeout: 60_000 });
    await quieta(page, 7000);
    await foto("7-presentar-1");
    await page.keyboard.press("ArrowRight");
    await quieta(page, 6000);
    await foto("7-presentar-2");
  });
