import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso, mapaFacil, sinRed, tocarEnMetros } from "./ayuda-recorrido";

// La transición entre actos (ADR 0108) es decorativa; con movimiento reducido no se monta.
test.use({ reducedMotion: "reduce" });

/** Capturas del poste (René, 2026-11-25): por dónde pasa el GM Camaro y dónde queda el poste. Solo la corre el flujo «Capturas». */
const SALIDA = process.env.CROQUIS_CAPTURAS ?? "capturas-poste";

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

for (const esc of [
  { nombre: "en-su-recorrido", finalCamaro: [5, 5] as const, poste: [6.5, 6.5] as const },
  { nombre: "fuera", finalCamaro: null, poste: [18, 3] as const },
])
  test(`capturas del poste: ${esc.nombre}`, async ({ page }) => {
    test.setTimeout(300_000);
    mkdirSync(SALIDA, { recursive: true });
    const foto = async (nombre: string) => {
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(SALIDA, `${esc.nombre}-${nombre}.png`) });
    };
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

    // La escena: el choque, los dos vehículos y, después, el GM Camaro contra un poste.
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
    if (esc.finalCamaro)
      await tocarEnMetros(page, "choque-1", esc.finalCamaro[0], esc.finalCamaro[1]);
    else await page.getByTestId("final-junto").click();
    await page.getByTestId("listo-final").click();
    await expect(pregunta).toHaveText("¿Dónde fue el primer golpe?");
    await page.getByTestId("golpe-nose").click();
    await expect(pregunta).toHaveText("¿Chocó contra algo más?");
    await page.getByTestId("otros-si").click();
    await page.getByTestId("otros-vehiculo-V2").click();
    await page.getByTestId("otros-objeto-0").click();
    await tocarEnMetros(page, "choque-1", esc.poste[0], esc.poste[1]);
    await expect(page.getByTestId("marca-objeto-2")).toHaveCount(1);
    await page.getByTestId("otros-no").click();
    await page.getByTestId("paso-listo").click();
    await page.getByTestId("terreno-liso").click();
    await expect(page.getByTestId("escena-lista")).toBeVisible();
    await foto("1-escena-con-poste");

    // Cada línea del resumen lleva «Cambiar».
    await expect(page.locator('[data-testid^="cambiar-linea-"]')).not.toHaveCount(0);

    // La primera reconstrucción.
    await irAPaso(page, 4);
    await page.getByTestId("reconstruir").click();
    const cifra = page.getByTestId("cifra-reconstruccion");
    await expect(cifra).toBeVisible({ timeout: 90_000 });
    const antes = await cifra.innerText();
    await foto("2-reconstruccion-2d");
    await page
      .getByRole("button", { name: "Ver todo" })
      .click()
      .catch(() => undefined);
    await foto("3-reconstruccion-2d-todo");

    // 1. Mover el poste: se toca, se arrastra 10 m y, al soltar, se recalcula.
    await irAPaso(page, 3);
    await page.getByTestId("cambiar-algo").click();
    await expect(page.getByTestId("panel-corregir")).toBeVisible();
    await page.getByTestId("marca-objeto-2").click();
    await expect(page.getByTestId("seleccion-nombre")).toHaveText(/poste/i);
    await arrastrarEnMetros(page, "marca-objeto-2", 10, 0);
    await expect(page.getByTestId("mensaje-exito")).toContainText("Moviste");
    await foto("4-escena-poste-movido");
    // Mover algo de la escena con la reconstrucción hecha: avisa y ofrece reconstruir de nuevo.
    await expect(page.getByTestId("aviso-escena-cambio")).toBeVisible();
    await page.getByTestId("reconstruir-de-nuevo").click();
    await expect(page.getByTestId("recalculo")).toHaveAttribute("data-estado", "al_dia", {
      timeout: 90_000,
    });
    await page.getByTestId("sel-listo").click();
    await irAPaso(page, 4);
    await expect(cifra).toBeVisible();
    const conPosteMovido = await cifra.innerText();
    await foto("5-reconstruccion-2d-poste-movido");
    await page
      .getByRole("button", { name: "Ver todo" })
      .click()
      .catch(() => undefined);
    await foto("6-reconstruccion-2d-todo-poste-movido");
    writeFileSync(
      join(SALIDA, `${esc.nombre}-cifras.json`),
      JSON.stringify({ antes, conPosteMovido }, null, 1),
    );
    expect(errores).toEqual([]);
  });
