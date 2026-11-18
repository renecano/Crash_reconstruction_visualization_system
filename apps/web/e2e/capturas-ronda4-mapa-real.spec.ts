import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { VISOR_PUENTE_VERSION } from "@croquis/scene-schema";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { conUnityFalso, recibidosDelPuente } from "./visor-unity-ayuda";

/**
 * Ronda 4, punto 9: las capturas del modo «mapa real» en AXA con la foto satelital de verdad (la
 * llave del `.env.local`, en un build local servido en localhost:3000, el referrer que acepta). Con el
 * Unity falso: se guarda la imagen exacta que recibe Unity (el piso), sin la foto y con ella, antes y
 * después de correrla. Sale a internet (OpenFreeMap y Esri, unas decenas de teselas). No corre en CI.
 *
 *   pnpm exec playwright test e2e/capturas-ronda4-mapa-real.spec.ts --project=chromium
 *     → docs/cesvi/ronda-4/evidencia/mapa-real/axa-*.jpg
 */
const DIR = resolve(__dirname, "../../../docs/cesvi/ronda-4/evidencia/mapa-real");

test.use({ viewport: { width: 1440, height: 900 } });

test("el modo «mapa real» en AXA, con la foto satelital", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const guardarPiso = async (nombre: string) => {
    const ps = (await recibidosDelPuente(page)).filter((m) => m.metodo === "piso");
    const img = String(ps.at(-1)?.datos.imagen ?? "");
    expect(img).toMatch(/^data:image\/jpeg;base64,/);
    writeFileSync(join(DIR, `${nombre}.jpg`), Buffer.from(img.split(",")[1]!, "base64"));
  };
  const pisos = async () =>
    (await recibidosDelPuente(page)).filter((m) => m.metodo === "piso").length;
  await conUnityFalso(page, VISOR_PUENTE_VERSION);
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
  await page.getByTestId("mapa-real").click();
  await expect(page.getByTestId("atribucion-mapa-real")).toContainText("Powered by Esri", {
    timeout: 90_000,
  });
  await expect.poll(pisos, { timeout: 30_000 }).toBeGreaterThan(0);
  await guardarPiso("axa-piso-con-foto");
  await page.screenshot({ path: join(DIR, "axa-panel-mapa-real.jpg"), quality: 84 });
  // Corrida 2 m al este y 1 m al norte.
  const antes = await pisos();
  for (let i = 0; i < 4; i++) await page.getByTestId("ajuste-foto-este").click();
  for (let i = 0; i < 2; i++) await page.getByTestId("ajuste-foto-norte").click();
  await expect(page.getByTestId("ajuste-foto")).toHaveText("2.0 m al este y 1.0 m al norte");
  await expect.poll(pisos, { timeout: 30_000 }).toBeGreaterThan(antes);
  await guardarPiso("axa-piso-con-foto-corrida");
  // Sin la foto: el mapa solo (lo que va en el paquete, el video y el visor de escritorio).
  const antes2 = await pisos();
  await page.getByTestId("foto-satelital").click();
  await expect.poll(pisos, { timeout: 60_000 }).toBeGreaterThan(antes2);
  await guardarPiso("axa-piso-mapa");
});
