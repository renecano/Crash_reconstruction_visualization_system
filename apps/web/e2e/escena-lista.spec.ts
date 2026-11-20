import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./base";
import { irAPaso, mapaFacil, sinRed } from "./ayuda-recorrido";

/**
 * La escena, propuesta 1 elegida por René (2026-11-18): Croquis la arma con lo que leyó y el perito la
 * revisa en la lista de la izquierda. Sin la barra de pasos de abajo; «Ver la reconstrucción» dentro
 * del panel, activo al completar. Las herramientas con su tecla. El caso de ejemplo (el crucero) con
 * su lectura grabada; sin red, así que la escena se arma en el centro del mapa.
 */
const GRABACION = JSON.parse(
  readFileSync(
    join(__dirname, "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { salida: unknown };

test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

test("@flujo /cesvi: la escena ya armada se revisa en su lista y llega a la reconstrucción", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => localStorage.setItem("croquis.escena", "nueva"));
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
    r.fulfill({ json: { metodo: "claude", salida: GRABACION.salida } }),
  );
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await irAPaso(page, 2);
  await page.getByTestId("ejemplo-narracion").click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toContainText("2 vehículos · 1 impacto");
  await page.getByTestId("confirmar-impacto").click();
  // La clase ya sale del modelo leído («tipo Jetta», ronda 4); se contesta solo si se pregunta.
  const clase = page.getByTestId("opcion-clase-V1-sedan_compacto");
  if (await clase.isVisible().catch(() => false)) await clase.click();
  await page.getByTestId("no-se-masa-V1").click();
  await page.getByTestId("valor-masa-V2").fill("1450");
  await page
    .getByTestId("pregunta-masa-V2")
    .getByRole("button", { name: "Usar", exact: true })
    .click();
  await sinRed(page);
  await irAPaso(page, 3);

  // La escena ya armada: la lista, la guía corta y las herramientas; sin la barra de pasos.
  const lista = page.getByTestId("lista-escena");
  await expect(lista).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("guia-escena")).toBeVisible();
  await expect(page.getByTestId("herramientas-escena")).toBeVisible();
  await expect(page.getByTestId("escena-avance")).toBeHidden();
  // Sin el lugar del caso (sin red no hay búsqueda), lo primero es buscarlo y marcar el choque.
  const choque = page.getByTestId("item-choque-1");
  await expect(choque).toHaveAttribute("data-estado", "falta");
  await expect(page.getByTestId("marcar-choque-1")).toHaveText("Buscar el lugar");
  const ver = page.getByTestId("lista-ver-reconstruccion");
  await expect(ver).toBeDisabled();
  await page.getByTestId("cerrar-guia").click();
  await page.getByTestId("marcar-choque-1").click();
  const mapa = await mapaFacil(page);
  const caja = (await mapa.boundingBox())!;
  await mapa.click({ position: { x: caja.width * 0.7, y: caja.height * 0.45 } });
  // De vuelta en la lista: el choque, listo; por dónde venía cada uno, propuesto por Croquis.
  await expect(lista).toBeVisible();
  await expect(choque).toHaveAttribute("data-estado", "confirmado");
  await expect(page.getByTestId("item-final-V1")).toHaveAttribute("data-estado", "falta");
  // Lo propuesto se confirma y cambia de estado.
  for (const v of ["V1", "V2"]) {
    await expect(page.getByTestId(`item-direccion-${v}`)).toHaveAttribute(
      "data-estado",
      "propuesto",
    );
    await page.getByTestId(`confirmar-direccion-${v}`).click();
    await expect(page.getByTestId(`item-direccion-${v}`)).toHaveAttribute(
      "data-estado",
      "confirmado",
    );
  }
  // Lo que falta abre su pregunta y, al contestarla, vuelve a la lista.
  for (const v of ["V1", "V2"]) {
    await page.getByTestId(`marcar-final-${v}`).click();
    await page.getByTestId("final-junto").click();
    await page.getByTestId("listo-final").click();
    await expect(lista).toBeVisible();
    await expect(page.getByTestId(`item-final-${v}`)).toHaveAttribute("data-estado", "confirmado");
  }
  // Las opcionales, con su respuesta de «no sé» o «listo».
  for (const [clave, boton] of [
    ["golpe", "golpe-nose"],
    ["otros", "otros-no"],
    ["paso", "paso-listo"],
    ["terreno", "terreno-liso"],
  ] as const) {
    const marcar = page.getByTestId(`marcar-c1-${clave}`);
    if (!(await marcar.count())) continue;
    await marcar.click();
    await page.getByTestId(boton).click();
    await expect(lista).toBeVisible();
  }
  // Con todo listo, «Ver la reconstrucción» dentro del panel.
  await expect(ver).toBeEnabled();
  await ver.click();
  await expect(page.getByTestId("panel-paso")).toHaveAttribute("data-paso", "4");
});
