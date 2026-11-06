"use client";
/**
 * El visor (PLAN §11.4). `VisorApp` es la herramienta avanzada de `/visor` (escena y controles en
 * la URL); `VisorEscena` es el visor en sí, que también usa el paso «Simula» del flujo guiado con
 * sus propios controles.
 *
 * Arriba de la escena van las lecturas de cada vehículo y la leyenda, que siempre está visible;
 * debajo, las cámaras predefinidas, la traza de telemetría y los paneles. Una hipótesis se ve como
 * fantasma sobre la escena.
 */
import {
  FIXTURE_NAMES,
  loadFixture,
  loadResultado,
  type EscenaSpec,
  type FixtureName,
  legendFor,
  LEGEND_TEXT_CESVI,
  type Resultado,
} from "@croquis/scene-schema";
import {
  createClock,
  createTimeline,
  environmentFor,
  eventMarkers,
  isQualityLevel,
  qualityForGpu,
  clampToCeiling,
  onLoss,
  RECOVERY_INICIAL,
  retry,
  getDiagnostico,
  subscribeDiagnostico,
  updateDiagnostico,
  type DiagPerdida,
  type Diagnostico,
  type RecoveryState,
  readGpuRenderer,
  type GpuTier,
  fpsEnVentana,
  defaultBackendFor,
  lowerQualityIfSlow,
  marcar,
  type Backend,
  seek,
  setSpeed,
  step,
  togglePlay,
  cameraFromButton,
  SIGHT_BLOCKED,
  SIGHT_VISIBLE,
  type CameraChoice,
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
import { useModoCesvi } from "@/components/cesvi/marco-cesvi";
import { reconstruirCompletoEnNavegador } from "@/lib/reconstruct-client";
import type { PeopleAttachment, ProceduralSummary } from "@croquis/viewer";
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
      detras: (rol: string) => `Detrás de ${rol}`,
    },
    ajustes: "Ajustes de dibujo",
    recuperando: (n: number) => `El dibujo 3D se perdió (${n}); se vuelve a crear…`,
    bajando: (q: string) => `El dibujo 3D se perdió otra vez; se baja la calidad a ${q}.`,
    fallo3d: "El dibujo 3D no se pudo recuperar en esta computadora.",
    reintentar: "Reintentar",
    usarMedia: "Usar calidad media",
    preparando: "Preparando el dibujo 3D…",
    preparandoResto: "Preparando la reproducción",
    lineaVision: "línea de visión: se veía",
    lineaTapada: "algo la tapaba",
    diagnostico: "Diagnóstico del visor",
    calidad: "Calidad",
    automatica: "Automática",
    niveles: { baja: "Baja", media: "Media", alta: "Alta", ultra: "Ultra" },
    render: "Render",
    renderAuto: "Automático (elige el más rápido)",
    forzarWebgpu: "Forzar WebGPU",
    forzarWebgl: "Forzar WebGL 2",
    elegido: (motivo: string) => `elegido por la GPU (${motivo})`,
    sinGpu: "Este navegador no pudo iniciar WebGPU ni WebGL 2; el visor 3D no está disponible.",
    calculando:
      "Calculando la incertidumbre (Monte Carlo), la inversión desde la evidencia y la consistencia en este navegador…",
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
      detras: (rol: string) => `Behind ${rol}`,
    },
    ajustes: "Rendering settings",
    recuperando: (n: number) => `The 3D view was lost (${n}); recreating it…`,
    bajando: (q: string) => `The 3D view was lost again; quality lowered to ${q}.`,
    fallo3d: "The 3D view could not be recovered on this computer.",
    reintentar: "Retry",
    usarMedia: "Use medium quality",
    preparando: "Preparing the 3D view…",
    preparandoResto: "Preparing playback",
    lineaVision: "line of sight: visible",
    lineaTapada: "blocked",
    diagnostico: "Viewer diagnostics",
    calidad: "Quality",
    automatica: "Automatic",
    niveles: { baja: "Low", media: "Medium", alta: "High", ultra: "Ultra" },
    render: "Renderer",
    renderAuto: "Automatic (picks the fastest)",
    forzarWebgpu: "Force WebGPU",
    forzarWebgl: "Force WebGL 2",
    elegido: (motivo: string) => `chosen by the GPU (${motivo})`,
    sinGpu: "This browser could not start WebGPU or WebGL 2; the 3D viewer is not available.",
    calculando:
      "Computing the uncertainty (Monte Carlo), the inversion from the evidence and the consistency in this browser…",
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
  /** Diagnóstico en pantalla (`?diag=1`): backend, GPU, calidad, memoria, fps y errores. */
  diag: boolean;
}

