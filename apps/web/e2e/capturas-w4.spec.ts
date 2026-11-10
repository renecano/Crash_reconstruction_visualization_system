import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { irAPaso, mapaFacil, sinRed, tocarEnMetros } from "./ayuda-recorrido";

// La transición entre actos (ADR 0108) es decorativa; con movimiento reducido no se monta.
test.use({ reducedMotion: "reduce" });

/** La lectura grabada de Claude de la narración de ejemplo (E-R1; CI no llama a la API). */
const GRABACION = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { salida: unknown };

const SALIDA = join(__dirname, "../../../docs/cesvi/w4");
mkdirSync(SALIDA, { recursive: true });
const foto = (page: Page, nombre: string) =>
  page.screenshot({ path: join(SALIDA, `${nombre}.png`), animations: "disabled" });

/** Arrastra un marcador del mapa (este, norte) metros, con la escala que publica el mapa. */
async function arrastrarEnMetros(page: Page, testid: string, este: number, norte: number) {
  const mapa = page.getByTestId("mapa-facil");
  const m = Number(await mapa.getAttribute("data-m-por-px"));
  const caja = (await page.getByTestId(testid).boundingBox())!;
  const x = caja.x + caja.width / 2;
  const y = caja.y + caja.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++)
    await page.mouse.move(x + (k * este) / m / 8, y - (k * norte) / m / 8);
  await page.mouse.up();
}

test("@capturas W4: corregir después, para el resumen de René", async ({ page }) => {
  test.setTimeout(240_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
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
  await page.route("**/api/cesvi/escena", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ metodo: "claude", salida: GRABACION.salida }),
    }),
  );
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await irAPaso(page, 2);
  await page.getByTestId("ejemplo-narracion").click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toContainText("2 vehículos · 1 impacto");
  await sinRed(page);
  await irAPaso(page, 3);

  // La escena: el choque, los dos vehículos y, después, el Camaro contra un poste.
  const pregunta = page.getByTestId("escena-pregunta");
  const mapa = await mapaFacil(page);
  const caja = (await mapa.boundingBox())!;
  await mapa.click({ position: { x: caja.width * 0.6, y: caja.height * 0.45 } });
  await expect(pregunta).toHaveText("¿Por dónde venía el Jetta?");
  await page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]').click();
  await expect(pregunta).toHaveText("¿Dónde quedó después del choque?");
  await tocarEnMetros(page, "choque-1", 6, 8);
  await page.getByTestId("listo-final").click();
  await expect(pregunta).toHaveText("¿Por dónde venía el Camaro?");
  await page.getByTestId("no-se-direccion").click();
  await page.getByTestId("final-junto").click();
  await page.getByTestId("listo-final").click();
  await expect(pregunta).toHaveText("¿Dónde fue el primer golpe?");
  await page.getByTestId("golpe-nose").click();
  await expect(pregunta).toHaveText("¿Chocó contra algo más?");
  await page.getByTestId("otros-si").click();
  await page.getByTestId("otros-vehiculo-V2").click();
  await page.getByTestId("otros-objeto-0").click();
  await tocarEnMetros(page, "choque-1", 18, 3);
  await expect(page.getByTestId("marca-objeto-2")).toHaveCount(1);
  await page.getByTestId("otros-no").click();
  await page.getByTestId("paso-listo").click();
  await expect(page.getByTestId("escena-lista")).toBeVisible();

  await foto(page, "1-resumen-con-cambiar");
  // Cada línea del resumen lleva «Cambiar».
  await expect(page.locator('[data-testid^="cambiar-linea-"]')).not.toHaveCount(0);

  // La primera reconstrucción.
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  const cifra = page.getByTestId("cifra-reconstruccion");
  await expect(cifra).toBeVisible({ timeout: 90_000 });
  const antes = await cifra.innerText();

  // 1. Mover el poste: se toca, se arrastra 10 m y, al soltar, se recalcula.
  await irAPaso(page, 3);
  await page.getByTestId("cambiar-algo").click();
  await expect(page.getByTestId("panel-corregir")).toBeVisible();
  await foto(page, "2-corregir-la-escena");
  await page.getByTestId("marca-objeto-2").click();
  await expect(page.getByTestId("seleccion-nombre")).toHaveText(/poste/i);
  await foto(page, "3-poste-seleccionado");
  await arrastrarEnMetros(page, "marca-objeto-2", 10, 0);
  await expect(page.getByTestId("mensaje-exito")).toContainText("Moviste");
  await expect(page.getByTestId("recalculo")).toHaveAttribute("data-estado", "al_dia", {
    timeout: 90_000,
  });
  await foto(page, "4-poste-movido-recalculado");
  await page.getByTestId("sel-listo").click();
  // Un objeto del lugar desde la paleta: una barrera.
  await page.getByTestId("paleta-barrera").click();
  await tocarEnMetros(page, "choque-1", -8, 6);
  await expect(page.getByTestId("seleccion")).toBeVisible();
  await foto(page, "5-barrera-agregada");
  await page.getByTestId("sel-listo").click();
  await irAPaso(page, 4);
  await expect(cifra).toBeVisible();
  const conPosteMovido = await cifra.innerText();
  expect(conPosteMovido).not.toEqual(antes);

  // 2. Corregir la dirección del Jetta, ya colocado: se toca y «Cambiar por dónde venía».
  await irAPaso(page, 3);
  await page.getByTestId("cambiar-algo").click();
  // El marcador del coche no tiene tamaño: se toca su cuerpo, como lo toca el perito.
  await page.locator('[data-testid="coche-V1-final"] .escena-coche-cuerpo').click();
  await foto(page, "6-jetta-seleccionado");
  await page.getByTestId("sel-cambiar-direccion").click();
  await expect(pregunta).toHaveText("¿Por dónde venía el Jetta?");
  await page.locator('[data-testid^="opcion-flecha-"][data-propuesta="no"]').first().click();
  await expect(page.getByTestId("recalculo")).toHaveAttribute("data-estado", "al_dia", {
    timeout: 90_000,
  });
  // «Deshacer» y «Rehacer» siguen a la vista.
  await expect(page.getByTestId("deshacer-barra")).toBeEnabled();
  await irAPaso(page, 4);
  await expect(cifra).toBeVisible();
  expect(await cifra.innerText()).not.toEqual(conPosteMovido);
  expect(errores).toEqual([]);
});
