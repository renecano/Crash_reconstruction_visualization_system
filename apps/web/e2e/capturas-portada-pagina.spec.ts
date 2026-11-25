import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./base";

/**
 * Las capturas de la portada para el visto bueno de René (2026-11-25): escritorio y celular, claro y
 * oscuro, el inicio (lo que se ve al abrir) y la página completa. No lleva @flujo ni corre en el CI de
 * cada PR: la corre a mano el flujo «Capturas» (`.github/workflows/capturas.yml`), que sube la carpeta.
 *
 *   CROQUIS_CAPTURAS=<carpeta> pnpm --filter @croquis/web exec playwright test e2e/capturas-portada-pagina.spec.ts
 */
const SALIDA = process.env.CROQUIS_CAPTURAS ?? "capturas-portada-pagina";

const EQUIPOS = [
  { nombre: "escritorio", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  {
    nombre: "celular",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
] as const;

for (const equipo of EQUIPOS)
  for (const tema of ["claro", "oscuro"] as const)
    test.describe(`la portada en ${equipo.nombre}, ${tema}`, () => {
      test.use({
        viewport: equipo.viewport,
        deviceScaleFactor: equipo.deviceScaleFactor,
        ...("isMobile" in equipo ? { isMobile: true, hasTouch: true } : {}),
        colorScheme: tema === "claro" ? "light" : "dark",
        reducedMotion: "reduce",
      });
      test("inicio y página completa", async ({ page }) => {
        test.setTimeout(180_000);
        mkdirSync(SALIDA, { recursive: true });
        await page.goto("/");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
        await page.waitForLoadState("networkidle").catch(() => undefined);
        // Las imágenes de abajo se cargan al acercarse: se recorre la página antes de la completa.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 120));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(1500);
        const base = join(SALIDA, `${equipo.nombre}-${tema}`);
        await page.screenshot({ path: `${base}-inicio.png` });
        await page.screenshot({ path: `${base}-completa.png`, fullPage: true });
      });
    });
