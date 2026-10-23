/** Ayudas de las e2e del recorrido de los casos (V2, ADR 0080). */
import { expect, type Page } from "@playwright/test";

/** Lleva el recorrido al paso n (1 a 8 del recorrido completo) con «Siguiente» y «Anterior». */
export async function irAPaso(page: Page, n: number) {
  const panel = page.getByTestId("panel-paso");
  for (let k = 0; k < 10; k++) {
    const actual = Number(await panel.getAttribute("data-paso"));
    if (actual === n) return;
    const boton = page.getByTestId(actual < n ? "siguiente" : "anterior");
    await expect(boton).toBeEnabled();
    await boton.click();
  }
  await expect(panel).toHaveAttribute("data-paso", String(n));
}

/** Cierra el diálogo para buscar el lugar si el caso no trae coordenadas (el mapa se mueve a mano). */
export async function sinBuscarLugar(page: Page) {
  const dialogo = page.getByTestId("dialogo-buscar-lugar");
  // El mapa ya cargó cuando aparece el diálogo o el botón para buscar el lugar.
  await expect(dialogo.or(page.getByTestId("buscar-lugar")).first()).toBeVisible({
    timeout: 20_000,
  });
  if (await dialogo.isVisible())
    await dialogo.getByRole("button", { name: /moviendo el mapa/ }).click();
}

/** Acerca el mapa en «Mover mapa» (en «Colocar» el doble clic colocaría) y vuelve a «Colocar». */
export async function acercar(page: Page, veces = 7) {
  // Las calles del lugar para el 3D (R10) salen de OpenStreetMap: en CI no se consulta la red, así
  // que se reconstruye sin ellas (lo mismo que hace la app si Overpass no responde).
  await page.route("**/api/osm?**", (r) => r.fulfill({ json: { elements: [] } }));
  const mapa = page.getByTestId("mapa-escena");
  await expect(mapa.locator("canvas")).toBeVisible({ timeout: 20_000 });
  await sinBuscarLugar(page);
  // Se coloca al trabajar (un reporte de la reproducción abre al presentar).
  const recorrido = page.getByTestId("recorrido-caso");
  if ((await recorrido.getAttribute("data-modo")) === "presentar")
    await page.getByTestId("modo-trabajar").click();
  await page.getByTestId("herramienta-mover").click();
  for (let k = 0; k < veces; k++) {
    await mapa.dblclick({ position: { x: 300, y: 260 } });
    await page.waitForTimeout(350);
  }
  await page.getByTestId("herramienta-colocar").click();
}

/**
 * Coloca todo lo que pide la lista guiada del paso 3, uno por uno: toca el mapa y «Listo». Sirve
 * para cualquier caso (dos vehículos, carambola, reporte) cuando la prueba no mira las posiciones.
 */
export async function colocarTodo(page: Page) {
  await acercar(page);
  const mapa = page.getByTestId("mapa-escena");
  for (let k = 0; k < 8; k++) {
    if ((await page.getByTestId("item-activo").count()) === 0) break;
    await mapa.click({ position: { x: 240 + k * 22, y: 240 + (k % 2) * 18 } });
    await page.getByTestId("listo-elemento").click();
  }
  await expect(page.getByTestId("falta-para-seguir")).toHaveCount(0);
}
