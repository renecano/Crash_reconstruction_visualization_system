import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/** La respuesta grabada de Claude para la declaración del dictamen (CI no llama a la API). */
const GRABACION = readFileSync(
  join(__dirname, "../../../data/cesvi/grabaciones/declaracion-A2010930.ndjson"),
  "utf8",
);

/**
 * Sin red externa: un estilo de mapa vacío en lugar de OpenFreeMap, una vía recta de sur a norte en
 * lugar de Overpass, Nominatim simulado, la extracción grabada y un borrador simulado.
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
  await page.route("https://nominatim.openstreetmap.org/**", (r) => {
    const q = new URL(r.request().url()).searchParams.get("q") ?? "";
    const p = q.startsWith("Navojoa")
      ? { lat: "27.07", lon: "-109.44" }
      : { lat: "25.79", lon: "-108.99" };
    return r.fulfill({ contentType: "application/json", body: JSON.stringify([p]) });
  });
  await page.route("**/api/osm?**", (r) => {
    const u = new URL(r.request().url());
    const lat = Number(u.searchParams.get("lat"));
    const lon = Number(u.searchParams.get("lon"));
    return r.fulfill({
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
  await page.route("**/api/relato/extraer", (r) =>
    r.fulfill({ contentType: "application/x-ndjson; charset=utf-8", body: GRABACION }),
  );
  await page.route("**/api/cesvi/consideraciones", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        texto:
          "1. Se analizará la declaración del conductor.\n\n2. La velocidad de impacto es de 63.15 km/h.",
        numerosNoReconocidos: ["2.40"],
      }),
    }),
  );
}

// El recorrido del perito (docs/cesvi/PROTOTIPO.md): los ocho pasos, de la declaración al dictamen.
test("@flujo /cesvi: el recorrido del perito, del caso al dictamen en PDF", async ({ page }) => {
  test.setTimeout(90_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await sinRedExterna(page);
  await page.goto("/cesvi");
  const frase = page.getByTestId("frase");

  // 1. El caso.
  await expect(frase).toContainText("Siniestro A2010930 de AXA");
  await expect(page.getByTestId("declaracion")).toContainText("reversie unos metros");

  // 2. La narración y lo que entiende la IA (con el teclado).
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("paso-2")).toHaveAttribute("aria-current", "step");
  const datos = page.getByTestId("datos-entendidos");
  await expect(datos).toContainText("reversa");
  await expect(datos).toContainText("IA");
  await expect(datos).toContainText("B impacta a A");
  await expect(
    page.getByTestId("texto-subrayado").locator('mark[data-dato="maniobra_a"]'),
  ).toHaveText(/reversie unos metros/);
  await expect(page.getByText("¿Cuántos metros de reversa?")).toBeVisible();
  await page.getByTestId("respuesta-reversa").fill("4");
  await expect(datos).toContainText("4 m");

  // 3. El lugar: el perito marca el punto de impacto.
  await page.getByTestId("siguiente").click();
  await page.getByTestId("coordenadas").fill("25.79, -108.99");
  await page.getByRole("button", { name: "Marcar el impacto" }).click();
  await expect(page.getByText("Punto de impacto marcado")).toBeVisible();

  // 4. Las dos versiones y la zona de restos.
  await page.getByTestId("siguiente").click();
  await expect(page.getByTestId("version-declarada")).toHaveAttribute("aria-pressed", "true");
  await expect(frase).toContainText("A retrocede 4 m");
  await expect(page.getByTestId("restos-mapa").locator("[data-valor]")).toHaveAttribute(
    "data-valor",
    "0.00",
  );
  await page.getByTestId("version-evidencia").click();
  await expect(page.getByTestId("restos-mapa").locator("[data-valor]")).toHaveAttribute(
    "data-valor",
    "15.89",
  );

  // 5. Los daños: dónde están contra dónde estarían.
  await page.getByTestId("siguiente").click();
  await expect(page.getByTestId("silueta-real-A")).toHaveAttribute(
    "aria-label",
    /posterior izquierda/,
  );
  await expect(page.getByTestId("silueta-declarada-A")).toHaveAttribute(
    "aria-label",
    /posterior central/,
  );

  // 6. Los números, y el cálculo completo en «Ver cálculo».
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("numero-impacto")).toHaveAttribute("data-valor", "63.15");
  await expect(page.getByTestId("numero-desplazamiento")).toHaveAttribute("data-valor", "60.27");
  await expect(page.getByTestId("conclusion-numeros")).toContainText(
    "Sin diferencia significativa",
  );
  await page.getByTestId("ver-detalle").click();
  const panel = page.getByTestId("panel-detalle");
  await expect(panel.getByText("V3 = 16.74 m/s = 60.27 km/h")).toBeVisible();
  await expect(panel.locator('[data-fila="energia"]')).toContainText("+2.39 %");
  await page.keyboard.press("Escape");

  // 7. La sugerencia, validada por el perito.
  await page.getByTestId("siguiente").click();
  await expect(page.getByTestId("sugerencia")).toContainText("no se sostiene");
  await page.getByTestId("perito").fill("Perito de prueba");
  await page.getByTestId("aceptar").click();
  await expect(page.getByTestId("validacion")).toContainText("Perito de prueba aceptó");

  // 8. El dictamen: vista previa, borrador de consideraciones y descarga.
  await page.getByTestId("siguiente").click();
  await expect(page.getByTestId("vista-previa")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("ver-detalle").click();
  await page.getByTestId("pedir-borrador").click();
  await expect(page.getByTestId("estado-borrador")).toContainText("2.40");
  await page.keyboard.press("Escape");
  const descarga = page.waitForEvent("download");
  await page.getByTestId("descargar-pdf").click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe("dictamen-A2010930.pdf");
  expect(
    readFileSync(await archivo.path())
      .subarray(0, 5)
      .toString(),
  ).toBe("%PDF-");

  expect(errores).toEqual([]);
});
