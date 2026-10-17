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
  "interseccion_toluca",
] as const;

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 90_000 });
}

test.describe("visor 3D", () => {
  // Antes de estar listo el visor carga los cuerpos y hornea restos y ragdolls (F5); con render
  // por software o pruebas en paralelo eso supera el límite de 30 s por omisión.
  test.describe.configure({ timeout: 120_000 });
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
      await expect(page.getByRole("table", { name: "Vehículos", exact: true })).toBeVisible();
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

  test("personas: ragdoll dentro de la banda de Searle, panel y cámara de persona", async ({
    page,
  }) => {
    await page.goto("/visor?escena=peaton_cruce&t=0.5&camara=persona");
    await waitReady(page);
    const ragdolls = await page.evaluate(
      () =>
        (window as unknown as { __croquisPeople?: { ragdolls: { inBand: boolean }[] } })
          .__croquisPeople?.ragdolls ?? [],
    );
    expect(ragdolls).toHaveLength(1);
    expect(ragdolls[0]?.inBand).toBe(true);
    await expect(page.getByLabel("Cámara", { exact: true })).toHaveValue("persona");
    await expect(page.getByTestId("personas")).toContainText("Proyección (Searle)");
    await expect(page.getByTestId("personas")).toContainText("dentro de la banda");
    await expect(page.getByTestId("visibilidad")).toContainText("el vehículo estacionado");
  });

  test("volcadura: el criterio de tropiezo se explica y la secuencia es ilustrativa", async ({
    page,
  }) => {
    await page.goto("/visor?escena=volcadura&t=1");
    await waitReady(page);
    await expect(page.getByTestId("volcadura")).toContainText("ilustrativa");
    await expect(page.getByTestId("personas")).toContainText("Sentado al volante");
    // Consistencia (F7): la posición final declarada no la alcanza ninguna velocidad.
    await expect(page.getByTestId("consistencia")).toContainText("aun llegando con otro ángulo");
  });

  test("hipótesis: otra velocidad se reconstruye en el navegador y se dibuja como fantasma", async ({
    page,
  }) => {
    // Sin servidor: el solver TS corre en un Web Worker del navegador.
    await page.goto("/visor?escena=alcance&t=0");
    await waitReady(page);
    await page.getByTestId("hipotesis-velocidad").fill("70");
    await page.getByTestId("hipotesis-comparar").click();
    await expect(page.getByTestId("hipotesis-0")).toContainText("A a 70 km/h", { timeout: 30_000 });
    await expect(page.getByTestId("hipotesis-diferencias")).toContainText(/queda a \d/);
    await page.waitForFunction(() => window.__croquisGhosts === 2);
    // Una segunda hipótesis se suma (otro color) y cada una se quita por separado.
    await page.getByTestId("hipotesis-velocidad").fill("30");
    await page.getByTestId("hipotesis-comparar").click();
    await expect(page.getByTestId("hipotesis-1")).toContainText("A a 30 km/h", { timeout: 30_000 });
    await page.waitForFunction(() => window.__croquisGhosts === 4);
    await page.getByRole("button", { name: "Quitar" }).first().click();
    await page.waitForFunction(() => window.__croquisGhosts === 2);
    await page.getByRole("button", { name: "Quitar" }).click();
    await page.waitForFunction(() => window.__croquisGhosts === 0);
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
  // Render por software en CI: compilar sombreadores y hornear restos tarda más que 30 s.
  test.setTimeout(120_000);
  for (const escena of ESCENAS) {
    test(`${escena} en el impacto`, async ({ page }) => {
      await page.goto(`/visor?escena=${escena}&t=0&camara=libre&calidad=media&renderer=webgl`);
      await waitReady(page);
      await page.waitForTimeout(1500);
      await expect(page.getByTestId("visor-3d")).toHaveScreenshot(`${escena}.png`, {
        maxDiffPixelRatio: 0.02,
        timeout: 30_000,
      });
    });
  }
});

/**
 * Ambiente forzado en la vista (ADR 0020): la URL cambia el clima, la luz o el piso solo en el
 * dibujo, y la vista lo avisa. Corre en todas las plataformas (no compara imágenes).
 */
test.describe("ambiente forzado en la vista", () => {
  test.describe.configure({ timeout: 120_000 });
  test("granizo de noche sin alumbrado: carga sin errores y avisa", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      "/visor?escena=lateral_interseccion&t=0&clima=granizo&iluminacion=noche_sin_alumbrado&piso=encharcado",
    );
    await waitReady(page);
    const aviso = page.getByTestId("ambiente-forzado");
    await expect(aviso).toContainText("granizo");
    await expect(aviso).toContainText("noche sin alumbrado");
    await expect(aviso).toContainText("La reconstrucción no cambia");
    expect(errors).toEqual([]);
  });

  test("sin parámetros de ambiente no hay aviso", async ({ page }) => {
    await page.goto("/visor?escena=poste&t=0");
    await waitReady(page);
    await expect(page.getByTestId("ambiente-forzado")).toHaveCount(0);
  });
});

