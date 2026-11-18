import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso } from "./ayuda-recorrido";

/**
 * La demo local sin internet (René, 2026-11-17): el sitio de `CORRER-DEMO-LOCAL.bat` (compilado con
 * `CROQUIS_VISOR=local`) en http://localhost:3000, con toda la red de afuera cortada en el navegador,
 * como en una sala sin internet. A mano y con ventana (el 3D de Unity necesita la GPU):
 *
 *   pnpm exec playwright test e2e/demo-local.spec.ts --headed
 *   → eval/results/demo_local.json (o la ruta de CROQUIS_SALIDA)
 *
 * Comprueba que, sin red:
 * - el caso de AXA reconstruye, abre el 3D de Unity (servido desde la máquina, con los modelos de los
 *   vehículos) y descarga el dictamen en PDF;
 * - un caso de ejemplo lee su narración guardada (sin Claude) y abre «La escena» con el mapa listo;
 * - ninguna petición sale a Vercel Blob ni a Vercel: lo único que se intenta afuera es lo que necesita
 *   internet (los mosaicos del mapa, la lectura con Claude), y la página lo aguanta.
 */
test.use({
  reducedMotion: "reduce",
  viewport: { width: 1600, height: 900 },
  // t4c (René, 2026-11-18): con CROQUIS_CANAL («chrome», «msedge») corre en el navegador instalado,
  // el que abre la demo de verdad, y no en el Chromium de Playwright.
  ...(process.env.CROQUIS_CANAL ? { channel: process.env.CROQUIS_CANAL } : {}),
});

const SALIDA =
  process.env.CROQUIS_SALIDA ?? resolve(__dirname, "../../../eval/results/demo_local.json");

async function sinInternet(page: Page) {
  const afuera = new Set<string>();
  await page.context().route(
    (u) => !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u.href),
    (r) => {
      afuera.add(new URL(r.request().url()).host);
      return r.abort("internetdisconnected");
    },
  );
  return afuera;
}

test("la demo local funciona sin internet: AXA con su 3D y su dictamen, y un caso de ejemplo", async ({
  page,
  baseURL,
}) => {
  test.skip(!/localhost|127\.0\.0\.1/.test(baseURL ?? ""), "Solo contra el sitio local.");
  test.setTimeout(600_000);
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  const consola: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && consola.length < 60) consola.push(m.text().slice(0, 300));
  });
  const afuera = await sinInternet(page);
  // El visor real de Unity, no el ligero (el navegador automatizado abre el ligero por omisión).
  await page.addInitScript(() => {
    (window as unknown as { __croquisVisorUnity?: boolean }).__croquisVisorUnity = true;
  });
  const t0 = Date.now();

  // El manifiesto es el local: el build y los modelos salen de esta máquina.
  const manifiesto = (await (await page.request.get("/visor-unity/manifest.json")).json()) as {
    base: string;
    modelos?: string;
  };
  expect(manifiesto.base, "el sitio no se compiló con CROQUIS_VISOR=local").toBe("/");
  expect(manifiesto.modelos).toBe("/modelos/vehiculos/");

  // 1. AXA: reconstrucción, 3D de Unity y dictamen.
  await page.goto("/cesvi/casos/a2010930");
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 90_000 });
  const cifraAxa = (await page.getByTestId("cifra-reconstruida").innerText()).trim();
  const antes3d = Date.now();
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 180_000,
  });
  const segundos3d = (Date.now() - antes3d) / 1000;
  // Los modelos de los vehículos llegaron del sitio (si no, Unity los habría pedido a Blob).
  const modelos = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((n) => /\/modelos\/vehiculos\//.test(n)),
  );
  expect(modelos.some((n) => n.endsWith(".glb"))).toBe(true);
  expect(modelos.every((n) => n.startsWith("http://localhost"))).toBe(true);
  await page.screenshot({ path: resolve(__dirname, "../test-results/demo-local-axa-3d.png") });
  await irAPaso(page, 8);
  const descarga = page.waitForEvent("download");
  await page.getByTestId("descargar-dictamen-pdf").click();
  const pdf = await descarga;
  expect(pdf.suggestedFilename()).toMatch(/^dictamen-reconstruccion/);

  // 2. Un caso de ejemplo: la narración guardada y la escena con el mapa.
  await page.goto("/cesvi/casos/nuevo");
  await page.getByTestId("usar-ejemplo-inicio").click();
  await page.getByTestId("ejemplo-narracion").click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("lectura-guardada")).toBeVisible({ timeout: 30_000 });
  await irAPaso(page, 3);
  try {
    await expect(page.getByTestId("mapa-facil")).toHaveAttribute("data-listo", "si", {
      timeout: 60_000,
    });
  } catch (e) {
    // t4c: si el mapa no queda listo, por qué (WebGL, lo que dijo la página), al registro y al JSON.
    const diagnostico = await page
      .evaluate(() => {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl2") ?? c.getContext("webgl");
        const info = gl?.getExtension("WEBGL_debug_renderer_info");
        return {
          webgl: gl ? (gl instanceof WebGL2RenderingContext ? "webgl2" : "webgl") : "ninguno",
          gpu: gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null,
          navegador: navigator.userAgent,
        };
      })
      .catch((x: unknown) => ({ error: String(x) }));
    const salida = { ejemplo: { mapa_listo: false }, diagnostico, consola, errores };
    process.stdout.write(`\n[diagnóstico del mapa] ${JSON.stringify(salida)}\n`);
    mkdirSync(join(SALIDA, ".."), { recursive: true });
    writeFileSync(SALIDA, `${JSON.stringify(salida, null, 2)}\n`);
    throw e;
  }

  // Nada fue a Vercel ni a Blob; lo de afuera es solo lo que necesita internet.
  const hosts = [...afuera].sort();
  expect(hosts.filter((h) => /vercel|blob\./.test(h))).toEqual([]);
  expect(errores).toEqual([]);

  const resultado = {
    descripcion:
      "La demo local sin internet (CORRER-DEMO-LOCAL.bat): el sitio compilado con CROQUIS_VISOR=local, con la red de afuera cortada en el navegador.",
    script: "apps/web/e2e/demo-local.spec.ts",
    fecha: new Date().toISOString(),
    sitio: baseURL,
    axa: {
      cifra: cifraAxa,
      segundos_hasta_unity_listo: Number(segundos3d.toFixed(1)),
      dictamen_pdf: true,
    },
    ejemplo: { lectura_guardada: true, mapa_listo: true },
    modelos_desde: "el sitio local",
    hosts_de_afuera_que_se_intentaron: hosts,
    errores_de_pagina: errores.length,
    segundos_totales: Number(((Date.now() - t0) / 1000).toFixed(1)),
  };
  mkdirSync(join(SALIDA, ".."), { recursive: true });
  writeFileSync(SALIDA, `${JSON.stringify(resultado, null, 2)}\n`);
});
