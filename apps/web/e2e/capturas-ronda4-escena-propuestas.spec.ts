import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "./base";

/**
 * Ronda 4 (René, 2026-11-18): las tres propuestas de la primera experiencia en La escena
 * (`?propuesta=1|2|3`, prototipo sobre La escena real) en AXA y en cesvi-cf708e9fed. Sale a internet
 * (mapa y búsqueda del lugar). No corre en CI.
 *
 *   pnpm exec playwright test e2e/capturas-ronda4-escena-propuestas.spec.ts --project=chromium
 *     → docs/cesvi/ronda-4/evidencia/escena/propuesta-<n>-<caso>-*.jpg
 */
const DIR = resolve(__dirname, "../../../docs/cesvi/ronda-4/evidencia/escena");

test.use({ viewport: { width: 1440, height: 900 } });

for (const n of [1, 2, 3] as const) {
  for (const [caso, ruta] of [
    ["axa", "/cesvi/casos/a2010930/escena"],
    ["cf708", "/cesvi/casos/reporte/cesvi-cf708e9fed/escena"],
  ] as const) {
    test(`propuesta ${n} en ${caso}`, async ({ page }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const foto = (x: string) =>
        page.screenshot({
          path: join(DIR, `propuesta-${n}-${caso}-${x}.jpg`),
          type: "jpeg",
          quality: 80,
        });
      await page.goto(`${ruta}?propuesta=${n}&desde=cero`);
      await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 60_000 });
      const trabajar = page.getByTestId("modo-trabajar");
      if ((await trabajar.getAttribute("aria-selected")) !== "true") await trabajar.click();
      const buscar = page.getByRole("button", { name: "Buscar", exact: true });
      if (await buscar.isVisible({ timeout: 5000 }).catch(() => false)) {
        // El Periférico a la altura de la colonia del caso (Ampliación Daniel Garza, Nominatim).
        await page.getByRole("textbox").first().fill("19.4085338, -99.1944592");
        await buscar.click();
        const opcion = page.getByTestId("opcion-lugar").first();
        if (await opcion.isVisible({ timeout: 8000 }).catch(() => false)) await opcion.click();
      }
      await expect(page.getByTestId(`propuesta-escena-${n}`)).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(4000);
      await foto("1-al-entrar");
      await page.getByRole("button", { name: "Empezar a revisar" }).click();
      await page.waitForTimeout(1500);
      await foto("2-revisando");
    });
  }
}
