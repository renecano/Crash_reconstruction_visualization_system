import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { expect, test } from "./base";
import { sinBlob } from "./sin-blob";
import { colocarTodo, irAPaso } from "./ayuda-recorrido";

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
  // La ventana al frente: Unity dibuja con requestAnimationFrame, que no corre en una ventana tapada.
  await page.bringToFront();
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

/** La huella SHA-256 del WebAssembly de Unity que sirve el sitio: descarta un build dañado. */
async function huellaWasm(pagina: import("@playwright/test").Page): Promise<string | null> {
  return pagina
    .evaluate(async () => {
      const m = (await (await fetch("/visor-unity/manifest.json")).json()) as {
        base: string;
        prefijo: string;
        code: string;
      };
      const r = await fetch(`${m.base}${m.prefijo}Build/${m.code}`);
      const h = await crypto.subtle.digest("SHA-256", await r.arrayBuffer());
      return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
    })
    .catch(() => null);
}

test("el arranque del 3D de Unity, por partes", async ({ baseURL }) => {
  test.setTimeout(1_800_000);
  const resultado: Record<string, unknown> = {};
  let equipo: unknown = null;
  // Cada caso con su perfil: la primera visita sin caché y la segunda con ella.
  for (const caso of ["axa", "nuevo"] as const) {
    const perfil = mkdtempSync(join(tmpdir(), "croquis-unity-arranque-"));
    // t4c (René, 2026-11-18): en la RTX el Chromium de Playwright no compiló el WebAssembly de
    // Unity («Compiling function #10005 failed»); su Chrome instalado sí (fps-web). Con
    // CROQUIS_CHROME (la ruta) o CROQUIS_CANAL («chrome», «msedge») se mide en ese navegador.
    const ctx = await chromium.launchPersistentContext(perfil, {
      ...(process.env.CROQUIS_CHROME
        ? { executablePath: process.env.CROQUIS_CHROME }
        : process.env.CROQUIS_CANAL
          ? { channel: process.env.CROQUIS_CANAL }
          : {}),
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
    // Lo que diga la página, para el registro si el 3D no arranca (t4b, René 2026-11-17).
    const avisos: string[] = [];
    const anotar = (x: string) => {
      if (avisos.length < 400)
        avisos.push(`${new Date().toISOString().slice(11, 19)} ${x.slice(0, 300)}`);
    };
    ctx.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning" || /unity|webgl|puente/i.test(m.text()))
        anotar(`[consola ${m.type()}] ${m.text()}`);
    });
    ctx.on("weberror", (e) => anotar(`[error de página] ${String(e.error())}`));
    ctx.on("requestfailed", (r) => anotar(`[falló] ${r.url()} ${r.failure()?.errorText ?? ""}`));
    await ctx.route("**/api/osm?**", (r) => r.fulfill({ json: { elements: [] } }));
    await ctx.route("**/api/lugar?**", (r) => r.fulfill({ json: { resultados: [] } }));
    await ctx.route("**/api/cesvi/escena", (r) =>
      r.fulfill({ json: { metodo: "claude", salida: ESCENA.salida } }),
    );
    try {
      const primera = await abrir3d(ctx.pages()[0] ?? (await ctx.newPage()), caso);
      equipo ??= {
        ...((await maquina(ctx.pages()[0]!)) as object),
        navegador: await ctx.pages()[0]!.evaluate(() => navigator.userAgent),
        wasm: await huellaWasm(ctx.pages()[0]!),
      };
      for (const p of ctx.pages()) await p.close();
      const segunda = await abrir3d(await ctx.newPage(), caso);
      resultado[caso] = { primera_visita: primera, segunda_visita: segunda };
    } catch (e) {
      // Al registro de la tanda: la tarjeta que usó WebGL, la fase del visor y lo que dijo la página.
      const pagina = ctx.pages()[0];
      const gpu = pagina ? await maquina(pagina).catch(() => null) : null;
      const fase = pagina
        ? await pagina
            .getByTestId("visor-unity")
            .getAttribute("data-fase", { timeout: 5_000 })
            .catch(() => null)
        : null;
      const lineas = [
        `[diagnóstico ${caso}] fase del visor: ${fase}; equipo: ${JSON.stringify(gpu)}`,
      ];
      for (const a of avisos) lineas.push(`  ${a}`);
      process.stdout.write(`\n${lineas.join("\n")}\n`);
      throw e;
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
          "El arranque del 3D de Unity al abrirlo (clic en «3D» con el caso reconstruido), por etapas, en ms desde el clic: descarga del build (precarga), compilación del WebAssembly, arranque del motor (instancia), solver del caso, carga del caso y primer cuadro. AXA y un caso nuevo (la narración de ejemplo grabada); primera visita con un perfil nuevo, segunda con otra pestaña del mismo perfil (caché). Tareas largas del hilo principal (Long Tasks API). Chromium con ventana y GPU (ANGLE d3d11), 1440×900.",
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
