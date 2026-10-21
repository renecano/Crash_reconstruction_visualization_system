"use client";
/**
 * `/medicion`: E6 en el navegador de la computadora de demo (PLAN §7.8, ADR 0045). Abre el visor
 * en un marco a pantalla completa, con los parámetros de E6, y mide escena por escena con la
 * lógica de `lib/medicion.ts`; al final descarga el JSON que `eval/e6_navegador.mjs` convierte en
 * el resultado versionado. Nada sale del equipo hasta que se descarga el archivo.
 */
import { readGpuRenderer } from "@croquis/viewer";
import { useCallback, useEffect, useRef, useState } from "react";
import { textos } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { Desplazable } from "@/components/sitio/desplazable";
import {
  CONFIG_DEMO,
  configDesdeUrl,
  frecuenciaPantalla,
  META_DEMO_FPS,
  planMedicion,
  repeticionMediana,
  resumirCuadros,
  tironesExternos,
  topadoPorPantalla,
  urlVisor,
  type CalidadE6,
  type ConfigMedicion,
  type PasoMedicion,
  type RendererE6,
  type ResumenCuadros,
} from "@/lib/medicion";

const T = textos(
  {
    equipo: "Este equipo",
    niveles: { baja: "Baja", media: "Media", alta: "Alta", ultra: "Ultra" } as Record<
      CalidadE6,
      string
    >,
    gpu: "GPU",
    webgpu: "WebGPU",
    disponible: "disponible",
    noDisponible: "no disponible",
    pantalla: "Pantalla",
    ventana: "Ventana",
    frecuencia: "Frecuencia de la pantalla",
    midiendo: "midiendo…",
    nucleos: "Núcleos",
    memoria: "Memoria (aprox.)",
    config: "Qué medir",
    calidades: "Calidades",
    renderers: "Renderers",
    repeticiones: "Repeticiones",
    escenas: (n: number) => `Escenas (${n})`,
    duracion: (min: number) =>
      `Dura ${min === 1 ? "alrededor de 1 minuto" : `unos ${min} minutos`}. Deja el equipo conectado y sin otras ventanas abiertas.`,
    vsync:
      "El navegador limita los cuadros a la frecuencia de la pantalla. Para medir la capacidad real, como E6, abre Chrome con --disable-gpu-vsync --disable-frame-rate-limit; si no, el resultado dice qué cifras quedaron topadas.",
    empezar: "Empezar la medición",
    cancelar: "Cancelar (Esc)",
    cargando: "Cargando",
    calentando: "Calentando",
    midiendoPaso: "Midiendo",
    pausa: "Pausa para que el equipo no se caliente",
    paso: (i: number, n: number) => `${i} de ${n}`,
    cancelada: "Medición cancelada. Lo medido hasta ahí está abajo.",
    resultados: "Resultados (repetición mediana)",
    escena: "Escena",
    calidad: "Calidad",
    renderer: "Renderer",
    backend: "Backend",
    fpsProm: "fps promedio",
    fpsMed: "fps mediana",
    fpsLento: "fps 1 % lento",
    topado: "topado",
    meta: (fps: number) =>
      `Meta de la computadora de demo: ≥ ${fps} fps en alta o ultra en todas las escenas.`,
    cumple: (c: string) => `Cumple con ${c} en todas las escenas medidas.`,
    noCumple: "No cumple en todas las escenas con ninguna de las calidades medidas.",
    nota: "Las cifras topadas por la pantalla son un mínimo: el visor podría dar más.",
    descargar: "Descargar el JSON",
    siguiente:
      "Luego: node eval/e6_navegador.mjs <archivo> para guardar el resultado en eval/results.",
  },
  {
    equipo: "This computer",
    niveles: { baja: "Low", media: "Medium", alta: "High", ultra: "Ultra" } as Record<
      CalidadE6,
      string
    >,
    gpu: "GPU",
    webgpu: "WebGPU",
    disponible: "available",
    noDisponible: "not available",
    pantalla: "Screen",
    ventana: "Window",
    frecuencia: "Screen refresh rate",
    midiendo: "measuring…",
    nucleos: "Cores",
    memoria: "Memory (approx.)",
    config: "What to measure",
    calidades: "Quality levels",
    renderers: "Renderers",
    repeticiones: "Repetitions",
    escenas: (n: number) => `Scenes (${n})`,
    duracion: (min: number) =>
      `It takes about ${min === 1 ? "1 minute" : `${min} minutes`}. Keep the computer plugged in and with no other windows open.`,
    vsync:
      "The browser caps frames at the screen refresh rate. To measure real capacity, like E6, open Chrome with --disable-gpu-vsync --disable-frame-rate-limit; otherwise the result says which figures were capped.",
    empezar: "Start measuring",
    cancelar: "Cancel (Esc)",
    cargando: "Loading",
    calentando: "Warming up",
    midiendoPaso: "Measuring",
    pausa: "Pause so the computer does not heat up",
    paso: (i: number, n: number) => `${i} of ${n}`,
    cancelada: "Measurement cancelled. What was measured so far is below.",
    resultados: "Results (median repetition)",
    escena: "Scene",
    calidad: "Quality",
    renderer: "Renderer",
    backend: "Backend",
    fpsProm: "mean fps",
    fpsMed: "median fps",
    fpsLento: "1% low fps",
    topado: "capped",
    meta: (fps: number) => `Demo computer target: ≥ ${fps} fps in high or ultra in every scene.`,
    cumple: (c: string) => `Meets it with ${c} in every measured scene.`,
    noCumple: "It does not meet it in every scene with any of the measured quality levels.",
    nota: "Figures capped by the screen are a minimum: the viewer could deliver more.",
    descargar: "Download the JSON",
    siguiente: "Then: node eval/e6_navegador.mjs <file> to save the result in eval/results.",
  },
);

