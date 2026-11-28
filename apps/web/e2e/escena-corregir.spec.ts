import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { reconstruirSiCambio, irAPaso, mapaFacil, sinRed, tocarEnMetros } from "./ayuda-recorrido";

// La transición entre actos (ADR 0108) es decorativa; con movimiento reducido no se monta.
test.use({ reducedMotion: "reduce" });

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

test("@flujo /cesvi: corregir después — el poste golpeado en el recorrido del Camaro y la dirección de un vehículo cambian el resultado; un poste suelto fuera de los recorridos, no (W4)", async ({
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
  // El Jetta lo golpea en su costado derecho: el Camaro sale empujado al noroeste y queda a 5 m.
  await tocarEnMetros(page, "choque-1", -5, 5);
  await page.getByTestId("listo-final").click();
  await expect(pregunta).toHaveText("¿Dónde fue el primer golpe?");
  await page.getByTestId("golpe-nose").click();
  await expect(pregunta).toHaveText("¿Chocó contra algo más?");
  await page.getByTestId("otros-si").click();
  await page.getByTestId("otros-vehiculo-V2").click();
  await page.getByTestId("otros-objeto-0").click();
  // El poste contra el que chocó, primero lejos de donde quedó el Camaro.
  await tocarEnMetros(page, "choque-1", 18, 3);
  await expect(page.getByTestId("marca-objeto-2")).toHaveCount(1);
  await page.getByTestId("otros-no").click();
  await page.getByTestId("paso-listo").click();
  await page.getByTestId("terreno-liso").click();
  await expect(page.getByTestId("escena-lista")).toBeVisible();

  // Cada línea del resumen lleva «Cambiar».
  await expect(page.locator('[data-testid^="cambiar-linea-"]')).not.toHaveCount(0);

  // La primera reconstrucción.
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  const cifra = page.getByTestId("cifra-reconstruccion");
  await expect(cifra).toBeVisible({ timeout: 90_000 });
  const antes = await cifra.innerText();
  // Sin el aviso del límite de la vía.
  await expect(page.getByTestId("sobre-el-limite")).toHaveCount(0);

  // 1. El poste contra el que chocó el Camaro, al recorrido del Camaro (donde se detiene): se toca,
  // se arrastra y, al soltar, se recalcula. El resultado cambia (René, 2026-11-25). Desde el
  // 2026-11-28 el poste narrado entra solo al cálculo, donde quedó el Camaro (#411), y llevarlo 25 m
  // más allá ya no da una cifra: la reconstrucción dice que no cuadra. El aviso del límite de la vía
  // junto a la cifra lo prueba `hoja-reconstruccion.test.tsx`.
  await irAPaso(page, 3);
  await page.getByTestId("cambiar-algo").click();
  await expect(page.getByTestId("panel-corregir")).toBeVisible();
  await page.getByTestId("marca-objeto-2").click();
  await expect(page.getByTestId("seleccion-nombre")).toHaveText(/poste/i);
  await arrastrarEnMetros(page, "marca-objeto-2", -25.5, 4.5);
  await expect(page.getByTestId("mensaje-exito")).toContainText("Moviste");
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
  expect(conPosteMovido).not.toEqual(antes);
  await expect(cifra).toContainText("La reconstrucción no cuadra");

  // 1b. La prueba contraria: un poste de la paleta, que nadie golpeó, lejos de los dos recorridos, no
  // cambia la cifra. (El poste golpeado no sirve para esto: es un choque declarado y la física lleva
  // al Camaro hasta él donde esté.)
  await irAPaso(page, 3);
  await page.getByTestId("cambiar-algo").click();
  await expect(page.getByTestId("panel-corregir")).toBeVisible();
  await page.getByTestId("paleta-poste").click();
  await tocarEnMetros(page, "choque-1", -25, -2);
  await expect(page.getByTestId("seleccion")).toBeVisible();
  await page.getByTestId("sel-listo").click();
  await expect(page.getByTestId("aviso-escena-cambio")).toBeVisible();
  await page.getByTestId("reconstruir-de-nuevo").click();
  await expect(page.getByTestId("recalculo")).toHaveAttribute("data-estado", "al_dia", {
    timeout: 90_000,
  });
  await irAPaso(page, 4);
  await expect(cifra).toBeVisible();
  expect(await cifra.innerText()).toEqual(conPosteMovido);

  // «Qué importa» (René, 2026-11-26): en La escena, el poste suelto (fuera de los recorridos) va en
  // gris; el poste del choque declarado no se apaga.
  await irAPaso(page, 3);
  await page.getByTestId("que-importa").click();
  await expect(page.getByTestId("que-importa-nota")).toBeVisible();
  await expect(page.locator('[data-testid^="objeto-"][data-influye="no"]')).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("marca-objeto-2")).not.toHaveAttribute("data-influye", "no");
  await page.getByTestId("que-importa").click();
  await expect(page.locator('[data-influye="no"]')).toHaveCount(0);

  // 2. Corregir la dirección del VW Jetta, ya colocado: se toca y «Cambiar por dónde venía».
  await irAPaso(page, 3);
  await page.getByTestId("cambiar-algo").click();
  // El marcador del coche no tiene tamaño: se toca su cuerpo, como lo toca el perito.
  await page.locator('[data-testid="coche-V1-final"] .escena-coche-cuerpo').click();
  await page.getByTestId("sel-cambiar-direccion").click();
  await expect(pregunta).toHaveText("¿Por dónde venía el VW Jetta?");
  await page.locator('[data-testid^="opcion-flecha-"][data-propuesta="no"]').first().click();
  await reconstruirSiCambio(page);
  // «Deshacer» y «Rehacer» siguen a la vista.
  await expect(page.getByTestId("deshacer-barra")).toBeEnabled();
  await irAPaso(page, 4);
  await expect(cifra).toBeVisible();
  expect(await cifra.innerText()).not.toEqual(conPosteMovido);
  expect(errores).toEqual([]);
});
