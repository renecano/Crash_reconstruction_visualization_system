import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { irAPaso } from "./ayuda-recorrido";

/**
 * Las pruebas pesadas del rediseño «Laboratorio» (prompt §11), a mano, contra el build de producción
 * (no llevan @flujo, porque CI no las pide en cada merge):
 *
 *   pnpm --filter @croquis/web exec playwright test e2e/laboratorio-axa.spec.ts --project=chromium
 *
 * - El recorrido de AXA A2010930 de Casos al PDF firmado, de día y de noche, con captura de cada
 *   acto a 1440 px y axe en cada pantalla.
 * - 63.90 / 63.15 / +1.19 % iguales en Casos, Contra CESVI y el PDF.
 * - Los actos se cruzan con teclado y los tooltips salen con el foco.
 * - Con movimiento reducido, las cifras salen en su valor final sin animar.
 *
 * Deja las capturas en `docs/cesvi/rediseno/laboratorio/capturas/actos/` y lo medido en
 * `eval/results/laboratorio_axa.json`.
 */
const RAIZ = resolve(__dirname, "../../..");
const CAPTURAS = join(RAIZ, "docs/cesvi/rediseno/laboratorio/capturas/actos");
const RESULTADO = join(RAIZ, "eval/results/laboratorio_axa.json");
type Sharp = (input: Buffer) => {
  webp(o: { quality: number }): { toBuffer(): Promise<Buffer> };
};
const sharp: Sharp = (input) =>
  (createRequire(require.resolve("next/package.json"))("sharp") as Sharp)(input);

const medido: Record<string, unknown> = {};

async function axe(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // El canvas del mapa y del 3D no tienen texto que revisar.
    .exclude("canvas")
    .analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

async function textoDelPdf(bytes: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  }).promise;
  let t = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const c = await (await doc.getPage(p)).getTextContent();
    t += ` ${c.items.map((i) => ("str" in i ? i.str : "")).join(" ")}`;
  }
  return t.replace(/\s+/g, " ");
}

