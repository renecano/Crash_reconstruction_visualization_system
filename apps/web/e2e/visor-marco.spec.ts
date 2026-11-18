import { VISOR_PUENTE_VERSION } from "@croquis/scene-schema";
import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";
import { conUnityFalso } from "./visor-unity-ayuda";

/**
 * El marco del 3D y del 2D de la reconstrucción (René, 2026-11-17): los controles fuera de la escena,
 * el minimapa que se oculta, la pantalla completa (botón, F, Esc) con Espacio para reproducir, y las
 * notas en un desplegable cerrado. Con el Unity de mentira (`unity-falso.js`).
 */
type Recibido = { metodo: string; datos: Record<string, unknown> };
const recibidos = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __unityFalso: { recibidos: Recibido[] } }).__unityFalso.recibidos,
  );

/** Que dos cajas no se encimen (una puede tocar el borde de la otra). */
async function noSeEnciman(a: Locator, b: Locator) {
  const [x, y] = [await a.boundingBox(), await b.boundingBox()];
  expect(x && y).toBeTruthy();
  const encima =
    x!.x < y!.x + y!.width - 1 &&
    y!.x < x!.x + x!.width - 1 &&
    x!.y < y!.y + y!.height - 1 &&
    y!.y < x!.y + x!.height - 1;
  expect(encima).toBe(false);
}

test("@flujo /cesvi: el 3D y el 2D en su marco — controles fuera de la escena, pantalla completa y notas plegadas", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await conUnityFalso(page, VISOR_PUENTE_VERSION);
  await page.route("https://tiles.openfreemap.org/**", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [{ id: "fondo", type: "background", paint: { "background-color": "#eee" } }],
      }),
    }),
  );
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 30_000 });
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  const cifra = await page.getByTestId("cifra-reconstruccion").innerText();

  // El 3D: las cámaras arriba y la reproducción abajo, fuera del lienzo de Unity.
  await page.getByTestId("vista-3d").click();
  const visor = page.getByTestId("visor-unity");
  await expect(visor).toHaveAttribute("data-fase", "listo", { timeout: 90_000 });
  const marco = page.getByTestId("marco-vista");
  const lienzo = page.locator("#visor-unity-lienzo");
  const arriba = page.getByTestId("marco-barra-superior");
  const abajo = page.getByTestId("marco-barra-inferior");
  await expect(arriba.locator(".selector-camaras")).toBeVisible();
  await expect(arriba.getByTestId("descargar-paquete-3d")).toBeVisible();
  await expect(arriba.getByTestId("editar-3d")).toBeVisible();
  await expect(abajo.getByTestId("controles-unity")).toBeVisible();
  await noSeEnciman(arriba, lienzo);
  await noSeEnciman(abajo, lienzo);

  // Las notas, en su desplegable, cerrado.
  const notas = page.getByTestId("supuestos-y-notas");
  await expect(notas).toBeVisible();
  expect(await notas.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
  await notas.locator("summary").click();
  await expect(notas).toContainText("Supuestos declarados");

  // El minimapa se oculta: Unity recibe `depurar` con `minimapa: false`.
  await page.getByTestId("minimapa").click();
  await expect(page.getByTestId("minimapa")).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(async () =>
      (await recibidos(page)).some((m) => m.metodo === "depurar" && m.datos.minimapa === false),
    )
    .toBe(true);

  // Pantalla completa con el botón; Espacio reproduce o pausa; Esc sale.
  await page.getByTestId("pantalla-completa").click();
  await expect(marco).toHaveAttribute("data-completa", "si");
  const pausado = await page.getByTestId("controles-unity").getAttribute("data-pausado");
  await page.mouse.move(400, 400);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("controles-unity")).not.toHaveAttribute(
    "data-pausado",
    pausado ?? "",
  );
  // Sin mover el mouse, los controles se esconden a los 3 s.
  await expect(marco).toHaveAttribute("data-controles", "ocultos", { timeout: 6_000 });
  await page.mouse.move(420, 420);
  await expect(marco).toHaveAttribute("data-controles", "visibles");
  await page.keyboard.press("Escape");
  await expect(marco).toHaveAttribute("data-completa", "no");
  // Con F, también entra y sale.
  await page.keyboard.press("f");
  await expect(marco).toHaveAttribute("data-completa", "si");
  await page.keyboard.press("f");
  await expect(marco).toHaveAttribute("data-completa", "no");

  // El 2D: la reproducción y la nota de la velocidad abajo, acercar y alejar arriba.
  await page.getByTestId("vista-maqueta").click();
  await expect(abajo.getByTestId("linea-de-tiempo")).toBeVisible({ timeout: 30_000 });
  await expect(abajo.getByTestId("maqueta-leyenda")).toBeVisible();
  await expect(arriba.getByTestId("maqueta-acercar")).toBeVisible();
  await noSeEnciman(abajo, page.getByTestId("maqueta-navegable"));
  // Las barras de la otra vista no se quedan: una sola reproducción abajo.
  await expect(abajo.getByTestId("controles-unity")).toHaveCount(0);

  // Nada de esto cambia la cifra.
  expect(await page.getByTestId("cifra-reconstruccion").innerText()).toBe(cifra);
  expect(errores).toEqual([]);
});
