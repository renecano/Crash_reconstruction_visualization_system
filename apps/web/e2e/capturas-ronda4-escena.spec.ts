import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "./base";

/**
 * Ronda 4 (René, 2026-11-18, «la primera experiencia en La escena»): cómo se ve hoy al entrar a La
 * escena en dos casos, AXA (con su escena colocada) y cesvi-cf708e9fed (Periférico a la altura de
 * Viaducto, un reporte importado), para las propuestas. Contra el sitio (por omisión producción), sin
 * Unity. Lo que se marca en el mapa se marca en el centro, como lo haría el perito al empezar.
 *
 *   CROQUIS_URL=<sitio> CROQUIS_CAPTURAS=<prefijo> pnpm exec playwright test \
 *     -c playwright.produccion.config.ts e2e/capturas-ronda4-escena.spec.ts
 *     → docs/cesvi/ronda-4/evidencia/escena/<prefijo>-*.jpg
 */
const DIR = resolve(__dirname, "../../../docs/cesvi/ronda-4/evidencia/escena");
const PREFIJO = process.env.CROQUIS_CAPTURAS ?? "antes";

test.use({ viewport: { width: 1440, height: 900 } });

for (const [caso, ruta] of [
  ["axa", "/cesvi/casos/a2010930/escena"],
  ["cf708", "/cesvi/casos/reporte/cesvi-cf708e9fed/escena"],
] as const) {
  test(`La escena al entrar: ${caso}`, async ({ page }) => {
    test.setTimeout(240_000);
    mkdirSync(DIR, { recursive: true });
    const foto = (n: string) =>
      page.screenshot({
        path: join(DIR, `${PREFIJO}-${caso}-${n}.jpg`),
        type: "jpeg",
        quality: 80,
      });
    // Las de «después» van con el flujo nuevo (la escena ya armada con su lista).
    if (PREFIJO !== "antes")
      await page.addInitScript(() => localStorage.setItem("croquis.escena", "nueva"));
    await page.goto(ruta);
    await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(8000);
    await foto("1-al-entrar");
    // Un reporte importado abre en «Presentar»: para marcar hay que pasar a «Trabajar».
    const trabajar = page.getByTestId("modo-trabajar");
    if ((await trabajar.getAttribute("aria-selected")) !== "true") {
      await trabajar.click();
      await page.waitForTimeout(2500);
      await foto("1b-trabajar");
    }
    // Con el flujo nuevo, la búsqueda se abre desde la lista («Buscar el lugar»).
    const buscarLugar = page.getByTestId("marcar-choque-1");
    if (PREFIJO !== "antes" && (await buscarLugar.isVisible().catch(() => false)))
      if (/Buscar el lugar/.test((await buscarLugar.textContent()) ?? ""))
        await buscarLugar.click();
    // Si pide el lugar, se busca con lo que trae el caso y se elige la primera opción.
    const buscar = page.getByRole("button", { name: "Buscar", exact: true });
    if (await buscar.isVisible().catch(() => false)) {
      if (PREFIJO !== "antes")
        // El Periférico a la altura de la colonia del caso (la búsqueda local no da opciones).
        await page.getByRole("textbox").first().fill("19.4085338, -99.1944592");
      await buscar.click();
      const opcion = page.getByTestId("opcion-lugar").first();
      await opcion.waitFor({ timeout: 30_000 }).catch(() => undefined);
      await foto("1c-opciones-del-lugar");
      if (await opcion.isVisible().catch(() => false)) await opcion.click();
      await page.waitForTimeout(6000);
      await foto("1d-el-lugar");
    }
    if (PREFIJO !== "antes") {
      await expect(page.getByTestId("lista-escena")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(4000);
      await foto("2-la-escena-armada");
      const guia = page.getByTestId("cerrar-guia");
      if (await guia.isVisible().catch(() => false)) await guia.click();
      await page.waitForTimeout(800);
      await foto("3-revisando");
      return;
    }
    // Si pregunta dónde fue el choque, se marca al centro del mapa (lo primero que hace el perito).
    const pregunta = page.getByTestId("escena-pregunta");
    if (
      (await pregunta.count()) &&
      /Dónde fue el choque/.test((await pregunta.textContent()) ?? "")
    ) {
      const mapa = page.getByTestId("mapa-facil");
      const caja = (await mapa.boundingBox())!;
      await mapa.click({ position: { x: caja.width * 0.5, y: caja.height * 0.5 } });
      // Lo que tarda en llegar la propuesta de flechas: se toma a los 6 s y a los 40 s.
      await page.waitForTimeout(6000);
      await foto("2-despues-del-choque");
      await page.waitForTimeout(34_000);
      await foto("3-a-los-40-s");
    }
  });
}
