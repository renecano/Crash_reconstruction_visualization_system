import { expect, test, type Page } from "@playwright/test";

/**
 * Demo sin red (F9, ADR 0030): con el service worker instalado y la red cortada, la demo abre,
 * reconstruye y hornea con lo precargado. Solo la extracción del relato con Claude pide red.
 */
test.use({ serviceWorkers: "allow" });

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
}

/** Peticiones de archivos de la app que fallaron (sin contar las RSC, que sin red fallan y Next resuelve navegando con el documento). */
function watchFailures(page: Page): string[] {
  const failed: string[] = [];
  page.on("requestfailed", (r) => {
    const url = new URL(r.url());
    if (url.searchParams.has("_rsc")) return;
    failed.push(url.pathname);
  });
  return failed;
}

test.describe("demo sin red", () => {
  test.describe.configure({ timeout: 300_000 });

  test("con la red cortada abre, reconstruye y hornea con lo precargado", async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    // El registro espera a que la página cargue y el navegador esté ocioso; `ready` llega cuando el
    // service worker está activo, y solo se activa después de precargar todo.
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe("/");

    await context.setOffline(true);
    const failed = watchFailures(page);

    await page.goto("/");
    await expect(page.locator("body")).toContainText("Croquis");

    // Visor: resultados canónicos, Rapier (restos y ragdoll), cuerpos de MakeHuman y texturas.
    await page.goto("/visor?escena=peaton_cruce&t=0.5&calidad=alta&renderer=webgl");
    await waitReady(page);
    await expect(page.getByTestId("visor-3d").locator("canvas")).toBeVisible();
    await page.waitForFunction(() => window.__croquisTexturesReady === true, null, {
      timeout: 60_000,
    });
    const ragdolls = await page.evaluate(
      () =>
        (window as unknown as { __croquisPeople?: { ragdolls: unknown[] } }).__croquisPeople
          ?.ragdolls.length ?? 0,
    );
    expect(ragdolls).toBe(1);

    // Croquis → «Ver en 3D»: la escena se reconstruye con el solver en el Web Worker, sin red.
    await page.goto("/croquis");
    await page.getByTestId("ver-3d").click();
    await expect(page).toHaveURL(/\/visor\?escena=propia/);
    await waitReady(page);
    await expect(page.getByTestId("evidencia")).toBeVisible({ timeout: 120_000 });

    // Demo «Tú eres…»: relato grabado, preguntas contestadas en el navegador, sin red.
    await page.goto("/demo");
    await page.getByTestId("demo-caso-rmx-d001").click();
    await expect(page.getByTestId("demo-relato")).toContainText("Paseo Tollocan");
    await page.getByTestId("responder").click();
    await expect(page.getByTestId("demo-rondas")).toContainText("Rondas contestadas: 1");

    // Relato: lo único que pide red, y la interfaz lo dice.
    await page.goto("/relato");
    await expect(page.getByTestId("sin-red")).toContainText("Sin conexión");
    await page.getByTestId("relato").fill("Iba en mi carro y me pegaron por un lado.");
    await expect(page.getByTestId("entender")).toBeDisabled();

    expect(failed).toEqual([]);
    expect(errors).toEqual([]);
  });
});
