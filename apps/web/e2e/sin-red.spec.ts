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
    await page.goto("/publico");
    // El registro espera a que la página cargue y el navegador esté ocioso; `ready` llega cuando el
    // service worker está activo, y solo se activa después de precargar todo.
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe("/");

    await context.setOffline(true);
    const failed = watchFailures(page);

    await page.goto("/publico");
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

    // Relato: lo único que pide red, y la interfaz lo dice (flujo guiado, F11a).
    await page.goto("/cuenta");
    await expect(page.getByTestId("sin-red")).toContainText("Sin conexión");
    await page.getByTestId("relato").fill("Iba en mi carro y me pegaron por un lado.");
    await expect(page.getByTestId("entender")).toBeDisabled();

    // La versión en inglés también abre sin red.
    await page.goto("/en/cuenta");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("sin-red")).toContainText("Offline");

    expect(failed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("con el service worker activo y con red, cada página es la suya; sin red, el inicio en su idioma", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    // Recargar páginas en inglés, con parámetros o sin precargar no debe abrir la portada.
    await page.goto("/en/cuenta");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tell what happened");
    await page.goto("/cuenta?paso=falta");
    await expect(page.getByTestId("flujo")).toBeVisible();
    await page.goto("/e9");
    await expect(page.getByTestId("e9-iniciar")).toBeVisible();
    await page.goto("/en/medicion");
    await expect(page.getByTestId("medicion-empezar")).toBeVisible();

    // Sin red, una página ya visitada abre su copia (el HTML va primero a la red y se guarda, ADR
    // 0083); una que no se precargó ni se visitó abre el inicio en su idioma.
    await context.setOffline(true);
    await page.goto("/e9");
    await expect(page.getByTestId("e9-iniciar")).toBeVisible();
    await page.goto("/medicion");
    await expect(page.locator("html")).toHaveAttribute("lang", "es-MX");
    await expect(page.getByTestId("portada")).toBeVisible();
    await page.goto("/en/e9");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("portada")).toBeVisible();
  });
});
