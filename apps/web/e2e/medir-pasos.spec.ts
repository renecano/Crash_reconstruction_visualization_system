import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type CDPSession, type Page } from "@playwright/test";
import { expect, test } from "./base";
import { colocarTodo, sinRed } from "./ayuda-recorrido";

/**
 * Cuánto se queda sin responder la página al pasar de un paso a otro (René, 2026-11-16: «la página
 * nunca debe quedarse sin responder más de 100 ms»). Recorre AXA y un caso nuevo paso por paso con
 * clics reales y, en cada cambio, anota la tarea larga más larga del hilo principal (Long Tasks API)
 * y cuánto tardó en llegar el paso siguiente. Si un cambio pasa de 1 s, guarda las funciones que más
 * tiempo ocuparon (perfil de CPU). No gasta API: la lectura es la grabada. No corre en CI.
 *
 *   CROQUIS_URL=<sitio> CROQUIS_MEDICION=antes|despues \
 *     pnpm exec playwright test -c playwright.produccion.config.ts e2e/medir-pasos.spec.ts
 *     → eval/results/pasos_hilo_<antes|despues>.json
 */
const RAIZ = resolve(__dirname, "../../..");
const CUAL = process.env.CROQUIS_MEDICION ?? "antes";
const SALIDA = join(RAIZ, `eval/results/pasos_hilo_${CUAL}.json`);
const ESCENA = JSON.parse(
  readFileSync(join(RAIZ, "data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"), "utf8"),
) as { salida: unknown };

test.use({
  actionTimeout: 60_000,
  reducedMotion: "reduce",
  viewport: { width: 1440, height: 900 },
  colorScheme: process.env.CROQUIS_OSCURO ? "dark" : "light",
  // Como lo usa un perito: con ventana y con la GPU de la laptop (sin GPU, Unity dibuja por software).
  headless: false,
  launchOptions: { args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] },
});

interface Cambio {
  caso: string;
  de: number;
  a: number;
  ms_hasta_el_paso: number;
  tarea_mas_larga_ms: number;
  tareas_de_mas_de_100_ms: number;
  funciones?: string[];
}

