import { expect, test, type Page } from "@playwright/test";

/** Lleva el recorrido al paso n (1 a 8 del recorrido completo) con «Siguiente» y «Anterior». */
async function irAPaso(page: Page, n: number) {
  const panel = page.getByTestId("panel-paso");
  for (let k = 0; k < 10; k++) {
    const actual = Number(await panel.getAttribute("data-paso"));
    if (actual === n) return;
    await page.getByTestId(actual < n ? "siguiente" : "anterior").click();
  }
  await expect(panel).toHaveAttribute("data-paso", String(n));
}

/**
 * «Reproducción de dictámenes» (R4): la lista de los casos de la prueba congelada que Croquis
 * reconstruye, y un caso con lo que concluyó CESVI y lo que obtuvo Croquis, en 2D y 3D.
 */
test("@flujo /cesvi/reproduccion: la evidencia, y cada reporte abre su caso en el recorrido", async ({
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

  // Cada reporte abre su caso en el recorrido (ADR 0079): se reconstruye, se ve en 3D y se compara
  // con lo que concluyó CESVI.
  await filas.first().getByRole("link").click();
  await expect(page.getByTestId("recorrido-caso")).toHaveAttribute("data-origen", "reporte");
  await expect(page.getByTestId("caso-con-reporte")).toBeVisible();
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("velocidades")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("ver-3d").click();
  await expect(page.getByTestId("visor-caso").locator("canvas").first()).toBeVisible({
    timeout: 60_000,
  });
  await irAPaso(page, 7);
  await expect(page.getByTestId("eje-modalidad")).toContainText("CESVI");
  await expect(page.getByTestId("conclusiones-cesvi")).toBeVisible();

  // Las rutas viejas llevan a las nuevas.
  await page.goto("/cesvi/caso");
  await expect(page).toHaveURL(/\/cesvi\/casos\/nuevo$/);
  await page.goto("/cesvi/importar");
  await expect(page).toHaveURL(/\/cesvi\/casos\/importar$/);
  expect(errores).toEqual([]);
});
