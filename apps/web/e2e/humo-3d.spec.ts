import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Page, type TestInfo } from "@playwright/test";
import { expect, test } from "./base";
import { irAPaso, sinRed } from "./ayuda-recorrido";
import { colocar, RECETAS } from "./recetas-ejemplos";

/**
 * El humo de las tandas (René, 2026-11-20): antes de gastar 2 horas, tres casos llegan al 3D de Unity
 * («listo») como los abriría una persona: AXA y el caso de Tollocan por La escena nueva (la guía, la
 * lista y «Ver la reconstrucción» dentro del panel) y un ejemplo («Crucero de noche») por La escena de
 * siempre, con su lectura guardada. Si uno no llega, la tanda se detiene (`detiene_si_falla`).
 *
 * Para no adivinar la próxima vez, cada caso deja en `eval/results/humo/` (o `CROQUIS_HUMO_SALIDA`):
 * su consola completa (con el log de Unity y cada paso del visor, `[croquis] unity:…`), el paquete
 * exacto que recibió Unity, una captura y una fila en `resumen.json`; la traza de Playwright queda en
 * `apps/web/test-results/`. Si Tollocan no llega, se repite sin el mapa en vivo (sin las calles ni los
 * objetos de OpenStreetMap ni de las teselas), para saber si es eso.
 *
 * No lleva @flujo ni corre en CI: necesita el Unity real.
 *
 *   CROQUIS_URL=http://localhost:3000 pnpm exec playwright test -c playwright.produccion.config.ts e2e/humo-3d.spec.ts
 */
const RAIZ = resolve(__dirname, "../../..");
const SALIDA = resolve(RAIZ, process.env.CROQUIS_HUMO_SALIDA ?? "eval/results/humo");
/** Lo que se espera «listo» después de pedir el 3D: más que el tope de carga del visor (45 s). */
const ESPERA_3D_MS = 75_000;

test.use({
  viewport: { width: 1440, height: 900 },
  // Sin las instantáneas del DOM: guardan también lo que baja la página (el build de Unity, decenas de
  // MB) y la traza pasaba de lo que acepta GitHub. Quedan las capturas y la consola.
  trace: { mode: "retain-on-failure", snapshots: false, screenshots: true, sources: false },
  ...(process.env.CROQUIS_CANAL ? { channel: process.env.CROQUIS_CANAL } : {}),
});

interface Consola {
  lineas: string[];
  paquete: string | null;
}
const consolas = new WeakMap<Page, Consola>();

test.beforeAll(() => {
  mkdirSync(SALIDA, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  const c: Consola = { lineas: [], paquete: null };
  consolas.set(page, c);
  const t0 = Date.now();
  page.on("console", (m) => {
    const texto = m.text();
    if (texto.startsWith("[croquis] paquete-3d ")) {
      c.paquete = texto.slice("[croquis] paquete-3d ".length);
      c.lineas.push(
        `${Date.now() - t0} ms [${m.type()}] [croquis] paquete-3d (${c.paquete.length} bytes)`,
      );
    } else c.lineas.push(`${Date.now() - t0} ms [${m.type()}] ${texto}`);
  });
  page.on("pageerror", (e) => c.lineas.push(`${Date.now() - t0} ms [pageerror] ${e.message}`));
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__croquisVisorUnity = true;
    w.__croquisDiagnostico = true;
    try {
      localStorage.setItem("croquis.escena", "nueva");
    } catch {
      // Sin almacenamiento: el flujo nuevo es el de omisión.
    }
  });
});

const slug = (t: string) =>
  t
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

/** Lo que dejó un caso: su consola, el paquete de Unity y una captura. */
async function guardar(page: Page, nombre: string, fila: Record<string, unknown>) {
  const c = consolas.get(page);
  const base = join(SALIDA, slug(nombre));
  writeFileSync(`${base}-consola.txt`, (c?.lineas ?? []).join("\n") + "\n");
  if (c?.paquete) writeFileSync(`${base}-paquete-3d.json`, c.paquete);
  // Una página trabada no saca captura: se intenta con tope.
  await page
    .screenshot({ path: `${base}.jpg`, type: "jpeg", quality: 80, timeout: 10_000 })
    .catch(() => (fila.captura = "la página no respondió para la captura"));
  appendFileSync(
    join(SALIDA, "resumen.jsonl"),
    JSON.stringify({ fecha: new Date().toISOString(), caso: nombre, ...fila }) + "\n",
  );
}

/**
 * Del 3D pedido a «listo», o a lo que haya: el visor ligero con su motivo, o nada (la página no
 * respondió). Anota las fases que se vieron y cuándo.
 */
