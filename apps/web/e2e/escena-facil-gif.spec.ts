import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { contestarC1, irAPaso } from "./ayuda-recorrido";

/**
 * El GIF de la escena fácil (René, 2026-11-05) para «Resumen para René»: el caso de ejemplo (Jetta y
 * Camaro), de «¿Dónde fue el choque?» a «¡La escena está lista!», con el mapa y las calles reales
 * (necesita red). Deja también una captura por pregunta. Corre a mano (no lleva @flujo):
 *
 *   pnpm --filter @croquis/web exec playwright test e2e/escena-facil-gif.spec.ts --project=chromium
 *
 * Sale `docs/cesvi/rediseno/escena-facil/recorrido.gif` y `capturas/*.webp`. Mide además el tiempo
 * de máquina del recorrido (sin la persona): sirve de piso para la meta de 1 minuto.
 */
const RAIZ = resolve(__dirname, "../../..");
const GRABACION = JSON.parse(
  readFileSync(join(RAIZ, "data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"), "utf8"),
) as { salida: unknown };
const DIR = join(RAIZ, "docs/cesvi/rediseno/escena-facil");
type Sharp = (
  input: Buffer | Buffer[],
  opts?: { join?: { animated: boolean } },
) => {
  resize(w: number): ReturnType<Sharp>;
  png(): ReturnType<Sharp>;
  webp(o: { quality: number }): ReturnType<Sharp>;
  toBuffer(): Promise<Buffer>;
  gif(o: { delay: number[]; loop: number; effort: number }): {
    toFile(p: string): Promise<unknown>;
  };
};
const sharp: Sharp = (input, opts) =>
  (createRequire(require.resolve("next/package.json"))("sharp") as Sharp)(input, opts);

async function hastaLaEscena(page: Page) {
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`consola: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => console.log(`error: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    if (/api\/(lugar|osm)/.test(r.url()))
      console.log(
        `api: ${r.status()} ${r.url().slice(r.url().indexOf("/api"), r.url().indexOf("/api") + 90)} ${Date.now() % 100000}`,
      );
  });
  page.on("requestfailed", (r) =>
    console.log(`fallo: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`),
  );
  page.on("console", (m) => {
    if (m.type() === "warning") console.log(`aviso: ${m.text().slice(0, 200)}`);
  });
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
  await expect(page.getByTestId("vehiculos")).toContainText("Jetta");
  await irAPaso(page, 3);
  await expect(page.getByTestId("mapa-facil")).toHaveAttribute("data-listo", "si", {
    timeout: 30_000,
  });
}

for (const [nombre, tema, ancho, alto] of [
  ["claro", "claro", 1440, 900],
  ["oscuro", "oscuro", 1440, 900],
  ["celular", "claro", 390, 844],
] as const) {
  test(`escena fácil: recorrido completo (${nombre})`, async ({ page }) => {
    test.setTimeout(300_000);
    // Los actos anteriores, en escritorio; la escena, en el tamaño de la prueba (en el celular, el
    // botón de Next en desarrollo tapa «Siguiente» del primer acto).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: tema === "claro" ? "light" : "dark" });
    await hastaLaEscena(page);
    await page.setViewportSize({ width: ancho, height: alto });
    const cuadros: { png: Buffer; ms: number }[] = [];
    mkdirSync(join(DIR, "capturas"), { recursive: true });
    const cuadro = async (ms: number, captura?: string) => {
      await page.waitForTimeout(700);
      const png = await page.screenshot();
      cuadros.push({ png, ms });
      if (captura)
        writeFileSync(
          join(DIR, "capturas", `${nombre}-${captura}.webp`),
          await sharp(png).webp({ quality: 82 }).toBuffer(),
        );
    };
    const t0 = Date.now();

    // 1. ¿Dónde fue el choque? Croquis propone el cruce de la narración (si llegaron las calles).
    await expect(page.getByTestId("escena-pregunta")).toHaveText("¿Dónde fue el choque?");
    // Croquis busca el lugar de la narración y trae sus calles: la propuesta llega en segundos.
    await page
      .getByTestId("aceptar-choque")
      .waitFor({ timeout: 60_000 })
      .catch(() => undefined);
    await page.waitForTimeout(1500);
    await cuadro(1800, "1-choque");
    if (await page.getByTestId("aceptar-choque").isVisible()) {
      await page.getByTestId("aceptar-choque").click();
    } else {
      const mapa = page.getByTestId("mapa-facil");
      const caja = (await mapa.boundingBox())!;
      await mapa.click({ position: { x: caja.width * 0.62, y: caja.height * 0.5 } });
    }
    await expect(page.getByTestId("mensaje-exito")).toBeVisible();
    await cuadro(1600, "2-choque-listo");

    // 2. ¿Por dónde venía el Jetta? La flecha propuesta ya viene resaltada.
    await expect(page.getByTestId("escena-pregunta")).toContainText("Jetta");
    await cuadro(1600, "3-jetta-direccion");
    await page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]').first().click();
    // ¿Dónde quedó? Lo marca en el mapa con un toque y lo gira 15°.
    await expect(page.getByTestId("escena-pregunta")).toHaveText(
      "¿Dónde quedó después del choque?",
    );
    const mapa = page.getByTestId("mapa-facil");
    const caja = (await mapa.boundingBox())!;
    // Un punto libre del mapa: arriba de la hoja en el celular (abajo, en escritorio, va a un lado).
    const hoja = (await page.getByTestId("escena-hoja").boundingBox())!;
    const y = ancho < 900 ? (hoja.y - caja.y) * 0.62 : caja.height * 0.36;
    await page
      .getByTestId("mensaje-exito")
      .waitFor({ state: "hidden", timeout: 8000 })
      .catch(() => undefined);
    await mapa.click({ position: { x: caja.width * 0.66, y } });
    await page.getByTestId("girar-derecha").click();
    await cuadro(1600, "4-jetta-quedo");
    await page.getByTestId("listo-final").click();

    // 3. El Camaro: su flecha y «Quedó junto al choque».
    await expect(page.getByTestId("escena-pregunta")).toContainText("Camaro");
    await cuadro(1400, "5-camaro-direccion");
    await page.locator('[data-testid^="opcion-flecha-"][data-propuesta="si"]').first().click();
    await page.getByTestId("final-junto").click();
    await cuadro(1200);
    await page.getByTestId("listo-final").click();

    // 4. ¡La escena está lista!
    await contestarC1(page);
    await expect(page.getByTestId("escena-lista")).toBeVisible();
    const segundos = (Date.now() - t0) / 1000;
    await cuadro(3000, "6-lista");
    test.info().annotations.push({ type: "segundos", description: segundos.toFixed(1) });
    console.log(`tiempo de máquina del recorrido (${nombre}): ${segundos.toFixed(1)} s`);

    if (nombre === "claro") {
      const reducidos = await Promise.all(
        cuadros.map((c) => sharp(c.png).resize(900).png().toBuffer()),
      );
      await sharp(reducidos, { join: { animated: true } })
        .gif({ delay: cuadros.map((c) => c.ms), loop: 0, effort: 7 })
        .toFile(join(DIR, "recorrido.gif"));
    }
  });
}
