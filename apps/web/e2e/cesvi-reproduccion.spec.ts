import { expect, test } from "@playwright/test";

/**
 * «Reproducción de dictámenes» (R4): la lista de los casos de la prueba congelada que Croquis
 * reconstruye, y un caso con lo que concluyó CESVI y lo que obtuvo Croquis, en 2D y 3D.
 */
test("@flujo /cesvi/reproduccion: un reporte de CESVI y la reconstrucción de Croquis, lado a lado", async ({
  page,
}) => {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto("/cesvi/reproduccion");
  await expect(page.getByTestId("resumen-r4")).toContainText("Línea base");
  const filas = page.getByTestId("casos-r4").locator("[data-caso]");
  await expect(filas.first()).toBeVisible();
  expect(await filas.count()).toBeGreaterThan(10);
  // La modalidad contra las dos referencias (ADR 0071) y el filtro de la lista (R9).
  await expect(page.getByTestId("modalidad-titulo")).toContainText("Contra el título del reporte");
  await expect(page.getByTestId("modalidad-r0")).toContainText("etiqueta de las conclusiones");
  await expect(page.getByTestId("seccion-reproduccion")).toHaveAttribute("aria-current", "page");
  const total = (await page.getByTestId("cuantos-casos").textContent())!;
  await page.getByTestId("filtro-coincide").selectOption("no_coincide");
  await expect(page.getByTestId("cuantos-casos")).not.toHaveText(total);
  await page.getByTestId("filtro-coincide").selectOption("");
  await expect(page.getByTestId("cuantos-casos")).toHaveText(total);

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
