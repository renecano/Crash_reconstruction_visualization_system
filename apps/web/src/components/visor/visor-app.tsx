"use client";
/**
 * El visor (PLAN §11.4). `VisorApp` es la herramienta avanzada de `/visor` (escena y controles en
 * la URL); `VisorEscena` es el visor en sí, que también usa el paso «Simula» del flujo guiado con
 * sus propios controles.
 *
 * Arriba de la escena van las lecturas de cada vehículo y la leyenda, que siempre está visible;
 * debajo, las cámaras predefinidas, la traza de telemetría y los paneles. Con una hipótesis se
 * puede comparar en pantalla dividida.
 */
import {
  FIXTURE_NAMES,
  loadFixture,
  loadResultado,
  type EscenaSpec,
  type FixtureName,
  legendFor,
  type Resultado,
} from "@croquis/scene-schema";
import {
  createClock,
  createTimeline,
  environmentFor,
  eventMarkers,
  isQualityLevel,
  nextQualityLevel,
  qualityForGpu,
  readGpuRenderer,
  type GpuTier,
  recentFps,
  recordTrial,
  startTrial,
  type Backend,
  type BackendTrial,
  seek,
  setSpeed,
  step,
  togglePlay,
  type CameraMode,
  type QualityLevel,
  type ViewerClock,
  type ViewerExportApi,
} from "@croquis/viewer";
import type { AmbienteVisual, RendererInfo, RendererPreference } from "@croquis/viewer/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { textos } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { leerE9, registrarE9 } from "@/lib/e9";
import { leerEscenaPropia } from "@/lib/escena-propia";
import { reconstruirCompletoEnNavegador } from "@/lib/reconstruct-client";
import type { PeopleAttachment } from "@croquis/viewer";
import { Legend } from "../legend";
import { describeAmbiente, parseAmbiente } from "./ambiente";
import { EvidencePanel } from "./evidence-panel";
import { ExportPanel } from "./export-panel";
import { HypothesisPanel, type Hipotesis } from "./hypothesis-panel";
import { Lecturas, useClockState } from "./lecturas";
import { PeoplePanel } from "./people-panel";
import { ResultPanel } from "./result-panel";
import { Traza } from "./traza";
import { tituloEscena } from "@/i18n/vocabulario";

const T = textos(
  {
    cargandoVisor: "Cargando el visor 3D…",
    cargando: "Cargando la reconstrucción…",
    cargandoEscena: "Cargando la escena…",
    sinPropia: {
      antes: "No hay una escena propia en esta pestaña.",
      cuenta: "Cuenta qué pasó",
      o: "o arma una en el",
      croquis: "croquis",
      despues: "y usa «Ver tu reconstrucción».",
    },
    escena: "Escena",
    propia: "Tu escena (del relato o el croquis)",
    camara: "Cámara",
    camaras: {
      libre: "Libre",
      libreAyuda: "arrastra para girar",
      cenital: "Cenital",
      cinematica: "Cinematográfica",
      dano: "Daño",
      persona: "Seguir a la persona",
      conductor: (rol: string) => `Conductor ${rol}`,
    },
    ajustes: "Ajustes de dibujo",
    calidad: "Calidad",
    automatica: "Automática",
    niveles: { baja: "Baja", media: "Media", alta: "Alta", ultra: "Ultra" },
    render: "Render",
    renderAuto: "Automático (elige el más rápido)",
    forzarWebgpu: "Forzar WebGPU",
    forzarWebgl: "Forzar WebGL 2",
    elegido: (lista: string) => `elegido por medición (${lista})`,
    sinGpu: "Este navegador no pudo iniciar WebGPU ni WebGL 2; el visor 3D no está disponible.",
    calculando:
      "Calculando la incertidumbre (Monte Carlo), la inversión desde la evidencia y la consistencia en este navegador…",
    dividida: "Comparar lado a lado",
    unida: "Ver una sola escena",
    original: "Tu reconstrucción",
    hipotesis: (titulo: string) => `Hipótesis: ${titulo}`,
  },
  {
    cargandoVisor: "Loading the 3D viewer…",
    cargando: "Loading the reconstruction…",
    cargandoEscena: "Loading the scene…",
    sinPropia: {
      antes: "There is no scene of your own in this tab.",
      cuenta: "Tell what happened",
      o: "or build one in the",
      croquis: "sketch",
      despues: "and use “See your reconstruction”.",
    },
    escena: "Scene",
    propia: "Your scene (from the narrative or the sketch)",
    camara: "Camera",
    camaras: {
      libre: "Free",
      libreAyuda: "drag to rotate",
      cenital: "Overhead",
      cinematica: "Cinematic",
      dano: "Damage",
      persona: "Follow the person",
      conductor: (rol: string) => `Driver ${rol}`,
    },
    ajustes: "Rendering settings",
    calidad: "Quality",
    automatica: "Automatic",
    niveles: { baja: "Low", media: "Medium", alta: "High", ultra: "Ultra" },
    render: "Renderer",
    renderAuto: "Automatic (picks the fastest)",
    forzarWebgpu: "Force WebGPU",
    forzarWebgl: "Force WebGL 2",
    elegido: (lista: string) => `chosen by measurement (${lista})`,
    sinGpu: "This browser could not start WebGPU or WebGL 2; the 3D viewer is not available.",
    calculando:
      "Computing the uncertainty (Monte Carlo), the inversion from the evidence and the consistency in this browser…",
    dividida: "Compare side by side",
    unida: "Show a single scene",
    original: "Your reconstruction",
    hipotesis: (titulo: string) => `Hypothesis: ${titulo}`,
  },
);

