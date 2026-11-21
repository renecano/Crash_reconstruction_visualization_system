import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { expect, test } from "./base";
import { colocar, RECETAS } from "./recetas-ejemplos";
import { cerrarLaEscena, contestarPreguntas, irAPaso } from "./ayuda-recorrido";
import { conPosicion, escenaDeNarracion, type SalidaCorpus } from "@croquis/cesvi";
import { casoParaGuardar } from "../src/lib/caso-guardado";

/**
 * Ronda 4 (René, 2026-11-18): «Prueba con 6 narraciones nuevas que cubran cada caso (árbol, poste,
 * puente, subida, bajada, carril en curva), de punta a punta en demo local, con captura del 3D de cada
 * una». Más el caso encimado a propósito. No lleva @flujo ni corre en CI: lee con Claude (la llave del
 * .env.local de la demo local, dentro del tope) y abre el Unity local.
 *
 *   CROQUIS_URL=http://localhost:3000 pnpm exec playwright test -c playwright.produccion.config.ts \
 *     e2e/narraciones-fisica.spec.ts --headed
 *     → eval/results/ronda4_narraciones_fisica.json y docs/cesvi/ronda-4/evidencia/fisica/
 */
const RAIZ = resolve(__dirname, "../../..");
const CAPTURAS = join(RAIZ, "docs/cesvi/ronda-4/evidencia/fisica");
/** Escribe el resultado, creando su carpeta si falta («antes»: eval/results/t5 no existía). */
function escribirSalida(texto: string): void {
  mkdirSync(dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, texto);
}
// `resolve`: la ruta puede llegar absoluta (la tanda); `join` la pegaba detrás de la raíz (t5).
const SALIDA = resolve(
  RAIZ,
  process.env.CROQUIS_SALIDA ?? "eval/results/ronda4_narraciones_fisica.json",
);

/** Las seis narraciones de `docs/cesvi/ronda-4/narraciones-fisica.md` (sus bloques citados). */
function narraciones(): { clave: string; texto: string }[] {
  const md = readFileSync(join(RAIZ, "docs/cesvi/ronda-4/narraciones-fisica.md"), "utf8");
  const claves = ["arbol", "poste", "puente", "subida", "bajada", "curva"];
  const bloques = [...md.matchAll(/^> (.+)$/gm)].map((m) => m[1]!.trim());
  return bloques.slice(0, 6).map((texto, k) => ({ clave: claves[k]!, texto }));
}

test.use({
  viewport: { width: 1600, height: 900 },
  // t5 (René, 2026-11-19): en el Chrome instalado, no en el Chromium de Playwright.
  ...(process.env.CROQUIS_CANAL ? { channel: process.env.CROQUIS_CANAL } : {}),
});

/** El 3D de Unity, en el impacto y después, con sus capturas. */
async function capturar3d(page: Page, clave: string) {
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 300_000,
  });
  await page.getByRole("button", { name: "Ir al impacto" }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({
    path: join(CAPTURAS, `${clave}-1-impacto.jpg`),
    quality: 85,
    type: "jpeg",
  });
  // Hay dos «Repetir» (la barra y el marco): el de la barra del 3D, por su testid (t5c, 2026-11-21).
  await page.getByTestId("repetir-unity").click();
  await page.waitForTimeout(9000);
  await page.screenshot({
    path: join(CAPTURAS, `${clave}-2-despues.jpg`),
    quality: 85,
    type: "jpeg",
  });
}

const filas: Record<string, unknown>[] = [];

// t5 (René, 2026-11-20): el Unity real (la app usa el visor de respaldo en un navegador automatizado
// si no se pide), y con qué tarjeta corre cada prueba (el renderer de WebGL).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __croquisVisorUnity?: boolean }).__croquisVisorUnity = true;
  });
});

/** El renderer de WebGL del navegador (UNMASKED_RENDERER_WEBGL): con qué tarjeta se corrió. */
async function rendererWebgl(page: Page): Promise<string | null> {
  return page
    .evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
    })
    .catch(() => null);
}

