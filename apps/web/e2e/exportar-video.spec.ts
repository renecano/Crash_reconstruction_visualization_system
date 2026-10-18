import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";

/**
 * Video de la reconstrucción (F9, ADR 0031): MP4 y WebM dibujados cuadro por cuadro. Cada archivo
 * descargado se abre: cuadros, duración, tamaño y la marca en los metadatos; en el WebM, además, se
 * decodifica un cuadro para ver la franja de la marca.
 */
const LEGEND = "Reconstrucción ilustrativa generada a partir de un relato. No es un peritaje.";
// `poste` dura 5.14 s (de −3.00 a 2.14): a 24 cuadros por segundo son 124 cuadros.
const FRAMES = 124;

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
}

async function exportVideo(page: Page, formato: "mp4" | "webm"): Promise<Buffer> {
  await page.getByTestId("export-video-formato").selectOption(formato);
  await page.getByTestId("export-video-tamano").selectOption("1280x720");
  await page.getByTestId("export-video-fps").selectOption("24");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 280_000 }),
    page.getByTestId("export-video").click(),
  ]);
  expect(download.suggestedFilename()).toBe(`croquis-poste-1280x720-24fps.${formato}`);
  return readFileSync(await download.path());
}

async function inspect(bytes: Buffer) {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BufferSource(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)),
  });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("El video no tiene pista de video");
  const stats = await track.computePacketStats();
  return {
    mime: await input.getMimeType(),
    width: track.displayWidth,
    height: track.displayHeight,
    duration: await input.computeDuration(),
    packets: stats.packetCount,
    tags: await input.getMetadataTags(),
  };
}

test.describe("video desde el visor", () => {
  test.describe.configure({ timeout: 600_000 });

  test("MP4: todos los cuadros, 1280×720 y la marca en los metadatos", async ({ page }) => {
    await page.goto("/visor?escena=poste&t=0&calidad=baja&renderer=webgl");
    await waitReady(page);
    const info = await inspect(await exportVideo(page, "mp4"));
    expect(info.mime).toMatch(/^video\/mp4/);
    expect(info.width).toBe(1280);
    expect(info.height).toBe(720);
    expect(info.packets).toBe(FRAMES);
    expect(info.duration).toBeCloseTo(FRAMES / 24, 2);
    expect(info.tags.comment).toContain(LEGEND);
    await expect(page.getByTestId("export-estado")).toContainText(`${FRAMES} cuadros`);
  });

  test("WebM: todos los cuadros y la franja de la marca en la imagen", async ({ page }) => {
    await page.goto("/visor?escena=poste&t=0&calidad=baja&renderer=webgl");
    await waitReady(page);
    const bytes = await exportVideo(page, "webm");
    const info = await inspect(bytes);
    expect(info.mime).toMatch(/^video\/webm/);
    expect(info.packets).toBe(FRAMES);
    expect(info.tags.comment).toContain(LEGEND);

    // Un cuadro del video: escena con detalle y la franja oscura abajo.
    const stats = await page.evaluate(async (b64) => {
      const blob = await (await fetch(`data:video/webm;base64,${b64}`)).blob();
      const video = document.createElement("video");
      video.muted = true;
      video.src = URL.createObjectURL(blob);
      await new Promise((r, j) => {
        video.onloadeddata = r;
        video.onerror = () => j(new Error("No se pudo abrir el video"));
      });
      video.currentTime = 3;
      await new Promise((r) => (video.onseeked = r));
      const c = document.createElement("canvas");
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(video, 0, 0);
      const lum = (y0: number, y1: number) => {
        const d = ctx.getImageData(0, y0, c.width, y1 - y0).data;
        let s = 0;
        let q = 0;
        const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
          s += l;
          q += l * l;
        }
        const m = s / n;
        return { mean: m, sd: Math.sqrt(Math.max(0, q / n - m * m)) };
      };
      return { escena: lum(0, 400), franja: lum(c.height - 10, c.height) };
    }, bytes.toString("base64"));
    expect(stats.escena.sd).toBeGreaterThan(5);
    expect(stats.franja.mean).toBeLessThan(stats.escena.mean);
  });

  test("sin WebCodecs, el respaldo con MediaRecorder: todos los cuadros, refechados", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // Navegador sin WebCodecs: el visor debe caer en MediaRecorder.
      delete (window as { VideoEncoder?: unknown }).VideoEncoder;
    });
    await page.goto("/visor?escena=poste&t=0&calidad=baja&renderer=webgl");
    await waitReady(page);
    const info = await inspect(await exportVideo(page, "webm"));
    expect(info.mime).toMatch(/^video[/]webm/);
    expect(info.width).toBe(1280);
    // Cada cuadro en k/24 aunque la grabación haya sido más lenta que el tiempo real.
    expect(info.packets).toBe(FRAMES);
    expect(info.duration).toBeCloseTo(FRAMES / 24, 2);
    expect(info.tags.comment).toContain(LEGEND);
    await expect(page.getByTestId("export-estado")).toContainText("mediarecorder");
  });
});
