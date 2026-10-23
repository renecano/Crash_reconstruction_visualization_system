import { readFileSync } from "node:fs";
import { join } from "node:path";
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
 * Cargar un reporte (R5): el PDF del caso A2010930 (redactado; se genera aquí con Chromium a partir
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

test("@flujo /cesvi: cargar un reporte de CESVI en PDF y abrirlo en el recorrido", async ({
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

  // El PDF del reporte, como lo imprimiría un navegador.
  const imprenta = await context.newPage();
  await imprenta.setContent(
    `<pre style="white-space: pre-wrap; font: 11px sans-serif">${escapar(TEXTO)}</pre>`,
  );
  const pdf = await imprenta.pdf({ format: "Letter" });
  await imprenta.close();

  // Desde la lista de casos (ADR 0079): «Cargar un reporte» abre el recorrido en el paso 1.
  await page.goto("/cesvi");
  await page.getByTestId("ir-importar").click();
  await expect(page.getByTestId("recorrido-caso")).toHaveAttribute("data-origen", "importado");
  await page.getByTestId("archivo-dictamen").setInputFiles({
    name: "dictamen-a2010930.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  const texto = page.getByTestId("texto-dictamen");
  await expect(texto).toContainText("páginas", { timeout: 30_000 });
  await expect(texto).toContainText("DICTAMEN TÉCNICO");

  // Leído el reporte, el caso sigue en el recorrido: el hecho con lo que leyó Croquis.
  await page.getByTestId("leer-dictamen").click();
  await expect(page.getByTestId("panel-paso")).toHaveAttribute("data-paso", "2");
  await expect(page.getByTestId("escena")).toContainText("2 vehículos");
  await expect(page.getByTestId("vehiculos")).toContainText("Silverado");

  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("velocidades")).toBeVisible({ timeout: 60_000 });
  // La verificación CESVI con las medidas del reporte reproduce la EBS de la Tacoma (C1).
  await irAPaso(page, 6);
  await expect(page.getByTestId("verificacion-cesvi")).toContainText("63.90 km/h");
  // Con reporte hay paso «Croquis contra el reporte de CESVI»: lo que concluyó CESVI, eje por eje.
  await irAPaso(page, 7);
  await expect(page.getByTestId("eje-modalidad")).toContainText("Alcance");
  await expect(page.getByTestId("conclusiones-cesvi")).toContainText("Alcance");
  await expect(page.getByTestId("velocidades-cesvi")).toContainText("63.15 km/h");
  await expect(page.getByTestId("velocidades-contra")).toContainText("%");
  expect(errores).toEqual([]);
});
