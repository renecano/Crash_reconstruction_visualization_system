import { expect, test, type Page } from "@playwright/test";
import recorrido from "../src/data/recorrido.json";

/**
 * La portada de lanzamiento (PLAN §11.3, F11a): los doce capítulos sobre la escena real de
 * Toluca, la revelación del croquis al 3D, el tiempo que corre con el scroll, el control de
 * velocidad que vuelve a calcular en el navegador, las pruebas con sus cifras, el inglés y la
 * versión con movimiento reducido. Corre en escritorio y en celular (proyecto `movil`).
 */
const CAPITULOS = [
  ["apertura", "Apertura"],
  ["problema", "El problema"],
  ["c", "Cuenta"],
  ["r", "Reconoce"],
  ["o", "Ordena"],
  ["q", "¿Qué falta?"],
  ["u", "Ubica"],
  ["i", "Impacta"],
  ["s", "Simula"],
  ["pruebas", "Las pruebas"],
  ["noes", "Lo que no es"],
  ["cierre", "Cierre"],
] as const;

function errores(page: Page): string[] {
  const out: string[] = [];
  page.on("pageerror", (e) => out.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") out.push(m.text());
  });
  return out;
}

/** Lleva el scroll a la mitad del capítulo `i` y espera a que la portada llegue. */
async function irA(page: Page, i: number, l = 0.5) {
  await page.evaluate((p) => window.scrollTo(0, p * window.innerHeight * 1.5), i + l);
  await expect(page.getByTestId("portada")).toHaveAttribute("data-capitulo", CAPITULOS[i]![0]);
}

/** Opacidad de la copia de un capítulo (la que maneja el scroll). */
function opacidad(page: Page, capitulo: string): Promise<number> {
  return page
    .locator(`section[data-capitulo="${capitulo}"] .pagina`)
    .evaluate((el) => Number(getComputedStyle(el).opacity));
}

const esperarEscena = (page: Page) =>
  page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });

