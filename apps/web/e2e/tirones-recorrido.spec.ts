/**
 * Tirones del recorrido del caso de AXA (René, 2026-11-04: en una MacBook Pro con Chrome el 3D de
 * `/cesvi/casos/a2010930` se congelaba). No bloquea el merge (no es `@flujo`): es una medición que
 * escribe `eval/results/t1_tirones.json` con la etiqueta `ETIQUETA` (antes/después).
 *
 * Llega al 3D como el flujo (`cesvi.spec.ts`), deja correr la reproducción y pulsa cada cámara,
 * midiendo las tareas largas del hilo principal (`PerformanceObserver` longtask; meta: ninguna de
 * más de 100 ms durante la reproducción) y del clic de cada cámara al siguiente cuadro (meta:
 * ≤ 100 ms), con la CPU normal y limitada ×4 (CDP, como DevTools). GPU real: `headless: false`.
 *
 *   ETIQUETA=antes pnpm --filter @croquis/web exec playwright test e2e/tirones-recorrido.spec.ts --project=chromium
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { colocarTodo, irAPaso } from "./ayuda-recorrido";

const ROOT = resolve(__dirname, "../../..");
const SALIDA = resolve(ROOT, "eval/results/t1_tirones.json");
const ETIQUETA = process.env.ETIQUETA ?? "despues";
const SEGUNDOS = Number(process.env.SEGUNDOS ?? "15");
const CPUS = (process.env.CPU ?? "1,4").split(",").map(Number);
/** «caso» (el recorrido de AXA) o «visor» (`/visor?escena=…&diag=1`, como René en la M1). */
const ESCENARIO = process.env.ESCENARIO ?? "caso";
const ESCENA = process.env.ESCENA ?? "lateral_interseccion";
/** `deviceScaleFactor` del navegador (la M1 de René: 2; con el factor 1.5 de alta salía 3). */
const DPR = Number(process.env.DPR ?? "1");
const CALIDAD = process.env.CALIDAD ?? "auto";
const BACKEND = process.env.BACKEND ?? "auto";
const UMBRAL_MS = 100;
/** Meta del primer cuadro con la escena a la vista desde el clic, con la CPU normal. */
const PRIMER_CUADRO_MS = 5000;

declare global {
  interface Window {
    __largas?: {
      en_ms: number;
      duracion_ms: number;
      inicio_abs?: number;
      t_escena?: number | null;
    }[];
    __largasT0?: number;
    __clicT?: number;
    __clicCuadroPrevio?: number;
  }
}

test.use({
  headless: false,
  launchOptions: {
    args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"],
  },
  viewport: { width: 1920, height: 1080 },
});
test.describe.configure({ timeout: 900_000 });

async function observar(page: Page) {
  await page.evaluate(() => {
    window.__largas = [];
    window.__largasT0 = performance.now();
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.__largas!.push({
          en_ms: Math.round(e.startTime - (window.__largasT0 ?? 0)),
          duracion_ms: Math.round(e.duration),
          inicio_abs: e.startTime,
          t_escena: window.__croquisT ?? null,
        });
    }).observe({ type: "longtask" });
  });
}

const leer = (page: Page) =>
  page.evaluate(() => {
    const out = window.__largas ?? [];
    window.__largas = [];
    window.__largasT0 = performance.now();
    const causas = (window.__croquisDiagnostico?.tareasLargas ?? []).map((t) => ({
      duracion_ms: Math.round(t.duracion),
      causa: t.causa,
    }));
    return { largas: out, causas };
  });

interface Larga {
  en_ms: number;
  duracion_ms: number;
  inicio_abs?: number;
  t_escena?: number | null;
  funciones?: { funcion: string; archivo: string; ms: number }[];
  eventos?: { evento: string; ms: number }[];
  fase?: string | null;
}

type EventoTraza = {
  name: string;
  cat: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  id?: string;
  args?: {
    data?: {
      startTime?: number;
      cpuProfile?: {
        nodes?: {
          id: number;
          callFrame: { functionName: string; url: string; lineNumber: number };
        }[];
        samples?: number[];
      };
      timeDeltas?: number[];
      functionName?: string;
      url?: string;
      type?: string;
    };
  };
};

/**
 * Traza de Chrome (CDP `Tracing`) con el perfil de CPU: las tareas del hilo principal
 * (`RunTask`) de más de `UMBRAL_MS` con sus funciones y eventos (GC, temporizadores, disposición)
 * en el mismo reloj, sin desfases. `t_escena` se toma de la tarea larga del observador más
 * cercana en duración, en orden.
 */
