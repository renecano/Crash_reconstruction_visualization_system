import { expect, test } from "@playwright/test";

// El flujo principal del prototipo para CESVI (docs/cesvi/PROTOTIPO.md): abrir el dictamen
// reproducido, ver los números del reporte junto a los de Croquis y recalcular al cambiar un dato.
test("@flujo /cesvi reproduce el dictamen A2010930 y recalcula con los datos del perito", async ({
  page,
}) => {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto("/cesvi");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("reversa declarada");

  // Tabla de reproducción: 60.27 y 63.15 km/h coinciden; la energía difiere, con su porcentaje.
  const tabla = page.getByTestId("reproduccion");
  await expect(tabla.locator('[data-fila="v3_kmh"]')).toContainText("60.27 km/h");
  await expect(tabla.locator('[data-fila="v3_kmh"]')).toContainText("Coincide");
  await expect(tabla.locator('[data-fila="ebs_kmh_reporte"]')).toContainText("63.15 km/h");
  await expect(tabla.locator('[data-fila="ebs_kmh_reporte"]')).toContainText("Coincide");
  await expect(tabla.locator('[data-fila="energia"]')).toContainText("Difiere");
  await expect(tabla.locator('[data-fila="energia"]')).toContainText("+2.39 %");

  // Con la separación de los restos del dictamen, V3 = 60.27 km/h; con otra, se recalcula.
  const v3 = page.locator("#calculo-2").locator("..").getByTestId("resultado-formula");
  await expect(v3).toHaveText("V3 = 16.74 m/s = 60.27 km/h");
  await page.getByTestId("distancia-restos").fill("10");
  await expect(v3).toHaveText("V3 = 13.28 m/s = 47.81 km/h");

  // El umbral de diferencia significativa lo decide el perito.
  const comparacion = page.getByTestId("comparacion-reporte");
  await page.getByTestId("distancia-restos").fill("15.89");
  await expect(comparacion).toContainText("no significativa");
  await page.getByTestId("umbral").fill("4");
  await expect(comparacion).toContainText("significativa con el umbral de 4 %");
  await expect(comparacion).not.toContainText("no significativa");

  expect(errores).toEqual([]);
});