function CargandoVisor() {
  const t = useTextos(T);
  return <div className="t-nota grid h-full place-items-center">{t.cargandoVisor}</div>;
}

const SceneViewer = dynamic(() => import("@croquis/viewer/react").then((m) => m.SceneViewer), {
  ssr: false,
  loading: () => <CargandoVisor />,
});

type CalidadOpcion = QualityLevel | "auto";
/** Una escena canónica o la escena propia de la persona usuaria (`escena=propia`). */
type EscenaVisor = FixtureName | "propia";

/** Lo que se puede controlar del visor; en `/visor` vive en la URL, en el flujo en el estado. */
export interface ControlesVisor {
  camara: string;
  calidad: CalidadOpcion;
  renderer: RendererPreference;
  t: number | undefined;
  auto: boolean;
  /** Visor a pantalla completa (demos y medición de E6 a 1080p). */
  completa: boolean;
  bucle: boolean;
}

export const CONTROLES_INICIALES: ControlesVisor = {
  camara: "libre",
  calidad: "auto",
  renderer: "auto",
  t: undefined,
  auto: false,
  completa: false,
  bucle: false,
};

function parseControles(sp: URLSearchParams): ControlesVisor & { escena: EscenaVisor } {
  const escena = sp.get("escena");
  const calidad = sp.get("calidad");
  const renderer = sp.get("renderer");
  const t = sp.get("t");
  return {
    escena:
      escena === "propia"
        ? "propia"
        : FIXTURE_NAMES.includes(escena as FixtureName)
          ? (escena as FixtureName)
          : "lateral_interseccion",
    camara: sp.get("camara") ?? "libre",
    calidad: isQualityLevel(calidad) ? calidad : "auto",
    renderer: renderer === "webgl" || renderer === "webgpu" ? renderer : "auto",
    t: t !== null && Number.isFinite(Number(t)) ? Number(t) : undefined,
    auto: sp.get("auto") === "1",
    completa: sp.get("pantalla") === "completa",
    bucle: sp.get("bucle") === "1",
  };
}

const BACKEND_KEY = "croquis.backend";

/** Preferencia de backend recordada en este navegador (puede no existir o no estar disponible). */
function readBackend(): Backend | null {
  try {
    const v = window.localStorage.getItem(BACKEND_KEY);
    return v === "webgpu" || v === "webgl" ? v : null;
  } catch {
    return null;
  }
}

function saveBackend(b: Backend): void {
  try {
    window.localStorage.setItem(BACKEND_KEY, b);
  } catch {
    /* almacenamiento no disponible: se vuelve a medir la próxima vez */
  }
}

const CAMARAS = ["libre", "cenital", "cinematica", "dano", "persona"] as const;

