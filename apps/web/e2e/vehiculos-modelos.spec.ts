import { expect, test, type Page } from "@playwright/test";

/**
 * Vehículos de Sketchfab (R10, ADR 0086): la versión completa en alta y ultra, la ligera en media y
 * ninguna en baja (los paramétricos), con la atribución CC-BY en la leyenda del 3D.
 *
 * No bloquea el merge (no es `@flujo`). En Chromium sin tarjeta de video, alta dibuja cada cuadro
 * por software y la carga de los modelos tarda (medido: unos 30 s); por eso las esperas son largas.
 */
async function abrir(page: Page, calidad: string): Promise<string[]> {
  const pedidos: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/modelos/vehiculos/")) pedidos.push(u.pathname.split("/").pop()!);
  });
  await page.goto(`/visor?escena=lateral_interseccion&calidad=${calidad}&renderer=webgl&t=0.2`);
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => window.__croquisVehicleModelsReady === true, null, {
    timeout: 240_000,
  });
  return pedidos;
}

test.describe("vehículos de Sketchfab", () => {
  test.describe.configure({ timeout: 480_000 });

  test("en alta: los modelos completos de la escena y su atribución en la leyenda", async ({
    page,
  }) => {
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    const pedidos = await abrir(page, "alta");
    expect(pedidos).toEqual(
      expect.arrayContaining(["vehiculos.json", "hatchback.glb", "pickup.glb"]),
    );
    expect(pedidos.some((p) => p.includes("-ligero"))).toBe(false);
    const atribucion = page.getByTestId("atribucion-modelos");
    await expect(atribucion).toContainText("«Sigil '07» de Daniel Zhabotinsky (CC-BY 4.0)");
    await expect(atribucion).toContainText("«Lightbody '90 MD Pickup»");
    expect(errores).toEqual([]);
  });

  test("en media: la versión ligera; en baja: ninguna", async ({ page }) => {
    const media = await abrir(page, "media");
    expect(media).toEqual(expect.arrayContaining(["hatchback-ligero.glb", "pickup-ligero.glb"]));
    await page.goto("about:blank");
    const baja = await abrir(page, "baja");
    expect(baja).toEqual([]);
    await expect(page.getByTestId("atribucion-modelos")).toHaveCount(0);
  });
});