/** Las funciones con más tiempo propio del hilo principal entre dos instantes de la traza. */
function funcionesEntre(
  eventos: EventoTraza[],
  desde: number,
  hasta: number,
): { funcion: string; archivo: string; ms: number }[] {
  const marcaPrincipal = eventos.find((e) => e.name.startsWith("fase:"));
  const perfil = eventos.find(
    (e) =>
      e.name === "Profile" &&
      e.args?.data?.startTime &&
      (!marcaPrincipal || (e.pid === marcaPrincipal.pid && e.tid === marcaPrincipal.tid)),
  );
  if (!perfil) return [];
  const nodos = new Map<
    number,
    { id: number; callFrame: { functionName: string; url: string; lineNumber: number } }
  >();
  const porFuncion = new Map<string, number>();
  let t = perfil.args!.data!.startTime!;
  const trozos = eventos
    .filter((e) => e.name === "ProfileChunk" && e.pid === perfil.pid && e.id === perfil.id)
    .sort((a, b) => a.ts - b.ts);
  for (const e of trozos) {
    const d = e.args?.data;
    for (const n of d?.cpuProfile?.nodes ?? []) nodos.set(n.id, n);
    const ids = d?.cpuProfile?.samples ?? [];
    const dts = d?.timeDeltas ?? [];
    ids.forEach((id, i) => {
      const dt = dts[i] ?? 0;
      t += dt;
      if (t < desde || t > hasta) return;
      const f = nodos.get(id)?.callFrame;
      const archivo = (f?.url ?? "").split("/").slice(-1)[0];
      const clave = `${f?.functionName || "(anónima)"}\t${archivo}:${(f?.lineNumber ?? -1) + 1}`;
      porFuncion.set(clave, (porFuncion.get(clave) ?? 0) + dt / 1000);
    });
  }
  return [...porFuncion.entries()]
    .map(([k, ms]) => {
      const [funcion, archivo] = k.split("\t");
      return { funcion: funcion ?? "", archivo: archivo ?? "", ms: Math.round(ms) };
    })
    .filter((x) => x.ms >= 3 && x.funcion !== "(idle)")
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 10);
}

function analizarTraza(eventos: EventoTraza[], largas: Larga[]): Larga[] {
  // Hay un perfil por hilo (workers incluidos): el del hilo principal es el de las marcas.
  const marcaPrincipal = eventos.find((e) => e.name.startsWith("fase:"));
  const perfil = eventos.find(
    (e) =>
      e.name === "Profile" &&
      e.args?.data?.startTime &&
      (!marcaPrincipal || (e.pid === marcaPrincipal.pid && e.tid === marcaPrincipal.tid)),
  );
  if (!perfil) return [];
  const { pid, tid } = perfil;
  const nodos = new Map<
    number,
    { id: number; callFrame: { functionName: string; url: string; lineNumber: number } }
  >();
  const muestras: { t: number; dt: number; id: number }[] = [];
  let t = perfil.args!.data!.startTime!;
  // Los trozos vienen del hilo del muestreador (otro `tid`) y por lotes, no en orden: se toman
  // por el `id` del perfil y se acumulan los deltas en orden de tiempo.
  const trozos = eventos
    .filter((e) => e.name === "ProfileChunk" && e.pid === pid && e.id === perfil.id)
    .sort((a, b) => a.ts - b.ts);
  for (const e of trozos) {
    const d = e.args?.data;
    for (const n of d?.cpuProfile?.nodes ?? []) nodos.set(n.id, n);
    const ids = d?.cpuProfile?.samples ?? [];
    const dts = d?.timeDeltas ?? [];
    ids.forEach((id, i) => {
      const dt = dts[i] ?? 0;
      t += dt;
      muestras.push({ t, dt, id });
    });
  }
  const tareas = eventos.filter(
    (e) =>
      e.name === "RunTask" && e.pid === pid && e.tid === tid && (e.dur ?? 0) / 1000 > UMBRAL_MS,
  );
  const hijos = eventos.filter(
    (e) => e.pid === pid && e.tid === tid && e.ph === "X" && e.name !== "RunTask",
  );
  const inicioTraza = Math.min(...hijos.map((x) => x.ts), ...tareas.map((x) => x.ts));
  // Marcas de usuario (`performance.mark`): la fase o el clic de cámara en que cae cada tarea.
  const marcas = eventos
    .filter(
      (e) => e.cat.includes("blink.user_timing") && (e.ph === "I" || e.ph === "R") && e.pid === pid,
    )
    .sort((a, b) => a.ts - b.ts);
  const resultado: Larga[] = [];
  for (const tarea of tareas) {
    const marca = marcas.filter((m) => m.ts <= tarea.ts).slice(-1)[0]?.name ?? null;
    const desde = tarea.ts;
    const hasta = tarea.ts + (tarea.dur ?? 0);
    const porFuncion = new Map<string, number>();
    for (const m of muestras) {
      if (m.t < desde || m.t > hasta) continue;
      const f = nodos.get(m.id)?.callFrame;
      const archivo = (f?.url ?? "").split("/").slice(-1)[0];
      const clave = `${f?.functionName || "(anónima)"}\t${archivo}:${(f?.lineNumber ?? -1) + 1}`;
      porFuncion.set(clave, (porFuncion.get(clave) ?? 0) + m.dt / 1000);
    }
    const porEvento = new Map<string, number>();
    for (const h of hijos) {
      if (h.ts < desde || h.ts > hasta) continue;
      const nombre =
        h.name === "FunctionCall" && h.args?.data?.functionName
          ? `FunctionCall ${h.args.data.functionName}`
          : h.name === "EventDispatch" && h.args?.data?.type
            ? `EventDispatch ${h.args.data.type}`
            : h.name;
      porEvento.set(nombre, (porEvento.get(nombre) ?? 0) + (h.dur ?? 0) / 1000);
    }
    const duracion = Math.round((tarea.dur ?? 0) / 1000);
    const cercana =
      largas
        .filter((l) => Math.abs(l.duracion_ms - duracion) <= 5)
        .sort((a, b) => a.en_ms - b.en_ms)[0] ?? null;
    resultado.push({
      en_ms: Math.round((tarea.ts - inicioTraza) / 1000),
      duracion_ms: duracion,
      fase: marca,
      t_escena: marca === "fase:reproduccion" ? (cercana?.t_escena ?? null) : null,
      funciones: [...porFuncion.entries()]
        .map(([k, ms]) => {
          const [funcion, archivo] = k.split("\t");
          return { funcion: funcion ?? "", archivo: archivo ?? "", ms: Math.round(ms) };
        })
        .filter((x) => x.ms >= 3 && x.funcion !== "(idle)")
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 8),
      eventos: [...porEvento.entries()]
        .map(([evento, ms]) => ({ evento, ms: Math.round(ms) }))
        .filter((x) => x.ms >= 3)
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 8),
    });
  }
  return resultado;
}