/** La lectura grabada de cada narración (eval/ronda4_grabar_narraciones.mts): sin llave ni gasto. */
const grabada = (clave: string) =>
  (
    JSON.parse(
      readFileSync(join(RAIZ, `data/cesvi/grabaciones/ronda4/ronda4-${clave}.json`), "utf8"),
    ) as { salida: unknown }
  ).salida;

for (const n of narraciones()) {
  test(`narración ${n.clave}: de lo dicho a la física y al 3D`, async ({ page }) => {
    test.setTimeout(900_000);
    mkdirSync(CAPTURAS, { recursive: true });
    await page.addInitScript(() => localStorage.setItem("croquis.escena", "nueva"));
    await page.route("**/api/cesvi/escena", (r) =>
      r.fulfill({ json: { metodo: "claude", salida: grabada(n.clave) } }),
    );
    await page.goto("/cesvi");
    const gpu = await rendererWebgl(page);
    await page.getByTestId("ir-caso-nuevo").click();
    await irAPaso(page, 2);
    await page.getByTestId("narracion").fill(n.texto);
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toContainText("vehículo", { timeout: 180_000 });
    await contestarPreguntas(page);
    await irAPaso(page, 3);
    await cerrarLaEscena(page);
    await page.getByTestId("lista-ver-reconstruccion").click();
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
    await page.waitForTimeout(3000);
    const panel = (await page.getByTestId("panel-paso").innerText()).slice(0, 1500);
    const notas = page.getByText("Supuestos y notas del cálculo");
    if (await notas.isVisible().catch(() => false)) await notas.click();
    const texto = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    await capturar3d(page, n.clave);
    filas.push({
      clave: n.clave,
      gpu,
      cifra: (await page.getByTestId("cifra-reconstruccion").innerText()).replace(/\s+/g, " "),
      panel: panel.replace(/\s+/g, " "),
      dice_supuesto_de_velocidad:
        /supuesto de \d+ a \d+ km\/h|típica de la vía|fija lo declarado|declarad/i.test(texto),
      menciona_objeto: /árbol|poste|barrera|muro/i.test(texto),
      menciona_estructura: /puente|paso a desnivel/i.test(texto),
      menciona_relieve: /relieve/i.test(texto),
    });
    writeFileSync(
      SALIDA,
      JSON.stringify({ fecha: new Date().toISOString(), filas }, null, 2) + "\n",
    );
  });
}

/**
 * El caso encimado a propósito (René, 2026-11-18): el crucero de ejemplo con B colocado encima de A
 * en el choque, los dos con el mismo rumbo. Antes: se tocaban y se despegaban sin daño. Ahora La
 * escena lo dice y lo separa, y la reconstrucción dice si el choque no transfiere energía.
 */
