import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import { colocarTodo, irAPaso } from "./ayuda-recorrido";

/**
 * Ensayo del guion de la demo con CESVI (`docs/cesvi/demo/guion.md`), a mano y contra el sitio
 * publicado: el mismo orden que la demo, con el Unity real, una lectura en vivo de una narración y
 * una importación en vivo de un reporte (gasta API de verdad: unos 0.15 USD). No lleva @flujo.
 *
 * Cada tramo se cronometra y deja una captura; si un tramo falla, se anota y el ensayo sigue con el
 * siguiente, como en la demo.
 *
 *   CROQUIS_URL=https://croquis-sage.vercel.app pnpm exec playwright test \
 *     -c playwright.produccion.config.ts e2e/ensayo-demo.spec.ts --headed
 *     → eval/results/ensayo_demo.json y docs/cesvi/demo/ensayo/
 */
const RAIZ = resolve(__dirname, "../../..");
const CAPTURAS = join(RAIZ, process.env.CROQUIS_CAPTURAS ?? "docs/cesvi/demo/ensayo");
const SALIDA = process.env.CROQUIS_SALIDA ?? join(RAIZ, "eval/results/ensayo_demo.json");
const REPORTE_AXA = join(RAIZ, "data/cesvi/grabaciones/importar/dictamen-a2010930.md");
/** Una carambola de la prueba cuyo impacto posterior ocurre (`cesvi_r4b_carambolas_prueba.json`). */
const CARAMBOLA = "cesvi-257e1374a0";
const LEYENDA = /Reconstrucción ilustrativa|Reconstrucción de apoyo/;

interface Tramo {
  tramo: string;
  segundos: number;
  ok: boolean;
  nota: string;
  captura?: string;
}

async function captura(page: Page, nombre: string): Promise<string> {
  const archivo = `${nombre}.jpg`;
  await page.screenshot({ path: join(CAPTURAS, archivo), type: "jpeg", quality: 70 });
  return `${process.env.CROQUIS_CAPTURAS ?? "docs/cesvi/demo/ensayo"}/${archivo}`;
}

async function verEn3D(page: Page): Promise<number> {
  const t0 = Date.now();
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 240_000,
  });
  return (Date.now() - t0) / 1000;
}

