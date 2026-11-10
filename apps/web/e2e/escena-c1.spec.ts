import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
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

test("@flujo /cesvi: el primer golpe, un choque contra algo más y un punto de paso (C1)", async ({
  page,
}) => {
  test.setTimeout(150_000);
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

  // Los vehículos, como siempre: el choque, por dónde venía cada uno y dónde quedó.
  const pregunta = page.getByTestId("escena-pregunta");
  await expect(pregunta).toHaveText("¿Dónde fue el choque?");
  const mapa = await mapaFacil(page);
  const caja = (await mapa.boundingBox())!;
  await mapa.click({ position: { x: caja.width * 0.6, y: caja.height * 0.45 } });
  await expect(page.getByTestId("choque-1")).toHaveCount(1);
  await expect(pregunta).toHaveText("¿Por dónde venía el Jetta?");
  await page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]').click();
  await page.getByTestId("final-junto").click();
  await page.getByTestId("listo-final").click();
  await expect(pregunta).toHaveText("¿Por dónde venía el Camaro?");
  await page.getByTestId("no-se-direccion").click();
  await page.getByTestId("final-junto").click();
  await page.getByTestId("listo-final").click();

  // 1. El primer golpe: un toque en el mapa, con su mensaje de éxito y su marca.
  await expect(pregunta).toHaveText("¿Dónde fue el primer golpe?");
  await expect(page.getByTestId("escena-lista")).toHaveCount(0);
  await tocarEnMetros(page, "choque-1", -7, -6);
  await expect(page.getByTestId("mensaje-exito")).toContainText(
    "Marcaste dónde fue el primer golpe",
  );
  await expect(page.getByTestId("marca-golpe")).toHaveCount(1);

  // 2. ¿Chocó contra algo más? Sí: el Camaro, contra un poste, y se toca dónde fue.
  await expect(pregunta).toHaveText("¿Chocó contra algo más?");
  await page.getByTestId("otros-si").click();
  await expect(page.getByTestId("otros-toca")).toContainText("Elige y después toca el mapa");
  await page.getByTestId("otros-vehiculo-V2").click();
  await page.getByTestId("otros-objeto-0").click();
  await expect(page.getByTestId("otros-toca")).toContainText("el Camaro chocó contra un poste");
  await tocarEnMetros(page, "choque-1", 18, 3);
  await expect(page.getByTestId("mensaje-exito")).toContainText("chocó contra un poste ahí");
  await expect(page.getByTestId("marca-objeto-2")).toHaveCount(1);
  await expect(page.getByTestId("otros-marcados")).toContainText("El Camaro contra un poste");
  // La pregunta sigue abierta hasta decir que es todo.
  await expect(pregunta).toHaveText("¿Chocó contra algo más?");
  await page.getByTestId("otros-no").click();

  // 3. ¿Sabes por dónde pasó? Opcional: un punto del Camaro, y «Listo».
  await expect(pregunta).toHaveText("¿Sabes por dónde pasó?");
  await page.getByTestId("paso-vehiculo-V2").click();
  await tocarEnMetros(page, "choque-1", 9, 1.5);
  await expect(page.getByTestId("marca-paso-V2-1")).toHaveCount(1);
  await expect(page.getByTestId("paso-cuenta")).toContainText("Un punto del Camaro");
  await page.getByTestId("paso-listo").click();

  // ¡La escena está lista!, con lo marcado en el resumen.
  await expect(page.getByTestId("escena-lista")).toBeVisible();
  const resumen = page.getByTestId("escena-resumen");
  await expect(resumen).toContainText("El primer golpe, donde lo marcaste");
  await expect(resumen).toContainText("el Camaro chocó contra un poste");
  await expect(resumen).toContainText("El Camaro pasó por el punto que marcaste");

  // La reconstrucción usa lo marcado como evidencia.
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 90_000 });
  const evidencia = page.getByTestId("evidencia-usada");
  await expect(evidencia).toContainText("punto del primer golpe que marcó el perito");
  await expect(evidencia).toContainText("punto de paso 1 de V2");
  await expect(evidencia).toContainText("lugar del choque intermedio (impacto 2)");
  expect(errores).toEqual([]);
});
