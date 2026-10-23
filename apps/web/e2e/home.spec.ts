import { expect, test } from "@playwright/test";

test("la portada carga en español y muestra la leyenda ilustrativa", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es-MX");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Croquis");
  await expect(page.getByRole("note")).toContainText("No es un peritaje");
});

/**
 * La entrada de los peritos (V2, ADR 0083): el botón principal de la portada y el de la barra
 * llevan a la lista de casos; «Cuenta qué pasó» queda como secundario.
 */
test("@flujo desde la portada, «Entrar a Croquis» llega a la lista de casos", async ({ page }) => {
  await page.goto("/");
  const entrar = page.getByTestId("cta-apertura");
  await expect(entrar).toHaveText("Entrar a Croquis");
  await expect(entrar).toHaveClass(/boton-principal/);
  await expect(page.getByTestId("cta-publico")).toHaveText("Cuenta qué pasó");
  await expect(page.getByTestId("nav-entrar")).toHaveText("Entrar a Croquis");
  await entrar.click();
  await expect(page).toHaveURL(/\/cesvi$/);
  await expect(page.getByTestId("lista-casos")).toBeVisible();

  // También desde la barra, y en inglés.
  await page.goto("/en");
  await expect(page.getByTestId("cta-apertura")).toHaveText("Enter Croquis");
  await page.getByTestId("nav-entrar").click();
  await expect(page).toHaveURL(/\/cesvi$/);
  await expect(page.getByTestId("lista-casos")).toBeVisible();
});
