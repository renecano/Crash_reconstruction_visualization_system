import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import { irAPaso } from "./ayuda-recorrido";

/**
 * El arranque del 3D de Unity al abrirlo, por partes (René, 2026-11-16): descarga, compilación del
 * WebAssembly, arranque del motor, carga del caso y primer cuadro, en la primera visita (perfil
 * nuevo) y en la segunda (mismo perfil, con caché), con la tarea larga más larga del hilo principal
 * de cada una. Chromium con ventana y la GPU de la laptop, con el visor Unity, como un perito. No
 * corre en CI.
 *
 *   CROQUIS_URL=https://croquis-sage.vercel.app pnpm exec playwright test \
 *     -c playwright.produccion.config.ts e2e/medir-unity-arranque.spec.ts
 *     → eval/results/unity_arranque.json
 */
const RAIZ = resolve(__dirname, "../../..");

/** Lo que se instala antes de que cargue la página: marcas de WebAssembly y tareas largas. */
function instrumentar() {
  const w = window as unknown as {
    __croquisVisorUnity: boolean;
    __largas: { t: number; d: number }[];
    __wasm: { compila?: number; compilado?: number; instancia?: number; instanciado?: number };
  };
  w.__croquisVisorUnity = true;
  w.__largas = [];
  w.__wasm = {};
  new PerformanceObserver((l) => {
    for (const e of l.getEntries())
      w.__largas.push({ t: Math.round(e.startTime), d: Math.round(e.duration) });
  }).observe({ type: "longtask", buffered: true });
  const envolver = (nombre: "instantiateStreaming" | "instantiate" | "compileStreaming") => {
    const original = WebAssembly[nombre] as unknown as (...a: unknown[]) => Promise<unknown>;
    if (!original) return;
    (WebAssembly as unknown as Record<string, unknown>)[nombre] = (...a: unknown[]) => {
      if (nombre === "compileStreaming") w.__wasm.compila ??= performance.now();
      else w.__wasm.instancia ??= performance.now();
      return original.apply(WebAssembly, a).then((r) => {
        if (nombre === "compileStreaming") w.__wasm.compilado ??= performance.now();
        else w.__wasm.instanciado ??= performance.now();
        return r;
      });
    };
  };
  envolver("instantiateStreaming");
  envolver("instantiate");
  envolver("compileStreaming");
}

async function abrir3d(page: Page) {
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible();
  await irAPaso(page, 4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 180_000 });
  await page.waitForTimeout(2000);
  const t0 = await page.evaluate(() => performance.now());
  const reloj = Date.now();
  await page.getByTestId("vista-3d").click();
  await expect(page.getByTestId("visor-unity")).toHaveAttribute("data-fase", "listo", {
    timeout: 300_000,
  });
  // El primer cuadro con el caso: el siguiente cuadro después de «caso cargado».
  const primerCuadro = await page.evaluate(
    () => new Promise<number>((ok) => requestAnimationFrame(() => ok(performance.now()))),
  );
  const ms = Date.now() - reloj;
  await page.waitForTimeout(2000);
  return page.evaluate(
    ({ t0, primerCuadro, ms }) => {
      const w = window as unknown as {
        __largas: { t: number; d: number }[];
        __wasm: Record<string, number>;
      };
      const marca = (n: string) =>
        performance.getEntriesByName(`unity:${n}`).at(-1)?.startTime ?? null;
      const rel = (x: number | null | undefined) => (x == null ? null : Math.round(x - t0));
      const recursos = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
        .filter((r) => /visor-unity\/[0-9a-f]+\/Build\//.test(r.name))
        .map((r) => ({
          archivo: r.name
            .split("/")
            .at(-1)!
            .replace(/^[0-9a-f]{20,}\./, "*."),
          mb: Number(((r.encodedBodySize || r.transferSize) / 2 ** 20).toFixed(1)),
          de_red_mb: Number((r.transferSize / 2 ** 20).toFixed(1)),
          inicio_ms: Math.round(r.startTime - t0),
          duracion_ms: Math.round(r.duration),
        }));
      const largas = w.__largas.filter((x) => x.t >= t0 - 20);
      return {
        ms_hasta_listo: ms,
        etapas_ms_desde_el_clic: {
          precarga: rel(marca("precarga")),
          precarga_lista: rel(marca("precarga_lista")),
          cargador_listo: rel(marca("cargador_listo")),
          wasm_compila: rel(w.__wasm.compila ?? w.__wasm.instancia),
          wasm_listo: rel(w.__wasm.compilado ?? w.__wasm.instanciado),
          motor_listo: rel(marca("instancia")),
          solver_listo: rel(marca("solver_listo")),
          caso_cargado: rel(marca("caso_cargado")),
          primer_cuadro: rel(primerCuadro),
        },
        recursos,
        tarea_mas_larga_ms: Math.max(0, ...largas.map((x) => x.d)),
        tareas_de_mas_de_100_ms: largas.filter((x) => x.d > 100).length,
        tiempo_bloqueado_ms: largas.reduce((a, x) => a + Math.max(0, x.d - 50), 0),
      };
    },
    { t0, primerCuadro, ms },
  );
}

test("el arranque del 3D de Unity, por partes", async ({ baseURL }) => {
  test.setTimeout(1_200_000);
  const perfil = mkdtempSync(join(tmpdir(), "croquis-unity-arranque-"));
  const ctx = await chromium.launchPersistentContext(perfil, {
    headless: false,
    args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"],
    baseURL,
    locale: "es-MX",
    serviceWorkers: "block",
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(instrumentar);
  await ctx.route("**/api/osm?**", (r) => r.fulfill({ json: { elements: [] } }));
  try {
    const primera = await abrir3d(ctx.pages()[0] ?? (await ctx.newPage()));
    // La segunda visita: otra pestaña del mismo perfil (el build ya está en la caché).
    for (const p of ctx.pages()) await p.close();
    const segunda = await abrir3d(await ctx.newPage());
    writeFileSync(
      join(RAIZ, "eval/results/unity_arranque.json"),
      `${JSON.stringify(
        {
          descripcion:
            "El arranque del 3D de Unity al abrirlo (clic en «3D» con AXA reconstruido), por etapas, en ms desde el clic: descarga del build (precarga), compilación del WebAssembly, arranque del motor (instancia), solver del caso, carga del caso y primer cuadro. Primera visita con un perfil nuevo; segunda, otra pestaña del mismo perfil (caché). Tareas largas del hilo principal (Long Tasks API). Chromium con ventana y GPU (ANGLE d3d11), 1440×900, en la laptop de René.",
          script: "apps/web/e2e/medir-unity-arranque.spec.ts",
          sitio: baseURL,
          fecha: new Date().toISOString(),
          primera_visita: primera,
          segunda_visita: segunda,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await ctx.close();
    rmSync(perfil, { recursive: true, force: true });
  }
});
