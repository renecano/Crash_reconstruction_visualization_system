import { expect, test, type Page } from "@playwright/test";

const ESCENAS = [
  "alcance",
  "lateral_interseccion",
  "frontal_curva",
  "peaton_cruce",
  "motociclista",
  "objeto_fijo_arbol",
  "poste",
  "volcadura",
  "nocturno_lluvia",
  "glorieta",
] as const;

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 90_000 });
}

test.describe("visor 3D", () => {
  for (const escena of ESCENAS) {
    test(`${escena}: carga, renderiza y muestra la leyenda`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/visor?escena=${escena}&t=0`);
      await waitReady(page);
      await expect(page.getByTestId("visor-3d").locator("canvas")).toBeVisible();
      await expect(page.getByTestId("backend")).toHaveText(/WebGPU|WebGL 2/);
      await expect(page.getByRole("note")).toContainText("No es un peritaje");
      await expect(page.getByTestId("tiempo")).toHaveText("0.00 s");
      await expect(page.getByRole("table")).toBeVisible();
      const frames = await page.evaluate(() => window.__croquisPerf?.frameMs.length ?? 0);
      expect(frames).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
  }

  test("reproducir avanza el tiempo y los controles lo mueven", async ({ page }) => {
    await page.goto("/visor?escena=alcance");
    await waitReady(page);
    const tiempo = page.getByTestId("tiempo");
    await expect(tiempo).toHaveText("−3.00 s");
    await page.getByRole("button", { name: "Cuadro siguiente" }).click();
    await expect(tiempo).toHaveText("−2.98 s");
    await page.getByRole("button", { name: /^Impacto/ }).click();
    await expect(tiempo).toHaveText("0.00 s");
    await page.getByRole("button", { name: "Reproducir" }).click();
    await expect(tiempo).not.toHaveText("0.00 s", { timeout: 5_000 });
    await page.getByRole("button", { name: "Pausar" }).click();
    const t1 = await tiempo.textContent();
    await page.waitForTimeout(400);
    await expect(tiempo).toHaveText(t1 ?? "");
  });

  test("cambiar de cámara y de escena queda en la URL", async ({ page }) => {
    await page.goto("/visor?escena=glorieta");
    await waitReady(page);
    await page.getByLabel("Cámara", { exact: true }).selectOption("cenital");
    await expect(page).toHaveURL(/camara=cenital/);
    await page.getByLabel("Escena", { exact: true }).selectOption("poste");
    await expect(page).toHaveURL(/escena=poste/);
    await waitReady(page);
    await page
      .getByLabel("Cámara", { exact: true })
      .selectOption({ label: "Vista del conductor A" });
    await expect(page).toHaveURL(/camara=conductor-veh-a/);
  });

  test("forzar WebGL 2 usa el respaldo", async ({ page }) => {
    await page.goto("/visor?escena=alcance&renderer=webgl");
    await waitReady(page);
    await expect(page.getByTestId("backend")).toHaveText("WebGL 2");
  });
});

/**
 * Capturas visuales (PLAN §13, F3). Las referencias se generan en Linux (CI) porque el render por
 * software difiere entre sistemas; en Windows se omiten. Vista libre en t = 0 (impacto), en pausa.
 */
test.describe("capturas visuales", () => {
  test.skip(
    process.platform !== "linux",
    "Las referencias visuales se generan y comparan en Linux",
  );
  test.use({ viewport: { width: 1280, height: 900 } });
  for (const escena of ESCENAS) {
    test(`${escena} en el impacto`, async ({ page }) => {
      await page.goto(`/visor?escena=${escena}&t=0&camara=libre&calidad=media&renderer=webgl`);
      await waitReady(page);
      await page.waitForTimeout(1500);
      await expect(page.getByTestId("visor-3d")).toHaveScreenshot(`${escena}.png`, {
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
