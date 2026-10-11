import { expect, test } from "@playwright/test";

test("la portada carga en español y muestra la leyenda ilustrativa", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es-MX");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Croquis");
  await expect(page.getByRole("note")).toContainText("No es un peritaje");
});