interface Equipo {
  agente: string;
  gpu: string | null;
  webgpu: boolean;
  pantalla: { ancho: number; alto: number; escala: number };
  ventana: { ancho: number; alto: number };
  nucleos: number | null;
  memoria_gb: number | null;
  frecuencia_hz: number | null;
}

export interface Medicion extends PasoMedicion, ResumenCuadros {
  backend: string | null;
  tareas_largas: number;
  tareas_largas_ms: number;
  llamadas_dibujo: number | null;
  triangulos: number | null;
  carga_inicial_mb: number | null;
  tiempo_hasta_listo_ms: number | null;
  topado: boolean;
  intento: number;
}

type Fase = "cargando" | "calentando" | "midiendo" | "pausa";

const esperar = (ms: number, senal: { cancelada: boolean }) =>
  new Promise<void>((res) => {
    const fin = Date.now() + ms;
    const tick = () =>
      senal.cancelada || Date.now() >= fin ? res() : window.setTimeout(tick, 100);
    tick();
  });

/** Intervalos de `requestAnimationFrame` con la página quieta, para estimar la frecuencia. */
function intervalosRaf(n: number): Promise<number[]> {
  return new Promise((res) => {
    const out: number[] = [];
    let antes = performance.now();
    const f = (t: number) => {
      out.push(t - antes);
      antes = t;
      if (out.length >= n) res(out.slice(5));
      else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
}

export function MedicionApp() {
  const { lang } = useIdioma();
  const t = useTextos(T);
  const [equipo, setEquipo] = useState<Equipo | null>(null);
  // La configuración de E6, o la que diga la URL (corridas cortas de diagnóstico o de e2e). La URL
  // se lee al montar: con useSearchParams la página entera se dibujaría solo en el navegador y el
  // pie saltaría al aparecer (CLS, PLAN §11.6).
  const [config, setConfig] = useState<ConfigMedicion>(CONFIG_DEMO);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la URL al montar
    setConfig(configDesdeUrl(new URLSearchParams(window.location.search)));
  }, []);
  const [corriendo, setCorriendo] = useState(false);
  const [estado, setEstado] = useState<{
    i: number;
    n: number;
    paso: PasoMedicion;
    fase: Fase;
  } | null>(null);
  const [mediciones, setMediciones] = useState<Medicion[]>([]);
  const [cancelada, setCancelada] = useState(false);
  const marco = useRef<HTMLIFrameElement>(null);
  const capa = useRef<HTMLDivElement>(null);
  const senal = useRef({ cancelada: false });

  useEffect(() => {
    let vivo = true;
    const nav = navigator as Navigator & { gpu?: unknown; deviceMemory?: number };
    intervalosRaf(130).then((iv) => {
      if (!vivo) return;
      setEquipo({
        agente: navigator.userAgent,
        gpu: readGpuRenderer(),
        webgpu: typeof nav.gpu !== "undefined",
        pantalla: { ancho: screen.width, alto: screen.height, escala: window.devicePixelRatio },
        ventana: { ancho: window.innerWidth, alto: window.innerHeight },
        nucleos: navigator.hardwareConcurrency ?? null,
        memoria_gb: nav.deviceMemory ?? null,
        frecuencia_hz: frecuenciaPantalla(iv),
      });
    });
    return () => {
      vivo = false;
    };
  }, []);

  const cancelar = useCallback(() => {
    senal.current.cancelada = true;
  }, []);

  useEffect(() => {
    if (!corriendo) return undefined;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelar();
    };
    const salida = () => {
      if (!document.fullscreenElement) cancelar();
    };
    window.addEventListener("keydown", tecla);
    document.addEventListener("fullscreenchange", salida);
    return () => {
      window.removeEventListener("keydown", tecla);
      document.removeEventListener("fullscreenchange", salida);
    };
  }, [corriendo, cancelar]);

  /** Una medición en el marco: carga, calentamiento y ventana de medición, como `viewer-measure.mjs`. */
  async function medirUna(
    p: PasoMedicion,
    fase: (f: Fase) => void,
  ): Promise<Omit<Medicion, "intento"> | null> {
    const iframe = marco.current;
    if (!iframe) return null;
    fase("cargando");
    const inicio = performance.now();
    // Mientras navega, el marco conserva el documento anterior (que ya decía «listo»): se espera
    // al `load` de la página nueva antes de preguntarle nada.
    const cargado = new Promise<void>((res) =>
      iframe.addEventListener("load", () => res(), { once: true }),
    );
    iframe.src = urlVisor("/visor", p);
    await Promise.race([cargado, esperar(120_000, senal.current)]);
    // Espera a que el visor diga que el primer cuadro está listo.
    let w: Window | null = null;
    while (!senal.current.cancelada) {
      w = iframe.contentWindow;
      try {
        if (w?.__croquisReady === true) break;
      } catch {
        // El marco todavía no es del mismo origen (about:blank en transición).
      }
      if (performance.now() - inicio > 120_000) return null;
      await esperar(100, senal.current);
    }
    if (senal.current.cancelada || !w) return null;
    const bytes = (
      w.performance.getEntriesByType("resource") as PerformanceResourceTiming[]
    ).reduce((a, e) => a + (e.transferSize || 0), 0);
    const nav = w.performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const listoEn = (w as Window & { __croquisReadyAt?: number }).__croquisReadyAt ?? null;
    fase("calentando");
    await esperar(config.calentamiento_s * 1000, senal.current);
    if (senal.current.cancelada) return null;
    fase("midiendo");
    const largas: number[] = [];
    const Obs = (w as Window & { PerformanceObserver: typeof PerformanceObserver })
      .PerformanceObserver;
    const obs = new Obs((lista) => {
      for (const e of lista.getEntries()) largas.push(e.duration);
    });
    try {
      obs.observe({ type: "longtask" });
    } catch {
      // Sin `longtask` (Firefox, Safari): se reportan cero tareas largas.
    }
    if (w.__croquisPerf) w.__croquisPerf.frameMs = [];
    await esperar(config.segundos * 1000, senal.current);
    obs.disconnect();
    if (senal.current.cancelada) return null;
    const perf = w.__croquisPerf;
    const resumen = resumirCuadros(perf?.frameMs ?? []);
    return {
      ...p,
      ...resumen,
      backend: perf?.backend ?? null,
      tareas_largas: largas.length,
      tareas_largas_ms: Math.round(largas.reduce((a, b) => a + b, 0)),
      llamadas_dibujo: perf?.drawCalls ?? null,
      triangulos: perf?.triangles ?? null,
      carga_inicial_mb: Math.round(((bytes + (nav?.transferSize ?? 0)) / 1048576) * 100) / 100,
      tiempo_hasta_listo_ms: listoEn === null ? null : Math.round(listoEn),
      topado: topadoPorPantalla(resumen.fps_mediana, equipo?.frecuencia_hz ?? null),
    };
  }

  async function empezar() {
    senal.current = { cancelada: false };
    setCancelada(false);
    setMediciones([]);
    setCorriendo(true);
    try {
      await capa.current?.requestFullscreen?.();
    } catch {
      // Sin pantalla completa se mide igual; el tamaño de la ventana queda en el resultado.
    }
    const pasos = planMedicion(config);
    const hechas: Medicion[] = [];
    for (let i = 0; i < pasos.length && !senal.current.cancelada; i++) {
      const p = pasos[i]!;
      const fase = (f: Fase) => setEstado({ i: i + 1, n: pasos.length, paso: p, fase: f });
      // Hasta dos intentos más si hubo tirones ajenos al visor (criterio de E6).
      for (let intento = 1; intento <= 3 && !senal.current.cancelada; intento++) {
        const r = await medirUna(p, fase);
        if (!r) break;
        const m = { ...r, intento };
        if (!tironesExternos(m) || intento === 3) {
          hechas.push(m);
          setMediciones([...hechas]);
          break;
        }
      }
      if (marco.current) marco.current.src = "about:blank";
      fase("pausa");
      if (i < pasos.length - 1) await esperar(config.pausa_s * 1000, senal.current);
    }
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    setCancelada(senal.current.cancelada);
    setCorriendo(false);
    setEstado(null);
  }

  const resumen = resumenPorConfig(mediciones);
  const minutos = Math.ceil(
    (planMedicion(config).length *
      (config.calentamiento_s + config.segundos + config.pausa_s + 4)) /
      60,
  );

  function descargar() {
    const doc = {
      version: 1,
      generado_por: "/medicion (apps/web/src/components/medicion/medicion-app.tsx)",
      momento: new Date().toISOString(),
      metodo:
        "E6 en el navegador: visor a pantalla completa, cámara cinematográfica en movimiento y escena en bucle; calentamiento, ventana de medición, repeticiones en orden alterno con pausa; se reporta la repetición mediana por fps promedio (ADR 0026). A diferencia de E6, el navegador conserva su caché entre escenas: carga_inicial_mb solo mide la carga sin caché en la primera medición.",
      equipo,
      config,
      meta_fps: META_DEMO_FPS,
      mediciones,
      resumen,
    };
    const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `e6-navegador-${doc.momento.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const alterna = <K extends "calidades" | "renderers">(k: K, v: ConfigMedicion[K][number]) =>
    setConfig((c) => {
      const lista = c[k] as readonly string[];
      const nueva = lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];
      return { ...c, [k]: nueva };
    });

  const cumpleCon = (["alta", "ultra"] as const).filter((c) => {
    const filas = resumen.filter((r) => r.calidad === c);
    return (
      filas.length > 0 &&
      new Set(filas.map((r) => r.escena)).size === config.escenas.length &&
      config.escenas.every((e) =>
        filas.some((r) => r.escena === e && (r.fps_promedio ?? 0) >= META_DEMO_FPS),
      )
    );
  });

  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="m-equipo" className="flex flex-col gap-4">
        <h2 id="m-equipo" className="t-titulo">
          {t.equipo}
        </h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-linea pt-4 sm:grid-cols-[auto_1fr]">
          <dt className="t-interfaz text-texto-2">{t.gpu}</dt>
          <dd className="t-interfaz" data-testid="medicion-gpu">
            {equipo?.gpu ?? "—"}
          </dd>
          <dt className="t-interfaz text-texto-2">{t.webgpu}</dt>
          <dd className="t-interfaz">
            {equipo ? (equipo.webgpu ? t.disponible : t.noDisponible) : "—"}
          </dd>
          <dt className="t-interfaz text-texto-2">{t.pantalla}</dt>
          <dd className="t-cota">
            {equipo
              ? `${equipo.pantalla.ancho}×${equipo.pantalla.alto} @${equipo.pantalla.escala}x`
              : "—"}
          </dd>
          <dt className="t-interfaz text-texto-2">{t.ventana}</dt>
          <dd className="t-cota">
            {equipo ? `${equipo.ventana.ancho}×${equipo.ventana.alto}` : "—"}
          </dd>
          <dt className="t-interfaz text-texto-2">{t.frecuencia}</dt>
          <dd className="t-cota" data-testid="medicion-hz">
            {equipo
              ? equipo.frecuencia_hz === null
                ? "—"
                : `${equipo.frecuencia_hz} Hz`
              : t.midiendo}
          </dd>
          <dt className="t-interfaz text-texto-2">{t.nucleos}</dt>
          <dd className="t-cota">{equipo?.nucleos ?? "—"}</dd>
          <dt className="t-interfaz text-texto-2">{t.memoria}</dt>
          <dd className="t-cota">{equipo?.memoria_gb ? `${equipo.memoria_gb} GB` : "—"}</dd>
        </dl>
      </section>

      <section aria-labelledby="m-config" className="flex flex-col gap-5">
        <h2 id="m-config" className="t-titulo">
          {t.config}
        </h2>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="t-interfaz mb-2 text-texto-2">{t.calidades}</legend>
          {(["baja", "media", "alta", "ultra"] as CalidadE6[]).map((c) => (
            <label key={c} className="boton-secundario min-h-11 cursor-pointer gap-2 px-4">
              <input
                type="checkbox"
                checked={config.calidades.includes(c)}
                onChange={() => alterna("calidades", c)}
                className="h-5 w-5 accent-[var(--accion)]"
                data-testid={`medicion-calidad-${c}`}
              />
              {t.niveles[c]}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="t-interfaz mb-2 text-texto-2">{t.renderers}</legend>
          {(["webgpu", "webgl"] as RendererE6[]).map((r) => (
            <label key={r} className="boton-secundario min-h-11 cursor-pointer gap-2 px-4">
              <input
                type="checkbox"
                checked={config.renderers.includes(r)}
                onChange={() => alterna("renderers", r)}
                className="h-5 w-5 accent-[var(--accion)]"
              />
              {r === "webgpu" ? "WebGPU" : "WebGL 2"}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-3">
          <span className="t-interfaz text-texto-2">{t.repeticiones}</span>
          <input
            type="number"
            min={1}
            max={5}
            value={config.repeticiones}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                repeticiones: Math.min(5, Math.max(1, Number(e.target.value) || 1)),
              }))
            }
            className="campo w-20 cifras"
          />
        </label>
        <p className="t-nota">
          {t.escenas(config.escenas.length)}: {config.escenas.join(", ")}
        </p>
        <p className="t-interfaz max-w-[68ch]">{t.duracion(minutos)}</p>
        <p className="t-nota max-w-[68ch]">{t.vsync}</p>
        <button
          type="button"
          className="boton-principal self-start"
          disabled={
            corriendo || !equipo || config.calidades.length === 0 || config.renderers.length === 0
          }
          onClick={empezar}
          data-testid="medicion-empezar"
        >
          {t.empezar}
        </button>
      </section>

      {/* El marco donde corre el visor: a pantalla completa mientras se mide. */}
      <div
        ref={capa}
        className={corriendo ? "fixed inset-0 z-50 bg-fondo" : "hidden"}
        aria-hidden={!corriendo}
      >
        <iframe
          ref={marco}
          title="visor"
          tabIndex={-1}
          className="pointer-events-none h-full w-full border-0"
          src="about:blank"
        />
        {estado && estado.fase !== "midiendo" ? (
          <div className="vidrio absolute top-4 left-4 flex flex-col gap-1 px-4 py-3" role="status">
            <span className="t-cota">{t.paso(estado.i, estado.n)}</span>
            <span className="t-interfaz">
              {estado.fase === "cargando"
                ? t.cargando
                : estado.fase === "calentando"
                  ? t.calentando
                  : t.pausa}{" "}
              · {estado.paso.escena} · {estado.paso.calidad} · {estado.paso.renderer}
            </span>
            <button type="button" className="t-nota self-start underline" onClick={cancelar}>
              {t.cancelar}
            </button>
          </div>
        ) : null}
      </div>

      {cancelada ? (
        <p role="status" className="t-interfaz border-l-2 border-texto pl-3">
          {t.cancelada}
        </p>
      ) : null}

      {resumen.length > 0 ? (
        <section
          aria-labelledby="m-resultados"
          className="flex flex-col gap-4"
          data-testid="medicion-resultados"
        >
          <h2 id="m-resultados" className="t-titulo">
            {t.resultados}
          </h2>
          <p className="t-interfaz">{t.meta(META_DEMO_FPS)}</p>
          {!corriendo ? (
            <p className="t-subtitulo">
              {cumpleCon.length
                ? t.cumple(cumpleCon.join(lang === "es" ? " y " : " and "))
                : t.noCumple}
            </p>
          ) : null}
          <Desplazable etiqueta={t.resultados}>
            <table className="w-full min-w-[44rem] border-collapse text-left">
              <thead>
                <tr className="t-nota border-b border-linea">
                  <th className="py-2 pr-4 font-normal">{t.escena}</th>
                  <th className="py-2 pr-4 font-normal">{t.calidad}</th>
                  <th className="py-2 pr-4 font-normal">{t.renderer}</th>
                  <th className="py-2 pr-4 font-normal">{t.backend}</th>
                  <th className="py-2 pr-4 text-right font-normal">{t.fpsProm}</th>
                  <th className="py-2 pr-4 text-right font-normal">{t.fpsMed}</th>
                  <th className="py-2 text-right font-normal">{t.fpsLento}</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r) => (
                  <tr
                    key={`${r.escena}-${r.calidad}-${r.renderer}`}
                    className="t-interfaz border-b border-linea"
                  >
                    <td className="py-2 pr-4">{r.escena}</td>
                    <td className="py-2 pr-4">{t.niveles[r.calidad]}</td>
                    <td className="py-2 pr-4">{r.renderer}</td>
                    <td className="py-2 pr-4 text-texto-2">{r.backend ?? "—"}</td>
                    <td className="t-cota py-2 pr-4 text-right">
                      {r.fps_promedio ?? "—"}
                      {r.topado ? <span className="t-nota ml-1">({t.topado})</span> : null}
                    </td>
                    <td className="t-cota py-2 pr-4 text-right">{r.fps_mediana ?? "—"}</td>
                    <td className="t-cota py-2 text-right">{r.fps_p1_bajo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Desplazable>
          <p className="t-nota">{t.nota}</p>
          <button
            type="button"
            className="boton-principal self-start"
            onClick={descargar}
            disabled={corriendo}
            data-testid="medicion-descargar"
          >
            {t.descargar}
          </button>
          <p className="t-nota cifras">{t.siguiente}</p>
        </section>
      ) : null}
    </div>
  );
}

/** La repetición mediana de cada configuración (escena × calidad × renderer). */
function resumenPorConfig(ms: readonly Medicion[]): Medicion[] {
  const grupos = new Map<string, Medicion[]>();
  for (const m of ms) {
    const k = `${m.renderer}|${m.calidad}|${m.escena}`;
    grupos.set(k, [...(grupos.get(k) ?? []), m]);
  }
  return [...grupos.values()].map((g) => repeticionMediana(g));
}
