/** Ayudas de las e2e del recorrido de los casos (V2, ADR 0080). */
import { expect, type Page } from "@playwright/test";
import { Fuente, FuenteExpediente } from "@croquis/scene-schema";
import { FUENTE, palabra } from "../src/i18n/vocabulario";

/**
 * Lleva el recorrido al paso n (1 a 8 del recorrido completo) con «Siguiente» y «Anterior». En La
 * escena (paso 3) al trabajar, la escena fácil ocupa la pantalla: se sale con «Ver la
 * reconstrucción» o con la barra de actos.
 */
export async function irAPaso(page: Page, n: number) {
  const panel = page.getByTestId("panel-paso");
  for (let k = 0; k < 10; k++) {
    const actual = Number(await panel.getAttribute("data-paso"));
    if (actual === n) return;
    if (actual === 3 && (await page.getByTestId("escena-facil").isVisible())) {
      if (n > 3) {
        const ver = page.getByTestId("avance-ver-reconstruccion");
        await expect(ver).toBeEnabled();
        await ver.click();
      } else await page.getByTestId("paso-1").click();
      await expect(panel).not.toHaveAttribute("data-paso", "3");
      continue;
    }
    const boton = page.getByTestId(actual < n ? "siguiente" : "anterior");
    await expect(boton).toBeEnabled();
    await boton.click();
  }
  await expect(panel).toHaveAttribute("data-paso", String(n));
}

/**
 * En CI no se consulta la red: las calles de OpenStreetMap y la búsqueda del lugar responden vacío (lo
 * mismo que hace la app si no responden). La escena fácil ofrece entonces las flechas por puntos
 * cardinales.
 */
export async function sinRed(page: Page) {
  await page.route("**/api/osm?**", (r) => r.fulfill({ json: { elements: [] } }));
  await page.route("**/api/lugar?**", (r) => r.fulfill({ json: { resultados: [] } }));
}

/** El mapa de la escena fácil, listo, al trabajar (un reporte de la reproducción abre al presentar). */
export async function mapaFacil(page: Page) {
  const recorrido = page.getByTestId("recorrido-caso");
  if ((await recorrido.getAttribute("data-modo")) === "presentar")
    await page.getByTestId("modo-trabajar").click();
  const mapa = page.getByTestId("mapa-facil");
  await expect(mapa).toHaveAttribute("data-listo", "si", { timeout: 30_000 });
  return mapa;
}

/**
 * Toca el mapa de la escena fácil a (este, norte) metros del centro de un marcador (`choque-1`…):
 * con la escala que el mapa publica en `data-m-por-px`.
 */
export async function tocarEnMetros(page: Page, desde: string, este: number, norte: number) {
  const mapa = page.getByTestId("mapa-facil");
  await expect(mapa).toHaveAttribute("data-m-por-px", /\d/);
  await page.waitForTimeout(700); // el mapa termina de moverse
  const m = Number(await mapa.getAttribute("data-m-por-px"));
  const caja = (await mapa.boundingBox())!;
  const ref = (await page.getByTestId(desde).boundingBox())!;
  await mapa.click({
    position: {
      x: ref.x + ref.width / 2 + este / m - caja.x,
      y: ref.y + ref.height / 2 - norte / m - caja.y,
    },
  });
}

/**
 * Las tres preguntas de C1 (W3) y el botón que las contesta sin agregar evidencia: «No sé» dónde fue
 * el primer golpe, «No» chocó contra algo más y seguir sin puntos de paso.
 */
const BOTON_C1: [RegExp, string][] = [
  [/primer golpe/, "golpe-nose"],
  [/algo más/, "otros-no"],
  [/por dónde pasó/, "paso-listo"],
];

/**
 * Después de colocar a mano los vehículos de un caso nuevo: contesta las tres preguntas de C1 con lo
 * que no agrega evidencia, hasta «¡La escena está lista!». En una escena que llega completa no se
 * preguntan y no hace nada.
 */
export async function contestarC1(page: Page) {
  const lista = page.getByTestId("escena-lista");
  const pregunta = page.getByTestId("escena-pregunta");
  for (let k = 0; k < 3; k++) {
    // La pregunta anterior tarda un instante en cambiar: se espera a la lista o a una de C1.
    await expect
      .poll(async () => {
        if (await lista.isVisible()) return true;
        const t = (await pregunta.textContent()) ?? "";
        return BOTON_C1.some(([rx]) => rx.test(t));
      })
      .toBe(true);
    if (await lista.isVisible()) return;
    const texto = (await pregunta.textContent()) ?? "";
    const c1 = BOTON_C1.find(([rx]) => rx.test(texto));
    if (!c1) return;
    await page.getByTestId(c1[1]).click();
    await expect
      .poll(async () => (await lista.isVisible()) || (await pregunta.textContent()) !== texto)
      .toBe(true);
  }
}

/**
 * Contesta la escena fácil hasta «¡La escena está lista!», con lo que Croquis propone: cada choque
 * con un toque, por dónde venía cada vehículo con la flecha resaltada y «Quedó junto al choque».
 * Sirve para cualquier caso (dos vehículos, carambola, reporte) cuando la prueba no mira las
 * posiciones.
 */
export async function colocarTodo(page: Page) {
  await sinRed(page);
  const mapa = await mapaFacil(page);
  const lista = page.getByTestId("escena-lista");
  const pregunta = page.getByTestId("escena-pregunta");
  for (let k = 0; k < 20; k++) {
    if (await lista.isVisible()) break;
    const texto = (await pregunta.textContent()) ?? "";
    const c1 = BOTON_C1.find(([rx]) => rx.test(texto));
    if (c1) {
      await page.getByTestId(c1[1]).click();
    } else if (/^¿Dónde fue/.test(texto)) {
      const caja = (await mapa.boundingBox())!;
      await mapa.click({ position: { x: caja.width * 0.7 + k * 14, y: caja.height * 0.45 } });
    } else if (texto.startsWith("¿Por dónde")) {
      const propuesta = page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]');
      await (
        (await propuesta.count()) ? propuesta.first() : page.getByTestId("opcion-flecha-0")
      ).click();
    } else {
      await page.getByTestId("final-junto").click();
      await page.getByTestId("listo-final").click();
    }
    await expect
      .poll(async () => (await lista.isVisible()) || (await pregunta.textContent()) !== texto)
      .toBe(true);
  }
  await expect(lista).toBeVisible();
}

/** Los identificadores internos de fuente que no son palabras («dictamen_importado»…). */
const IDS_FUENTE = [...Fuente.options, ...FuenteExpediente.options].filter(
  (f) => palabra(FUENTE, f, "es") !== f,
);

/**
 * Ninguna fuente aparece en pantalla como identificador interno (ADR 0083): cada etiqueta de fuente
 * dice su palabra legible y ningún identificador con guion bajo llega al texto visible.
 */
export async function sinIdentificadoresDeFuente(page: Page) {
  const etiquetas = page.locator("[data-fuente]");
  for (const e of await etiquetas.all()) {
    const f = (await e.getAttribute("data-fuente"))!;
    await expect(e, `fuente ${f}`).toHaveText(palabra(FUENTE, f, "es"));
  }
  const texto = await page.locator("body").innerText();
  for (const f of IDS_FUENTE.filter((f) => f.includes("_"))) expect(texto).not.toContain(f);
}