export const CONTROLES_INICIALES: ControlesVisor = {
  camara: "libre",
  calidad: "auto",
  renderer: "auto",
  t: undefined,
  auto: false,
  completa: false,
  bucle: false,
  diag: false,
};

function parseControles(sp: URLSearchParams): ControlesVisor & { escena: EscenaVisor } {
  const escena = sp.get("escena");
  const calidad = sp.get("calidad");
  // `?backend=webgl` es un alias de `?renderer=webgl` (así lo pidió René para la M1).
  const renderer = sp.get("renderer") ?? sp.get("backend");
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
    diag: sp.get("diag") === "1",
  };
}

// Clave nueva (René, 2026-11-04): la prueba automática vieja guardaba su decisión en
// «croquis.backend» y dejaba a la M1 en WebGL para siempre; aquí solo se guarda lo que la persona
// elige a mano, y lo viejo se ignora.
const BACKEND_KEY = "croquis.backend.manual";

/** Preferencia de backend elegida a mano en este navegador (puede no existir o no estar disponible). */
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

const diagInicial: Diagnostico | null = null;
const diagServidor = () => diagInicial;

/**
 * Diagnóstico en pantalla (`?diag=1`; René, 2026-11-04): backend y GPU, calidad, memoria
 * estimada, fps y el último error o pérdida, para probar en otras computadoras y mandar la captura.
 */
/** Nota pequeña con el avance del precompilado en segundo plano («revelado 12/80»). */
function AvancePrecompilado({ texto }: { texto: string }) {
  const d = useSyncExternalStore(subscribeDiagnostico, getDiagnostico, diagServidor);
  return (
    <p
      role="status"
      className="t-nota vidrio absolute top-3 left-3 px-3 py-1 text-texto"
      data-testid="visor-preparando-fondo"
    >
      {texto}
      {d?.precompilado ? ` · ${d.precompilado}` : "…"}
    </p>
  );
}