const peor = (xs: Larga[]) => Math.max(0, ...xs.map((l) => l.duracion_ms));

async function medir(page: Page, cpu: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  const t0 = Date.now();
  if (ESCENARIO === "caso") {
    await page.goto("/cesvi");
    await page.getByTestId("ir-axa").click();
    await expect(page).toHaveURL(/\/cesvi\/casos\/a2010930$/);
    await irAPaso(page, 3);
    await colocarTodo(page);
    await irAPaso(page, 4);
    await page.getByTestId("reconstruir").click();
    await expect(page.getByTestId("velocidades")).toBeVisible({ timeout: 120_000 });
  } else {
    const q = new URLSearchParams({ escena: ESCENA, diag: "1", auto: "1", camara: "cinematica" });
    if (CALIDAD !== "auto") q.set("calidad", CALIDAD);
    if (BACKEND !== "auto") q.set("renderer", BACKEND);
    await page.goto(`/visor?${q.toString()}`);
  }
  // Carga del 3D desde el clic en «Ver la reconstrucción en 3D»: cuándo llega cada cosa, el primer
  // cuadro con la escena a la vista (meta ≤ 5 s con la CPU normal; René, 2026-11-04) y listo.
  await page.evaluate(() => {
    const w = window as unknown as { __cargaT0?: number; __carga?: Record<string, number> };
    w.__cargaT0 = performance.now();
    w.__carga = {};
    const banderas = [
      "__croquisReady",
      "__croquisVehicleModelsReady",
      "__croquisTexturesReady",
      "__croquisSkyReady",
      "__croquisTreesReady",
      "__croquisDebrisReady",
      "__croquisPeopleReady",
      "__croquisGraphReady",
    ];
    const sondeo = () => {
      const ahora = Math.round(performance.now() - (w.__cargaT0 ?? 0));
      const ww = window as unknown as Record<string, unknown>;
      for (const b of banderas)
        if (ww[b] === true && w.__carga![b] === undefined) w.__carga![b] = ahora;
      if (window.__croquisPrimerCuadro !== undefined && w.__carga!.primer_cuadro === undefined)
        w.__carga!.primer_cuadro = Math.round(window.__croquisPrimerCuadro - (w.__cargaT0 ?? 0));
      if (window.__croquisRendererListo !== undefined && w.__carga!.renderer === undefined)
        w.__carga!.renderer = Math.round(window.__croquisRendererListo - (w.__cargaT0 ?? 0));
      if (
        window.__croquisVehiculosEnPantalla !== undefined &&
        w.__carga!.vehiculos_en_pantalla === undefined
      )
        w.__carga!.vehiculos_en_pantalla = Math.round(
          window.__croquisVehiculosEnPantalla - (w.__cargaT0 ?? 0),
        );
      if (w.__carga!.__croquisGraphReady === undefined || w.__carga!.primer_cuadro === undefined)
        setTimeout(sondeo, 100);
    };
    sondeo();
  });
  // Traza de Chrome (como la pestaña Performance de DevTools) con el perfil de CPU desde el clic
  // en «ver 3D»: cubre la carga, el precompilado, el arranque de la reproducción y los clics de cámara. A cada
  // tarea larga se le atribuyen sus funciones y eventos en el mismo reloj.
  const trazaEventos: EventoTraza[] = [];
  cdp.on("Tracing.dataCollected", (d) => {
    trazaEventos.push(...(d.value as unknown as EventoTraza[]));
  });
  const trazaCompleta = new Promise<void>((done) =>
    cdp.once("Tracing.tracingComplete", () => done()),
  );
  await cdp.send("Tracing.start", {
    categories: [
      "devtools.timeline",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-v8.cpu_profiler",
      "v8.execute",
      "blink.user_timing",
    ].join(","),
    transferMode: "ReportEvents",
    options: "sampling-frequency=2000",
  });
  await page.evaluate(() => performance.mark("fase:carga"));
  if (ESCENARIO === "caso") await page.getByTestId("ver-3d").click();
  // Si el 3D no llega a dibujar en 5 min (la M1 de René en alta con dpr 3), se registra el fallo
  // con el diagnóstico que haya, en vez de perder la corrida.
  let fallo: string | null = null;
  try {
    await page.waitForFunction(() => window.__croquisGl !== undefined, null, { timeout: 300_000 });
    // Qué pipelines (programas) crea el renderer desde que existe (carga, reproducción, cámaras), con el instante de la
    // escena y el material: lo que se compila al vuelo es lo que debió precompilarse.
    await page.evaluate(() => {
      const w = window as unknown as {
        __croquisGl?: { backend?: Record<string, unknown> };
        __pipelinesRT?: {
          t: number | null;
          material: string;
          objeto: string;
          ms: number;
          sombra: boolean;
          precompilado: string | null;
          capa: number;
          uuid: string;
          mat: string;
          geo: number;
          clave: string;
          detalle: string;
        }[];
      };
      w.__pipelinesRT = [];
      const backend = w.__croquisGl?.backend;
      type RO = {
        material?: { name?: string; type?: string; isShadowPassMaterial?: boolean; uuid?: string };
        object?: {
          name?: string;
          uuid?: string;
          userData?: { precompilado?: string };
          layers?: { mask: number };
        };
        geometry?: { id?: number };
        getCacheKey?: () => string | number;
        getMaterialCacheKey?: () => string | number;
        getDynamicCacheKey?: () => string | number;
        lightsNode?: { getCacheKey?: () => string | number; getLights?: () => { id: number }[] };
        context?: { id?: number };
        scene?: { environment?: { uuid?: string } | null; fog?: unknown };
      };
      const original = backend?.createRenderPipeline as
        ((ro: RO, p: unknown) => unknown) | undefined;
      if (backend && original) {
        backend.createRenderPipeline = function (this: unknown, ro: RO, promises: unknown) {
          const t0 = performance.now();
          const r = original.call(this, ro, promises);
          w.__pipelinesRT!.push({
            t: window.__croquisT ?? null,
            material: `${ro.material?.name || ""}/${ro.material?.type || ""}`,
            objeto: ro.object?.name || "",
            ms: Math.round(performance.now() - t0),
            sombra: ro.material?.isShadowPassMaterial === true,
            precompilado: ro.object?.userData?.precompilado ?? null,
            capa: ro.object?.layers?.mask ?? -1,
            uuid: ro.object?.uuid ?? "",
            mat: ro.material?.uuid ?? "",
            geo: ro.geometry?.id ?? -1,
            clave: String(ro.getCacheKey?.() ?? ""),
            detalle: [
              `mat=${String(ro.getMaterialCacheKey?.() ?? "")}`,
              `din=${String(ro.getDynamicCacheKey?.() ?? "")}`,
              `luces=${String(ro.lightsNode?.getCacheKey?.() ?? "")}:${(ro.lightsNode?.getLights?.() ?? []).map((l) => l.id).join("+")}`,
              `ctx=${String(ro.context?.id ?? "")}`,
              `env=${ro.scene?.environment?.uuid?.slice(0, 6) ?? "-"}`,
              `rs=${String((ro.object as { receiveShadow?: boolean } | undefined)?.receiveShadow)}`,
            ].join(" "),
          });
          return r;
        };
      }
    });
    await page.waitForFunction(() => window.__croquisReady === true, null, { timeout: 300_000 });
  } catch {
    fallo = "el 3D no dibujó su primer cuadro en 300 s";
  }
  if (fallo) {
    const diagFallo = await page.evaluate(() => window.__croquisDiagnostico ?? null);
    const carga = await page.evaluate(
      () => (window as unknown as { __carga?: Record<string, number> }).__carga ?? {},
    );
    await cdp.send("Tracing.end");
    await trazaCompleta;
    return {
      escenario: ESCENARIO,
      escena: ESCENARIO === "caso" ? "a2010930" : ESCENA,
      dpr_navegador: DPR,
      calidad_pedida: CALIDAD,
      backend_pedido: BACKEND,
      cpu,
      fallo,
      listo_ms: null,
      carga_desde_clic_ms: { primer_cuadro: null, listo: null, banderas: carga },
      diag: diagFallo,
      errores_pagina: errores.slice(0, 10),
      tareas_largas_traza: analizarTraza(trazaEventos, []),
      cumple: false,
    };
  }
  await page.waitForFunction(() => window.__croquisGraphReady === true, null, {
    timeout: 300_000,
  });
  await page.evaluate(() => performance.mark("fase:grafo listo"));
  const pipelinesCarga = await page.evaluate(() => {
    const w = window as unknown as {
      __pipelinesRT?: { t: number | null; material: string; objeto: string; ms: number }[];
    };
    const out = w.__pipelinesRT ?? [];
    w.__pipelinesRT = [];
    return out;
  });
  const todosLosPipelines: { fase: string; lista: unknown[] }[] = [
    { fase: "carga", lista: pipelinesCarga },
  ];
  const listoMs = Date.now() - t0;
  await page.waitForFunction(
    () =>
      (window as unknown as { __carga?: Record<string, number> }).__carga?.primer_cuadro !==
      undefined,
    null,
    { timeout: 60_000 },
  );
  const carga = await page.evaluate(
    () => (window as unknown as { __carga?: Record<string, number> }).__carga ?? {},
  );
  await page.waitForTimeout(1000);
  await observar(page);
  await page.evaluate(() => performance.mark("fase:reproduccion"));
  await page.waitForTimeout(SEGUNDOS * 1000);
  const reproduccion = (await leer(page)) as {
    largas: Larga[];
    causas: { duracion_ms: number; causa: string }[];
  };
  const pipelinesRT = await page.evaluate(() => {
    const w = window as unknown as { __pipelinesRT?: unknown[] };
    const out = w.__pipelinesRT ?? [];
    w.__pipelinesRT = [];
    return out;
  });
  todosLosPipelines.push({ fase: "reproduccion", lista: pipelinesRT });
  const botones = page.getByTestId("camaras").getByRole("radio");
  const n = await botones.count();
  const camaras: {
    camara: string;
    respuesta_ms: number;
    largas: Larga[];
    causas: { duracion_ms: number; causa: string }[];
    pipelines_creados: unknown[];
    funciones?: { funcion: string; archivo: string; ms: number }[];
    eventos?: { evento: string; ms: number }[];
    cuadros_ms?: number[];
    react_ms?: number | null;
    cuadro_ms?: number | null;
  }[] = [];
  for (let i = 0; i < n; i++) {
    const b = botones.nth(i);
    const nombre = (await b.textContent())?.trim() ?? `botón ${i}`;
    // El cronómetro vive en la página: arranca en el evento del DOM (Playwright tarda en mover
    // el ratón antes de hacer clic) y para en el primer cuadro dibujado con la cámara nueva (o,
    // si es la misma cámara, en el cuadro siguiente). Medirlo desde fuera sumaba el viaje de ida
    // y vuelta de Playwright (4–6 cuadros).
    await page.evaluate((nombre) => {
      const w = window as unknown as { __respuesta?: number; __clicCamaraPrevia?: string };
      w.__respuesta = undefined;
      window.__clicT = undefined;
      window.__clicCuadroPrevio = window.__croquisPerf?.frameMs.length ?? 0;
      w.__clicCamaraPrevia = window.__croquisCamaraDibujada;
      document.addEventListener(
        "click",
        () => {
          performance.mark(`clic:${nombre}`);
          window.__clicT = performance.now();
          window.__clicCuadroPrevio = window.__croquisPerf?.frameMs.length ?? 0;
        },
        { once: true, capture: true },
      );
      const espera = () => {
        const inicio = window.__clicT;
        if (inicio !== undefined) {
          const ahora = performance.now();
          const cuadros = window.__croquisPerf?.frameMs.length ?? 0;
          const cambio = window.__croquisCamaraDibujada !== w.__clicCamaraPrevia;
          if (cambio || cuadros > (window.__clicCuadroPrevio ?? 0) + 1 || ahora - inicio > 5000) {
            w.__respuesta = Math.round(ahora - inicio);
            return;
          }
        }
        requestAnimationFrame(espera);
      };
      requestAnimationFrame(espera);
    }, nombre);
    await b.click();
    await page.waitForFunction(
      () => (window as unknown as { __respuesta?: number }).__respuesta !== undefined,
      null,
      { timeout: 10_000 },
    );
    const respuesta = await page.evaluate(
      () => (window as unknown as { __respuesta?: number }).__respuesta ?? -1,
    );
    await page.waitForTimeout(1200);
    const { largas, causas } = await leer(page);
    const pipelines = await page.evaluate(() => {
      const w = window as unknown as { __pipelinesRT?: unknown[] };
      const out = w.__pipelinesRT ?? [];
      w.__pipelinesRT = [];
      return out;
    });
    camaras.push({
      camara: nombre,
      respuesta_ms: respuesta,
      largas,
      causas: causas.slice(-3),
      pipelines_creados: pipelines,
    });
    todosLosPipelines.push({ fase: `clic:${nombre}`, lista: pipelines });
  }
  await cdp.send("Tracing.end");
  await trazaCompleta;
  try {
    writeFileSync(
      resolve(__dirname, `../test-results/t1_tirones_pipelines_cpu${cpu}.json`),
      JSON.stringify(todosLosPipelines, null, 1),
    );
  } catch {
    /* sin espacio */
  }
  const tareasTraza = analizarTraza(trazaEventos, reproduccion.largas);
  // Qué llena la respuesta de cada cámara: funciones entre la marca del clic y la respuesta.
  const marcasClic = trazaEventos.filter((e) => e.name.startsWith("clic:"));
  for (const c of camaras) {
    const m = marcasClic.find((e) => e.name === `clic:${c.camara}`);
    if (!m) continue;
    const hasta = m.ts + c.respuesta_ms * 1000;
    c.funciones = funcionesEntre(trazaEventos, m.ts, hasta);
    // Del clic al efecto de React que aplica la cámara (marca «croquis: cambio de cámara → …»)
    // y de ahí al primer cuadro con la cámara nueva.
    const efecto = trazaEventos.find(
      (e) => e.name.startsWith("croquis: cambio de cámara") && e.ts >= m.ts && e.ts <= hasta,
    );
    c.react_ms = efecto ? Math.round((efecto.ts - m.ts) / 1000) : null;
    c.cuadro_ms = efecto ? Math.round((hasta - efecto.ts) / 1000) : null;
    const porEvento = new Map<string, number>();
    for (const h of trazaEventos) {
      if (h.pid !== m.pid || h.tid !== m.tid || h.ph !== "X" || h.ts < m.ts || h.ts > hasta)
        continue;
      const nombre =
        h.name === "EventDispatch" && h.args?.data?.type
          ? `EventDispatch ${h.args.data.type}`
          : h.name;
      if (nombre === "RunTask") continue;
      porEvento.set(nombre, (porEvento.get(nombre) ?? 0) + (h.dur ?? 0) / 1000);
    }
    c.eventos = [...porEvento.entries()]
      .map(([evento, ms]) => ({ evento, ms: Math.round(ms) }))
      .filter((x) => x.ms >= 2)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 8);
    // Cada cuadro (rAF) de la ventana, en orden, con su duración: ¿uno largo o varios cortos?
    c.cuadros_ms = trazaEventos
      .filter(
        (h) =>
          h.name === "FireAnimationFrame" &&
          h.pid === m.pid &&
          h.tid === m.tid &&
          h.ph === "X" &&
          h.ts >= m.ts &&
          h.ts <= hasta,
      )
      .sort((a, b) => a.ts - b.ts)
      .map((h) => Math.round((h.dur ?? 0) / 1000));
  }
  // La traza cruda (decenas de MB) queda fuera del repositorio, junto a los informes de Playwright.
  try {
    writeFileSync(
      resolve(__dirname, `../test-results/t1_tirones_traza_cpu${cpu}.json`),
      JSON.stringify({ traceEvents: trazaEventos }),
    );
  } catch {
    /* sin espacio: la traza no hace falta para el resultado */
  }
  // El paso «Los daños» abre el 3D con el mismo visor: nunca dos lienzos (WebGPU/WebGL) a la vez.
  if (ESCENARIO === "caso") await irAPaso(page, 5);
  await page.waitForTimeout(500);
  const lienzosEnDanos = await page.locator("canvas").count();
  const ordenRevelado = await page.evaluate(() => window.__croquisOrdenRevelado ?? []);
  const sombrasCalentadas = await page.evaluate(
    () =>
      (window as unknown as { __croquisSombrasCalentadas?: number }).__croquisSombrasCalentadas ??
      0,
  );
  const diag = await page.evaluate(() => {
    const d = window.__croquisDiagnostico;
    return d
      ? {
          backend: d.backend,
          adaptador: d.adaptador,
          calidad: d.calidad,
          fps: d.fps,
          perdidas: d.perdidas,
          recuperaciones: d.recuperaciones,
          calidad_motivo: d.calidadMotivo,
          dpr: d.dpr,
          lienzo: d.lienzo,
          memoria: d.memoria,
          dibujos_por_cuadro: window.__croquisPerf?.drawCalls ?? null,
          triangulos_por_cuadro: window.__croquisPerf?.triangles ?? null,
        }
      : null;
  });
  return {
    escenario: ESCENARIO,
    escena: ESCENARIO === "caso" ? "a2010930" : ESCENA,
    dpr_navegador: DPR,
    calidad_pedida: CALIDAD,
    backend_pedido: BACKEND,
    cpu,
    listo_ms: listoMs,
    carga_desde_clic_ms: {
      primer_cuadro: carga.primer_cuadro ?? null,
      vehiculos_en_pantalla: carga.vehiculos_en_pantalla ?? null,
      listo: carga.__croquisGraphReady ?? null,
      banderas: carga,
    },
    sombras_calentadas: sombrasCalentadas,
    orden_revelado: ordenRevelado.slice(0, 30),
    pipelines_en_carga: {
      total: pipelinesCarga.length,
      ms_total: pipelinesCarga.reduce((a, p) => a + p.ms, 0),
      mas_lentos: [...pipelinesCarga].sort((a, b) => b.ms - a.ms).slice(0, 12),
    },
    diag,
    errores_pagina: errores.slice(0, 10),
    lienzos_en_danos: lienzosEnDanos,
    tareas_largas_traza: tareasTraza,
    reproduccion: {
      segundos: SEGUNDOS,
      pipelines_creados: pipelinesRT,
      tareas_largas: reproduccion.largas.map((l) => ({
        en_ms: l.en_ms,
        duracion_ms: l.duracion_ms,
        t_escena: l.t_escena,
      })),
      mas_larga_ms: peor(reproduccion.largas),
      mayores_a_100: reproduccion.largas.filter((l) => l.duracion_ms > UMBRAL_MS).length,
      causas: reproduccion.causas.slice(-6),
    },
    camaras,
    camara_respuesta_max_ms: Math.max(0, ...camaras.map((c) => c.respuesta_ms)),
    camara_tarea_larga_max_ms: Math.max(0, ...camaras.map((c) => peor(c.largas))),
    cumple:
      lienzosEnDanos <= 1 &&
      (cpu !== 1 || (carga.primer_cuadro ?? Infinity) <= PRIMER_CUADRO_MS) &&
      peor(reproduccion.largas) <= UMBRAL_MS &&
      camaras.every((c) => c.respuesta_ms <= UMBRAL_MS && peor(c.largas) <= UMBRAL_MS),
  };
}

