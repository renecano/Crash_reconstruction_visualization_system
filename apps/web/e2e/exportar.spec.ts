import { readFileSync } from "node:fs";
import { expect, test, type Download, type Page } from "@playwright/test";
import { pngSize, readPngText } from "../../../packages/viewer/src/export/png";

/**
 * Exportaciones del visor (F9, PLAN §7.9): cada archivo se descarga, se abre y se verifica que
 * lleve la marca de reconstrucción ilustrativa (PLAN §10).
 */
const LEGEND = "Reconstrucción ilustrativa generada a partir de un relato. No es un peritaje.";

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
}

async function bytesOf(download: Download): Promise<Buffer> {
  return readFileSync(await download.path());
}

test.describe("exportar desde el visor", () => {
  test.describe.configure({ timeout: 180_000 });

  test("cuadro PNG: tamaño pedido, escena dibujada, franja y leyenda en el archivo", async ({
    page,
  }) => {
    await page.goto("/visor?escena=volcadura&t=1&calidad=baja&renderer=webgl");
    await waitReady(page);
    await page.getByTestId("export-resolucion").selectOption("1280x720");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-png").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^croquis-volcadura-t1\.00s-1280x720\.png$/);
    const png = await bytesOf(download);
    expect(pngSize(png)).toEqual({ width: 1280, height: 720 });
    const text = readPngText(png);
    expect(text.Description).toContain(LEGEND);
    expect(text.Description).toMatch(/semilla \d+/);

    // La imagen no está en blanco (la escena se dibujó) y abajo está la franja oscura de la marca.
    const stats = await page.evaluate(async (b64) => {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      const lum = (y0: number, y1: number) => {
        const d = ctx.getImageData(0, y0, bmp.width, y1 - y0).data;
        let sum = 0;
        let sq = 0;
        const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
          sum += l;
          sq += l * l;
        }
        const mean = sum / n;
        return { mean, sd: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
      };
      return { escena: lum(0, 500), franja: lum(bmp.height - 12, bmp.height) };
    }, png.toString("base64"));
    expect(stats.escena.sd).toBeGreaterThan(5);
    expect(stats.franja.mean).toBeLessThan(stats.escena.mean);
    await expect(page.getByTestId("export-estado")).toContainText("Listo");
  });

  test("escena glTF: .glb con leyenda, vehículos y animación", async ({ page }) => {
    await page.goto("/visor?escena=volcadura&t=0&calidad=baja&renderer=webgl");
    await waitReady(page);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.getByTestId("export-glb").click(),
    ]);
    expect(download.suggestedFilename()).toBe("croquis-volcadura.glb");
    const glb = await bytesOf(download);
    expect(glb.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
    expect(glb.readUInt32LE(4)).toBe(2);
    const jsonLen = glb.readUInt32LE(12);
    const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8")) as {
      asset: { copyright?: string };
      nodes: { name?: string }[];
      animations?: { channels: unknown[] }[];
      scenes: { extras?: { leyenda?: string[] } }[];
    };
    expect(json.asset.copyright).toContain(LEGEND);
    expect(json.scenes[0]!.extras!.leyenda).toContain(LEGEND);
    expect(json.nodes.some((n) => n.name?.startsWith("vehiculo_"))).toBe(true);
    expect(json.animations?.[0]?.channels.length ?? 0).toBeGreaterThan(0);
  });
});