test("caso encimado a propósito: antes y después en el 3D", async ({ page }) => {
  test.setTimeout(900_000);
  mkdirSync(CAPTURAS, { recursive: true });
  const g = JSON.parse(
    readFileSync(join(RAIZ, "data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"), "utf8"),
  ) as { narracion: string; salida: SalidaCorpus };
  const escena = escenaDeNarracion(g.salida, g.narracion);
  const P = { lat: 19.3576, lon: -99.0625 };
  const m = (n: number, e: number) => ({
    lat: P.lat + n / 111320,
    lon: P.lon + e / (111320 * Math.cos((P.lat * Math.PI) / 180)),
  });
  let e = conPosicion(escena.expediente, {
    vehiculo: "V1",
    fase: "impacto",
    punto: m(0, 0),
    rumbo: 90,
  });
  e = conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(0.3, 0.8), rumbo: 90 });
  const ruta = join(RAIZ, "eval/results/ronda4_caso_encimado.croquis");
  writeFileSync(
    ruta,
    JSON.stringify(
      casoParaGuardar({
        narracion: g.narracion,
        escena,
        expediente: e,
        validacion: null,
        titulo: "Encimados a propósito",
      }),
    ),
  );
  await page.goto("/cesvi");
  await page.getByTestId("abrir-caso-casos").setInputFiles(ruta);
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 60_000 });
  // El caso trae dónde chocaron A y B, no dónde quedaron: La escena lo pide («Para seguir falta: dónde
  // quedó…», t5c 2026-11-21) y se contesta como en el crucero, «junto al choque».
  await irAPaso(page, 3);
  const notasEscena: string[] = [];
  await colocar(
    page,
    RECETAS.find((x) => x.clave === "crucero-noche")!,
    notasEscena,
  );
  // Antes de separarlos: la reconstrucción con lo encimado, y su 3D.
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
  const avisoAntes = await page
    .getByTestId("aviso-sin-transferencia")
    .isVisible()
    .catch(() => false);
  await capturar3d(page, "encimado-antes");
  // En La escena, el aviso con «Separarlos».
  await page
    .getByTestId("vista-mapa")
    .first()
    .click()
    .catch(() => undefined);
  await irAPaso(page, 3);
  const separar = page.getByTestId("separar-choque-encimado");
  const avisoEscena = await separar.isVisible({ timeout: 30_000 }).catch(() => false);
  if (avisoEscena) await separar.click();
  await irAPaso(page, 4);
  const rec = page.getByTestId("reconstruir");
  if (await rec.isVisible().catch(() => false)) await rec.click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
  await capturar3d(page, "encimado-despues");
  filas.push({
    clave: "encimado",
    gpu: await rendererWebgl(page),
    aviso_sin_transferencia_antes: avisoAntes,
    aviso_en_la_escena: avisoEscena,
  });
  escribirSalida(JSON.stringify({ fecha: new Date().toISOString(), filas }, null, 2) + "\n");
});

/**
 * El caso de Tollocan de René (2026-11-18), de punta a punta: «iba por tollocan rumbo a la ciudad de
 * mexico, y me sali de la carretera imapctando de frente contra un arbol, iba en un sedan». Antes daba
 * 20 km/h en producción; aquí se ve qué velocidad da, qué dice de ella, dónde queda el árbol y su 3D.
 */
test("Tollocan de René, de punta a punta", async ({ page }) => {
  test.setTimeout(900_000);
  mkdirSync(CAPTURAS, { recursive: true });
  await page.goto("/cesvi");
  await page
    .getByTestId("abrir-caso-casos")
    .setInputFiles(join(RAIZ, "data/cesvi/casos/tollocan-rene.croquis"));
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 60_000 });
  await irAPaso(page, 2);
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: join(CAPTURAS, "tollocan-1-el-hecho.jpg"),
    quality: 85,
    type: "jpeg",
  });
  await irAPaso(page, 3);
  await page.waitForTimeout(12_000);
  await page.screenshot({
    path: join(CAPTURAS, "tollocan-2-la-escena.jpg"),
    quality: 85,
    type: "jpeg",
  });
  await irAPaso(page, 4);
  const rec = page.getByTestId("reconstruir");
  if (await rec.isVisible().catch(() => false)) await rec.click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 240_000 });
  await page.waitForTimeout(3000);
  const texto = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  await page.screenshot({
    path: join(CAPTURAS, "tollocan-3-reconstruccion.jpg"),
    quality: 85,
    type: "jpeg",
  });
  await capturar3d(page, "tollocan");
  filas.push({
    clave: "tollocan",
    gpu: await rendererWebgl(page),
    cifra: (await page.getByTestId("cifra-reconstruccion").innerText()).replace(/\s+/g, " "),
    dice_supuesto_de_velocidad: /típica de la vía|supuesto de \d+ a \d+ km\/h|declarad/i.test(
      texto,
    ),
    menciona_arbol: /árbol/i.test(texto),
  });
  escribirSalida(JSON.stringify({ fecha: new Date().toISOString(), filas }, null, 2) + "\n");
});