/**
 * Deja el archivo de resultados con las cifras y listas recortadas (las trazas enteras y la lista
 * completa de programas quedan en `apps/web/test-results/`): el archivo pasaba de 3 MB.
 */
function compactar(salida: Record<string, unknown>): Record<string, unknown> {
  const pipe = (p: Record<string, unknown>) => ({
    t: p.t,
    material: p.material,
    objeto: p.objeto,
    ms: p.ms,
    sombra: p.sombra,
    precompilado: p.precompilado,
  });
  const tarea = (l: Larga) => ({
    en_ms: l.en_ms,
    duracion_ms: l.duracion_ms,
    fase: l.fase ?? null,
    t_escena: l.t_escena ?? null,
    funciones: (l.funciones ?? []).slice(0, 3).map((f) => ({ funcion: f.funcion, ms: f.ms })),
    eventos: (l.eventos ?? []).slice(0, 3),
  });
  for (const bloque of Object.values(salida)) {
    if (!bloque || typeof bloque !== "object" || !("corridas" in bloque)) continue;
    for (const c of (bloque as { corridas: Record<string, unknown>[] }).corridas) {
      const rep = c.reproduccion as Record<string, unknown> | undefined;
      if (rep) {
        const pcs = (rep.pipelines_creados as Record<string, unknown>[] | undefined) ?? [];
        rep.pipelines_creados_total = pcs.length;
        rep.pipelines_creados = pcs.slice(0, 8).map(pipe);
        rep.tareas_largas = ((rep.tareas_largas as unknown[]) ?? []).slice(0, 24);
      }
      for (const cam of (c.camaras as Record<string, unknown>[] | undefined) ?? []) {
        const pcs = (cam.pipelines_creados as Record<string, unknown>[] | undefined) ?? [];
        cam.pipelines_creados_total = pcs.length;
        cam.pipelines_creados = pcs.slice(0, 5).map(pipe);
        delete cam.funciones;
        delete cam.eventos;
      }
      const tt = (c.tareas_largas_traza as Larga[] | undefined) ?? [];
      c.tareas_largas_traza_total = tt.length;
      c.tareas_largas_traza = tt
        .filter((l) => l.duracion_ms >= 300)
        .slice(0, 40)
        .map(tarea);
      const pc = c.pipelines_en_carga as { mas_lentos?: Record<string, unknown>[] } | undefined;
      if (pc?.mas_lentos) pc.mas_lentos = pc.mas_lentos.slice(0, 12).map(pipe);
    }
  }
  return salida;
}

