import { expect, test, type Page } from "@playwright/test";

/**
 * Sin red externa en la prueba: un estilo de mapa vacío en lugar de OpenFreeMap y una vía recta de
 * sur a norte en lugar de Overpass (`/api/osm`), alrededor del punto que se marca.
 */
async function sinRedExterna(page: Page) {
  await page.route("https://tiles.openfreemap.org/**", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [{ id: "fondo", type: "background", paint: { "background-color": "#111" } }],
      }),
    }),
  );
  await page.route("**/api/osm?**", (r) => {
    const u = new URL(r.request().url());
    const lat = Number(u.searchParams.get("lat"));
    const lon = Number(u.searchParams.get("lon"));
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        elements: [
          { type: "node", id: 1, lat: lat - 0.002, lon },
          { type: "node", id: 2, lat: lat + 0.002, lon },
          { type: "way", id: 10, nodes: [1, 2], tags: { highway: "trunk", ref: "MEX 15" } },
        ],
      }),
    });
  });
}

// El flujo principal del prototipo para CESVI (docs/cesvi/PROTOTIPO.md): abrir el dictamen
// reproducido, ver los números del reporte junto a los de Croquis, recalcular con los datos del
// perito y medir la zona de restos en el croquis sobre el mapa de cada versión.
test("@flujo /cesvi reproduce el dictamen A2010930, mide sobre el mapa y exporta el dictamen", async ({
  page,
}) => {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await sinRedExterna(page);
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

  // El croquis sobre el mapa: el perito marca el impacto y Croquis propone las dos versiones.
  await page.getByTestId("coordenadas").fill("25.79, -108.99");
  await page.getByRole("button", { name: "Marcar el impacto" }).click();
  await expect(page.getByTestId("version-evidencia")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Vía más cercana en OSM: MEX 15")).toBeVisible();
  // Evidencia: los restos van del impacto a la posición final de A (15.89 m del dictamen).
  await expect(page.getByTestId("restos-mapa")).toContainText("De R1 a R2: 15.89 m");
  await page.getByTestId("usar-restos").click();
  await expect(page.getByText("D, separación de los restos (medida por el perito)")).toBeVisible();
  await expect(v3).toHaveText("V3 = 16.74 m/s = 60.27 km/h");
  // Declarada: sin desplazamiento después del impacto, no hay separación de restos.
  await page.getByTestId("version-declarada").click();
  await expect(page.getByTestId("restos-mapa")).toContainText("De R1 a R2: 0.00 m");
  await page.getByTestId("usar-restos").click();
  await expect(v3).toHaveText("V3 = 0.00 m/s = 0.00 km/h");

  // Correspondencia y dictamen: con los datos del dictamen, la versión declarada no se sostiene.
  await page.getByRole("button", { name: "Volver a los datos del dictamen" }).click();
  await expect(page.getByTestId("sugerencia")).toContainText("no se sostiene");
  await page.getByTestId("criterio-A-direccion").selectOption("corresponde");
  await page.getByTestId("perito").fill("Perito de prueba");
  await page.getByTestId("aceptar").click();
  await expect(page.getByTestId("validacion")).toContainText(
    "Perito de prueba aceptó la sugerencia",
  );

  // Borrador de las consideraciones (sin llamar a la API en la prueba): avisa de cifras ajenas.
  await page.route("**/api/cesvi/consideraciones", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        texto:
          "1. Se analizará la declaración del conductor.\n\n2. La velocidad de impacto es de 63.15 km/h y la batea mide 2.40 m.",
        numerosNoReconocidos: ["2.40"],
      }),
    }),
  );
  await page.getByTestId("pedir-borrador").click();
  await expect(page.getByTestId("texto-borrador")).toHaveValue(/63\.15 km\/h/);
  await expect(page.getByTestId("numeros-no-reconocidos")).toContainText("2.40");

  // El dictamen en PDF, validado (sin la marca de borrador en el nombre).
  const descarga = page.waitForEvent("download");
  await page.getByTestId("exportar-pdf").click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe("dictamen-A2010930.pdf");
  const ruta = await archivo.path();
  const { readFileSync } = await import("node:fs");
  expect(readFileSync(ruta).subarray(0, 5).toString()).toBe("%PDF-");

  expect(errores).toEqual([]);
});
