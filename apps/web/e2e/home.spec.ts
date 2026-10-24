import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const raiz = join(__dirname, "../../..");
const leer = <T>(ruta: string) => JSON.parse(readFileSync(join(raiz, ruta), "utf8")) as T;

/**
 * La portada de CESVI (punto 4 de René, `docs/cesvi/rediseno/Portada.html`): sus cifras salen de
 * `eval/results` al compilar; aquí se leen de los mismos archivos, no se escriben.
 */
test("la portada de CESVI carga con las cifras de las evaluaciones y la leyenda de CESVI", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es-MX");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Reconstruye el hecho.");
  const corpus = leer<{ dictamenes: number }>("eval/results/cesvi_corpus_extraccion.json");
  const titulo = leer<{ v3: { titulo_del_reporte: { croquis: { pct: number } } } }>(
    "eval/results/cesvi_r4c_titulo_prueba.json",
  );
  const cifras = page.getByTestId("cifra-portada");
  await expect(cifras.nth(0)).toHaveText(corpus.dictamenes.toLocaleString("es-MX"));
  await expect(cifras.nth(2)).toHaveText(
    `${titulo.v3.titulo_del_reporte.croquis.pct.toFixed(1)} %`,
  );
  const tabla = page.getByTestId("tabla-axa");
  await expect(tabla).toContainText("Alcance");
  await expect(tabla).toContainText("60.27");
  await expect(page.getByTestId("escena-portada")).toBeVisible();
  await expect(page.getByRole("note")).toContainText("el dictamen es del perito");
});

/**
 * «Entrar a Croquis» está en la barra, en el encabezado y en el cierre, y lleva a la lista de casos;
 * la portada para el público queda en /publico, con su liga en el pie.
 */
test("@flujo la portada lleva a /cesvi desde la barra, el encabezado y el cierre", async ({
  page,
}) => {
  for (const id of ["cta-apertura", "nav-entrar", "cta-cierre"]) {
    await page.goto("/");
    const entrar = page.getByTestId(id);
    await expect(entrar).toHaveText("Entrar a Croquis");
    await entrar.click();
    await expect(page).toHaveURL(/\/cesvi$/);
    await expect(page.getByTestId("lista-casos")).toBeVisible();
  }

  // En inglés.
  await page.goto("/en");
  await expect(page.getByTestId("cta-apertura")).toHaveText("Enter Croquis");
  await page.getByTestId("cta-apertura").click();
  await expect(page).toHaveURL(/\/cesvi$/);

  // La portada de antes, para el público, desde el pie.
  await page.goto("/");
  await page.getByTestId("enlace-publico").click();
  await expect(page).toHaveURL(/\/publico$/);
  await expect(page.getByTestId("cta-publico")).toHaveText("Cuenta qué pasó");
});
