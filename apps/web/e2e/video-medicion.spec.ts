import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";

/**
 * Cuánto tarda el video y en qué se va el tiempo (René, 2026-11-28: «13 min por video es demasiado»).
 * Con el Unity real, en la demo local (`tools/demo-local/demo-local.sh`; en Windows, `demo-local.ps1`):
 * AXA reconstruido, el video del choque con la cámara automática en «Rápido» y en «Máxima calidad».
 * Por cada uno: el tiempo total, el desglose (Unity, componer, codificar, cerrar), la duración del
 * video, la estimación del diálogo y la tarjeta de video. No corre en CI. Lista para la laptop con
 * tarjeta integrada:
 *
 *   CROQUIS_URL=http://localhost:3000 CROQUIS_CANAL=chrome pnpm exec playwright test \
 *     -c playwright.produccion.config.ts e2e/video-medicion.spec.ts --headed
 *   → una línea JSON por grabación en CROQUIS_SALIDA (eval/results/video_medicion.jsonl)
 */
const SALIDA = resolve(
  __dirname,
  "../../..",
  process.env.CROQUIS_SALIDA ?? "eval/results/video_medicion.jsonl",
);
const CALIDADES = (process.env.CROQUIS_VIDEO_CALIDADES ?? "rapido,maxima").split(",");

test.use({
  viewport: { width: 1600, height: 900 },
  ...(process.env.CROQUIS_CANAL ? { channel: process.env.CROQUIS_CANAL } : {}),
});

test("cuánto tarda el video del choque, por calidad", async ({ page }) => {
  test.setTimeout(3_600_000);
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
  });
  await page.goto("/cesvi");
  const tarjeta = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
  });
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 60_000 });
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
  await page.getByTestId("vista-3d").click();
  const visor = page.getByTestId("visor-unity");
  await expect(visor).toHaveAttribute("data-fase", "listo", { timeout: 300_000 });
  await page.waitForTimeout(8000);
  await expect(visor).toHaveAttribute("data-fase", "listo", { timeout: 300_000 });

  mkdirSync(dirname(SALIDA), { recursive: true });
  for (const calidad of CALIDADES) {
    await page.getByTestId("descargar-video").click();
    await page.getByTestId("video-camara").selectOption("automatica");
    await page.getByTestId(`video-calidad-${calidad}`).check();
    const estimado = await page.getByTestId("video-estimado").innerText();
    await page.evaluate(() => {
      delete (window as unknown as Record<string, unknown>).__croquisVideoMedicion;
    });
    const t0 = Date.now();
    const [descarga] = await Promise.all([
      page.waitForEvent("download", { timeout: 3_000_000 }),
      page
        .getByTestId("video-grabar")
        .click()
        .then(() =>
          page
            .getByTestId("video-seguir")
            .click({ timeout: 90_000 })
            .catch(() => undefined),
        ),
    ]);
    const segundos = Math.round((Date.now() - t0) / 100) / 10;
    const bytes = readFileSync((await descarga.path())!);
    const entrada = new Input({
      formats: ALL_FORMATS,
      source: new BufferSource(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
      ),
    });
    const pista = (await entrada.getPrimaryVideoTrack())!;
    const medicion = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__croquisVideoMedicion ?? null,
    );
    const fila = {
      fecha: new Date().toISOString(),
      tarjeta,
      calidad,
      estimado_antes: estimado,
      segundos_totales: segundos,
      duracion_video_s: Math.round((await entrada.computeDuration()) * 100) / 100,
      ancho: pista.displayWidth,
      alto: pista.displayHeight,
      mb: Math.round((bytes.length / 1e6) * 10) / 10,
      medicion,
    };
    appendFileSync(SALIDA, JSON.stringify(fila) + "\n");
    // El MP4 y un cuadro cerca del impacto, para comparar lo que se ve (fuera del repo si es AXA).
    const carpeta = process.env.CROQUIS_VIDEO_CARPETA;
    if (carpeta) {
      mkdirSync(carpeta, { recursive: true });
      copyFileSync((await descarga.path())!, join(carpeta, `video-${calidad}.mp4`));
      const jpg = await page.evaluate(
        async ({ b64, t }) => {
          const v = document.createElement("video");
          v.muted = true;
          v.src = URL.createObjectURL(
            new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "video/mp4" }),
          );
          await new Promise((ok) => (v.onloadeddata = ok));
          v.currentTime = t;
          await new Promise((ok) => (v.onseeked = ok));
          const c = document.createElement("canvas");
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          c.getContext("2d")!.drawImage(v, 0, 0);
          return c.toDataURL("image/jpeg", 0.92).split(",")[1]!;
        },
        { b64: bytes.toString("base64"), t: fila.duracion_video_s * 0.45 },
      );
      writeFileSync(join(carpeta, `cuadro-${calidad}.jpg`), Buffer.from(jpg, "base64"));
    }
    expect(fila.ancho).toBe(1920);
    expect(medicion).not.toBeNull();
    await expect(page.getByTestId("aviso-video")).toContainText("Listo", { timeout: 30_000 });
  }
});