async function perfil(cdp: CDPSession) {
  const { profile } = (await cdp.send("Profiler.stop")) as unknown as {
    profile: {
      nodes: {
        id: number;
        callFrame: { functionName: string; url: string; lineNumber: number };
        children?: number[];
      }[];
      samples: number[];
      timeDeltas: number[];
    };
  };
  const porId = new Map(profile.nodes.map((n) => [n.id, n]));
  const padre = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) padre.set(c, n.id);
  const total = new Map<string, number>();
  profile.samples.forEach((id, i) => {
    const vistos = new Set<string>();
    for (let x: number | undefined = id; x !== undefined; x = padre.get(x)) {
      const f = porId.get(x)!.callFrame;
      if (!f.url) continue;
      const k = `${f.functionName || "(anónima)"} ${f.url.split("/").slice(-1)[0]}:${f.lineNumber}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      total.set(k, (total.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
    }
  });
  return [...total]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([k, v]) => `${Math.round(v)} ms ${k}`);
}

test("cuánto se queda sin responder la página entre pasos", async ({ page, context }) => {
  test.setTimeout(1_200_000);
  const cambios: Cambio[] = [];
  await sinRed(page);
  await page.route("https://tiles.openfreemap.org/**", (r) =>
    r.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [{ id: "fondo", type: "background", paint: { "background-color": "#e9e9e6" } }],
      },
    }),
  );
  await page.route("**/api/cesvi/escena", (r) =>
    r.fulfill({ json: { metodo: "claude", salida: ESCENA.salida } }),
  );
  await page.addInitScript(() => {
    // El visor Unity, como en el navegador de un perito (un navegador automatizado usa el de respaldo).
    (window as unknown as Record<string, unknown>).__croquisVisorUnity = true;
    const w = window as unknown as { __largas: { t: number; d: number }[] };
    w.__largas = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        w.__largas.push({ t: Math.round(e.startTime), d: Math.round(e.duration) });
    }).observe({ type: "longtask", buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });

  const paso = async () => Number(await page.getByTestId("panel-paso").getAttribute("data-paso"));
  // Un cambio de paso con un clic real en «Siguiente»; se espera a que llegue y a que la página
  // quede quieta (3 s) para contar las tareas largas que siguen al cambio.
  const avanzar = async (caso: string) => {
    const de = await paso();
    const t0 = await page.evaluate(() => performance.now());
    await cdp.send("Profiler.start");
    const reloj = Date.now();
    await page.getByTestId("siguiente").click();
    await expect.poll(paso, { timeout: 120_000 }).toBeGreaterThan(de);
    const ms = Date.now() - reloj;
    // Como en la pasada: una captura de la pantalla poco después de llegar.
    if (process.env.CROQUIS_CAPTURAR) {
      await page.waitForTimeout(600);
      await page.screenshot({ type: "jpeg", quality: 60, timeout: 120_000 }).catch(() => undefined);
    }
    await page.waitForTimeout(3000);
    const funciones = await perfil(cdp);
    const largas = await page.evaluate(
      (a) =>
        (window as unknown as { __largas: { t: number; d: number }[] }).__largas.filter(
          (x) => x.t >= a - 20,
        ),
      t0,
    );
    const mas = Math.max(0, ...largas.map((x) => x.d));
    cambios.push({
      caso,
      de,
      a: await paso(),
      ms_hasta_el_paso: ms,
      tarea_mas_larga_ms: mas,
      tareas_de_mas_de_100_ms: largas.filter((x) => x.d > 100).length,
      ...(mas > Number(process.env.CROQUIS_UMBRAL_PERFIL ?? 1000) ? { funciones } : {}),
    });
    writeFileSync(SALIDA, `${JSON.stringify({ cambios }, null, 2)}\n`);
  };

  // 1. AXA, del caso al dictamen.
  await page.goto("/cesvi");
  await page.getByTestId("ir-axa").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible();
  while ((await paso()) < 8) {
    if ((await paso()) === 3 && (await page.getByTestId("escena-facil").isVisible())) {
      await page.getByTestId("avance-ver-reconstruccion").click();
      await expect.poll(paso).toBe(4);
    }
    if ((await paso()) === 4 && (await page.getByTestId("reconstruir").isVisible())) {
      await page.getByTestId("reconstruir").click();
      await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 180_000 });
      await page.waitForTimeout(3000);
    }
    await avanzar("axa");
  }

  // 2. Un caso nuevo con la narración de ejemplo, del hecho al dictamen.
  await page.goto("/cesvi");
  await page.getByTestId("ir-caso-nuevo").click();
  await expect(page.getByTestId("recorrido-caso")).toBeVisible();
  await avanzar("nuevo");
  await page.getByTestId("ejemplo-narracion").click();
  await page.getByTestId("leer-narracion").click();
  await expect(page.getByTestId("escena")).toContainText("vehículos", { timeout: 60_000 });
  await avanzar("nuevo");
  await colocarTodo(page);
  await page.getByTestId("avance-ver-reconstruccion").click();
  await expect.poll(paso).toBe(4);
  await page.getByTestId("reconstruir").click();
  await expect(page.getByTestId("cifra-reconstruccion")).toBeVisible({ timeout: 180_000 });
  await page.waitForTimeout(3000);
  while ((await paso()) < 7) await avanzar("nuevo");

  const todas = await page.evaluate(
    () => (window as unknown as { __largas: { t: number; d: number }[] }).__largas,
  );
  mkdirSync(join(RAIZ, "eval/results"), { recursive: true });
  writeFileSync(
    SALIDA,
    `${JSON.stringify(
      {
        descripcion:
          "Cuánto se queda sin responder la página al pasar de un paso a otro: la tarea larga más larga del hilo principal (Long Tasks API) en los 3 s que siguen a cada clic en «Siguiente», y cuánto tardó en llegar el paso. AXA y un caso nuevo (narración de ejemplo grabada), con el visor Unity, en Chromium con ventana y GPU (ANGLE d3d11) a 1440×900 en la laptop de René. Meta: ninguna tarea de más de 100 ms.",
        script: "apps/web/e2e/medir-pasos.spec.ts",
        sitio: page.url().split("/cesvi")[0],
        fecha: new Date().toISOString(),
        cambios,
        tarea_mas_larga_de_los_cambios_ms: Math.max(...cambios.map((c) => c.tarea_mas_larga_ms)),
        tarea_mas_larga_de_la_visita_ms: Math.max(0, ...todas.map((x) => x.d)),
      },
      null,
      2,
    )}\n`,
  );
});

export type { Page };
