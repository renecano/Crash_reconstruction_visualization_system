import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { expect, test } from "./base";
import { sinBlob } from "./sin-blob";
import { colocarTodo, irAPaso } from "./ayuda-recorrido";

/**
 * El arranque del 3D de Unity al abrirlo, por partes (René, 2026-11-16): descarga, compilación del
 * WebAssembly, arranque del motor, carga del caso (hasta que se ve), primer cuadro y caso completo, en la primera visita (perfil
 * nuevo) y en la segunda (mismo perfil, con caché), con la tarea larga más larga del hilo principal
 * de cada una. Chromium con ventana y la GPU de la laptop, con el visor Unity, como un perito. No
 * corre en CI.
 *
 *   CROQUIS_URL=https://croquis-sage.vercel.app pnpm exec playwright test \
 *     -c playwright.produccion.config.ts e2e/medir-unity-arranque.spec.ts
 *     → eval/results/unity_arranque.json
 */
const RAIZ = resolve(__dirname, "../../..");
/** Dónde escribe (la tanda de la RTX lo manda a eval/results/rtx-t4). */
const SALIDA = resolve(
  RAIZ,
  process.env.CROQUIS_ARRANQUE_SALIDA ?? "eval/results/unity_arranque.json",
);
/** La lectura grabada de la narración de ejemplo: el caso nuevo no gasta API. */
const ESCENA = JSON.parse(
  readFileSync(join(RAIZ, "data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"), "utf8"),
) as { salida: unknown };

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

async function abrir3d(page: Page, caso: "axa" | "nuevo") {
  // El desglose que escribe Unity al terminar de armar («[carga] paso ms, …», acumulado).
  const consola: string[] = [];
  page.on("console", (m) => {
    if (m.text().includes("[carga]")) consola.push(m.text());
  });
  await page.goto("/cesvi");
  if (caso === "axa") {
    await page.getByTestId("ir-axa").click();
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    await irAPaso(page, 4);
  } else {
    // Un caso nuevo con la narración de ejemplo (leída de la grabación), colocado en el mapa.
    await page.getByTestId("ir-caso-nuevo").click();
    await expect(page.getByTestId("recorrido-caso")).toBeVisible();
    await irAPaso(page, 2);
    await page.getByTestId("ejemplo-narracion").click();
    await page.getByTestId("leer-narracion").click();
    await expect(page.getByTestId("escena")).toContainText("vehículos", { timeout: 60_000 });
    await irAPaso(page, 3);
    await colocarTodo(page);
    await page.getByTestId("avance-ver-reconstruccion").click();
    await expect(page.getByTestId("panel-paso")).toHaveAttribute("data-paso", "4");
  }
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
  // Desde el puente 1.3.0 el entorno se sigue armando después de que el caso se ve: las tareas largas
  // se cuentan hasta que queda completo («caso_completo»), y 2 s más.
  await page
    .waitForFunction(() => performance.getEntriesByName("unity:caso_completo").length > 0, null, {
      timeout: 120_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(2000);
  const datos = await page.evaluate(
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
          // El caso ya se ve (antes del puente 1.3.0, también completo).
          paquete_armado: rel(marca("cargar_caso")),
          caso_serializado: rel(marca("caso_serializado")),
          caso_enviado: rel(marca("caso_enviado")),
          caso_cargado: rel(marca("caso_cargado")),
          primer_cuadro: rel(primerCuadro),
          // El entorno terminado (puente 1.3.0); con un build anterior, null.
          caso_completo: rel(marca("caso_completo")),
        },
        recursos,
        // Los shaders adelantados (ADR 0119): cuántos se compilaron de antemano y cuántos usó Unity.
        programas:
          (window as unknown as { croquisProgramas?: { estado: unknown } | null }).croquisProgramas
            ?.estado ?? null,
        tarea_mas_larga_ms: Math.max(0, ...largas.map((x) => x.d)),
        tareas_de_mas_de_200_ms: largas.filter((x) => x.d > 200).length,
        tareas_largas: largas
          .filter((x) => x.d > 100)
          .map((x) => ({ desde_el_clic_ms: Math.round(x.t - t0), ms: x.d })),
        tareas_de_mas_de_100_ms: largas.filter((x) => x.d > 100).length,
        tiempo_bloqueado_ms: largas.reduce((a, x) => a + Math.max(0, x.d - 50), 0),
      };
    },
    { t0, primerCuadro, ms },
  );
  return { ...datos, unity_carga: consola.at(-1)?.replace(/^.*\[carga\]\s*/, "") ?? null };
}

/** La máquina en que se mide: núcleos, memoria y la tarjeta que usa WebGL. */
async function maquina(page: Page) {
  return page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      nucleos: navigator.hardwareConcurrency,
      memoria_gb: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
      gpu: ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null,
    };
  });
}

test("el arranque del 3D de Unity, por partes", async ({ baseURL }) => {
  test.setTimeout(1_800_000);
  const resultado: Record<string, unknown> = {};
  let equipo: unknown = null;
  // Cada caso con su perfil: la primera visita sin caché y la segunda con ella.
  // CROQUIS_ARRANQUE_CASOS=axa mide solo uno (para iterar); la tabla completa lleva los dos.
  const casos = (process.env.CROQUIS_ARRANQUE_CASOS?.split(",") ?? ["axa", "nuevo"]) as (
    "axa" | "nuevo"
  )[];
  for (const caso of casos) {
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
    await sinBlob(ctx);
    await ctx.addInitScript(instrumentar);
    await ctx.route("**/api/osm?**", (r) => r.fulfill({ json: { elements: [] } }));
    await ctx.route("**/api/lugar?**", (r) => r.fulfill({ json: { resultados: [] } }));
    await ctx.route("**/api/cesvi/escena", (r) =>
      r.fulfill({ json: { metodo: "claude", salida: ESCENA.salida } }),
    );
    try {
      const primera = await abrir3d(ctx.pages()[0] ?? (await ctx.newPage()), caso);
      equipo ??= await maquina(ctx.pages()[0]!);
      for (const p of ctx.pages()) await p.close();
      const segunda = await abrir3d(await ctx.newPage(), caso);
      resultado[caso] = { primera_visita: primera, segunda_visita: segunda };
    } finally {
      await ctx.close();
      rmSync(perfil, { recursive: true, force: true });
    }
  }
  writeFileSync(
    SALIDA,
    `${JSON.stringify(
      {
        descripcion:
          "El arranque del 3D de Unity al abrirlo (clic en «3D» con el caso reconstruido), por etapas, en ms desde el clic: descarga del build (precarga), compilación del WebAssembly, arranque del motor (instancia), solver del caso, carga del caso hasta que se ve, primer cuadro y caso completo (desde el puente 1.3.0 el entorno se arma después de que el caso se ve; con un build anterior, `caso_completo` es null y «cargado» ya es la escena completa). AXA y un caso nuevo (la narración de ejemplo grabada); primera visita con un perfil nuevo, segunda con otra pestaña del mismo perfil (caché). Tareas largas del hilo principal (Long Tasks API). Chromium con ventana y GPU (ANGLE d3d11), 1440×900.",
        script: "apps/web/e2e/medir-unity-arranque.spec.ts",
        sitio: baseURL,
        fecha: new Date().toISOString(),
        maquina: equipo,
        ...resultado,
      },
      null,
      2,
    )}
`,
  );
});