function DiagnosticoPanel({ titulo }: { titulo: string }): ReactElement {
  const d = useSyncExternalStore(subscribeDiagnostico, getDiagnostico, diagServidor);
  if (!d) return <></>;
  const mb = d.memoria;
  const fila = (k: string, v: string | number | null | undefined) => (
    <div key={k} className="flex gap-2">
      <span className="opacity-70">{k}</span>
      <span className="break-all">{v === null || v === undefined ? "—" : String(v)}</span>
    </div>
  );
  return (
    <section
      aria-label={titulo}
      data-testid="visor-diag"
      className="vidrio absolute bottom-3 left-3 max-w-[min(92vw,520px)] px-3 py-2 font-mono text-[11px] leading-snug text-texto"
    >
      <div className="mb-1 font-semibold">{titulo}</div>
      {fila("backend", d.backend ? `${d.backend} (pref. ${d.preferencia})` : null)}
      {fila("gpu", d.adaptador)}
      {fila(
        "calidad",
        d.calidad ? `${d.calidad} · dpr ${d.dpr.toFixed(2)} · gen ${d.generacion}` : null,
      )}
      {fila("lienzo", d.lienzo ? `${d.lienzo[0]}×${d.lienzo[1]}` : null)}
      {fila("fps", d.fps)}
      {fila("calidad auto", d.calidadMotivo)}
      {fila("precompilado", d.precompilado)}
      {fila("armado del grafo", d.armado)}
      {fila(
        "tareas largas",
        d.tareasLargas.length
          ? d.tareasLargas
              .slice(-5)
              .map((x) => `${Math.round(x.duracion)} ms: ${x.causa}`)
              .join(" · ")
          : "ninguna",
      )}
      {fila(
        "memoria",
        mb
          ? `texturas ${mb.texturasMB} MB (${mb.texturas}; renderer ${mb.texturasRenderer ?? "—"}) · pantalla ${mb.pantallaMB} MB · sombras ${mb.sombrasMB} MB · total ~${mb.totalMB} MB · geometrías ${mb.geometriasRenderer ?? "—"}`
          : null,
      )}
      {fila(
        "pérdida",
        d.perdida
          ? `${d.perdida.api}: ${d.perdida.mensaje}${d.perdida.motivo ? ` (${d.perdida.motivo})` : ""} · ${d.perdidas} pérdida(s), ${d.recuperaciones} recuperación(es)`
          : `ninguna (${d.recuperaciones} recuperación(es))`,
      )}
      {fila(
        "último error",
        d.ultimoError ? `[${d.ultimoError.origen}] ${d.ultimoError.mensaje}` : null,
      )}
    </section>
  );
}

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
  // `leyenda=cesvi`: un caso de CESVI abierto en el visor (p. ej. la escena de AXA del video de la
  // computadora de la demo) lleva la leyenda de CESVI en pantalla y en lo que se exporta.
  const leyendaTexto = sp.get("leyenda") === "cesvi" ? LEGEND_TEXT_CESVI : undefined;
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
      leyendaTexto={leyendaTexto}
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
  /** Otro texto de leyenda, en pantalla y en lo que se exporta (en /cesvi, el de CESVI). */
  leyendaTexto?: string;
  /**
   * Visor activo (por omisión). Inactivo (el mapa del caso lo tapa): el 3D no dibuja ni corre el
   * reloj, pero conserva el renderer y el grafo precompilado; nunca hay dos contextos dibujando.
   */
  activo?: boolean;
}

