import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Cargar un dictamen (R5): el PDF del caso A2010930 (redactado; se genera aquí con Chromium a partir
 * del texto), su texto sacado con pdf.js en el navegador, las dos lecturas grabadas de Claude (CI no
 * llama a la API) y el expediente en «Caso nuevo», con la verificación CESVI y lo que concluyó CESVI.
 */
const DIR = join(__dirname, "../../../data/cesvi/grabaciones/importar");
const TEXTO = readFileSync(join(DIR, "dictamen-a2010930.md"), "utf8");
const LECTURAS = JSON.parse(readFileSync(join(DIR, "lecturas-a2010930.json"), "utf8")) as {
  corpus: unknown;
  narracion: unknown;
};

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

test("@flujo /cesvi/importar: de un reporte de CESVI en PDF al expediente, listo para reconstruir", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
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
  await page.route("**/api/cesvi/importar", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ metodo: "claude", ...LECTURAS }),
    }),
  );

  // El PDF del dictamen, como lo imprimiría un navegador.
  const imprenta = await context.newPage();
  await imprenta.setContent(
    `<pre style="white-space: pre-wrap; font: 11px sans-serif">${escapar(TEXTO)}</pre>`,
  );
  const pdf = await imprenta.pdf({ format: "Letter" });
  await imprenta.close();

  await page.goto("/cesvi/importar");
  await page.getByTestId("archivo-dictamen").setInputFiles({
    name: "dictamen-a2010930.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  const texto = page.getByTestId("texto-dictamen");
  await expect(texto).toContainText("páginas", { timeout: 30_000 });
  await expect(texto).toContainText("DICTAMEN TÉCNICO");

  await page.getByTestId("leer-dictamen").click();
  await expect(page.getByTestId("resumen-importado")).toContainText("2 vehículos");
  await expect(page.getByTestId("vehiculos")).toContainText("Silverado");
  // La verificación CESVI con las medidas del dictamen reproduce la EBS de la Tacoma (C1).
  await expect(page.getByTestId("verificacion-cesvi")).toContainText("63.90 km/h");
  // Lo que concluyó CESVI, para comparar.
  const cesvi = page.getByTestId("conclusiones-cesvi");
  await expect(cesvi).toContainText("alcance");
  await expect(page.getByTestId("velocidades-cesvi")).toContainText("63.15 km/h");

  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("velocidades")).toBeVisible({ timeout: 60_000 });
  expect(errores).toEqual([]);
});
