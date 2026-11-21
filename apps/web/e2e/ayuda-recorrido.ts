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
        // Ronda 4 (René, 2026-11-20): La escena nueva (la lista de la propuesta 1) no tiene la barra
        // de pasos; «Ver la reconstrucción» va dentro del panel. La guía («Entendido») se cierra.
        const lista = page.getByTestId("lista-escena");
        if (await lista.isVisible().catch(() => false)) {
          const guia = page.getByTestId("cerrar-guia");
          if (await guia.isVisible().catch(() => false)) await guia.click();
          const ver = page.getByTestId("lista-ver-reconstruccion");
          await expect(ver, `La escena no deja seguir: ${await lista.innerText()}`).toBeEnabled({
            timeout: 30_000,
          });
          await ver.click();
        } else {
          const ver = page.getByTestId("avance-ver-reconstruccion");
          const falta = page.getByTestId("avance-falta");
          await expect(
            ver,
            `La escena no deja seguir: ${(await falta.isVisible().catch(() => false)) ? await falta.textContent() : "sin aviso"}`,
          ).toBeEnabled({ timeout: 30_000 });
          await ver.click();
        }
      } else await page.getByTestId("paso-1").click();
      await expect(panel).not.toHaveAttribute("data-paso", "3");
      continue;
    }
    const boton = page.getByTestId(actual < n ? "siguiente" : "anterior");
    await expect(boton).toBeEnabled();
    await boton.click();
    // «El trazo» (A1) se recoge antes de pasar a la narración: se espera el cambio de paso.
    await expect(panel).not.toHaveAttribute("data-paso", String(actual), { timeout: 3000 });
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
 * Las tres preguntas de C1 (W3) y la del terreno (C3, W5), con el botón que las contesta sin agregar
 * evidencia: «No sé» dónde fue el primer golpe, «No» chocó contra algo más, seguir sin puntos de
 * paso y «Es pavimento liso».
 */
const BOTON_C1: [RegExp, string][] = [
  [/primer golpe/, "golpe-nose"],
  [/algo más/, "otros-no"],
  [/por dónde pasó/, "paso-listo"],
  [/Cómo es el terreno/, "terreno-liso"],
];

/**
 * Después de colocar a mano los vehículos de un caso nuevo: contesta las tres preguntas de C1 con lo
 * que no agrega evidencia, hasta «¡La escena está lista!». En una escena que llega completa no se
 * preguntan y no hace nada.
 */
export async function contestarC1(page: Page) {
  const lista = page.getByTestId("escena-lista");
  const pregunta = page.getByTestId("escena-pregunta");
  for (let k = 0; k < BOTON_C1.length; k++) {
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

/**
 * Después de cambiar la escena con una reconstrucción hecha, la escena ya no se recalcula sola
 * (René, 2026-11-17): avisa que cambió y ofrece «Reconstruir de nuevo». Si el aviso aparece, se toca;
 * luego se espera a que la reconstrucción esté al día. Las respuestas a una pregunta sí recalculan
 * solas: ahí no hay aviso.
 */
export async function reconstruirSiCambio(page: Page) {
  const boton = page.getByTestId("reconstruir-de-nuevo");
  if (await boton.isVisible().catch(() => false)) await boton.click();
  await expect(page.getByTestId("recalculo")).toHaveAttribute("data-estado", "al_dia", {
    timeout: 90_000,
  });
}

/** Contesta lo que pregunte la lectura: el típico si lo ofrece; si no, «No sé». */
export async function contestarPreguntas(page: Page) {
  for (let k = 0; k < 20; k++) {
    const pregunta = page.locator('[data-testid^="pregunta-"]').first();
    if (!(await pregunta.isVisible().catch(() => false))) return;
    const tipico = pregunta.locator('[data-testid^="usar-tipico-"]');
    const nose = pregunta.locator('[data-testid^="no-se-"]');
    const opcion = pregunta.locator('[data-testid^="opcion-"]').first();
    if (await tipico.count()) await tipico.click();
    else if (await nose.count()) await nose.click();
    else if (await opcion.count()) await opcion.click();
    else return;
    await page.waitForTimeout(400);
  }
}

/** La escena ya armada (flujo de la lista): confirma lo propuesto y contesta lo que falta. */
export async function cerrarLaEscena(page: Page) {
  const lista = page.getByTestId("lista-escena");
  await expect(lista).toBeVisible({ timeout: 90_000 });
  const cerrarGuia = page.getByTestId("cerrar-guia");
  if (await cerrarGuia.isVisible().catch(() => false)) await cerrarGuia.click();
  // Que llegue la propuesta (con las calles) antes de seguir.
  await page.waitForTimeout(12_000);
  for (let k = 0; k < 30; k++) {
    const ver = page.getByTestId("lista-ver-reconstruccion");
    if (await ver.isEnabled().catch(() => false)) return;
    const confirmar = page.locator('[data-testid^="confirmar-"]').first();
    if (await confirmar.isVisible().catch(() => false)) {
      await confirmar.click();
      continue;
    }
    const marcar = page.locator('[data-testid^="marcar-"]').first();
    if (!(await marcar.isVisible().catch(() => false))) break;
    const id = (await marcar.getAttribute("data-testid")) ?? "";
    await marcar.click();
    if (id.startsWith("marcar-choque")) {
      const mapa = await mapaFacil(page);
      const caja = (await mapa.boundingBox())!;
      await mapa.click({ position: { x: caja.width * 0.5, y: caja.height * 0.5 } });
    } else if (id.startsWith("marcar-direccion")) {
      const propuesta = page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]');
      await (
        (await propuesta.count()) ? propuesta.first() : page.getByTestId("opcion-flecha-0")
      ).click();
    } else if (id.startsWith("marcar-final")) {
      await page.getByTestId("final-junto").click();
      await page.getByTestId("listo-final").click();
    } else {
      for (const b of ["golpe-nose", "otros-no", "paso-listo", "terreno-liso"]) {
        const x = page.getByTestId(b);
        if (await x.isVisible().catch(() => false)) {
          await x.click();
          break;
        }
      }
    }
    await expect(lista).toBeVisible({ timeout: 30_000 });
  }
}

/**
 * Las masas del crucero de ejemplo, si se preguntan: la de V1 con «No sé» y la de V2 con 1450 kg.
 * Con la ficha del fabricante del modelo leído (René, 2026-11-21) ya no se preguntan.
 */
export async function contestarMasas(page: Page) {
  const nose = page.getByTestId("no-se-masa-V1");
  if (await nose.isVisible().catch(() => false)) await nose.click();
  const v2 = page.getByTestId("pregunta-masa-V2");
  if (await v2.isVisible().catch(() => false)) {
    await page.getByTestId("valor-masa-V2").fill("1450");
    await v2.getByRole("button", { name: "Usar", exact: true }).click();
  }
}
