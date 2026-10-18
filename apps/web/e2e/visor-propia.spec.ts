import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Escena propia (F9): la escena del relato o del croquis se reconstruye en el navegador con el
 * solver TS en un Web Worker, primero para dibujar y luego con Monte Carlo, inversión y
 * consistencia para los paneles.
 */
const SPEC = readFileSync(
  join(process.cwd(), "../../packages/scene-schema/fixtures/lateral_interseccion.json"),
  "utf-8",
);
/** La escena canónica más costosa del solver completo (E8, `e8_costo_dmath.json`). */
const SPEC_PESADA = readFileSync(
  join(process.cwd(), "../../packages/scene-schema/fixtures/interseccion_toluca.json"),
  "utf-8",
);

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 90_000 });
}

test.describe("escena propia en el visor 3D", () => {
  test.describe.configure({ timeout: 180_000 });

  test("sin escena guardada explica cómo crearla", async ({ page }) => {
    await page.goto("/visor?escena=propia");
    await expect(page.getByTestId("sin-escena-propia")).toContainText("No hay una escena propia");
  });

  test("se reconstruye en el navegador y llegan la inversión y la consistencia", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((spec) => {
      sessionStorage.setItem("croquis:escena-propia", spec);
    }, SPEC);
    await page.goto("/visor?escena=propia&t=0&calidad=baja&renderer=webgl");
    await waitReady(page);
    await expect(page.getByTestId("visor-3d").locator("canvas")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Escena" })).toHaveValue("propia");
    await expect(page.getByRole("table", { name: "Vehículos", exact: true })).toBeVisible();
    // El resultado completo llega después del dibujo y reemplaza al aviso de cálculo.
    await expect(page.getByTestId("evidencia")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("calculo-completo")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("el cálculo completo no bloquea el hilo principal", async ({ page }) => {
    // El visor crea el worker del solver; se toma su URL y se usa en una página sin 3D, donde el
    // hilo principal solo corre un latido cada 10 ms. Si el cálculo bloqueara el hilo principal, el
    // mayor hueco entre latidos sería tan largo como el cálculo.
    const workerUrl = new Promise<string>((resolve) => page.on("worker", (w) => resolve(w.url())));
    await page.addInitScript((spec) => {
      sessionStorage.setItem("croquis:escena-propia", spec);
    }, SPEC_PESADA);
    await page.goto("/visor?escena=propia&t=0&calidad=baja&renderer=webgl");
    const url = await workerUrl;
    await page.goto("/croquis");
    const m = await page.evaluate(
      async ({ url, spec }) => {
        let last = performance.now();
        let maxGap = 0;
        const beat = setInterval(() => {
          const now = performance.now();
          maxGap = Math.max(maxGap, now - last);
          last = now;
        }, 10);
        // Turbopack empaqueta el worker como clásico (carga sus trozos con importScripts).
        const worker = new Worker(url);
        const t0 = performance.now();
        await new Promise<void>((resolve, reject) => {
          worker.onerror = (ev) => reject(new Error(ev.message || "el worker falló"));
          worker.onmessage = (ev: MessageEvent<{ fase?: string; error?: string }>) => {
            if (ev.data.error) reject(new Error(ev.data.error));
            else if (ev.data.fase === "completo") resolve();
          };
          worker.postMessage({ id: 1, spec: JSON.parse(spec) as unknown, completo: true });
        });
        const ms = performance.now() - t0;
        clearInterval(beat);
        worker.terminate();
        return { ms, maxGap };
      },
      { url, spec: SPEC_PESADA },
    );
    console.log(
      `cálculo completo ${m.ms.toFixed(0)} ms; mayor hueco del hilo principal ${m.maxGap.toFixed(0)} ms`,
    );
    expect(m.ms).toBeGreaterThan(500);
    expect(m.maxGap).toBeLessThan(m.ms / 2);
  });

  test("del croquis al visor con «Ver en 3D»", async ({ page }) => {
    await page.goto("/croquis");
    await page.getByTestId("ver-3d").click();
    await expect(page).toHaveURL(/\/visor\?escena=propia/);
    await waitReady(page);
    await expect(page.getByTestId("visor-3d").locator("canvas")).toBeVisible();
  });
});
