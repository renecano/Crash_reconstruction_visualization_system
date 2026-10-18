/**
 * Medición de fps del visor (E6 y comparaciones antes/después): una escena, un nivel y un
 * renderer en un contexto nuevo del navegador dado, con calentamiento, ventana de medición,
 * tareas largas del hilo principal y bytes de carga inicial.
 */

/** Opciones de Chromium para medir capacidad: GPU real y sin tope de vsync ni de fps. */
export const MEASURE_ARGS = [
  "--enable-unsafe-webgpu",
  "--ignore-gpu-blocklist",
  "--disable-gpu-vsync",
  "--disable-frame-rate-limit",
];

export function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
export const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

export async function measureViewer(
  browser,
  base,
  { scene, quality, renderer, diag = {}, warmupS = 2, seconds = 6 },
) {
  // `_serviceWorkers` va al contexto del navegador ("allow" o "block", ADR 0030); lo demás son
  // interruptores de diagnóstico del visor (`window.__croquisDiag`).
  const { _serviceWorkers: serviceWorkers = "allow", ...pageDiag } = diag;
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    serviceWorkers,
  });
  const page = await context.newPage();
  if (Object.keys(pageDiag).length > 0) {
    await page.addInitScript((d) => {
      window.__croquisDiag = d;
    }, pageDiag);
  }
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  let bytes = 0;
  let ready = false;
  cdp.on("Network.loadingFinished", (e) => {
    if (!ready) bytes += e.encodedDataLength;
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const params = new URLSearchParams({
    escena: scene,
    calidad: quality,
    camara: "cinematica",
    pantalla: "completa",
    auto: "1",
    bucle: "1",
  });
  params.set("renderer", renderer);
  await page.goto(`${base}/visor?${params.toString()}`);
  await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 120_000 });
  ready = true;
  const readyAt = await page.evaluate(() => window.__croquisReadyAt ?? null);
  await page.waitForTimeout(warmupS * 1000);
  await page.evaluate(() => {
    if (window.__croquisPerf) window.__croquisPerf.frameMs = [];
    window.__e6LongTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__e6LongTasks.push(e.duration);
    }).observe({ type: "longtask" });
  });
  await page.waitForTimeout(seconds * 1000);
  const sample = await page.evaluate(() => {
    const p = window.__croquisPerf;
    const mem = performance.memory;
    return {
      frameMs: p ? [...p.frameMs] : [],
      longTasks: [...(window.__e6LongTasks ?? [])],
      backend: p?.backend ?? null,
      drawCalls: p?.drawCalls ?? null,
      triangles: p?.triangles ?? null,
      jsHeapMB: mem ? mem.usedJSHeapSize / 1048576 : null,
    };
  });
  await context.close();
  const ms = sample.frameMs.filter((x) => x > 0).sort((a, b) => a - b);
  const mean = ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length);
  return {
    escena: scene,
    calidad: quality,
    renderer_pedido: renderer,
    backend: sample.backend,
    cuadros: ms.length,
    fps_promedio: round(1000 / mean, 1),
    fps_mediana: round(1000 / percentile(ms, 50), 1),
    fps_p1_bajo: round(1000 / percentile(ms, 99), 1),
    cuadro_p95_ms: round(percentile(ms, 95), 2),
    tareas_largas: sample.longTasks.length,
    tareas_largas_ms: round(
      sample.longTasks.reduce((a, b) => a + b, 0),
      0,
    ),
    llamadas_dibujo: sample.drawCalls,
    triangulos: sample.triangles,
    memoria_js_mb: round(sample.jsHeapMB, 1),
    carga_inicial_mb: round(bytes / 1048576, 2),
    tiempo_hasta_listo_ms: round(readyAt, 0),
    errores: errors,
  };
}
