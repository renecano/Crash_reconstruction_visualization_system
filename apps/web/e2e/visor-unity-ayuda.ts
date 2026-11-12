/** Ayudas de las e2e del visor Unity (U6): el caso con un poste y lo que la web le manda a Unity. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { irAPaso, mapaFacil, sinRed, tocarEnMetros } from "./ayuda-recorrido";

/** La lectura grabada de Claude de la narración de ejemplo (E-R1; CI no llama a la API). */
const GRABACION = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { salida: unknown };

export interface MensajeEnviado {
  metodo: string;
  datos: Record<string, unknown>;
}

/** Lo que la web le mandó a Unity (`window.__croquisPuente`, solo en navegadores automatizados). */
export const recibidosDelPuente = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __croquisPuente?: { enviados: MensajeEnviado[] } }).__croquisPuente
        ?.enviados ?? [],
  );

/** La escena de «Corregir después» (W4): dos vehículos y el Camaro contra un poste. */
export async function casoConPoste(page: Page) {
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
  const pregunta = page.getByTestId("escena-pregunta");
  const mapa = await mapaFacil(page);
  const caja = (await mapa.boundingBox())!;
  await mapa.click({ position: { x: caja.width * 0.6, y: caja.height * 0.45 } });
  await expect(pregunta).toHaveText("¿Por dónde venía el Jetta?");
  await page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]').click();
  await tocarEnMetros(page, "choque-1", 6, 8);
  await page.getByTestId("listo-final").click();
  await page.getByTestId("no-se-direccion").click();
  await page.getByTestId("final-junto").click();
  await page.getByTestId("listo-final").click();
  await page.getByTestId("golpe-nose").click();
  await page.getByTestId("otros-si").click();
  await page.getByTestId("otros-vehiculo-V2").click();
  await page.getByTestId("otros-objeto-0").click();
  await tocarEnMetros(page, "choque-1", 18, 3);
  await page.getByTestId("otros-no").click();
  await page.getByTestId("paso-listo").click();
  await page.getByTestId("terreno-liso").click();
  await expect(page.getByTestId("escena-lista")).toBeVisible();
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 90_000 });
}
