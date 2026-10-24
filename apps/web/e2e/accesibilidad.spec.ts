import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { simularApi } from "./api-simulada";

/**
 * Accesibilidad (PLAN §11.6, criterio de F11a): axe sin problemas serios ni críticos (WCAG 2.2 A y
 * AA) en cada página, en los dos idiomas, y en cada paso del flujo guiado. Corre en escritorio y
 * en celular.
 */
async function sinProblemasSerios(page: Page, donde: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serios = r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(serios, `${donde}:\n${serios.join("\n")}`).toEqual([]);
}

const PAGINAS = [
  "/",
  "/publico",
  "/en",
  "/cuenta",
  "/en/cuenta",
  "/demo",
  "/en/demo",
  "/recorrido",
  "/en/recorrido",
  "/historia",
  "/en/historia",
  "/croquis",
  "/en/croquis",
  "/e9",
  "/en/e9",
  "/medicion",
  "/en/medicion",
];

test.describe("accesibilidad", () => {
  test.setTimeout(180_000);

  for (const ruta of PAGINAS) {
    test(`axe: ${ruta}`, async ({ page }) => {
      await page.goto(ruta);
      await page.waitForLoadState("networkidle");
      await sinProblemasSerios(page, ruta);
    });
  }

  test("axe: el visor con una escena", async ({ page }) => {
    await page.goto("/visor?escena=interseccion_toluca");
    await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
    await sinProblemasSerios(page, "/visor");
  });

  test("axe: la portada a la mitad de cada capítulo", async ({ page }) => {
    await page.goto("/publico");
    for (let i = 0; i < 12; i++) {
      await page.evaluate((p) => window.scrollTo(0, p * window.innerHeight * 1.5), i + 0.5);
      await page.waitForTimeout(1500);
      await sinProblemasSerios(page, `portada, capítulo ${i + 1}`);
    }
  });

  test("axe: la demo con un relato elegido", async ({ page }) => {
    await page.goto("/demo");
    await page.getByTestId("demo-caso-rmx-d001").click();
    await sinProblemasSerios(page, "/demo con relato");
  });

  test("axe: cada paso del flujo guiado", async ({ page }) => {
    await simularApi(page);
    await page.goto("/cuenta");
    await page.getByTestId("relato").fill("Iba por la glorieta y un auto se me cerró y le pegué.");
    await sinProblemasSerios(page, "paso Cuenta con texto");
    await page.getByRole("button", { name: "Leer mi relato" }).click();
    await expect(page.getByTestId("hechos")).toBeVisible();
    await sinProblemasSerios(page, "paso ¿Qué falta?");
    // Con la pregunta pendiente, el botón es «Seguir sin contestar».
    await page.getByTestId("abrir-croquis").click();
    await expect(page.getByTestId("croquis-flujo")).toBeVisible();
    await sinProblemasSerios(page, "paso Ubica");
    await page.getByRole("button", { name: "Ver tu reconstrucción" }).click();
    await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
    await sinProblemasSerios(page, "paso Simula");
  });
});
