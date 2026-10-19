import { expect, test, type Page } from "@playwright/test";
import historia from "../src/data/historia.json";
import recorrido from "../src/data/recorrido.json";

/**
 * Página de historia y recorrido técnico (PLAN §11, F11): se ven completas, las imágenes cargan,
 * los números salen de `eval/results/` (vía `src/data/`) y llevan la leyenda ilustrativa.
 */
function errores(page: Page): string[] {
  const out: string[] = [];
  page.on("pageerror", (e) => out.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") out.push(m.text());
  });
  return out;
}

test("la portada enlaza a la historia y al recorrido técnico", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Por qué existe Croquis" }).click();
  await expect(page).toHaveURL(/\/historia$/);
  await page.goto("/");
  await page.getByRole("link", { name: /Recorrido técnico/ }).click();
  await expect(page).toHaveURL(/\/recorrido$/);
});

test("historia: relato, datos de ATUS, CROQUIS letra por letra e imágenes con la leyenda", async ({
  page,
}) => {
  const errs = errores(page);
  await page.goto("/historia");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cuenta. Reconoce. Ordena.");
  const datos = page.getByRole("region", { name: "No es un caso raro" });
  await expect(datos).toContainText(`En ${historia.anio}, el INEGI registró`);
  await expect(datos).toContainText(historia.nacional.accidentes.toLocaleString("es-MX"));
  for (const palabra of [
    "Cuenta",
    "Reconoce",
    "Ordena",
    "¿Qué falta?",
    "Ubica",
    "Impacta",
    "Simula",
  ]) {
    await expect(page.getByRole("heading", { level: 3, name: palabra })).toBeVisible();
  }
  for (const img of await page.getByRole("img", { name: /Reconstrucción ilustrativa/ }).all()) {
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
  await expect(page.getByRole("note")).toContainText("No es un peritaje");
  await expect(page.getByRole("note")).toContainText("OpenStreetMap");
  expect(errs).toEqual([]);
});

test("recorrido técnico: E1–E9 con sus gráficas, la mejor marcada y el enlace al resultado", async ({
  page,
}) => {
  const errs = errores(page);
  await page.goto("/recorrido");
  for (const e of recorrido.evaluaciones) {
    const sec = page.locator(`section#${e.id}`);
    await expect(sec.getByRole("heading", { level: 2 })).toHaveText(e.titulo);
    for (const f of e.fuentes)
      await expect(sec.getByRole("link", { name: f.archivo })).toBeVisible();
  }
  // E3: WinSMASH se equivoca menos en promedio y la gráfica lo marca, no a Croquis.
  const e3 = page.locator("section#E3").getByRole("listitem");
  await expect(e3.filter({ hasText: "WinSMASH" }).getByTitle("mejor valor")).toBeVisible();
  await expect(e3.filter({ hasText: "Croquis" }).getByTitle("mejor valor")).toHaveCount(0);
  await expect(page.locator("section#E9")).toContainText("Pendiente");
  await expect(page.getByRole("note")).toContainText("No es un peritaje");
  expect(errs).toEqual([]);
});
