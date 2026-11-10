import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
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

/**
 * Con `CAPTURAS_W5=1`, la misma prueba deja las capturas del «Resumen para René» en
 * `docs/cesvi/w5/` (a mano; en CI no se toman).
 */
const DIR_CAPTURAS = join(__dirname, "../../../docs/cesvi/w5");
type Sharp = (input: Buffer) => { webp(o: { quality: number }): { toBuffer(): Promise<Buffer> } };
async function foto(page: Page, nombre: string) {
  if (!process.env.CAPTURAS_W5) return;
  const sharp = createRequire(require.resolve("next/package.json"))("sharp") as Sharp;
  mkdirSync(DIR_CAPTURAS, { recursive: true });
  await page.waitForTimeout(800);
  writeFileSync(
    join(DIR_CAPTURAS, `${nombre}.webp`),
    await sharp(await page.screenshot({ animations: "disabled" }))
      .webp({ quality: 82 })
      .toBuffer(),
  );
}

/**
 * Una malla de relieve de prueba, con la forma que entrega `/api/relieve`: un plano que sube 5 %
 * hacia el este, centrado en el punto que se pide. No es el relieve de ningún lugar: CI no sale a
 * la red.
 */
function mallaDePrueba(lat: number, lon: number) {
  const n = 61;
  const k = (Math.PI / 180) * 6_371_008.8;
  const alturas: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) alturas.push((i - 30) * 10 * 0.05);
  return {
    id: "prueba-plano-5",
    origen: {
      lat: lat - 300 / k,
      lon: lon - 300 / (k * Math.cos((lat * Math.PI) / 180)),
      x: -300,
      y: -300,
    },
    resolucion_m: 10,
    ancho: n,
    alto: n,
    alturas_m: alturas,
    fuente: "Malla de prueba (plano de 5 %)",
    licencia: "Sin licencia: entrada de prueba.",
    resolucion_nativa_m: 10,
  };
}

test("@flujo /cesvi: ¿cómo es el terreno? — un tope, una zona ondulada y el relieve entran en la reconstrucción (W5)", async ({
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
  const pedidas: string[] = [];
  await page.route("**/api/relieve?**", (r) => {
    const u = new URL(r.request().url());
    pedidas.push(u.search);
    return r.fulfill({
      json: mallaDePrueba(Number(u.searchParams.get("lat")), Number(u.searchParams.get("lon"))),
    });
  });
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await irAPaso(page, 2);
  await page.getByTestId("ejemplo-narracion").click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toContainText("2 vehículos · 1 impacto");
  await sinRed(page);
  await irAPaso(page, 3);

  // La escena: el choque y los dos vehículos; las tres preguntas de C1, sin agregar evidencia.
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
  await page.getByTestId("golpe-nose").click();
  await page.getByTestId("otros-no").click();
  await page.getByTestId("paso-listo").click();

  // ¿Cómo es el terreno? Sin marcar nada, la respuesta es «Es pavimento liso».
  await expect(pregunta).toHaveText("¿Cómo es el terreno?");
  await expect(page.getByTestId("terreno-liso")).toBeVisible();
  await foto(page, "1-como-es-el-terreno");

  // Un tope, en el camino del Jetta hacia donde quedó: con las medidas de la norma.
  await page.getByTestId("terreno-tope-circular").click();
  await expect(page.getByTestId("terreno-pista")).toContainText("NOM-034");
  await foto(page, "2-tope-elegido");
  await tocarEnMetros(page, "choque-1", 3, 4);
  await expect(page.getByTestId("terreno-tope-1")).toHaveCount(1);
  await expect(page.getByTestId("terreno-marcado")).toContainText(
    "0.10 m de alto × 1.40 m de largo",
  );

  // Una zona ondulada alrededor del choque: sus medidas son un supuesto hasta que se miden.
  await page.getByTestId("terreno-ondulado").click();
  await tocarEnMetros(page, "choque-1", 0, -3);
  await expect(page.getByTestId("terreno-onda-1")).toHaveCount(1);
  await expect(page.getByTestId("terreno-marcado")).toContainText("(supuesto)");

  // Una zona de terracería a un lado: lleva la fricción de la tabla hasta que el perito la fija.
  await page.getByTestId("terreno-terraceria").click();
  await tocarEnMetros(page, "choque-1", -14, 2);
  await expect(page.getByTestId("terreno-zona-1")).toHaveCount(1);
  await expect(page.getByTestId("terreno-marcado")).toContainText("fricción de la tabla");

  // Y el relieve real del lugar (aquí, la malla de prueba).
  await page.getByTestId("terreno-relieve").check();
  await foto(page, "3-terreno-marcado");
  await page.getByTestId("terreno-listo").click();
  await expect(page.getByTestId("escena-lista")).toBeVisible();
  const resumen = page.getByTestId("escena-resumen");
  await expect(resumen).toContainText("Un tope, donde lo marcaste");
  await expect(resumen).toContainText("Una zona ondulada, donde la marcaste");
  await expect(resumen).toContainText("Una zona de terracería, donde la marcaste");
  await expect(resumen).toContainText("El relieve real del lugar");
  await foto(page, "4-resumen-con-terreno");

  // La reconstrucción: el terreno entra, con el perfil de elevación de cada vehículo.
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 90_000 });
  const terreno = page.getByTestId("terreno-reconstruccion");
  await expect(terreno).toBeVisible();
  await expect(page.getByTestId("perfiles-elevacion")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid^="perfil-V"]')).toHaveCount(2);
  // La malla se pidió una vez, alrededor del punto de impacto, y su fuente se dice junto al perfil.
  expect(pedidas).toHaveLength(1);
  await expect(page.getByTestId("relieve-fuente")).toContainText("Malla de prueba (plano de 5 %)");
  await expect(page.getByTestId("relieve-falta")).toHaveCount(0);
  // La maqueta (el croquis del caso) dibuja el terreno marcado y las curvas de nivel del relieve.
  await expect(page.getByTestId("maqueta-terreno")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("maqueta-tope-tope-1")).toHaveCount(1);
  await expect(page.getByTestId("maqueta-zona-zona-1")).toHaveCount(1);
  await expect(page.getByTestId("maqueta-curvas")).toHaveCount(1);
  await terreno.scrollIntoViewIfNeeded();
  await foto(page, "5-reconstruccion-terreno");
  // Los cruces de tope con su velocidad y lo que supone Croquis al cruzarlos.
  const supuestos = page.getByTestId("supuestos-tope");
  await expect(page.getByTestId("cruces-tope")).toBeVisible();
  await supuestos.locator("summary").click();
  await supuestos.scrollIntoViewIfNeeded();
  await foto(page, "6-cruces-y-supuestos");

  // Corregir después: se toca el tope y se le da la altura medida; deja de ser «de la norma».
  await irAPaso(page, 3);
  await page.getByTestId("cambiar-algo").click();
  await page.locator('[data-testid="terreno-tope-1"] .escena-etiqueta-terreno').click();
  await expect(page.getByTestId("seleccion-nombre")).toContainText("(norma)");
  await foto(page, "7-tope-seleccionado");
  await page.getByTestId("sel-alto-menos").click();
  await expect(page.getByTestId("seleccion-nombre")).toContainText(
    "0.09 m de alto × 1.40 m de largo",
  );
  await expect(page.getByTestId("seleccion-nombre")).not.toContainText("(norma)");
  await expect(page.getByTestId("recalculo")).toHaveAttribute("data-estado", "al_dia", {
    timeout: 90_000,
  });
  expect(errores).toEqual([]);
});
