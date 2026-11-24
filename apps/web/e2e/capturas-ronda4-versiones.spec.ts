import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "./base";
import {
  contestarC1,
  contestarMasas,
  irAPaso,
  mapaFacil,
  sinRed,
  tocarEnMetros,
} from "./ayuda-recorrido";

/**
 * Ronda 4, punto 8 (René, 2026-11-18): las capturas «después» del acto «Versiones», con el mismo caso
 * de las de «antes» (`evidencia/hipotesis/hoy-*.jpg`): el crucero de ejemplo con su lectura y su
 * declaración grabadas. No llama a Claude ni corre en CI.
 *
 *   pnpm exec playwright test e2e/capturas-ronda4-versiones.spec.ts --project=chromium
 *     → docs/cesvi/ronda-4/evidencia/versiones/despues-*.jpg
 */
const RAIZ = resolve(__dirname, "../../..");
const DIR = join(RAIZ, "docs/cesvi/ronda-4/evidencia/versiones");
const GRABACION = JSON.parse(
  readFileSync(join(RAIZ, "data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"), "utf8"),
) as { salida: unknown };
const DECLARACION = JSON.parse(
  readFileSync(join(RAIZ, "data/cesvi/grabaciones/declaracion/declaracion-e2e.json"), "utf8"),
) as { declaracion: string; salida: unknown };

test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

test("el acto «Versiones»: la declaración y una hipótesis sobre la reconstrucción", async ({
  page,
}) => {
  test.setTimeout(480_000);
  mkdirSync(DIR, { recursive: true });
  const foto = (n: string) =>
    page.screenshot({ path: join(DIR, `despues-${n}.jpg`), type: "jpeg", quality: 82 });
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
  // La clase ya sale del modelo leído («tipo Jetta», ronda 4); se contesta solo si se pregunta.
  const clase = page.getByTestId("opcion-clase-V1-sedan_compacto");
  if (await clase.isVisible().catch(() => false)) await clase.click();
  // La masa también sale del modelo leído (ficha del fabricante, René 2026-11-21): solo si se pregunta.
  await contestarMasas(page);
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

  // 1. Reconstrucción: «Comparar con una versión», a la vista bajo la cifra.
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("vista-maqueta").click();
  await expect(page.getByTestId("comparar-version")).toBeVisible();
  await page.waitForTimeout(2500);
  await foto("1-reconstruccion-con-el-boton");

  // 2. El acto «Versiones», sin versiones todavía.
  await page.getByTestId("comparar-version").click();
  await expect(page.getByTestId("versiones-vacio")).toBeVisible();
  await page.waitForTimeout(1200);
  await foto("2-versiones-vacio");

  // 3. La declaración del conductor de B, leída y simulada: fantasma en el 2D y qué cambia.
  await page.getByTestId("texto-declaracion").fill(DECLARACION.declaracion);
  await page.getByTestId("declarante").selectOption("V2");
  await page.getByTestId("leer-declaracion").click();
  await expect(page.getByTestId("que-cambia")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("maqueta-declarada")).toHaveCount(1, { timeout: 30_000 });
  await page.getByTestId("panel-paso").evaluate((el) => el.scrollTo({ top: 0 }));
  await page.waitForTimeout(1500);
  await foto("3-declaracion");

  // 4. Una hipótesis: ¿y si el conductor de A frena 1.5 s antes?
  await page.getByTestId("abrir-hipotesis").click();
  await page.getByTestId("conductor-vehiculo").selectOption("V1");
  await page.getByTestId("conductor-instante").fill("1.5");
  await page.getByTestId("conductor-probar").click();
  await expect(page.getByTestId("version-hipotesis-1")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("maqueta-declarada")).toHaveCount(1, { timeout: 30_000 });
  await page.getByTestId("panel-paso").evaluate((el) => el.scrollTo({ top: 0 }));
  await page.waitForTimeout(1500);
  await foto("4-hipotesis");
  await page.getByTestId("version-elegida").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await foto("4b-hipotesis-que-cambia");

  // 5. Análisis ya no lleva la hipótesis.
  await irAPaso(page, 7);
  await page.waitForTimeout(800);
  await foto("5-analisis-sin-la-hipotesis");

  // 6. Presentar: el capítulo «Versiones».
  await page.getByTestId("modo-presentar").click();
  const presentar = page.getByTestId("presentar-caso");
  await expect(presentar).toBeVisible({ timeout: 60_000 });
  for (let k = 0; k < 6; k++) {
    if ((await presentar.getAttribute("data-capitulo")) === "versiones") break;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
  }
  await expect(presentar).toHaveAttribute("data-capitulo", "versiones");
  await page.waitForTimeout(1200);
  await foto("6-presentar-capitulo-versiones");
});
