import { expect, test } from "@playwright/test";

/**
 * «Reproducción de dictámenes» (R4): la lista de los casos de la prueba congelada que Croquis
 * reconstruye, y un caso con lo que concluyó CESVI y lo que obtuvo Croquis, en 2D y 3D.
 */
test("@flujo /cesvi/reproduccion: un dictamen de CESVI y la reconstrucción de Croquis, lado a lado", async ({
  page,
}) => {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto("/cesvi/reproduccion");
  await expect(page.getByTestId("resumen-r4")).toContainText("Línea base");
  const filas = page.getByTestId("casos-r4").locator("[data-caso]");
  await expect(filas.first()).toBeVisible();
  expect(await filas.count()).toBeGreaterThan(10);

  // El primer caso: los dos lados y la reconstrucción en 2D y 3D.
  await filas.first().getByRole("link").click();
  await expect(page.getByTestId("lado-cesvi")).toContainText("Lo que concluyó CESVI");
  await expect(page.getByTestId("lado-croquis")).toContainText("Lo que obtuvo Croquis");
  await expect(page.getByTestId("modalidad-croquis")).toBeVisible();
  await page.getByTestId("reconstruir-r4").click();
  await expect(page.getByTestId("croquis-2d-r4").locator("svg").first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("visor-r4").locator("canvas").first()).toBeVisible({
    timeout: 60_000,
  });
  expect(errores).toEqual([]);
});