const noopSubscribe = () => () => undefined;
const nullSnapshot = () => null;
/** GPU leída una sola vez por página (la instantánea de `useSyncExternalStore` debe ser estable). */
let gpuTierCache: GpuTier | null = null;
const gpuTierSnapshot = (): GpuTier => (gpuTierCache ??= qualityForGpu(readGpuRenderer()));

/**
 * Traza suscrita al reloj. La suscripción vive aquí y no en `VisorEscena`: el reloj avisa a la
 * interfaz 15 veces por segundo durante la reproducción y, si el visor se suscribiera, cada aviso
 * volvería a dibujar los paneles de resultados, que no cambian con el tiempo (E6: tirones de
 * 50–70 ms en el hilo principal).
 */
function TrazaConReloj({
  clock,
  resultado,
}: {
  clock: ViewerClock;
  resultado: Resultado;
}): ReactElement | null {
  const { lang } = useIdioma();
  const state = useClockState(clock);
  const markers = useMemo(() => {
    const rol = new Map([
      ...resultado.vehiculos.map((v) => [v.id, v.rol] as const),
      ...resultado.personas.map((p) => [p.id, lang === "es" ? "peatón" : "pedestrian"] as const),
    ]);
    return eventMarkers(resultado.eventos, resultado.t_inicio, resultado.t_fin, (id) =>
      rol.get(id),
    );
  }, [resultado, lang]);
  if (!state) return null;
  return (
    <Traza
      state={state}
      markers={markers}
      vehiculos={resultado.vehiculos.filter((v) => v.involucrado)}
      onTogglePlay={() => clock.set(togglePlay)}
      onSeek={(t) => clock.set((s) => seek(s, t))}
      onStep={(n) => clock.set((s) => step(s, n))}
      onSpeed={(v) => clock.set((s) => setSpeed(s, v))}
    />
  );
}

const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * `/visor`: elige la escena (una canónica o la propia, guardada en esta pestaña desde el flujo o
 * el croquis) y guarda los controles en la URL. Sin escena propia explica cómo crearla.
 */
export function VisorApp() {
  const t = useTextos(T);
  const { ruta } = useIdioma();
  const sp = useSearchParams();
  const router = useRouter();
  const params = useMemo(() => parseControles(new URLSearchParams(sp.toString())), [sp]);
  const ambiente = useMemo(() => parseAmbiente(new URLSearchParams(sp.toString())), [sp]);
  const hidratado = useSyncExternalStore(noopSubscribe, hydratedSnapshot, serverSnapshot);
  const propia = useSyncExternalStore(noopSubscribe, leerEscenaPropia, nullSnapshot);
  const spec = useMemo(
    () => (params.escena === "propia" ? propia : loadFixture(params.escena)),
    [params.escena, propia],
  );
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (value === null) next.delete(key);
      else next.set(key, value);
      if (key === "escena") next.delete("t");
      router.replace(`${ruta("/visor")}?${next.toString()}`, { scroll: false });
    },
    [sp, router, ruta],
  );
  if (!spec) {
    return (
      <div
        className="t-cuerpo grid min-h-[360px] place-items-center border border-linea p-6 text-center"
        data-testid="sin-escena-propia"
      >
        {hidratado ? (
          <p>
            {t.sinPropia.antes} <Link href={ruta("/cuenta")}>{t.sinPropia.cuenta}</Link>{" "}
            {t.sinPropia.o} <Link href={ruta("/croquis")}>{t.sinPropia.croquis}</Link>{" "}
            {t.sinPropia.despues}
          </p>
        ) : (
          <p>{t.cargandoEscena}</p>
        )}
      </div>
    );
  }
  return (
    <VisorEscena
      key={params.escena}
      spec={spec}
      escena={params.escena}
      hayPropia={propia !== null}
      controles={params}
      onControl={(k, v) =>
        setParam(k === "completa" ? "pantalla" : k, k === "completa" ? (v ? "completa" : null) : v)
      }
      onEscena={(e) => setParam("escena", e)}
      ambiente={ambiente}
    />
  );
}

