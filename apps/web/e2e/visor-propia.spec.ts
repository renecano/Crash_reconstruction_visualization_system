import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Escena propia (F9): la escena del relato o del croquis se reconstruye en el navegador con el
 * solver TS en un Web Worker, primero para dibujar y luego con Monte Carlo, inversión y
 * consistencia para los paneles.
 */
const SPEC = readFileSync(
  join(process.cwd(), "../../packages/scene-schema/fixtures/lateral_interseccion.json"),
  "utf-8",
);

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 90_000 });
}

test.describe("escena propia en el visor 3D", () => {
  test.describe.configure({ timeout: 180_000 });

  test("sin escena guardada explica cómo crearla", async ({ page }) => {
    await page.goto("/visor?escena=propia");
    await expect(page.getByTestId("sin-escena-propia")).toContainText("No hay una escena propia");
  });

  test("se reconstruye en el navegador y llegan la inversión y la consistencia", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((spec) => {
      sessionStorage.setItem("croquis:escena-propia", spec);
    }, SPEC);
    await page.goto("/visor?escena=propia&t=0&calidad=baja&renderer=webgl");
    await waitReady(page);
    await expect(page.getByTestId("visor-3d").locator("canvas")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Escena" })).toHaveValue("propia");
    await expect(page.getByRole("table", { name: "Vehículos", exact: true })).toBeVisible();
    // El resultado completo llega después del dibujo y reemplaza al aviso de cálculo.
    await expect(page.getByTestId("evidencia")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("calculo-completo")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("del croquis al visor con «Ver en 3D»", async ({ page }) => {
    await page.goto("/croquis");
    await page.getByTestId("ver-3d").click();
    await expect(page).toHaveURL(/\/visor\?escena=propia/);
    await waitReady(page);
    await expect(page.getByTestId("visor-3d").locator("canvas")).toBeVisible();
  });
});
