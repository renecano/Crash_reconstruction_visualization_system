import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";

/**
 * Ronda 4: el build 1.3.0 de Unity, de verdad, en la demo local (`node tools/unity/build-a-cache.mjs`
 * y `demo-local.ps1 -SoloPreparar`). AXA: el modo «mapa real» con la foto de Esri (la llave del
 * `.env.local`, referrer localhost:3000) y el fantasma de una hipótesis en «Versiones». Mide las
 * tareas largas del hilo principal al poner el piso (René, 2026-11-16: nunca más de 100 ms). No
 * corre en CI.
 *
 *   pnpm exec playwright test -c playwright.produccion.config.ts e2e/unity-130-real.spec.ts
 *     (CROQUIS_URL=http://localhost:3000)
 *     → docs/cesvi/ronda-4/evidencia/unity-130/*.jpg y eval/results/ronda4_unity_130.json
 */
const RAIZ = resolve(__dirname, "../../..");
const DIR = join(RAIZ, "docs/cesvi/ronda-4/evidencia/unity-130");

test.use({ viewport: { width: 1440, height: 900 } });

test("el build 1.3.0: mapa real con foto y el fantasma de una versión", async ({ page }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const foto = (n: string) =>
    page.screenshot({ path: join(DIR, `${n}.jpg`), type: "jpeg", quality: 84 });
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
    const w = window as unknown as { __largas: number[] };
    w.__largas = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__largas.push(Math.round(e.duration));
    }).observe({ type: "longtask", buffered: true });
  });
  await page.goto("/cesvi/casos/a2010930/reconstruccion");
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("modo-trabajar").click();
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("vista-3d").click();
  const visor = page.getByTestId("visor-unity");
  await expect(visor).toHaveAttribute("data-fase", "listo", { timeout: 300_000 });
  await page.waitForTimeout(6000);
  await page.getByRole("button", { name: "Ir al impacto" }).click();
  await page.waitForTimeout(3000);
  await foto("1-procedural");

  // El modo «mapa real»: las tareas largas desde que se pide hasta que el piso se ve.
  const antes = await page.evaluate(
    () => (window as unknown as { __largas: number[] }).__largas.length,
  );
  await page.getByTestId("mapa-real").click();
  await expect(page.getByTestId("atribucion-mapa-real")).toContainText("Powered by Esri", {
    timeout: 90_000,
  });
  await page.waitForTimeout(8000);
  const largasPiso = await page.evaluate(
    (n) => (window as unknown as { __largas: number[] }).__largas.slice(n),
    antes,
  );
  await foto("2-mapa-real-con-foto");
  for (let i = 0; i < 4; i++) await page.getByTestId("ajuste-foto-este").click();
  await page.waitForTimeout(5000);
  await foto("3-mapa-real-foto-corrida");
  await page.getByTestId("foto-satelital").click();
  await page.waitForTimeout(8000);
  await foto("4-mapa-real-solo-mapa");
  await page.getByTestId("mapa-real").click();
  await page.waitForTimeout(5000);

  // «Versiones»: una hipótesis, superpuesta como fantasma.
  await irAPaso(page, 5);
  // Sin versiones, el formulario ya viene abierto: solo se abre si está cerrado.
  if (!(await page.getByTestId("conductor-vehiculo").isVisible()))
    await page.getByTestId("abrir-hipotesis").click();
  await page.getByTestId("conductor-vehiculo").selectOption("V2");
  await page.getByTestId("conductor-instante").fill("1.5");
  await page.getByTestId("conductor-probar").click();
  await expect(page.getByTestId("version-hipotesis-1")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("vista-3d").click();
  await page.getByTestId("ver-3d-version").click();
  await expect(visor).toHaveAttribute("data-fase", "listo", { timeout: 300_000 });
  await page.waitForTimeout(8000);
  await foto("5-version-fantasma");

  const todas = await page.evaluate(() => (window as unknown as { __largas: number[] }).__largas);
  writeFileSync(
    join(RAIZ, "eval/results/ronda4_unity_130.json"),
    `${JSON.stringify(
      {
        descripcion:
          "Ronda 4: el build 1.3.0 de Unity en la demo local (AXA). Tareas largas del hilo principal (ms) desde que se pide «Mapa real» hasta que el piso con la foto se ve, y todas las de la sesión.",
        script: "apps/web/e2e/unity-130-real.spec.ts",
        fecha: new Date().toISOString(),
        huella: await page.evaluate(async () => {
          const r = await fetch("/visor-unity/local/manifest.json");
          return ((await r.json()) as { huella: string }).huella;
        }),
        tareas_largas_al_poner_el_piso_ms: largasPiso,
        tarea_mas_larga_al_poner_el_piso_ms: Math.max(0, ...largasPiso),
        tareas_largas_de_la_sesion_ms: todas,
      },
      null,
      2,
    )}\n`,
  );
});
