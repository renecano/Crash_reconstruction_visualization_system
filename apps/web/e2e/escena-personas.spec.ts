import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "./base";
import { irAPaso, mapaFacil, sinRed, tocarEnMetros } from "./ayuda-recorrido";

// La transición entre actos (ADR 0108) es decorativa; con movimiento reducido no se monta.
test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

/** La lectura grabada de Claude de la narración de ejemplo (E-R1; CI no llama a la API). */
const GRABACION = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { salida: unknown };
const CAPTURAS = resolve(__dirname, "../../../docs/cesvi/ronda-4/evidencia/personas");

/**
 * Peatones y ciclistas en La escena (René, 2026-11-18, A3): se colocan, se seleccionan, se giran,
 * se marca dónde quedaron (la distancia de proyección), se quitan y se deshace, como los vehículos.
 */
test("@flujo /cesvi: un peatón en La escena — colocar, girar, dónde quedó, quitar y deshacer", async ({
  page,
}) => {
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

  // La escena del ejemplo, lo más corto: el choque, el VW Jetta y el GM Camaro.
  const pregunta = page.getByTestId("escena-pregunta");
  const mapa = await mapaFacil(page);
  const caja = (await mapa.boundingBox())!;
  await mapa.click({ position: { x: caja.width * 0.6, y: caja.height * 0.45 } });
  await expect(pregunta).toHaveText("¿Por dónde venía el VW Jetta?");
  await page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]').click();
  await tocarEnMetros(page, "choque-1", 6, 8);
  await page.getByTestId("listo-final").click();
  await expect(pregunta).toHaveText("¿Por dónde venía el GM Camaro?");
  await page.getByTestId("no-se-direccion").click();
  await page.getByTestId("final-junto").click();
  await page.getByTestId("listo-final").click();
  await page.getByTestId("golpe-nose").click();
  await page.getByTestId("otros-no").click();
  await page.getByTestId("paso-listo").click();
  await page.getByTestId("terreno-liso").click();
  await expect(page.getByTestId("escena-lista")).toBeVisible();

  // Agregar un peatón a 4 m del choque: queda seleccionado, con su nombre.
  await page.getByTestId("cambiar-algo").click();
  await expect(page.getByTestId("panel-corregir")).toBeVisible();
  await page.getByTestId("agregar-peaton").click();
  await tocarEnMetros(page, "choque-1", 4, 0);
  const peaton = page.getByTestId("persona-per-1");
  await expect(peaton).toHaveCount(1);
  await expect(page.getByTestId("seleccion-nombre")).toHaveText("Peatón");
  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: join(CAPTURAS, "despues-1-peaton-seleccionado.jpg"), quality: 82 });

  // Girarlo con el teclado (E: 15° a la derecha) y marcar dónde quedó, 12 m al norte.
  await page.keyboard.press("e");
  await page.getByTestId("marcar-final-persona").click();
  await tocarEnMetros(page, "choque-1", 4, 12);
  await expect(page.getByTestId("proyeccion-persona")).toContainText(/Proyección 1[12]\.\d m/);
  await page.screenshot({ path: join(CAPTURAS, "despues-2-proyeccion.jpg"), quality: 82 });

  // Quitarlo y deshacer.
  await page.getByTestId("sel-quitar").click();
  await expect(peaton).toHaveCount(0);
  await page.getByTestId("deshacer-barra").click();
  await expect(peaton).toHaveCount(1);
  await expect(page.getByTestId("proyeccion-persona")).toHaveCount(1);
  expect(errores).toEqual([]);
});
