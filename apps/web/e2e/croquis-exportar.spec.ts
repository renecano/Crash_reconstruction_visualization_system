import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { pngSize, readPngText } from "../../../packages/viewer/src/export/png";

/**
 * Croquis exportado (F9, PLAN §7.7 y §7.9): SVG, PNG y PDF. Cada archivo descargado se abre y se
 * verifica que lleve la marca de reconstrucción ilustrativa, la semilla y la atribución del mapa.
 */
const LEGEND = "Reconstrucción ilustrativa generada a partir de un relato. No es un peritaje.";

async function download(page: Page, fmt: "svg" | "png" | "pdf"): Promise<Buffer> {
  const [d] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId(`croquis-${fmt}`).click(),
  ]);
  expect(d.suggestedFilename()).toMatch(new RegExp(`^croquis-[a-z0-9-]+\\.${fmt}$`));
  return readFileSync(await d.path());
}

/** Texto de todas las páginas y metadatos del PDF, con pdf.js (Mozilla). */
async function pdfText(bytes: Buffer): Promise<{ text: string; subject: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false })
    .promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += `${content.items.map((it) => ("str" in it ? it.str : "")).join(" ")}\n`;
  }
  const meta = await doc.getMetadata();
  const info = meta.info as { Subject?: string };
  return { text, subject: info.Subject ?? "", pages: doc.numPages };
}

test.describe("exportar el croquis", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/croquis");
    await page.getByTestId("scene-select").selectOption("interseccion_toluca");
  });

  test("SVG: documento válido con la marca, la semilla, la escala y la atribución", async ({
    page,
  }) => {
    const svg = (await download(page, "svg")).toString("utf8");
    const parsed = await page.evaluate((markup) => {
      const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
      return {
        errors: doc.getElementsByTagName("parsererror").length,
        ns: doc.documentElement.getAttribute("xmlns"),
        text: doc.documentElement.textContent ?? "",
      };
    }, svg);
    expect(parsed.errors).toBe(0);
    expect(parsed.ns).toBe("http://www.w3.org/2000/svg");
    expect(parsed.text).toContain(LEGEND);
    expect(parsed.text).toMatch(/semilla \d+/);
    expect(parsed.text).toMatch(/\d+ m/);
    expect(parsed.text).toMatch(/OpenStreetMap/);
  });

  test("PNG: imagen al doble de resolución con la marca como texto del archivo", async ({
    page,
  }) => {
    const png = await download(page, "png");
    const { width, height } = pngSize(png);
    expect(width).toBeGreaterThan(500);
    expect(height).toBeGreaterThan(300);
    expect(readPngText(png).Description).toContain(LEGEND);
  });

  test("PDF: croquis vectorial, título y la marca al pie y en los metadatos", async ({ page }) => {
    const pdf = await download(page, "pdf");
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const { text, subject, pages } = await pdfText(pdf);
    expect(pages).toBe(1);
    expect(text).toContain("Croquis de la escena");
    expect(text.replace(/\s+/g, " ")).toContain(LEGEND);
    expect(subject).toContain(LEGEND);
    // El croquis va como vector: su texto (norte, escala, atribución) se puede extraer del PDF.
    expect(text).toMatch(/OpenStreetMap/);
    expect(text).toMatch(/\d+ m/);
  });
});
