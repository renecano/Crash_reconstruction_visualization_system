import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";

test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

/**
 * El 2D de Reconstrucción como croquis de perito (ronda 4, propuesta 2 elegida por René): AXA
 * reconstruido, el croquis con A1…B3 y el impacto, sus referencias plegables fuera del dibujo, el
 * color por velocidad opcional y «Ver todo».
 */
test("@flujo /cesvi: el croquis pericial del 2D de Reconstrucción", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => localStorage.setItem("croquis.2d", "pericial"));
  await page.route("https://tiles.openfreemap.org/**", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [{ id: "fondo", type: "background", paint: { "background-color": "#eee" } }],
      }),
    }),
  );
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 30_000 });
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("vista-maqueta").click();
  const croquis = page.getByTestId("croquis-pericial");
  await expect(croquis).toBeVisible({ timeout: 60_000 });
  for (const e of ["A1", "A2", "A3", "B1", "B2", "B3", "Impacto"])
    await expect(croquis.locator(`[data-etiqueta="${e}"]`)).toHaveCount(1);
  // Las referencias, plegadas y fuera del dibujo.
  const referencias = page.getByTestId("croquis-referencias");
  await expect(referencias).not.toHaveAttribute("open", "");
  await referencias.locator("summary").click();
  await expect(referencias).toContainText("A1, A2, A3");
  // El color por velocidad, opcional.
  await expect(croquis.locator("svg line[stroke^='rgb(']")).toHaveCount(0);
  await page.getByTestId("croquis-color").click();
  await expect.poll(() => croquis.locator("svg line[stroke^='rgb(']").count()).toBeGreaterThan(5);
});