async function esperar3d(page: Page) {
  const t0 = Date.now();
  const fases: string[] = [];
  let final: { estado: string; motivo?: string | null; aviso?: string | null } = {
    estado: "sin respuesta",
  };
  while (Date.now() - t0 < ESPERA_3D_MS) {
    const r = await page
      .evaluate(() => {
        const v = document.querySelector('[data-testid="visor-unity"]');
        const resp = document.querySelector('[data-testid="visor-unity-respaldo"]');
        return {
          fase: v?.getAttribute("data-fase") ?? null,
          respaldo: resp?.getAttribute("data-motivo") ?? null,
          aviso: document.querySelector('[data-testid="visor-unity-aviso"]')?.textContent ?? null,
        };
      })
      .catch(() => null);
    const s = (Date.now() - t0) / 1000;
    const visto = r
      ? r.respaldo
        ? `respaldo:${r.respaldo}`
        : (r.fase ?? "sin visor")
      : "sin respuesta";
    if (fases.at(-1)?.split(" @")[0] !== visto) fases.push(`${visto} @${s.toFixed(1)} s`);
    if (r?.fase === "listo") {
      final = { estado: "listo" };
      break;
    }
    if (r?.respaldo) {
      final = { estado: "respaldo", motivo: r.respaldo, aviso: r.aviso };
      break;
    }
    await page.waitForTimeout(500);
  }
  return { ...final, segundos: Math.round((Date.now() - t0) / 100) / 10, fases };
}

/** De La escena (la nueva) a Reconstrucción y al 3D. */
async function porLaEscenaNueva(page: Page) {
  await irAPaso(page, 3);
  await expect(page.getByTestId("lista-escena")).toBeVisible({ timeout: 30_000 });
  await irAPaso(page, 4);
  const rec = page.getByTestId("reconstruir");
  if (await rec.isVisible().catch(() => false)) await rec.click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("vista-3d").click();
  return esperar3d(page);
}

async function abrirTollocan(page: Page) {
  await page.goto("/cesvi");
  await page
    .getByTestId("abrir-caso-casos")
    .setInputFiles(join(RAIZ, "data/cesvi/casos/tollocan-rene.croquis"));
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 30_000 });
}

function revisar(nombre: string, r: Awaited<ReturnType<typeof esperar3d>>, info: TestInfo) {
  info.annotations.push({ type: "humo", description: `${nombre}: ${JSON.stringify(r)}` });
  expect(r.estado, `${nombre}: ${r.fases.join(" → ")}${r.aviso ? ` (${r.aviso})` : ""}`).toBe(
    "listo",
  );
}

test("humo: AXA de La escena nueva al 3D de Unity", async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible({ timeout: 30_000 });
  const r = await porLaEscenaNueva(page);
  await guardar(page, "AXA", r);
  revisar("AXA", r, info);
});

test("humo: Tollocan de La escena nueva al 3D de Unity", async ({ page, context }, info) => {
  test.setTimeout(330_000);
  await abrirTollocan(page);
  const r = await porLaEscenaNueva(page);
  await guardar(page, "Tollocan", r);
  if (r.estado !== "listo") {
    // Para aislarlo: el mismo caso sin el mapa en vivo (otra pestaña, ya sin calles ni objetos).
    const otra = await context.newPage();
    const c: Consola = { lineas: [], paquete: null };
    consolas.set(otra, c);
    otra.on("console", (m) => {
      const t = m.text();
      if (t.startsWith("[croquis] paquete-3d ")) c.paquete = t.slice(21);
      else c.lineas.push(`[${m.type()}] ${t}`);
    });
    await page.close().catch(() => undefined);
    await sinRed(otra);
    await abrirTollocan(otra);
    const sin = await porLaEscenaNueva(otra);
    await guardar(otra, "Tollocan sin el mapa en vivo", sin);
    info.annotations.push({
      type: "humo",
      description: `Tollocan sin el mapa en vivo: ${sin.estado} (${sin.fases.join(" → ")})`,
    });
  }
  revisar("Tollocan", r, info);
});

test("humo: un ejemplo («Crucero de noche») de La escena al 3D de Unity", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  // Las recetas de los ejemplos van por La escena de siempre (una pregunta a la vez).
  await page.addInitScript(() => {
    try {
      localStorage.setItem("croquis.escena", "anterior");
    } catch {
      // Sin almacenamiento.
    }
  });
  const receta = RECETAS.find((x) => x.clave === "crucero-noche")!;
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible();
  await irAPaso(page, 2);
  await page.locator(`[data-ejemplo="${receta.clave}"]`).click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toBeVisible({ timeout: 60_000 });
  await irAPaso(page, 3);
  const notas: string[] = [];
  expect(await colocar(page, receta, notas), notas.join(" ")).toBe(true);
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("vista-3d").click();
  const r = await esperar3d(page);
  await guardar(page, "Ejemplo crucero de noche", { ...r, notas });
  revisar("Crucero de noche", r, info);
});
