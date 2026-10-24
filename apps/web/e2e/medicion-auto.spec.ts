import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * `/medicion?auto=1` (botón de la computadora de la demo): empieza sola y descarga el JSON de E6 al
 * terminar, sin que nadie toque nada. Aquí, una medición corta en baja para que no tarde.
 */
test("la medición automática mide y descarga el resultado sin intervención", async ({ page }) => {
  test.setTimeout(300_000);
  const descarga = page.waitForEvent("download", { timeout: 240_000 });
  await page.goto(
    "/medicion?auto=1&escenas=alcance&calidades=baja&renderers=webgl&repeticiones=1&calentamiento=0&segundos=1&pausa=0",
  );
  const d = await descarga;
  expect(d.suggestedFilename()).toMatch(/^e6-navegador-\d{4}-\d{2}-\d{2}\.json$/);
  const doc = JSON.parse(readFileSync((await d.path())!, "utf8")) as {
    config: { calidades: string[]; escenas: string[] };
    mediciones: { escena: string; calidad: string }[];
    equipo: { agente: string } | null;
  };
  expect(doc.config.calidades).toEqual(["baja"]);
  expect(doc.mediciones).toHaveLength(1);
  expect(doc.mediciones[0]).toMatchObject({ escena: "alcance", calidad: "baja" });
  expect(doc.equipo?.agente).toContain("Chrome");
});
