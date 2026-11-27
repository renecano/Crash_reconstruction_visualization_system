import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso, mapaFacil, sinRed, tocarEnMetros } from "./ayuda-recorrido";

// La transición entre actos (ADR 0108) es decorativa; con movimiento reducido no se monta.
test.use({ reducedMotion: "reduce" });

/**
 * Los detalles que vio Alberto (René, 2026-11-26): el «km/h» junto a una cifra de tres dígitos en
 * anchos de panel angostos, claro y oscuro, y Presentar (la leyenda y «Salir · Esc» sobre el 3D). La
 * cifra es la de una reconstrucción real: el poste en el recorrido del GM Camaro y movido 10 m al
 * oriente da 121 km/h (calibración del 2026-11-25). Solo la corre el flujo «Capturas».
 */
const SALIDA = process.env.CROQUIS_CAPTURAS ?? "capturas-alberto";

/** La lectura grabada de Claude de la narración de ejemplo (E-R1; CI no llama a la API). */
const GRABACION = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { salida: unknown };

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

test("capturas de los detalles de Alberto", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(SALIDA, { recursive: true });
  const foto = async (nombre: string) => {
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(SALIDA, `${nombre}.png`) });
  };
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
  await expect(pregunta).toHaveText("¿Por dónde venía el VW Jetta?");
  await page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]').click();
  await expect(pregunta).toHaveText("¿Dónde quedó después del choque?");
  await tocarEnMetros(page, "choque-1", 6, 8);
  await page.getByTestId("listo-final").click();
  await expect(pregunta).toHaveText("¿Por dónde venía el GM Camaro?");
  await page.getByTestId("no-se-direccion").click();
  await tocarEnMetros(page, "choque-1", -5, 5);
  await page.getByTestId("listo-final").click();
  await expect(pregunta).toHaveText("¿Dónde fue el primer golpe?");
  await page.getByTestId("golpe-nose").click();
  await expect(pregunta).toHaveText("¿Chocó contra algo más?");
  await page.getByTestId("otros-si").click();
  await page.getByTestId("otros-vehiculo-V2").click();
  await page.getByTestId("otros-objeto-0").click();
  await tocarEnMetros(page, "choque-1", -7.5, 7.5);
  await expect(page.getByTestId("marca-objeto-2")).toHaveCount(1);
  await page.getByTestId("otros-no").click();
  await page.getByTestId("paso-listo").click();
  await page.getByTestId("terreno-liso").click();
  await expect(page.getByTestId("escena-lista")).toBeVisible();
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  const cifra = page.getByTestId("cifra-reconstruccion");
  await expect(cifra).toBeVisible({ timeout: 90_000 });
  // El poste 10 m al oriente: 121 km/h del GM Camaro.
  await irAPaso(page, 3);
  await page.getByTestId("cambiar-algo").click();
  await page.getByTestId("marca-objeto-2").click();
  await arrastrarEnMetros(page, "marca-objeto-2", 10, 0);
  await expect(page.getByTestId("mensaje-exito")).toContainText("Moviste");
  await page.getByTestId("reconstruir-de-nuevo").click();
  await expect(page.getByTestId("recalculo")).toHaveAttribute("data-estado", "al_dia", {
    timeout: 90_000,
  });
  await page.getByTestId("sel-listo").click();
  await irAPaso(page, 4);
  await expect(cifra).toBeVisible();
  writeFileSync(
    join(SALIDA, "cifra.txt"),
    await page.getByTestId("cifra-reconstruida").innerText(),
  );

  // El panel de la cifra en cuatro anchos, claro y oscuro.
  for (const tema of ["claro", "oscuro"] as const) {
    await page.evaluate((t) => {
      localStorage.setItem("croquis.cesvi.tema.trabajar", t);
      window.dispatchEvent(new Event("croquis-cesvi-tema"));
    }, tema);
    for (const ancho of [1440, 1280, 1024, 390]) {
      await page.setViewportSize({ width: ancho, height: 900 });
      await cifra.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await cifra.screenshot({ path: join(SALIDA, `panel-${tema}-${ancho}.png`) });
    }
  }

  // Presentar, claro: la leyenda y «Salir · Esc» sobre el 3D.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("modo-presentar").first().click();
  await expect(page.getByTestId("salir-presentar")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(4000);
  await foto("presentar-claro");
});
