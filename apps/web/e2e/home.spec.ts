import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";

const raiz = join(__dirname, "../../..");
const leer = <T>(ruta: string) => JSON.parse(readFileSync(join(raiz, ruta), "utf8")) as T;

function errores(page: Page): string[] {
  const out: string[] = [];
  page.on("pageerror", (e) => out.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") out.push(m.text());
  });
  return out;
}

/** La cortina con el logo se retira sola. */
const sinCortina = (page: Page) =>
  expect(page.locator("[data-cortina]")).toBeHidden({ timeout: 15_000 });

/**
 * La portada: carga sin errores de consola, con las cifras del índice único (aquí se leen de él, no se
 * escriben), cada botón lleva a /cesvi, la barra lleva a su sección, sigue el tema del sistema, y las
 * páginas del producto anterior (/publico…) llevan a ella. Con movimiento reducido no hay cortina.
 */
test("@flujo la portada carga sin errores y lleva a /cesvi", async ({ page }) => {
  test.setTimeout(120_000);
  const errs = errores(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es-MX");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("El perito narra el hecho.");
  await sinCortina(page);
  await expect(page.locator('[data-testid^="paso-portada-"]')).toHaveCount(6);

  // El tráiler, con fachada: nada de YouTube antes de tocarlo; al tocarlo, el reproductor sin cookies
  // (aquí no sale a la red).
  const deYoutube: string[] = [];
  await page.route(/youtube/, (r) => {
    deYoutube.push(r.request().url());
    return r.abort();
  });
  const trailer = page.getByTestId("trailer");
  await trailer.scrollIntoViewIfNeeded();
  await expect(trailer).toHaveAttribute("href", /youtube\.com\/watch\?v=mUWk-sZgdjM/);
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(deYoutube).toEqual([]);
  await trailer.click();
  await expect(page.locator(".pv-trailer-caja iframe")).toHaveAttribute(
    "src",
    /^https:\/\/www\.youtube-nocookie\.com\/embed\/mUWk-sZgdjM\?/,
  );
  await page.unroute(/youtube/);
  await page.evaluate(() => window.scrollTo(0, 0));

  // El indicador de los pasos sigue al que se ve, al tocar una pestaña y en un salto de scroll.
  const pestanas = page.getByRole("navigation", { name: "Pasos" });
  const actual = pestanas.locator("[aria-current]");
  await expect(actual).toHaveText(/El hecho/);
  for (const [nombre, paso] of [
    ["Dictamen", "dictamen"],
    ["La escena", "escena"],
    ["Versiones", "versiones"],
  ] as const) {
    await pestanas.getByRole("link", { name: nombre }).click();
    await expect(actual).toHaveText(new RegExp(nombre));
    await expect(page.getByTestId(`paso-portada-${paso}`)).toBeInViewport();
  }
  for (const [y, nombre] of [
    ["document.body.scrollHeight", "Dictamen"],
    ["0", "El hecho"],
  ] as const) {
    await page.evaluate(`window.scrollTo({ top: ${y}, behavior: "instant" })`);
    await expect(actual).toHaveText(new RegExp(nombre));
  }

  // «Resultados», desde la barra: la cortina, la sección y las cifras del índice.
  await page.getByRole("link", { name: "Resultados" }).click();
  await expect(page.locator("#resultados")).toBeFocused();
  await sinCortina(page);
  const { cifras } = leer<{ cifras: Record<string, { k: number; n: number }> }>(
    "eval/results/cifras.json",
  );
  for (const [testid, clave] of [
    ["cifra-cobertura", "cobertura.rango"],
    ["cifra-modalidad", "er4.modalidad_titulo"],
    ["cifra-carambolas", "carambolas.prueba"],
  ] as const) {
    const c = cifras[clave]!;
    await page.getByTestId(testid).scrollIntoViewIfNeeded();
    await expect(page.getByTestId(testid).locator("[data-cuenta]")).toHaveText(String(c.k));
    await expect(page.getByTestId(testid)).toContainText(`${c.k} de ${c.n}`);
  }

  for (const boton of ["entrar-barra", "entrar", "entrar-cierre"]) {
    await page.goto("/");
    await sinCortina(page);
    await page.getByTestId(boton).click();
    await expect(page).toHaveURL(/\/cesvi$/);
    await expect(page.getByTestId("lista-casos")).toBeVisible();
  }

  // En inglés y de noche.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/en");
  await expect(page.getByTestId("portada-v3")).toHaveAttribute("data-tema", "oscuro");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Physics reconstructs it in 3D.",
  );

  // Las páginas del producto anterior llevan a la portada (auditoría del 2026-11-15, I7).
  await page.goto("/publico");
  await expect(page).toHaveURL(/localhost:\d+\/$/);

  // Movimiento reducido: sin cortina y todo a la vista.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("portada-v3")).not.toHaveAttribute("data-movimiento", "si");
  await expect(page.locator("[data-cortina]")).toBeHidden();
  expect(errs).toEqual([]);
});
