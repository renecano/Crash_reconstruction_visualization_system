import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VISOR_PUENTE_VERSION } from "@croquis/scene-schema";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { conUnityFalso } from "./visor-unity-ayuda";
import type { Page } from "@playwright/test";

/**
 * «Descargar video» del 3D (René, 2026-11-18, B7): la reproducción completa, cuadro por cuadro, en
 * MP4 H.264 de 1920×1080 a 30 fps, con la leyenda en los metadatos; dice cuánto falta y se cancela.
 * Con el Unity de mentira (`unity-falso.js`), que dibuja un color por instante.
 */
async function abrirEl3d(page: Page) {
  await conUnityFalso(page, VISOR_PUENTE_VERSION);
  await page.route("**/api/lugar?**", (r) => r.fulfill({ json: { resultados: [] } }));
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 30_000 });
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 90_000,
  });
}

/** El MP4 descargado: H.264, 1920×1080 y sus paquetes. */
async function leerMp4(bytes: Buffer) {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BufferSource(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)),
  });
  const pista = await input.getPrimaryVideoTrack();
  expect(pista).toBeTruthy();
  expect(await input.getMimeType()).toMatch(/^video\/mp4/);
  expect(await pista!.getCodec()).toBe("avc");
  expect(pista!.displayWidth).toBe(1920);
  expect(pista!.displayHeight).toBe(1080);
  return { input, pista: pista!, paquetes: (await pista!.computePacketStats()).packetCount };
}

test("/cesvi: descargar el video del 3D en MP4 1080p", async ({ page }) => {
  test.setTimeout(420_000);
  await abrirEl3d(page);

  // Cancelar con Esc deja todo como estaba.
  const boton = page.getByTestId("descargar-video");
  await boton.click();
  await expect(page.getByTestId("grabando-video")).toBeVisible();
  await expect(page.getByTestId("falta-video")).toContainText("1920×1080, MP4");
  await page.screenshot({
    path: resolve(__dirname, "../../../docs/cesvi/ronda-4/evidencia/b/despues-b7-grabando.jpg"),
    quality: 82,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("aviso-video")).toContainText("Se canceló");
  await expect(page.getByTestId("grabando-video")).toHaveCount(0);

  // El video completo.
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 360_000 }),
    boton.click(),
  ]);
  await expect(page.getByTestId("falta-video")).toHaveCount(0, { timeout: 360_000 });
  expect(descarga.suggestedFilename()).toMatch(/^croquis-.+\.mp4$/);
  const { input, paquetes } = await leerMp4(readFileSync(await descarga.path()));
  // Los instantes que Unity recibió: de inicio a fin cada 1/30 s.
  const fijados = await page.evaluate(() =>
    (
      window as unknown as {
        __unityFalso: { recibidos: { metodo: string; datos: { t?: number } }[] };
      }
    ).__unityFalso.recibidos
      .filter((r) => r.metodo === "fijarTiempo")
      .map((r) => r.datos.t ?? 0),
  );
  expect(paquetes).toBeGreaterThan(30);
  expect(await input.computeDuration()).toBeCloseTo(paquetes / 30, 1);
  expect(fijados.length).toBeGreaterThanOrEqual(paquetes);
  const tags = await input.getMetadataTags();
  expect(String(tags.comment ?? tags.description ?? "")).toContain("ilustrativa");
  await expect(page.getByTestId("aviso-video")).toContainText("Listo");
});

/**
 * En la laptop con Intel UHD el codificador por hardware dio «Encoding error» (2026-11-26). Aquí se
 * fuerza ese error en todo codificador que no sea por software: el video sale igual, sin el error
 * crudo en pantalla.
 */
test("/cesvi: si el codificador falla, el reintento por software entrega el MP4", async ({
  page,
}) => {
  test.setTimeout(420_000);
  await page.addInitScript(() => {
    const Original = window.VideoEncoder;
    const w = window as unknown as { __fallosForzados: number };
    w.__fallosForzados = 0;
    // Sin campos privados: Playwright los transpila con un ayudante que el navegador no tiene.
    window.VideoEncoder = class extends Original {
      alFallar: (e: DOMException) => void;
      falla = false;
      constructor(init: VideoEncoderInit) {
        super(init);
        this.alFallar = init.error;
      }
      override configure(config: VideoEncoderConfig) {
        this.falla = config.hardwareAcceleration !== "prefer-software";
        super.configure(config);
      }
      override encode(frame: VideoFrame, opciones?: VideoEncoderEncodeOptions) {
        if (!this.falla) return super.encode(frame, opciones);
        w.__fallosForzados++;
        queueMicrotask(() => this.alFallar(new DOMException("Encoding error", "EncodingError")));
      }
    };
  });
  await abrirEl3d(page);
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 360_000 }),
    page.getByTestId("descargar-video").click(),
  ]);
  await expect(page.getByTestId("aviso-video")).toContainText("Listo", { timeout: 60_000 });
  await expect(page.getByTestId("aviso-video")).not.toContainText("Encoding");
  expect(
    await page.evaluate(() => (window as unknown as { __fallosForzados: number }).__fallosForzados),
  ).toBeGreaterThan(0);
  const { input, paquetes } = await leerMp4(readFileSync(await descarga.path()));
  expect(paquetes).toBeGreaterThan(30);
  expect(await input.computeDuration()).toBeCloseTo(paquetes / 30, 1);
});