test("medición: tirones del recorrido de AXA con la CPU normal y limitada", async ({ browser }) => {
  const corridas: Awaited<ReturnType<typeof medir>>[] = [];
  for (const cpu of CPUS) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: DPR,
    });
    const page = await context.newPage();
    const r = await medir(page, cpu);
    corridas.push(r);
    console.log(
      `${ESCENARIO} dpr${DPR} ${CALIDAD} cpu×${cpu}: listo ${r.listo_ms} ms; primer cuadro ${r.carga_desde_clic_ms.primer_cuadro} ms; reproducción: tarea más larga ${r.reproduccion?.mas_larga_ms ?? "-"} ms (${r.reproduccion?.mayores_a_100 ?? "-"} > 100 ms); cámaras: respuesta máx ${r.camara_respuesta_max_ms ?? "-"} ms, tarea larga máx ${r.camara_tarea_larga_max_ms ?? "-"} ms; cumple ${r.cumple}`,
    );
    await context.close();
  }
  let commit: string | null = null;
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    /* sin git */
  }
  // Las corridas viejas sin escenario son del caso de AXA con dpr 1 y calidad automática.
  const previo = existsSync(SALIDA)
    ? (JSON.parse(readFileSync(SALIDA, "utf8")) as Record<string, unknown>)
    : {};
  const clave = (c: (typeof corridas)[number]) =>
    `${c.escenario}|${c.escena}|${c.dpr_navegador}|${c.calidad_pedida}|${c.backend_pedido}|${c.cpu}`;
  const anteriores = (
    (previo[ETIQUETA] as { corridas?: Partial<(typeof corridas)[number]>[] } | undefined)
      ?.corridas ?? []
  )
    .map(
      (a) =>
        Object.assign(
          {
            escenario: "caso",
            escena: "a2010930",
            dpr_navegador: 1,
            calidad_pedida: "auto",
            backend_pedido: "auto",
          },
          a,
        ) as (typeof corridas)[number],
    )
    .filter((a) => !corridas.some((c) => clave(c) === clave(a)));
  corridas.unshift(...anteriores);
  const salida = {
    ...previo,
    name: "t1_tirones",
    descripcion:
      "Recorrido del caso de AXA en Chromium con GPU real: tareas largas del hilo principal durante la reproducción y del clic de cada cámara al siguiente cuadro, con la CPU normal y limitada ×4 (meta: nada de más de 100 ms; René, 2026-11-04).",
    [ETIQUETA]: {
      generated_at: new Date().toISOString(),
      git_commit: commit,
      umbral_ms: UMBRAL_MS,
      corridas,
      cumple: corridas.every((c) => c.cumple),
    },
  };
  writeFileSync(SALIDA, JSON.stringify(compactar(salida), null, 1) + "\n");
  console.log(SALIDA);
});
