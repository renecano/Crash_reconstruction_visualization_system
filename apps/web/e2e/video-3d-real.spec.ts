import { appendFileSync, copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";

/**
 * «Descargar video» con el Unity real (René, 2026-11-18, B7), en la demo local de la computadora del
 * colaborador (`demo-local.ps1 -Despues video-3d`: el build de Unity servido desde la máquina, nada de
 * Blob). AXA reconstruido, el 3D con la cámara por omisión, «Descargar video», y se revisa el MP4:
 * H.264, 1920×1080, 30 fps, la duración de la reproducción. El navegador lo pone `CROQUIS_CANAL`
 * (`chrome` o `msedge`, los instalados en la computadora). Con ventana (usa la tarjeta de video).
 *
 *   CROQUIS_CANAL=msedge pnpm exec playwright test e2e/video-3d-real.spec.ts --headed
 *   → una línea JSON por navegador en CROQUIS_SALIDA (eval/results/rtx-r4/video_3d.jsonl) y el MP4 en
 *     el Escritorio, carpeta «croquis-video-3d».
 */
const CANAL = process.env.CROQUIS_CANAL ?? "chrome";
const SALIDA = resolve(
  __dirname,
  "../../..",
  process.env.CROQUIS_SALIDA ?? "eval/results/rtx-r4/video_3d.jsonl",
);
const ESCRITORIO = join(homedir(), "Desktop", "croquis-video-3d");

test.use({ channel: CANAL, viewport: { width: 1600, height: 900 } });

test(`video del 3D con el Unity real (${CANAL})`, async ({ page }) => {
  test.setTimeout(900_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
  });
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 60_000 });
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
  await page.getByTestId("vista-3d").click();
  const visor = page.getByTestId("visor-unity");
  await expect(visor).toHaveAttribute("data-fase", "listo", { timeout: 300_000 });
  // Las calles del mapa llegan después y Unity vuelve a cargar: se espera a que se asiente.
  await page.waitForTimeout(8000);
  await expect(visor).toHaveAttribute("data-fase", "listo", { timeout: 300_000 });

  const t0 = Date.now();
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 840_000 }),
    page.getByTestId("descargar-video").click(),
  ]);
  const segundos = Math.round((Date.now() - t0) / 100) / 10;
  mkdirSync(ESCRITORIO, { recursive: true });
  const destino = join(ESCRITORIO, `axa-${CANAL}.mp4`);
  copyFileSync(await descarga.path(), destino);
  const bytes = readFileSync(destino);
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BufferSource(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)),
  });
  const pista = (await input.getPrimaryVideoTrack())!;
  const paquetes = (await pista.computePacketStats()).packetCount;
  const fila = {
    canal: CANAL,
    fecha: new Date().toISOString(),
    segundos_grabando: segundos,
    archivo: descarga.suggestedFilename(),
    mb: Math.round((bytes.length / 1e6) * 10) / 10,
    codec: await pista.getCodec(),
    ancho: pista.displayWidth,
    alto: pista.displayHeight,
    cuadros: paquetes,
    duracion_s: Math.round((await input.computeDuration()) * 100) / 100,
    errores_de_pagina: errores,
  };
  mkdirSync(dirname(SALIDA), { recursive: true });
  appendFileSync(SALIDA, JSON.stringify(fila) + "\n");
  expect(fila.codec).toBe("avc");
  expect([fila.ancho, fila.alto]).toEqual([1920, 1080]);
  expect(fila.cuadros).toBeGreaterThan(30);
  expect(errores).toEqual([]);
});
