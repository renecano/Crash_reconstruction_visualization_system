import { readFileSync } from "node:fs";
import { VISOR_PUENTE_VERSION } from "@croquis/scene-schema";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { conUnityFalso } from "./visor-unity-ayuda";

/**
 * «Descargar video» del 3D (René, 2026-11-18, B7): la reproducción completa, cuadro por cuadro, en
 * MP4 H.264 de 1920×1080 a 30 fps, con la leyenda en los metadatos; dice cuánto falta y se cancela.
 * Con el Unity de mentira (`unity-falso.js`), que dibuja un color por instante.
 */
test("/cesvi: descargar el video del 3D en MP4 1080p", async ({ page }) => {
  test.setTimeout(420_000);
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

  // Cancelar con Esc deja todo como estaba.
  const boton = page.getByTestId("descargar-video");
  await boton.click();
  await expect(page.getByTestId("grabando-video")).toBeVisible();
  await expect(page.getByTestId("falta-video")).toContainText("1920×1080, MP4");
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
  const bytes = readFileSync(await descarga.path());
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
  const paquetes = (await pista!.computePacketStats()).packetCount;
  expect(paquetes).toBeGreaterThan(30);
  expect(await input.computeDuration()).toBeCloseTo(paquetes / 30, 1);
  expect(fijados.length).toBeGreaterThanOrEqual(paquetes);
  const tags = await input.getMetadataTags();
  expect(String(tags.comment ?? tags.description ?? "")).toContain("ilustrativa");
  await expect(page.getByTestId("aviso-video")).toContainText("Listo");
});