export interface VisorEscenaProps {
  spec: EscenaSpec;
  escena: EscenaVisor;
  controles: ControlesVisor;
  /** Cambia un control (`camara`, `calidad` o `renderer`); null vuelve al valor automático. */
  onControl: (key: "camara" | "calidad" | "renderer" | "completa", value: string | null) => void;
  /** Si existe, se muestra el selector de escena (herramienta avanzada). */
  onEscena?: (e: EscenaVisor) => void;
  hayPropia?: boolean;
  ambiente?: AmbienteVisual | null;
  /** Avisa el tiempo del reloj y la reconstrucción dibujada (p. ej. para mover el croquis 2D). */
  onTiempo?: (t: number, resultado: Resultado) => void;
  /**
   * Hipótesis que llegan de fuera (R7: la versión que declara un conductor): se dibujan como
   * fantasmas o lado a lado, igual que las del panel, pero el panel no las quita.
   */
  hipotesisExternas?: readonly Hipotesis[];
  /** Entrega la API de exportación del visor (R8: cuadros del 3D para el dictamen). */
  onExportApi?: (api: ViewerExportApi | null) => void;
}

export function VisorEscena({
  spec,
  escena,
  controles,
  onControl,
  onEscena,
  hayPropia = false,
  ambiente = null,
  onTiempo,
  hipotesisExternas,
  onExportApi,
}: VisorEscenaProps) {
  const t = useTextos(T);
  const { lang } = useIdioma();
  // La escena propia se reconstruye en el navegador (Web Worker): primero la reconstrucción, que
  // es lo que se dibuja, y luego el resultado completo (Monte Carlo, inversión y consistencia) para
  // los paneles. El visor 3D se queda con la primera para no reconstruir la escena 3D al llegar la
  // segunda (las trayectorias son las mismas).
  const [resultado, setResultado] = useState<{
    name: EscenaVisor;
    spec: EscenaSpec;
    dibujo: Resultado;
    r: Resultado;
    completo: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<RendererInfo | null>(null);
  const [exportApi, setExportApi] = useState<ViewerExportApi | null>(null);
  useEffect(() => {
    onExportApi?.(exportApi);
  }, [exportApi, onExportApi]);
  const legend = useMemo(() => legendFor(spec), [spec]);
  // Modo automático (ADR 0026): arranca en el nivel que sugiere la GPU y luego lo ajustan los fps
  // medidos. En el prerender no hay GPU (null) y se usa media.
  const gpu = useSyncExternalStore(noopSubscribe, gpuTierSnapshot, nullSnapshot);
  const [autoAjustada, setAutoAjustada] = useState<QualityLevel | null>(null);
  const autoCalidad: QualityLevel = autoAjustada ?? gpu?.level ?? "media";
  const calidad: QualityLevel = controles.calidad === "auto" ? autoCalidad : controles.calidad;

  useEffect(() => {
    let alive = true;
    const fail = (e: unknown) => {
      if (alive) setError(e instanceof Error ? e.message : String(e));
    };
    if (escena === "propia") {
      reconstruirCompletoEnNavegador(spec, (parcial) => {
        if (alive)
          setResultado({ name: escena, spec, dibujo: parcial, r: parcial, completo: false });
      })
        .then((completo) => {
          if (alive) {
            setResultado((prev) => ({
              name: escena,
              spec,
              dibujo: prev?.name === escena && prev.spec === spec ? prev.dibujo : completo,
              r: completo,
              completo: true,
            }));
          }
        })
        .catch(fail);
    } else {
      loadResultado(escena)
        .then((r) => {
          if (alive) setResultado({ name: escena, spec, dibujo: r, r, completo: true });
        })
        .catch(fail);
    }
    return () => {
      alive = false;
    };
  }, [escena, spec]);

  const vigente = resultado?.name === escena && resultado.spec === spec ? resultado : null;
  const r = vigente?.r ?? null;
  const dibujo = vigente?.dibujo ?? null;
  const calculando = vigente !== null && !vigente.completo;
  // Hipótesis alternativa de la escena actual (se descarta al cambiar de escena).
  const [hyp, setHyp] = useState<{ escena: EscenaVisor; lista: Hipotesis[] } | null>(null);
  const propias = useMemo(() => (hyp?.escena === escena ? hyp.lista : []), [hyp, escena]);
  const hipotesis = useMemo(
    () => [...(hipotesisExternas ?? []), ...propias],
    [hipotesisExternas, propias],
  );
  const ghostResults = useMemo(() => hipotesis.map((h) => h.resultado), [hipotesis]);
  const [dividida, setDividida] = useState(false);
  const comparar = dividida && hipotesis.length > 0;
  const clock = useMemo(() => {
    if (!dibujo) return null;
    return createClock(
      createTimeline(dibujo.t_inicio, dibujo.t_fin, dibujo.dt, {
        t: controles.t ?? dibujo.t_inicio,
        playing: controles.auto,
        loop: controles.bucle,
      }),
    );
  }, [dibujo, controles.t, controles.auto, controles.bucle]);

  // El reloj del 3D hacia fuera (el croquis 2D de «Caso nuevo» lo sigue).
  const avisarTiempo = useRef(onTiempo);
  useEffect(() => {
    avisarTiempo.current = onTiempo;
  }, [onTiempo]);
  useEffect(() => {
    if (!clock || !dibujo) return undefined;
    avisarTiempo.current?.(clock.get().t, dibujo);
    return clock.subscribe((st) => avisarTiempo.current?.(st.t, dibujo));
  }, [clock, dibujo]);

  // Resultado del montaje de personas (ragdolls calibrados) para el panel.
  const [people, setPeople] = useState<{ escena: EscenaVisor; data: PeopleAttachment } | null>(
    null,
  );
  const onPeople = useCallback((data: PeopleAttachment) => setPeople({ escena, data }), [escena]);
  // Backend automático por medición (ADR 0006): WebGPU primero; si no llega a 60 fps se prueba
  // WebGL 2 y se queda el más rápido. La decisión se recuerda en este navegador. Una prueba por
  // escena: lo que rinde en una escena puede no rendir en otra.
  const [trialState, setTrialState] = useState<{ escena: EscenaVisor; trial: BackendTrial }>(
    () => ({
      escena,
      trial: startTrial(readBackend()),
    }),
  );
  const trial = trialState.escena === escena ? trialState.trial : startTrial(readBackend());
  // E9: la primera vez que la escena propia queda lista en 3D (solo con una sesión activa).
  useEffect(() => {
    if (escena !== "propia" || !leerE9()) return undefined;
    const id = window.setInterval(() => {
      if (window.__croquisReady) {
        registrarE9("reconstruccion_visible");
        window.clearInterval(id);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [escena]);
  const setTrial = useCallback(
    (update: (t: BackendTrial) => BackendTrial): void =>
      setTrialState((s) => ({
        escena,
        trial: update(s.escena === escena ? s.trial : startTrial(readBackend())),
      })),
    [escena],
  );
  const effectiveRenderer: RendererPreference =
    controles.renderer === "auto" ? trial.current : controles.renderer;
  useEffect(() => {
    if (controles.renderer !== "auto" || trial.decided || !info) return undefined;
    const id = window.setInterval(() => {
      const perf = window.__croquisPerf;
      if (!perf || perf.frameMs.length < 240) return;
      const fps = recentFps(perf.frameMs, 120);
      if (!Number.isFinite(fps)) return;
      setTrial((tr) => {
        const next = recordTrial(tr, fps, info.backend);
        if (next.decided) saveBackend(next.current);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [controles.renderer, trial.decided, info, setTrial]);

  // Calidad automática con histéresis según los fps medidos (PLAN §7.8), una vez elegido el backend.
  useEffect(() => {
    if (controles.calidad !== "auto" || (controles.renderer === "auto" && !trial.decided))
      return undefined;
    const id = window.setInterval(() => {
      const fps = recentFps(window.__croquisPerf?.frameMs ?? [], 90);
      if (Number.isFinite(fps)) {
        setAutoAjustada((q) => nextQualityLevel(q ?? gpu?.level ?? "media", fps));
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [controles.calidad, controles.renderer, trial.decided, gpu]);

  const env = useMemo(
    () =>
      environmentFor({
        fechaHora: spec.entorno.fecha_hora?.valor,
        iluminacion: spec.entorno.iluminacion?.valor,
        clima: spec.entorno.clima?.valor,
        alumbrado: spec.entorno.alumbrado_publico?.valor,
        lat: spec.lugar.ubicacion_real?.lat,
        lon: spec.lugar.ubicacion_real?.lon,
      }),
    [spec],
  );

  const [mode, driverId] = controles.camara.startsWith("conductor-")
    ? (["conductor", controles.camara.slice("conductor-".length)] as const)
    : ([controles.camara as CameraMode, undefined] as const);
  const cameraMode: CameraMode = (
    ["libre", "cenital", "conductor", "cinematica", "dano", "persona"] as const
  ).includes(mode as CameraMode)
    ? (mode as CameraMode)
    : "libre";
  const opcionesCamara = [
    ...CAMARAS.filter((c) => c !== "persona" || spec.personas.some((p) => !p.vehiculo_id)).map(
      (c) => ({
        valor: c as string,
        texto: t.camaras[c],
      }),
    ),
    ...spec.vehiculos.map((v) => ({
      valor: `conductor-${v.id}`,
      texto: t.camaras.conductor(v.rol),
    })),
  ];

  const leyenda = (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[color-mix(in_srgb,var(--fondo)_72%,transparent)] px-4 py-2">
      <Legend
        seed={spec.meta.semilla}
        inputHash={spec.meta.hash_relato}
        tone="clara"
        atribucion={spec.lugar.red_vial?.atribucion}
        modelos={exportApi?.vehicleCredits}
      />
    </div>
  );
  const visor = (res: Resultado, principal: boolean) =>
    clock ? (
      <SceneViewer
        spec={spec}
        resultado={res}
        clock={clock}
        camera={cameraMode}
        driverVehicleId={driverId}
        quality={
          principal ? calidad : calidad === "ultra" || calidad === "alta" ? "media" : calidad
        }
        renderer={effectiveRenderer}
        onRendererInfo={principal ? setInfo : undefined}
        onPeople={principal ? onPeople : undefined}
        hipotesis={principal && !comparar ? ghostResults : undefined}
        onExport={principal ? setExportApi : undefined}
        ambiente={ambiente ?? undefined}
        onError={() => setError(t.sinGpu)}
        className="h-full w-full"
      />
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      {onEscena ? (
        <label className="t-interfaz flex max-w-md flex-col gap-1">
          {t.escena}
          <select
            value={escena}
            onChange={(e) => onEscena(e.target.value as EscenaVisor)}
            className="campo"
            aria-label={t.escena}
          >
            {hayPropia ? <option value="propia">{t.propia}</option> : null}
            {FIXTURE_NAMES.map((n) => (
              <option key={n} value={n}>
                {tituloEscena(n, lang)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {ambiente ? (
        <p
          role="status"
          data-testid="ambiente-forzado"
          className="t-interfaz border-l-2 border-texto-2 pl-4"
        >
          {describeAmbiente(ambiente, lang)}
        </p>
      ) : null}

      <div
        className={
          controles.completa
            ? "fixed inset-0 z-50 bg-fondo"
            : `grid gap-2 ${comparar ? "md:grid-cols-2" : ""}`
        }
      >
        <div
          className={
            controles.completa
              ? "relative h-full w-full"
              : "relative h-[62vh] min-h-[360px] w-full overflow-hidden rounded-panel bg-superficie"
          }
          data-testid="marco-visor"
        >
          {error ? (
            <p role="alert" className="t-interfaz grid h-full place-items-center p-6 text-center">
              {error}
            </p>
          ) : dibujo && clock ? (
            visor(dibujo, true)
          ) : (
            <div className="t-nota grid h-full place-items-center">{t.cargando}</div>
          )}
          {/* Las lecturas toman el resultado completo cuando llega: ΔV con su intervalo. */}
          {dibujo && clock && !error ? <Lecturas clock={clock} resultado={r ?? dibujo} /> : null}
          {comparar ? (
            <span className="t-nota vidrio absolute top-3 right-3 px-3 py-1 text-texto">
              {t.original}
            </span>
          ) : null}
          {leyenda}
        </div>
        {comparar && hipotesis[0] ? (
          <div
            className="relative h-[62vh] min-h-[360px] w-full overflow-hidden rounded-panel bg-superficie"
            data-testid="visor-hipotesis"
          >
            {visor(hipotesis[0].resultado, false)}
            {clock ? <Lecturas clock={clock} resultado={hipotesis[0].resultado} /> : null}
            <span className="t-nota vidrio absolute top-3 right-3 px-3 py-1 text-texto">
              {t.hipotesis(hipotesis[0].etiqueta)}
            </span>
            {leyenda}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="t-nota mb-2">{t.camara}</legend>
          <div
            role="radiogroup"
            aria-label={t.camara}
            className="flex flex-wrap gap-2"
            data-testid="camaras"
          >
            {opcionesCamara.map((o) => {
              const sel = controles.camara === o.valor;
              return (
                <button
                  key={o.valor}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  title={o.valor === "libre" ? t.camaras.libreAyuda : undefined}
                  onClick={() => onControl("camara", o.valor)}
                  className={`boton-secundario min-h-11 px-4 ${sel ? "border-texto bg-superficie-alta" : ""}`}
                >
                  {o.texto}
                </button>
              );
            })}
          </div>
        </fieldset>
        {hipotesis.length > 0 ? (
          <button
            type="button"
            className="boton-secundario"
            aria-pressed={comparar}
            data-testid="comparar-lado-a-lado"
            onClick={() => setDividida((d) => !d)}
          >
            {comparar ? t.unida : t.dividida}
          </button>
        ) : null}
      </div>

      {clock && dibujo ? <TrazaConReloj clock={clock} resultado={dibujo} /> : null}

      {/* Primero lo que pasó y qué cambia con otra hipótesis; después la evidencia, las
          personas, las exportaciones y los ajustes de dibujo. */}
      {calculando ? (
        <p role="status" data-testid="calculo-completo" className="t-nota">
          {t.calculando}
        </p>
      ) : null}
      {r ? <ResultPanel resultado={r} supuestosEntorno={env.supuestos} spec={spec} /> : null}
      {r ? (
        <HypothesisPanel
          spec={spec}
          resultado={r}
          hipotesis={propias}
          onChange={(lista) => setHyp({ escena, lista })}
        />
      ) : null}
      {r ? <EvidencePanel resultado={r} /> : null}
      {r ? (
        <PeoplePanel resultado={r} people={people?.escena === escena ? people.data : null} />
      ) : null}
      <ExportPanel
        api={exportApi}
        clock={clock}
        legend={legend}
        nombre={escena === "propia" ? "escena-propia" : escena}
        informe={{ spec, resultado: r, supuestosEntorno: env.supuestos, completo: !calculando }}
      />
      <details className="border-t border-linea pt-4">
        <summary className="t-interfaz flex min-h-11 cursor-pointer items-center">
          {t.ajustes}
        </summary>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="t-nota flex flex-col gap-1">
            {t.calidad}
            <select
              value={controles.calidad}
              onChange={(e) =>
                onControl("calidad", e.target.value === "auto" ? null : e.target.value)
              }
              className="campo w-auto max-w-full"
              aria-label={t.calidad}
            >
              <option value="auto">
                {t.automatica} ({t.niveles[calidad]}
                {gpu ? ` · ${gpu.kind}` : ""})
              </option>
              <option value="baja">{t.niveles.baja}</option>
              <option value="media">{t.niveles.media}</option>
              <option value="alta">{t.niveles.alta}</option>
              <option value="ultra">{t.niveles.ultra}</option>
            </select>
          </label>
          <label className="t-nota flex flex-col gap-1">
            {t.render}
            <select
              value={controles.renderer}
              onChange={(e) =>
                onControl("renderer", e.target.value === "auto" ? null : e.target.value)
              }
              className="campo w-auto max-w-full"
              aria-label={t.render}
            >
              <option value="auto">{t.renderAuto}</option>
              <option value="webgpu">{t.forzarWebgpu}</option>
              <option value="webgl">{t.forzarWebgl}</option>
            </select>
          </label>
          {info ? (
            <span className="t-nota cifras pb-3" data-testid="backend">
              {info.backend === "webgpu" ? "WebGPU" : "WebGL 2"}
              {controles.renderer === "auto" &&
              trial.decided &&
              Object.keys(trial.measured).length > 0
                ? ` · ${t.elegido(
                    Object.entries(trial.measured)
                      .map(
                        ([k, v]) => `${k === "webgpu" ? "WebGPU" : "WebGL 2"} ${Math.round(v)} fps`,
                      )
                      .join(", "),
                  )}`
                : ""}
            </span>
          ) : null}
        </div>
      </details>
    </div>
  );
}
