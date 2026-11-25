import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./base";

/**
 * Las capturas de la portada para el visto bueno de René (2026-11-25): escritorio y celular, claro y
 * oscuro, sección por sección (lo que se ve al llegar a cada una, bajo la barra fija), y la página
 * completa sin JavaScript a densidad 1 (una captura de página completa a densidad 2 pasa del tamaño
 * que Chromium pinta y sale en blanco). No lleva @flujo ni corre en el CI de cada PR: la corre a mano
 * el flujo «Capturas» (`.github/workflows/capturas.yml`), que sube la carpeta.
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
      test("sección por sección", async ({ page }) => {
        test.setTimeout(240_000);
        mkdirSync(SALIDA, { recursive: true });
        await page.goto("/");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
        await page.waitForLoadState("networkidle").catch(() => undefined);
        const base = join(SALIDA, `${equipo.nombre}-${tema}`);
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${base}-01-inicio.png` });
        // Cada sección después del inicio, con su borde de arriba justo debajo de la barra fija.
        const secciones = await page.locator("main > section").count();
        const barra = await page.evaluate(
          () => document.querySelector(".pv > header")?.getBoundingClientRect().height ?? 72,
        );
        for (let k = 1; k < secciones; k++) {
          const y = await page
            .locator("main > section")
            .nth(k)
            .evaluate((s) => s.getBoundingClientRect().top + window.scrollY);
          await page.evaluate((top) => window.scrollTo(0, top), Math.max(0, y - barra));
          await page.waitForTimeout(700);
          await page.screenshot({ path: `${base}-${String(k + 1).padStart(2, "0")}-seccion.png` });
        }
      });
    });

// La página completa sin JavaScript, a densidad 1: todo el contenido se ve sin las entradas.
test.describe("la portada completa sin JavaScript", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    javaScriptEnabled: false,
  });
  test("escritorio, claro", async ({ page }) => {
    test.setTimeout(120_000);
    mkdirSync(SALIDA, { recursive: true });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
    // Sin JavaScript, las imágenes de abajo («lazy») se piden al acercarse: se recorre la página.
    for (let k = 0; k < 40; k++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: join(SALIDA, "sin-js-escritorio-claro-completa.png"),
      fullPage: true,
    });
  });
});