for (const tema of ["claro", "oscuro"] as const) {
  test(`AXA de Casos al PDF firmado (${tema})`, async ({ page }) => {
    test.setTimeout(420_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: tema === "claro" ? "light" : "dark" });
    mkdirSync(CAPTURAS, { recursive: true });
    const violaciones: Record<string, string[]> = {};
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    const revisa = async (nombre: string) => {
      // Que terminen las entradas y las cifras (§6) antes de medir y capturar.
      await page.waitForTimeout(2200);
      await expect(page.getByTestId("maqueta-calculando")).toHaveCount(0, { timeout: 60_000 });
      await expect(page.getByTestId("presentar-calculando")).toHaveCount(0, { timeout: 60_000 });
      // Las calles del mapa vienen de la red: si no llegan, la escena lo dice y la prueba sigue.
      await expect(page.getByTestId("maqueta-sin-calles"))
        .toHaveCount(0, { timeout: 20_000 })
        .catch(() => undefined);
      violaciones[nombre] = await axe(page);
      writeFileSync(
        join(CAPTURAS, `${tema}-${nombre}.webp`),
        await sharp(await page.screenshot())
          .webp({ quality: 82 })
          .toBuffer(),
      );
    };
    // Con teclado: el foco en «Continuar» y Enter.
    const continuar = async () => {
      await page.getByTestId("siguiente").focus();
      await page.keyboard.press("Enter");
    };

    await page.goto("/cesvi");
    await expect(page.getByTestId("ultimo-pct")).toHaveText("+1.19 %");
    const enCasos = await page.getByTestId("ultimo-cifras").textContent();
    expect(enCasos).toContain("63.90 contra 63.15 km/h");
    await revisa("0-casos");

    await page.getByTestId("ir-axa").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    await irAPaso(page, 2);
    await revisa("1-hecho");

    await irAPaso(page, 3);
    await expect(page.getByTestId("escena-lista")).toBeVisible();
    await revisa("2-escena");
    await irAPaso(page, 4);

    await page.getByTestId("reconstruir").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("linea-de-tiempo")).toBeVisible({ timeout: 60_000 });
    await revisa("3-reconstruccion");

    // Los tooltips salen con el foco (§9). Sin dispersión no hay percentiles: se dice otra cosa.
    if (await page.getByTestId("percentil-p50").isVisible()) {
      await page.getByTestId("percentil-p50").focus();
      await expect(page.getByTestId("tooltip")).toContainText("La mitad queda abajo");
    } else {
      await expect(page.getByTestId("sin-dispersion")).toBeVisible();
    }
    await page.locator('[data-testid="maqueta-impacto"]').focus();
    await expect(page.getByTestId("tooltip")).toContainText("Impacto");

    // Presentar, con teclado.
    await page.getByTestId("modo-presentar").click();
    await expect(page.getByTestId("capitulo-titulo")).toBeVisible({ timeout: 60_000 });
    await revisa("presentar");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("presentar-caso")).toHaveCount(0);

    await continuar();
    await expect(page.getByTestId("danos-caso")).toBeVisible();
    await revisa("4-analisis");
    await continuar();
    await expect(page.getByTestId("verificacion-cesvi")).toBeVisible();
    await revisa("4-numeros");
    await continuar();

    await expect(page.getByTestId("cifra-contra-croquis")).toHaveText("63.90");
    await expect(page.getByTestId("cifra-contra-cesvi")).toHaveText("63.15");
    await expect(page.getByTestId("cifra-contra-pct")).toHaveText("+1.19 %");
    await expect(page.getByTestId("lectura-fisica")).toContainText(
      "Reconstrucción física de Croquis",
    );
    await expect(page.getByTestId("fisica-pct")).toHaveText(/^[+−]\d+\.\d\d %$/);
    await expect(page.getByTestId("por-que-difieren")).toContainText("la masa de B sola");
    medido[`lectura_fisica_${tema}`] = {
      croquis_kmh: await page.getByTestId("fisica-croquis").textContent(),
      rango: await page
        .getByTestId("fisica-rango")
        .textContent()
        .catch(() => null),
      cesvi_kmh: await page.getByTestId("fisica-cesvi").textContent(),
      diferencia_kmh: await page.getByTestId("fisica-kmh").textContent(),
      diferencia_pct: await page.getByTestId("fisica-pct").textContent(),
    };
    await revisa("5-contraste");
    await continuar();

    await expect(page.getByTestId("marca-borrador")).toBeVisible();
    await revisa("6-dictamen");
    await page.getByTestId("citar-contraste").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("conclusion-perito")).toHaveValue(/63\.90.*63\.15.*\+1\.19 %/);
    await page.getByTestId("nombre-perito").fill("Perito de prueba");
    await page.getByTestId("validar-dictamen").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("sello-validado")).toContainText("SHA-256");
    await expect(page.getByTestId("marca-borrador")).toHaveCount(0);
    await revisa("6-dictamen-firmado");

    const descarga = page.waitForEvent("download");
    await page.getByTestId("descargar-dictamen-pdf").click();
    const archivo = await descarga;
    expect(archivo.suggestedFilename()).toBe("dictamen-reconstruccion.pdf");
    const pdf = await textoDelPdf(readFileSync(await archivo.path()));
    for (const cifra of ["63.90", "63.15", "+1.19 %"]) expect(pdf).toContain(cifra);
    expect(pdf).toContain("Perito de prueba");

    medido[tema] = {
      casos: enCasos,
      pdf_lleva: ["63.90", "63.15", "+1.19 %"],
      violaciones_serias: violaciones,
      errores_de_pagina: errores,
    };
    expect(errores).toEqual([]);
    expect(Object.values(violaciones).flat()).toEqual([]);
  });
}

test.describe("con movimiento reducido", () => {
  test.use({ reducedMotion: "reduce" });

  test("las cifras salen en su valor final, sin animar", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/cesvi");
    await page.getByTestId("ir-axa").click();
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    await irAPaso(page, 4);
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
    await irAPaso(page, 7);
    // De inmediato, sin esperar a que cuente: `textContent` en el primer vistazo.
    const croquis = page.getByTestId("cifra-contra-croquis");
    await croquis.waitFor();
    expect(await croquis.textContent()).toBe("63.90");
    const animadas = await page.evaluate(
      () =>
        document.getAnimations().filter((a) => {
          const e = a.effect as KeyframeEffect | null;
          return Boolean(e?.target?.closest('[data-testid="contra-reporte"]'));
        }).length,
    );
    expect(animadas).toBe(0);
    medido.movimiento_reducido = { cifra_inmediata: "63.90", animaciones_en_contraste: animadas };
  });
});

test.afterAll(() => {
  // Junta lo medido con lo que haya (cada tema puede correr por separado).
  let previo: Record<string, unknown> = {};
  try {
    previo = JSON.parse(readFileSync(RESULTADO, "utf8")) as Record<string, unknown>;
  } catch {
    /* primera corrida */
  }
  writeFileSync(
    RESULTADO,
    `${JSON.stringify({ ...previo, ...medido, fecha: new Date().toISOString().slice(0, 10) }, null, 2)}\n`,
  );
});