/**
 * Capturas de clima (PLAN §13, F8): la misma vista libre en t = 0 con el ambiente forzado por URL.
 * Niebla con visibilidad declarada, granizo, lluvia fuerte de día con charcos y noche sin
 * alumbrado. Las referencias se generan en Linux (CI).
 */
const CLIMAS: { nombre: string; query: string }[] = [
  { nombre: "niebla-60m", query: "escena=lateral_interseccion&clima=niebla&visibilidad=60" },
  { nombre: "granizo", query: "escena=lateral_interseccion&clima=granizo" },
  {
    nombre: "lluvia-fuerte-dia",
    query: "escena=alcance&clima=lluvia_fuerte&piso=encharcado&iluminacion=dia",
  },
  { nombre: "noche-sin-alumbrado", query: "escena=peaton_cruce&iluminacion=noche_sin_alumbrado" },
];

test.describe("capturas de clima", () => {
  test.skip(
    process.platform !== "linux",
    "Las referencias visuales se generan y comparan en Linux",
  );
  test.use({ viewport: { width: 1280, height: 900 } });
  test.setTimeout(120_000);
  for (const c of CLIMAS) {
    test(`clima: ${c.nombre}`, async ({ page }) => {
      await page.goto(`/visor?${c.query}&t=0&camara=libre&calidad=media&renderer=webgl`);
      await waitReady(page);
      await page.waitForTimeout(1500);
      await expect(page.getByTestId("visor-3d")).toHaveScreenshot(`clima-${c.nombre}.png`, {
        maxDiffPixelRatio: 0.02,
        timeout: 30_000,
      });
    });
  }
});

/**
 * Capturas de daño (PLAN §13, F4): 1.5 s después del impacto, con el acercamiento al daño. Se ven
 * la deformación, la pintura transferida, vidrios, piezas desprendidas, marcas y bolsas de aire.
 */
test.describe("capturas de daño", () => {
  test.skip(
    process.platform !== "linux",
    "Las referencias visuales se generan y comparan en Linux",
  );
  test.use({ viewport: { width: 1280, height: 900 } });
  // Render por software en CI: compilar sombreadores y hornear restos tarda más que 30 s.
  test.setTimeout(120_000);
  for (const escena of ESCENAS) {
    test(`${escena} con daño`, async ({ page }) => {
      await page.goto(`/visor?escena=${escena}&t=1.5&camara=dano&calidad=media&renderer=webgl`);
      await waitReady(page);
      await page.waitForTimeout(1500);
      await expect(page.getByTestId("visor-3d")).toHaveScreenshot(`${escena}-dano.png`, {
        maxDiffPixelRatio: 0.02,
        timeout: 30_000,
      });
    });
  }
});
