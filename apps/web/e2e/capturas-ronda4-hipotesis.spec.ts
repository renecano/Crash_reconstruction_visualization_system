import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "./base";
import { contestarC1, irAPaso, mapaFacil, sinRed, tocarEnMetros } from "./ayuda-recorrido";

/**
 * Ronda 4, punto 8 (René, 2026-11-18): dónde están hoy «probar una hipótesis» y la comparación con
 * la declaración del conductor, en capturas, para las propuestas de diseño. El caso de ejemplo (el
 * crucero) con su lectura y su declaración grabadas: no llama a Claude. No corre en CI.
 *
 *   CROQUIS_URL=<sitio> pnpm exec playwright test -c playwright.produccion.config.ts \
 *     e2e/capturas-ronda4-hipotesis.spec.ts
 *     → docs/cesvi/ronda-4/evidencia/hipotesis/hoy-*.jpg
 */
const RAIZ = resolve(__dirname, "../../..");
const DIR = join(RAIZ, "docs/cesvi/ronda-4/evidencia/hipotesis");
const GRABACION = JSON.parse(
  readFileSync(join(RAIZ, "data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"), "utf8"),
) as { salida: unknown };
const DECLARACION = JSON.parse(
  readFileSync(join(RAIZ, "data/cesvi/grabaciones/declaracion/declaracion-e2e.json"), "utf8"),
) as { declaracion: string; salida: unknown };

test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

test("dónde están hoy las hipótesis y la declaración", async ({ page }) => {
  test.setTimeout(420_000);
  mkdirSync(DIR, { recursive: true });
  const foto = (n: string) =>
    page.screenshot({ path: join(DIR, `hoy-${n}.jpg`), type: "jpeg", quality: 82 });
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
  await page.route("**/api/cesvi/declaracion", (r) =>
    r.fulfill({ json: { metodo: "claude", salida: DECLARACION.salida } }),
  );
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await irAPaso(page, 2);
  await page.getByTestId("ejemplo-narracion").click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toContainText("2 vehículos · 1 impacto");
  await page.getByTestId("confirmar-impacto").click();
  await page.getByTestId("opcion-clase-V1-sedan_compacto").click();
  await page.getByTestId("no-se-masa-V1").click();
  await page.getByTestId("valor-masa-V2").fill("1450");
  await page
    .getByTestId("pregunta-masa-V2")
    .getByRole("button", { name: "Usar", exact: true })
    .click();
  await sinRed(page);
  await irAPaso(page, 3);
  const mapaEscena = await mapaFacil(page);
  const caja = (await mapaEscena.boundingBox())!;
  await mapaEscena.click({ position: { x: caja.width * 0.7, y: caja.height * 0.45 } });
  await page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]').click();
  await tocarEnMetros(page, "choque-1", 6, 8);
  await page.getByTestId("girar-derecha").click();
  await page.getByTestId("listo-final").click();
  await page.getByTestId("no-se-direccion").click();
  await page.getByTestId("final-junto").click();
  await page.getByTestId("listo-final").click();
  await contestarC1(page);
  await expect(page.getByTestId("escena-lista")).toBeVisible();

  // 1. Reconstrucción, como abre: nada dice que se puede comparar con la declaración.
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("vista-maqueta").click();
  await page.waitForTimeout(3000);
  await foto("1-reconstruccion-como-abre");

  // 2. Hay que abrir «Ver el detalle» y bajar: ahí está, plegada y «opcional».
  await page.getByTestId("ver-detalle-reconstruccion").click();
  await page.getByTestId("abrir-declaracion").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await foto("2-declaracion-plegada-en-el-detalle");

  // 3. Abierta y comparada: una tabla.
  await page.getByTestId("abrir-declaracion").click();
  await page.getByTestId("texto-declaracion").fill(DECLARACION.declaracion);
  await page.getByTestId("declarante").selectOption("V2");
  await page.getByTestId("leer-declaracion").click();
  await expect(page.getByTestId("que-cambia")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("que-cambia").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await foto("3-que-cambia-la-tabla");

  // 4. El 2D con la versión declarada punteada.
  await page.getByTestId("maqueta-declarada").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await foto("4-2d-con-la-version-declarada");

  // 5. «Probar una hipótesis sobre un conductor»: al final del acto «Análisis».
  await irAPaso(page, 5);
  await page.waitForTimeout(800);
  await foto("5-analisis-como-abre");
  await irAPaso(page, 6);
  await page.waitForTimeout(800);
  await foto("5b-analisis-numeros-como-abre");
  await page.getByTestId("probar-conductores").scrollIntoViewIfNeeded();
  await page.getByTestId("conductor-vehiculo").selectOption("V2");
  await page.getByTestId("conductor-instante").fill("1.5");
  await page.getByTestId("conductor-probar").click();
  await expect(page.getByTestId("resultado-conductores")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("resultado-conductores").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await foto("6-hipotesis-de-conductor-resultado");
});