test.describe("portada", () => {
  // Render por software: compilar la escena de Toluca tarda más que 30 s en CI.
  test.setTimeout(180_000);

  test("recorre los doce capítulos: cada texto llega a verse completo y el riel lo sigue", async ({
    page,
    isMobile,
  }) => {
    const errs = errores(page);
    await page.goto("/publico");
    await expect(page.locator("html")).toHaveAttribute("lang", "es-MX");
    await expect(page.getByTestId("cuadro-portada")).toBeVisible();
    await esperarEscena(page);
    for (const [i, [c, nombre]] of CAPITULOS.entries()) {
      await irA(page, i);
      await expect.poll(() => opacidad(page, c), { timeout: 10_000 }).toBeGreaterThan(0.95);
      if (!isMobile) {
        await expect(
          page.getByRole("navigation", { name: "Capítulos" }).getByRole("button", { name: nombre }),
        ).toHaveAttribute("aria-current", "step");
      }
    }
    // La leyenda ilustrativa y la atribución de la calle están sobre la escena todo el tiempo.
    await expect(page.getByRole("note").first()).toContainText("No es un peritaje");
    await expect(page.getByTestId("atribucion-mapa").first()).toContainText("OpenStreetMap");
    expect(errs).toEqual([]);
  });

  test("Impacta: el scroll mueve el tiempo y el control de velocidad recalcula en el navegador", async ({
    page,
  }) => {
    const errs = errores(page);
    await page.goto("/publico");
    await esperarEscena(page);
    const i = CAPITULOS.findIndex(([c]) => c === "i");
    await irA(page, i, 0.3);
    const tiempo = page.getByTestId("tiempo-portada");
    await expect(tiempo).toHaveText(/t = [−-]0\.\d\d s/);
    await irA(page, i, 0.75);
    await expect(tiempo).toHaveText(/t = \+1\.\d\d s/);
    await expect(page.getByTestId("lecturas")).toBeVisible();

    const resultado = page.getByTestId("resultado-portada");
    const antes = await resultado.textContent();
    await page.getByTestId("control-velocidad").fill("60");
    await expect(page.getByTestId("velocidad-portada")).toHaveText("60 km/h");
    await expect(resultado).not.toHaveText(antes ?? "", { timeout: 60_000 });
    expect(errs).toEqual([]);
  });

  test("Las pruebas: las cifras salen de eval/results y el comparador se maneja con teclado", async ({
    page,
  }) => {
    await page.goto("/publico");
    const p = CAPITULOS.findIndex(([c]) => c === "pruebas");
    await irA(page, p);
    const cotas = page.getByTestId("cota");
    await expect(cotas).toHaveCount(3);
    const e3 = recorrido.evaluaciones.find((e) => e.id === "E3")!;
    const barras = (e3.graficas[0] as { barras: { etiqueta: { es: string }; valor: number }[] })
      .barras;
    const winsmash = barras.find((b) => b.etiqueta.es === "WinSMASH")!.valor;
    await expect(cotas.nth(1)).toContainText(winsmash.toFixed(2));
    await expect(cotas.nth(1)).toContainText("WinSMASH se equivoca menos");

    const comparador = page.getByTestId("comparador");
    const corte = comparador.getByRole("slider");
    await corte.focus();
    await page.keyboard.press("End");
    await expect(corte).toHaveValue("100");
    await expect(comparador.getByRole("img", { name: "Foto de la prueba real" })).toBeVisible();
  });

  test("el cierre entra a Croquis para CESVI; el flujo para el público queda al lado", async ({
    page,
  }) => {
    await page.goto("/publico");
    await irA(page, CAPITULOS.length - 1);
    await expect(page.getByTestId("cta-cierre-publico")).toHaveAttribute("href", "/cuenta");
    await page.getByTestId("cta-cierre").click();
    await expect(page).toHaveURL(/\/cesvi$/);
  });

  test("con teclado, enfocar un enlace de un capítulo lleva el scroll a ese capítulo", async ({
    page,
  }) => {
    await page.goto("/publico");
    await page.getByRole("link", { name: "Abrir esta escena en el visor" }).focus();
    await expect(page.getByTestId("portada")).toHaveAttribute("data-capitulo", "s");
    await expect.poll(() => opacidad(page, "s"), { timeout: 10_000 }).toBeGreaterThan(0.95);
  });

  test("en inglés", async ({ page }) => {
    const errs = errores(page);
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('section[data-capitulo="apertura"] p.t-lanzamiento')).toHaveText(
      "Tell what happened. Watch it happen.",
    );
    await expect(page.getByTestId("cta-apertura")).toHaveAttribute("href", "/cesvi");
    await expect(page.getByTestId("cta-publico")).toHaveAttribute("href", "/en/cuenta");
    await expect(page.getByRole("note").first()).toContainText("not a forensic report");
    // El relato de ejemplo se queda en su español original, marcado como tal.
    await expect(page.getByTestId("relato-en-vivo")).toHaveAttribute("lang", "es-MX");
    expect(errs).toEqual([]);
  });
});

test.describe("portada con movimiento reducido", () => {
  test.use({ reducedMotion: "reduce" });

  test("sin 3D ni suavizado: un cuadro fijo por capítulo y el texto aparece completo", async ({
    page,
  }) => {
    const errs = errores(page);
    await page.goto("/publico");
    const cuadro = page.getByTestId("cuadro-portada");
    await expect(cuadro).toBeVisible();
    await expect(cuadro).toHaveAttribute("src", "/portada/apertura-ancho.jpg");
    const u = CAPITULOS.findIndex(([c]) => c === "u");
    await irA(page, u);
    await expect(cuadro).toHaveAttribute("src", "/portada/u-ancho.jpg");
    // Sin suavizado, la copia llega a 1 en el primer cuadro.
    await expect.poll(() => opacidad(page, "u"), { timeout: 2_000 }).toBe(1);
    // El escenario nunca monta la escena 3D.
    await page.waitForTimeout(3000);
    await expect(page.locator('[data-testid="escenario"] canvas')).toHaveCount(0);
    // El control de velocidad sigue funcionando: el resultado se ve en cifras.
    await irA(
      page,
      CAPITULOS.findIndex(([c]) => c === "i"),
    );
    const resultado = page.getByTestId("resultado-portada");
    const antes = await resultado.textContent();
    await page.getByTestId("control-velocidad").fill("55");
    await expect(resultado).not.toHaveText(antes ?? "", { timeout: 60_000 });
    expect(errs).toEqual([]);
  });
});