test("ensayo de la demo con CESVI, en producción", async ({ baseURL }) => {
  test.setTimeout(1_500_000);
  mkdirSync(CAPTURAS, { recursive: true });
  const perfil = mkdtempSync(join(tmpdir(), "croquis-ensayo-"));
  const ctx = await chromium.launchPersistentContext(perfil, {
    headless: false,
    args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"],
    baseURL,
    locale: "es-MX",
    serviceWorkers: "block",
    viewport: { width: 1600, height: 900 },
  });
  const tramos: Tramo[] = [];
  const errores: string[] = [];
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on("pageerror", (e) => errores.push(e.message));
  await ctx.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
  });
  // CROQUIS_TRAMOS=1,2c: solo los tramos que empiezan así (para repetir los que tocan una pantalla).
  const solo = (process.env.CROQUIS_TRAMOS ?? "").split(",").filter(Boolean);
  const tramo = async (nombre: string, f: () => Promise<{ nota: string; captura?: string }>) => {
    if (solo.length && !solo.some((p) => nombre.startsWith(p))) return;
    const t0 = Date.now();
    try {
      const r = await f();
      tramos.push({ tramo: nombre, segundos: (Date.now() - t0) / 1000, ok: true, ...r });
    } catch (e) {
      let c: string | undefined;
      try {
        c = await captura(page, `falla-${nombre}`);
      } catch {
        // Sin captura.
      }
      tramos.push({
        tramo: nombre,
        segundos: (Date.now() - t0) / 1000,
        ok: false,
        nota: (e as Error).message.split("\n")[0]!.slice(0, 300),
        captura: c,
      });
    }
  };

  try {
    await tramo("0-portada", async () => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      return { nota: "portada", captura: await captura(page, "0-portada") };
    });

    // 1. AXA, el caso que CESVI ya analizó.
    await tramo("1a-axa-reconstruccion", async () => {
      await page.goto("/cesvi");
      await page.getByTestId("ir-axa").click();
      await expect(page.getByTestId("recorrido-caso")).toBeVisible();
      await irAPaso(page, 4);
      await page.getByTestId("reconstruir").click();
      const cifra = page.getByTestId("cifra-reconstruccion");
      await expect(cifra).toContainText("rango", { timeout: 120_000 });
      const texto = (await cifra.innerText()).replace(/\s+/g, " ");
      return { nota: texto.slice(0, 220), captura: await captura(page, "1a-axa-reconstruccion") };
    });
    await tramo("1b-axa-3d", async () => {
      const s = await verEn3D(page);
      await page.getByTestId("ir-al-impacto-unity").click();
      await page.waitForTimeout(3000);
      await expect(page.getByTestId("visor-caso")).toContainText(LEYENDA);
      const notas = (await page.getByTestId("contra-cesvi-3d").allInnerTexts()).map(
        (x) => x.split(". ")[0],
      );
      return {
        nota: `Unity listo en ${s.toFixed(1)} s (primera visita); «Ir al impacto». Notas: ${notas.join(" | ")}`,
        captura: await captura(page, "1b-axa-3d-impacto"),
      };
    });
    await tramo("1c-axa-contra-cesvi", async () => {
      await irAPaso(page, 7);
      const t = (await page.getByTestId("panel-paso").innerText()).replace(/\s+/g, " ");
      return { nota: t.slice(0, 220), captura: await captura(page, "1c-axa-contra-cesvi") };
    });
    await tramo("1d-axa-dictamen", async () => {
      await irAPaso(page, 8);
      await expect(page.getByTestId("panel-paso")).toContainText(/Dictamen|dictamen/);
      // Las filas contra CESVI de la vista previa del dictamen, tal como se leen.
      const t = (await page.getByTestId("panel-paso").innerText()).split(/\r?\n/);
      const filas = t.filter((l) =>
        /salir del impacto|antes del impacto|Restos|Deformación/.test(l),
      );
      return {
        nota: filas.join(" | ").slice(0, 400),
        captura: await captura(page, "1d-axa-dictamen"),
      };
    });
    await tramo("1e-axa-presentar", async () => {
      await page.getByTestId("modo-presentar").click();
      await expect(page.getByTestId("capitulo-titulo")).toBeVisible({ timeout: 60_000 });
      for (let k = 0; k < 6; k++) {
        if ((await page.getByTestId("capitulo-titulo").innerText()).includes("Contra CESVI")) break;
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(600);
      }
      await expect(page.getByTestId("capitulo-titulo")).toContainText("Contra CESVI");
      const datos = (await page.getByTestId("capitulo-datos").innerText()).replace(/\s+/g, " ");
      const c = await captura(page, "1e-axa-presentar-contra");
      await page.keyboard.press("Escape");
      return { nota: datos.slice(0, 400), captura: c };
    });

    // 2. Un caso nuevo en vivo: Claude lee la narración.
    await tramo("2a-nuevo-lectura-en-vivo", async () => {
      await page.goto("/cesvi");
      await page.getByTestId("ir-caso-nuevo").click();
      await irAPaso(page, 2);
      await page.getByTestId("ejemplo-narracion").click();
      const t0 = Date.now();
      await page.getByTestId("leer-narracion").click();
      await expect(page.getByTestId("escena")).toContainText("vehículos", { timeout: 120_000 });
      const s = (Date.now() - t0) / 1000;
      return {
        nota: `Claude leyó la narración en ${s.toFixed(1)} s`,
        captura: await captura(page, "2a-nuevo-lectura"),
      };
    });
    await tramo("2b-nuevo-colocar-y-reconstruir", async () => {
      await irAPaso(page, 3);
      await colocarTodo(page);
      await irAPaso(page, 4);
      await page.getByTestId("reconstruir").click();
      await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
      const texto = (await page.getByTestId("cifra-reconstruccion").innerText()).replace(
        /\s+/g,
        " ",
      );
      return { nota: texto.slice(0, 220), captura: await captura(page, "2b-nuevo-reconstruccion") };
    });
    await tramo("2c-nuevo-3d", async () => {
      const s = await verEn3D(page);
      await page.waitForTimeout(2000);
      return {
        nota: `Unity listo en ${s.toFixed(1)} s (segunda visita)`,
        captura: await captura(page, "2c-nuevo-3d"),
      };
    });

    // 3. Importar un reporte en vivo.
    await tramo("3-importar-en-vivo", async () => {
      await page.goto("/cesvi");
      await page.getByTestId("ir-importar").click();
      await page.getByTestId("archivo-dictamen").setInputFiles({
        name: "reporte-a2010930.md",
        mimeType: "text/markdown",
        buffer: readFileSync(REPORTE_AXA),
      });
      const t0 = Date.now();
      await page.getByTestId("leer-dictamen").click();
      await expect(page.getByTestId("panel-paso")).toHaveAttribute("data-paso", "2", {
        timeout: 240_000,
      });
      await expect(page.getByTestId("vehiculos")).toContainText("Silverado", { timeout: 60_000 });
      const s = (Date.now() - t0) / 1000;
      return {
        nota: `Claude leyó el reporte en ${s.toFixed(1)} s`,
        captura: await captura(page, "3-importar"),
      };
    });

    // 4. Una carambola de los reportes de CESVI.
    await tramo("4-carambola-3d", async () => {
      await page.goto(`/cesvi/casos/reporte/${CARAMBOLA}`);
      await irAPaso(page, 3);
      await colocarTodo(page);
      await irAPaso(page, 4);
      await page.getByTestId("reconstruir").click();
      await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
      const s = await verEn3D(page);
      await page.waitForTimeout(2000);
      return {
        nota: `Unity listo en ${s.toFixed(1)} s`,
        captura: await captura(page, "4-carambola-3d"),
      };
    });
  } finally {
    const salida = {
      descripcion:
        "Ensayo del guion de la demo con CESVI en producción (docs/cesvi/demo/guion.md): cada tramo con su tiempo, si salió y una captura. Incluye una lectura en vivo de una narración y una importación en vivo de un reporte.",
      sitio: baseURL,
      fecha: new Date().toISOString(),
      total_segundos: tramos.reduce((a, t) => a + t.segundos, 0),
      tramos,
      errores_de_pagina: errores,
    };
    writeFileSync(SALIDA, `${JSON.stringify(salida, null, 2)}\n`);
    await ctx.close();
    rmSync(perfil, { recursive: true, force: true });
  }
  expect(tramos.filter((t) => !t.ok)).toEqual([]);
});
