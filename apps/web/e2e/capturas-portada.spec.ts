import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { cerrarLaEscena, contestarPreguntas, irAPaso } from "./ayuda-recorrido";

/**
 * Las capturas de la app que usa la portada (René, 2026-11-24), de la app en producción y con el flujo
 * de hoy: un ejemplo de la app (inventado, sin AXA ni reportes de CESVI; con su lectura guardada, no
 * llama a Claude), de día y de noche. Ninguna muestra una cifra de la reconstrucción: dependen de dónde
 * se colocó cada vehículo y cambian con la física, así que esas zonas quedan fuera del recorte. El
 * Unity sale de la copia local (`base.ts`), no de Blob. No lleva @flujo y no corre en CI:
 *
 *   CROQUIS_URL=https://croquis-sage.vercel.app CROQUIS_CAPTURAS=<carpeta> CROQUIS_EJEMPLO=<clave> \
 *     pnpm --filter @croquis/web exec playwright test --config playwright.recorrido.config.ts --headed
 *   node apps/web/scripts/portada-capturas.mjs …
 */
const SALIDA = process.env.CROQUIS_CAPTURAS ?? "capturas-portada";
const CLAVE = process.env.CROQUIS_EJEMPLO ?? "alcance-deformacion";

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });

const quieta = async (page: Page, ms = 3000) => {
  await page.waitForTimeout(ms);
  await expect(page.getByTestId("maqueta-calculando")).toHaveCount(0, { timeout: 120_000 });
};

for (const tema of ["claro", "oscuro"] as const)
  test(`el recorrido (${tema})`, async ({ page }) => {
    test.setTimeout(1_200_000);
    const dir = join(SALIDA, tema);
    mkdirSync(dir, { recursive: true });
    const foto = async (nombre: string) => {
      for (const b of await page.locator('button[aria-label="Cerrar el mensaje"]:visible').all())
        await b.click();
      await page.screenshot({ path: join(dir, `${nombre}.png`) });
    };
    await page.emulateMedia({ colorScheme: tema === "claro" ? "light" : "dark" });
    await page.addInitScript((t) => {
      (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
      localStorage.setItem("croquis.cesvi.tema.trabajar", t);
      localStorage.setItem("croquis.escena", "nueva");
      localStorage.setItem("croquis.2d", "pericial");
    }, tema);
    await page.goto("/cesvi?calidad=alta");
    await page.getByTestId("ir-caso-nuevo").click();
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    await irAPaso(page, 2);
    await page.locator(`[data-ejemplo="${CLAVE}"]`).click();
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
    await contestarPreguntas(page);
    await quieta(page);
    await page.evaluate(() =>
      document.querySelectorAll("*").forEach((e) => {
        if (e.scrollTop) e.scrollTop = 0;
      }),
    );
    await page.waitForTimeout(800);
    await foto("1-hecho");
    await irAPaso(page, 3);
    await cerrarLaEscena(page);
    await quieta(page);
    await foto("2-escena");
    await page.getByTestId("lista-ver-reconstruccion").click();
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
    await quieta(page, 4000);
    await foto("3-reconstruccion-2d");
    await page.getByTestId("vista-3d").first().click();
    await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
      timeout: 300_000,
    });
    await page.waitForTimeout(5000);
    const minimapa = page.getByRole("button", { name: "Ocultar minimapa" });
    if (await minimapa.isVisible().catch(() => false)) await minimapa.click();
    await page.getByTestId("ir-al-impacto-unity").click();
    await page.waitForTimeout(3500);
    await foto("3-reconstruccion");
    await page.getByTestId("pantalla-completa").first().click();
    await page.waitForTimeout(3500);
    await foto("3-reconstruccion-completa");
    // Antes del impacto, sin barras (se esconden solas): la foto del inicio.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
    await page.getByTestId("camara-cinematica").click();
    await page.waitForTimeout(1500);
    await page.getByTestId("tiempo-unity").fill("-0.28");
    await page.getByTestId("pantalla-completa").first().click();
    await page.mouse.move(720, 450);
    await page.waitForTimeout(6000);
    await foto("3-antes-del-impacto");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
    await irAPaso(page, 5);
    await quieta(page);
    await foto("4-versiones");
    await irAPaso(page, 6);
    await quieta(page);
    await foto("5-analisis");
    // Los últimos supuestos de la lista, con su rango.
    const supuestos = page.getByTestId("supuestos").locator(".tarjeta-supuesto");
    const recorte = async (nombre: string, desde: number, hasta: number) => {
      await supuestos.nth(hasta).scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      const a = (await supuestos.nth(desde).boundingBox())!;
      const z = (await supuestos.nth(hasta).boundingBox())!;
      await page.screenshot({
        path: join(dir, `${nombre}.png`),
        clip: { x: a.x - 8, y: a.y - 8, width: a.width + 16, height: z.y + z.height - a.y + 16 },
      });
    };
    await recorte("5-supuestos", (await supuestos.count()) - 3, (await supuestos.count()) - 1);
    await irAPaso(page, 9);
    await quieta(page, 9000);
    await foto("6-dictamen");
    if (tema === "oscuro") return;
    // El PDF del dictamen: las páginas que usa la portada, sin una velocidad.
    const [descarga] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.getByTestId("descargar-dictamen-pdf").click(),
    ]);
    const pdf = join(dir, "dictamen.pdf");
    await descarga.saveAs(pdf);
    const visor = await page.context().newPage();
    const pdfjs = dirname(require.resolve("pdfjs-dist/build/pdf.mjs"));
    await visor.route("http://pdf.local/**", (r) => {
      const f = new URL(r.request().url()).pathname.slice(1);
      return f
        ? r.fulfill({ path: f === "d.pdf" ? pdf : join(pdfjs, f) })
        : r.fulfill({ contentType: "text/html", body: "<body></body>" });
    });
    await visor.goto("http://pdf.local/");
    for (const n of [1, 4]) {
      const { texto, png } = await visor.evaluate(async (k) => {
        const l = await import(/* webpackIgnore: true */ "/pdf.mjs" as string);
        l.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
        const p = await (await l.getDocument({ url: "/d.pdf" }).promise).getPage(k);
        const viewport = p.getViewport({ scale: 2.7 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await p.render({ canvas, viewport }).promise;
        const t = (await p.getTextContent()).items as { str?: string }[];
        return { texto: t.map((i) => i.str ?? "").join(" "), png: canvas.toDataURL("image/png") };
      }, n);
      expect(texto, `página ${n}`).not.toMatch(/km\/h|kJ|AXA/);
      writeFileSync(join(dir, `6-pdf-${n}.png`), Buffer.from(png.split(",")[1]!, "base64"));
    }
  });