/** La calidad automática no baja hasta que el grafo lleva este tiempo precompilado. */
const CALIDAD_ASENTADA_MS = 4000;
/** Cuánto tiempo seguido por debajo de `LOWER_BELOW_FPS` hace bajar un nivel (René: 5 s). */
const CALIDAD_LENTA_MS = 5000;
/** Techo de calidad automática de la sesión (una vez bajada, no sube hasta cerrar la pestaña). */
const TECHO_SESION = "croquis.calidad.techo";
function leerTechoSesion(): QualityLevel | null {
  try {
    const v = window.sessionStorage.getItem(TECHO_SESION);
    return v === "baja" || v === "media" || v === "alta" ? v : null;
  } catch {
    return null;
  }
}
// El techo se lee una vez por montaje del visor (no en cada render): bajarlo mientras el 3D está
// abierto no vuelve a crear el renderer; se aplica al volver a abrir el 3D.
let techoLeido: QualityLevel | null | undefined;
function techoSesionSnapshot(): QualityLevel | null {
  if (techoLeido === undefined) techoLeido = leerTechoSesion();
  return techoLeido;
}
function guardarTechoSesion(q: QualityLevel): void {
  try {
    window.sessionStorage.setItem(TECHO_SESION, q);
  } catch {
    /* sin almacenamiento: la sesión no recuerda el techo */
  }
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
  leyendaTexto,
  activo = true,
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
  const legend = useMemo(
    () => ({ ...legendFor(spec), ...(leyendaTexto ? { texto: leyendaTexto } : {}) }),
    [spec, leyendaTexto],
  );
  // Modo automático (ADR 0026): arranca en el nivel que sugiere la GPU y luego lo ajustan los fps
  // medidos. En el prerender no hay GPU (null) y se usa media.
  const gpu = useSyncExternalStore(noopSubscribe, gpuTierSnapshot, nullSnapshot);
  // Modo automático conservador (René, 2026-11-04): el nivel inicial lo da la GPU (Mac e
  // integradas, media); en la sesión solo baja, y solo con el reloj parado (cada cambio vuelve a
  // crear el renderer: nunca a media reproducción). Lo bajado queda de techo.
  const [autoAjustada, setAutoAjustada] = useState<QualityLevel | null>(null);
  // Recuperación del 3D (René, 2026-11-04): al perder el dispositivo se recrea el visor
  // (`generacion`); si se repite, se baja un nivel y ese nivel queda de techo para el modo
  // automático; si no se recupera, se pide a la persona qué hacer (`recovery.ts`).
  const [recovery, setRecovery] = useState<RecoveryState>(RECOVERY_INICIAL);
  const [generacion, setGeneracion] = useState(0);
  const [rendido, setRendido] = useState(false);
  const [avisoRecuperacion, setAvisoRecuperacion] = useState<string | null>(null);
  // Mientras el grafo nuevo se precompila (al cargar y en cada cambio de calidad o backend) se ve
  // solo el cielo: se dice en pantalla, y el modo automático no juzga fps de una escena vacía
  // (dibujaba a 400 fps y subía de media a ultra en 6 s; ADR 0102).
  const [grafoListo, setGrafoListo] = useState(false);
  // La escena ya se ve (va apareciendo objeto por objeto); el resto se precompila en segundo plano.
  // Se guarda con qué visor (calidad, backend, generación) se vio: al recrearlo vuelve el aviso.
  const [vistoEn, setVistoEn] = useState<string | null>(null);
  // La cámara «viva» (ver `SceneViewerProps.cameraLive`): el botón la escribe en el mismo clic.
  const camaraViva = useRef<CameraChoice | null>(null);
  // Backend sin prueba en vivo (René, 2026-11-04): la prueba por medición (ADR 0006) volvía a
  // crear el renderer a media reproducción. Manda lo recordado en este navegador (lo que la
  // persona eligió a mano); si no, WebGL 2 en GPU integrada y WebGPU en las demás.
  const recordado = useSyncExternalStore(noopSubscribe, readBackend, nullSnapshot);
  const backendPrevisto: Backend =
    controles.renderer === "auto" ? defaultBackendFor(gpu?.kind, recordado) : controles.renderer;
  const techoSesion = useSyncExternalStore(noopSubscribe, techoSesionSnapshot, nullSnapshot);
  useEffect(
    () => () => {
      techoLeido = undefined;
    },
    [],
  );
  // En WebGL (ANGLE sobre Metal o D3D) la compilación bloquea el hilo y alta no cabe sin
  // precompilarla en segundo plano (pendiente): el automático se queda en media (René, 2026-11-04).
  const topeBackend: QualityLevel | null = backendPrevisto === "webgl" ? "media" : null;
  const autoCalidad = clampToCeiling(
    clampToCeiling(clampToCeiling(autoAjustada ?? gpu?.level ?? "media", techoSesion), topeBackend),
    recovery.techo,
  );
  const calidad: QualityLevel = controles.calidad === "auto" ? autoCalidad : controles.calidad;
  useEffect(() => {
    updateDiagnostico({
      calidadMotivo:
        controles.calidad === "auto"
          ? `automática: inicial ${gpu?.level ?? "media"} (${gpu?.kind ?? "sin GPU"})${topeBackend ? `, tope ${topeBackend} en WebGL` : ""}${techoSesion ? `, techo de la sesión ${techoSesion}` : ""}${recovery.techo ? `, techo por recuperación ${recovery.techo}` : ""}`
          : `fija por la persona usuaria: ${controles.calidad}`,
    });
  }, [controles.calidad, gpu, recovery.techo, techoSesion, topeBackend]);
  const claveVisor = `${calidad}|${backendPrevisto}|${generacion}`;
  const marcarEnPantalla = useCallback(() => setVistoEn(claveVisor), [claveVisor]);
  const enPantalla = vistoEn === claveVisor;
  const onDeviceLost = useCallback(
    (info: DiagPerdida) => {
      const { state, action } = onLoss(recovery, performance.now(), calidad);
      setRecovery(state);
      if (action.tipo === "rendirse") {
        setRendido(true);
        setAvisoRecuperacion(null);
        return;
      }
      if (action.tipo === "bajar") {
        if (controles.calidad === "auto") setAutoAjustada(action.calidad);
        else onControl("calidad", action.calidad);
        setAvisoRecuperacion(t.bajando(action.calidad));
      } else setAvisoRecuperacion(t.recuperando(state.perdidas.length));
      updateDiagnostico({ recuperaciones: getDiagnostico().recuperaciones + 1 });
      setGeneracion((g) => g + 1);
      window.setTimeout(() => setAvisoRecuperacion(null), 6000);
      void info;
    },
    [recovery, calidad, controles.calidad, onControl, t],
  );
  const reintentar = useCallback(() => {
    setRecovery((r) => retry(r));
    setRendido(false);
    setError(null);
    updateDiagnostico({ recuperaciones: getDiagnostico().recuperaciones + 1 });
    setGeneracion((g) => g + 1);
  }, []);
  const usarMedia = useCallback(() => {
    setRecovery((r) => ({ ...retry(r), techo: "media" }));
    setAutoAjustada("media");
    if (controles.calidad !== "auto" && controles.calidad !== "media")
      onControl("calidad", "media");
    setRendido(false);
    setError(null);
    updateDiagnostico({ recuperaciones: getDiagnostico().recuperaciones + 1 });
    setGeneracion((g) => g + 1);
  }, [controles.calidad, onControl]);

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
  const clock = useMemo(() => {
    if (!dibujo) return null;
    return createClock(
      createTimeline(dibujo.t_inicio, dibujo.t_fin, dibujo.dt, {
        t: controles.t ?? dibujo.t_inicio,
        // La reproducción automática arranca cuando el grafo está precompilado (abajo), no antes:
        // reproducir mientras llegan modelos, árboles o el HDRI era regenerar sombreadores a
        // media animación (René, 2026-11-04).
        playing: false,
        loop: controles.bucle,
      }),
    );
  }, [dibujo, controles.t, controles.bucle]);
  const arrancado = useRef<ViewerClock | null>(null);
  useEffect(() => {
    if (!clock || !controles.auto || !grafoListo || !activo || arrancado.current === clock) return;
    arrancado.current = clock;
    clock.set((s) => ({ ...s, playing: true }));
  }, [clock, controles.auto, grafoListo, activo]);

  // El reloj del 3D hacia fuera (el croquis 2D de «Caso nuevo» lo sigue).
  const avisarTiempo = useRef(onTiempo);
  useEffect(() => {
    avisarTiempo.current = onTiempo;
  }, [onTiempo]);
  useEffect(() => {
    if (!clock || !dibujo) return undefined;
    avisarTiempo.current?.(clock.get().t, dibujo);
    // A lo más 4 avisos por segundo mientras reproduce (y siempre al pausar o buscar): cada
    // aviso vuelve a dibujar la página del caso (15 por segundo la dejaban a 10 fps).
    let ultimo = -Infinity;
    return clock.subscribe((st) => {
      const ahora = performance.now();
      if (st.playing && ahora - ultimo < 250) return;
      ultimo = ahora;
      avisarTiempo.current?.(st.t, dibujo);
    });
  }, [clock, dibujo]);

  // Resultado del montaje de personas (ragdolls calibrados) para el panel.
  // Lo procedural del entorno 3D (T1.3), para la leyenda.
  const [procedural, setProcedural] = useState<ProceduralSummary | null>(null);
  const [people, setPeople] = useState<{ escena: EscenaVisor; data: PeopleAttachment } | null>(
    null,
  );
  const onPeople = useCallback((data: PeopleAttachment) => setPeople({ escena, data }), [escena]);
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
  const effectiveRenderer: RendererPreference = backendPrevisto;
  useEffect(() => {
    if (controles.renderer !== "auto") saveBackend(controles.renderer);
  }, [controles.renderer]);

  // Calidad automática (René, 2026-11-04): el nivel inicial lo da la GPU (Mac e integradas,
  // media) acotado por el techo de la sesión. Si con el visor a la vista y el grafo listo los fps
  // se quedan por debajo de `LOWER_BELOW_FPS` (24) durante `CALIDAD_LENTA_MS` (5 s), baja un nivel
  // en ese momento (hasta baja; volver a preparar el dibujo cuesta un momento, pero se vuelve a
  // poder ver) y ese nivel queda de techo para la sesión. Nunca sube. Lo dice `?diag=1`.
  useEffect(() => {
    if (controles.calidad !== "auto" || !clock || !grafoListo || !activo) return undefined;
    const listoEn = performance.now();
    const id = window.setInterval(() => {
      if (window.__croquisGraphReady === false || !window.__croquisReady) return;
      // Los primeros segundos tras quedar listo no cuentan (texturas que suben, recolección).
      if (performance.now() - listoEn < CALIDAD_ASENTADA_MS) return;
      const fps = fpsEnVentana(window.__croquisPerf?.frameMs ?? [], CALIDAD_LENTA_MS);
      if (!Number.isFinite(fps)) return;
      const abajo = lowerQualityIfSlow(calidad, fps);
      if (abajo === calidad) return;
      const motivo = `automática: bajó de ${calidad} a ${abajo} (${Math.round(fps)} fps durante ${CALIDAD_LENTA_MS / 1000} s); no vuelve a subir en esta sesión`;
      marcar(`calidad automática: baja a ${abajo} (${Math.round(fps)} fps)`);
      guardarTechoSesion(abajo);
      setAutoAjustada(abajo);
      setRecovery((r) => ({ ...r, techo: abajo }));
      updateDiagnostico({ calidadMotivo: motivo });
    }, 1000);
    return () => window.clearInterval(id);
  }, [controles.calidad, clock, grafoListo, activo, calidad]);

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

  const [mode, driverId] = controles.camara.startsWith("detras-")
    ? (["detras", controles.camara.slice("detras-".length)] as const)
    : controles.camara.startsWith("conductor-")
      ? (["conductor", controles.camara.slice("conductor-".length)] as const)
      : ([controles.camara as CameraMode, undefined] as const);
  const cameraMode: CameraMode = (
    ["libre", "cenital", "conductor", "detras", "cinematica", "dano", "persona"] as const
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
    ...spec.vehiculos.map((v) => ({
      valor: `detras-${v.id}`,
      texto: t.camaras.detras(v.rol),
    })),
  ];

  const { modo } = useModoCesvi();
  const leyenda = (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[color-mix(in_srgb,var(--fondo)_72%,transparent)] px-4 py-2">
      <Legend
        // Sin semilla ni hash en la vista (René, 2026-11-03): quedan en el dictamen y las
        // exportaciones, que son la trazabilidad.
        tone="clara"
        atribucion={spec.lugar.red_vial?.atribucion}
        modelos={exportApi?.vehicleCredits}
        texto={leyendaTexto}
        procedural={procedural ?? undefined}
        limpia={modo === "presentar"}
      />
    </div>
  );
  const visor = (res: Resultado) =>
    clock ? (
      <SceneViewer
        spec={spec}
        resultado={res}
        clock={clock}
        camera={cameraMode}
        cameraLive={camaraViva}
        driverVehicleId={driverId}
        quality={calidad}
        renderer={effectiveRenderer}
        onRendererInfo={setInfo}
        onPeople={onPeople}
        onProcedural={setProcedural}
        hipotesis={ghostResults}
        onExport={setExportApi}
        ambiente={ambiente ?? undefined}
        onError={(e) => setError(`${t.sinGpu} ${e.message}`)}
        onDeviceLost={onDeviceLost}
        onGraphReady={setGrafoListo}
        onShown={marcarEnPantalla}
        activo={activo}
        generation={generacion}
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

      <div className={controles.completa ? "fixed inset-0 z-50 bg-fondo" : "grid gap-2"}>
        <div
          className={
            controles.completa
              ? "relative h-full w-full"
              : "relative h-[62vh] min-h-[360px] w-full overflow-hidden rounded-panel bg-superficie"
          }
          data-testid="marco-visor"
        >
          {error || rendido ? (
            <div
              role="alert"
              className="t-interfaz grid h-full place-items-center p-6 text-center"
              data-testid="visor-fallo"
            >
              <div className="flex flex-col items-center gap-4">
                <p>{rendido ? t.fallo3d : error}</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button type="button" className="boton" onClick={reintentar}>
                    {t.reintentar}
                  </button>
                  <button type="button" className="boton" onClick={usarMedia}>
                    {t.usarMedia}
                  </button>
                </div>
              </div>
            </div>
          ) : dibujo && clock ? (
            visor(dibujo)
          ) : (
            <div className="t-nota grid h-full place-items-center">{t.cargando}</div>
          )}
          {dibujo && clock && !error && !rendido && !enPantalla ? (
            <p
              role="status"
              className="t-nota vidrio absolute top-3 left-3 px-3 py-1 text-texto"
              data-testid="visor-preparando"
            >
              {t.preparando}
            </p>
          ) : null}
          {dibujo && clock && !error && !rendido && enPantalla && !grafoListo ? (
            <AvancePrecompilado texto={t.preparandoResto} />
          ) : null}
          {dibujo &&
          (cameraMode === "cenital" || cameraMode === "libre") &&
          (dibujo.visibilidad?.length ?? 0) > 0 ? (
            // Las líneas de visión se dibujan solo en la cenital y la libre, con su leyenda
            // (René, 2026-11-04: desde el asiento se veían como una raya suelta).
            <p
              className="t-nota vidrio pointer-events-none absolute top-3 right-3 flex items-center gap-2 px-3 py-1 text-texto"
              data-testid="leyenda-vision"
            >
              <span
                aria-hidden
                className="inline-block h-0.5 w-5"
                style={{ background: SIGHT_VISIBLE }}
              />
              {t.lineaVision}
              <span
                aria-hidden
                className="inline-block h-0.5 w-5"
                style={{ background: SIGHT_BLOCKED }}
              />
              {t.lineaTapada}
            </p>
          ) : null}
          {avisoRecuperacion ? (
            <p
              role="status"
              className="t-nota vidrio absolute top-3 left-3 px-3 py-1 text-texto"
              data-testid="visor-recuperando"
            >
              {avisoRecuperacion}
            </p>
          ) : null}
          {controles.diag ? <DiagnosticoPanel titulo={t.diagnostico} /> : null}
          {/* Las lecturas toman el resultado completo cuando llega: ΔV con su intervalo. */}
          {dibujo && clock && !error ? <Lecturas clock={clock} resultado={r ?? dibujo} /> : null}
          {leyenda}
        </div>
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
                  onClick={() => {
                    // El siguiente cuadro ya dibuja esta cámara (modo y, en la del conductor, de
                    // qué vehículo), sin esperar a React.
                    camaraViva.current = cameraFromButton(o.valor);
                    onControl("camara", o.valor);
                  }}
                  className={`boton-secundario min-h-11 px-4 ${sel ? "border-texto bg-superficie-alta" : ""}`}
                >
                  {o.texto}
                </button>
              );
            })}
          </div>
        </fieldset>
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
              {controles.renderer === "auto" ? ` · ${t.elegido(gpu?.kind ?? "")}` : ""}
            </span>
          ) : null}
        </div>
      </details>
    </div>
  );
}
