"use client";
/**
 * Visor 3D (React Three Fiber v9 + three.js WebGPURenderer).
 *
 * El renderer es `WebGPURenderer`: usa WebGPU si el navegador lo ofrece y, si no, su backend
 * WebGL 2. `renderer="webgl"` fuerza el respaldo para medirlo (PLAN §7.8). Toda la escena sale
 * de `buildSceneGraph` (probado sin GPU); aquí solo se monta, se ilumina y se anima con el reloj.
 */
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { longitudM } from "@croquis/scene-schema";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Color,
  CubeCamera,
  DirectionalLight,
  FogExp2,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  HemisphereLight,
  Object3D,
  PointLight,
  RenderTarget,
  SphereGeometry,
  type Camera,
  type Light,
  type Texture,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector3,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SkyMesh } from "three/examples/jsm/objects/SkyMesh.js";
import {
  dot,
  float,
  max,
  min,
  mix,
  normalize,
  positionWorld,
  smoothstep,
  vec3,
  vec4,
} from "three/tsl";
import { CubeRenderTarget, type Node, type WebGPURenderer } from "three/webgpu";
import {
  actionBounds,
  blendPose,
  CAMERA_TRANSITION_MS,
  chooseCinematicAdjust,
  cinematicCamera,
  sameCamera,
  type CameraChoice,
  type CinematicAdjust,
  damageCamera,
  personCamera,
  driverCamera,
  driverEyeHeight,
  DRIVER_NEAR_M,
  exportCameras,
  freeCameraStart,
  overheadCamera,
  type CameraMode,
  type CameraPose,
} from "../cameras";
import type { ViewerClock } from "../clock";
import { environmentFor, type EnvironmentSettings } from "../environment";
import {
  environmentIntensityFor,
  exposureFor,
  fogColorFor,
  hdriFor,
  hdriRotationY,
  HEMISPHERE_WITH_HDRI,
} from "../sky";
import { buildNightSkyMesh, buildSkyEnvironment, type SkyEnvironment } from "../sky-scene";
import { PRECIPITATION_HEIGHT, precipitationParams } from "../precipitation";
import { buildPrecipitation } from "../precipitation-scene";
import { toThree } from "../coords";
import { QUALITY_PROFILES, type QualityLevel } from "../quality";
import { dprPara, pantallaDe } from "../dpr";
import {
  CAPA_OCULTA,
  cederHilo,
  Precompilador,
  dibujables,
  esconder,
  mostrar,
  ordenDeRevelado,
  type ContextoRender,
  type ProgresoPrecompilado,
  type RendererCompilable,
} from "../precompile";
import {
  estimarMemoria,
  marcar,
  registrarError,
  registrarPerdida,
  registrarTareaLarga,
  updateDiagnostico,
  type DiagPerdida,
} from "../diagnostics";
import { recentFps } from "../backend-choice";
import { attachDebris } from "../debris-scene";
import { attachRollovers } from "../rollover-scene";
import { buildVisibilityOverlay, TODOS_LOS_CONDUCTORES } from "../visibility-overlay";
import { sunShadowFrame } from "../shadow-frame";
import { BODY_BASE_URL, loadBodies } from "../body-assets";
import { PostEffects } from "./PostEffects";
import {
  cinematicFocus,
  impactTimeWarp,
  firstImpactTime,
  impactBlurWeight,
  newFxState,
  type FxState,
} from "../cinematic-fx";
import { loadEnvTextures, TEXTURE_BASE_URL, texturesWanted } from "../env-textures";
import { loadTreeImpostors, TREE_BASE_URL } from "../tree-impostors";
import { attachPeople, variantsFor, type PeopleAttachment } from "../people-scene";
import { buildGhostLayer, GHOST_COLORS } from "../ghosts";
import { buildCroquisPaint } from "../croquis-paint";
import {
  buildSceneGraph,
  mesh2DToGeometry,
  type ProceduralSummary,
  type SceneGraph,
} from "../scene-graph";
import type { CaptureOptions, ViewerExportApi } from "../export/capture";
import { seek } from "../timeline";
import {
  loadVehicleModels,
  modelClassesFor,
  modelVariantFor,
  type ModelClass,
  type VehicleModelTemplate,
} from "../vehicle-models";

export type RendererPreference = "auto" | "webgpu" | "webgl";

export interface RendererInfo {
  backend: "webgpu" | "webgl2";
  preference: RendererPreference;
}

export interface SceneViewerProps {
  spec: EscenaSpec;
  resultado: Resultado;
  clock: ViewerClock;
  camera: CameraMode;
  /**
   * Cámara «viva»: la escribe el botón en el mismo clic y el siguiente cuadro ya la usa, sin
   * esperar a que `camera` llegue por React (3–5 cuadros por el reconciliador de R3F; René,
   * 2026-11-04: ≤ 100 ms del clic a la respuesta). Vuelve a null cuando `camera` la alcanza.
   */
  cameraLive?: { current: CameraChoice | null };
  /** Vehículo para la cámara del conductor. */
  driverVehicleId?: string;
  quality: QualityLevel;
  renderer?: RendererPreference;
  onRendererInfo?: (info: RendererInfo) => void;
  /** No se pudo crear el renderer, o el visor lanzó al dibujar (límite de error de React). */
  onError?: (error: Error) => void;
  /**
   * Se perdió el dispositivo gráfico (WebGPU `device.lost`, WebGL `webglcontextlost`) o el ciclo
   * de dibujo falla sin parar: quien monta el visor decide recrearlo (`generation`) y con qué
   * calidad (`recovery.ts`).
   */
  onDeviceLost?: (info: DiagPerdida) => void;
  /** Sube para volver a crear el renderer y la escena (recuperación). */
  generation?: number;
  /** El grafo vigente ya está precompilado y en pantalla (false mientras se prepara). */
  onGraphReady?: (ready: boolean) => void;
  /** La escena ya se ve (sus objetos van apareciendo); el resto se precompila en segundo plano. */
  onShown?: () => void;
  /**
   * Visor activo (por omisión). Inactivo (p. ej. tapado por el mapa del caso): no dibuja cuadros
   * ni corre el reloj, pero conserva el renderer y el grafo precompilado para volver al instante.
   */
  activo?: boolean;
  className?: string;
  /** Carpeta de los cuerpos de MakeHuman (`personas.json` y los .glb). */
  bodiesBaseUrl?: string;
  /** Resultado del montaje de personas (ragdolls calibrados, indicadores). */
  onPeople?: (people: PeopleAttachment) => void;
  /** Otras reconstrucciones de la misma escena: sus vehículos se dibujan como fantasmas. */
  hipotesis?: readonly Resultado[];
  /**
   * Ambiente forzado solo en la vista (capturas de clima, ADR 0020): reemplaza lo que dice la
   * escena para dibujar, sin tocar la escena ni la reconstrucción.
   */
  ambiente?: AmbienteVisual;
  /** Recibe la API de exportación (cuadros y glTF) cuando el visor está montado; null al salir. */
  onExport?: (api: ViewerExportApi | null) => void;
  /** Lo procedural del entorno de la escena (T1.3), para la leyenda. */
  onProcedural?: (p: ProceduralSummary) => void;
  /**
   * Escena guiada desde afuera (portada, PLAN §11.3). Con ella, la cámara sigue `pose` en cada
   * cuadro (en vez del modo de `camera`), el croquis se pinta sobre el asfalto y `revelado`
   * (0 = solo la pintura, 1 = la escena 3D) levanta los vehículos y las personas desde el piso.
   * Sin ella, el visor se comporta como siempre.
   */
  guiada?: Guiada;
}

/** Control externo del visor para la portada; ver `SceneViewerProps.guiada`. */
export interface Guiada {
  pose: (t: number) => CameraPose | null;
  revelado: () => number;
  /**
   * Dónde queda en la pantalla el punto que mira la cámara, en fracciones del ancho y del alto
   * (0.5, 0.5 = el centro). Desplaza la proyección (`setViewOffset`) para que la acción quede del
   * lado contrario al texto sin girar la cámara.
   */
  centro?: () => readonly [number, number];
  /** Mostrar las marcas del choque (el punto de impacto): antes del croquis no hay evidencia. */
  marcas?: () => boolean;
  /** Color del cielo y de la niebla en lugar del que da el ambiente (sin cielo físico). */
  cielo?: string;
}

/** Ambiente que se puede forzar en la vista. */
export interface AmbienteVisual {
  clima?: string;
  iluminacion?: string;
  estadoSuperficie?: string;
  visibilidadM?: number;
}

/** Muestras de tiempo por cuadro para E6, expuestas en `window.__croquisPerf`. */
export interface PerfSample {
  frameMs: number[];
  backend?: "webgpu" | "webgl2";
  drawCalls?: number;
  triangles?: number;
}

declare global {
  interface Window {
    __croquisPerf?: PerfSample;
    __croquisReady?: boolean;
    /** Restos horneados y agregados a la escena. */
    __croquisDebrisReady?: boolean;
    /** Fantasmas de la hipótesis montados en la escena (e2e). */
    __croquisGhosts?: number;
    __croquisPeopleReady?: boolean;
    /** Texturas del entorno aplicadas (o descartadas por calidad o por error). */
    __croquisTexturesReady?: boolean;
    /** Árboles impostores cargados y puestos (T1.3b), o descartados. */
    __croquisTreesReady?: boolean;
    /** Los vehículos de Sketchfab ya están en la escena, o no se piden en esta calidad (R10). */
    __croquisVehicleModelsReady?: boolean;
    __croquisPeople?: PeopleAttachment;
    /**
     * Interruptores de diagnóstico para las evaluaciones (`eval/`); la página nunca los pone.
     * `sombraLuna`: dibuja la sombra de la luna de noche, para medir que no se ve.
     * `gravaPrevia`: las manchas de grava de antes de ADR 0036, para medir el costo del cambio.
     * `osmSoloCalzada`: la red del mapa sin rayas, banquetas ni guarniciones (antes de ADR 0039).
     */
    /** El renderer en pantalla (e2e: `__croquisGl.onDeviceLost(...)` simula una pérdida). */
    __croquisGl?: {
      onDeviceLost(info: { api: string; message?: string; reason?: string | null }): void;
    };
    __croquisDiag?: {
      sombraLuna?: boolean;
      gravaPrevia?: boolean;
      osmSoloCalzada?: boolean;
      /** T1.1: sin HDRI como luz de ambiente (queda el hemisferio), para medir su costo. */
      sinHdri?: boolean;
      /** T1.1: el HDRI sin aplicarlo a los reflejos del piso. */
      sinReflejosPiso?: boolean;
      /** T1.1: sin luminarias procedurales (ni sus focos), para medir su costo de noche. */
      sinLuminarias?: boolean;
      /** T1.2: sin texturas del entorno (colores lisos), para medir su costo en media. */
      sinTexturas?: boolean;
      /** T1.2: sin el tramado por pixel, para medir su costo. */
      sinTramado?: boolean;
      /** T1.3: sin el entorno procedural, o solo sin el relieve, para medir su costo. */
      sinEntorno?: boolean;
      sinRelieve?: boolean;
      /** T1.3b: sin árboles impostores (quedan las copas de pocas caras). */
      sinArboles?: boolean;
    };
    /** `performance.now()` del primer cuadro listo (E6: tiempo hasta interactivo). */
    __croquisReadyAt?: number;
    /** El HDRI de la luz de ambiente ya está aplicado (o no se pide en esta calidad, T1.1). */
    __croquisSkyReady?: boolean;
    /** El instante de la línea de tiempo que dibujó el último cuadro (s). */
    __croquisT?: number;
    /** `performance.now()` del primer cuadro con algo de la escena a la vista (medición de carga). */
    __croquisPrimerCuadro?: number;
    /** `performance.now()` en que todos los objetos de los vehículos quedaron revelados. */
    __croquisVehiculosEnPantalla?: number;
    /** `performance.now()` en que el renderer quedó creado e inicializado. */
    __croquisRendererListo?: number;
    /** El orden en que se revelan los objetos (medición de carga). */
    __croquisOrdenRevelado?: string[];
    /** Los controles de la cámara libre (capturas de cerca, `eval/t1_ruedas.mjs`). */
    __croquisOrbit?: OrbitControls | null;
    /** La escena de three (medición y capturas). */
    __croquisEscena?: Scene;
    /** La API de exportación del visor (pruebas: dos capturas en instantes distintos difieren). */
    __croquisExportApi?: ViewerExportApi | null;
    /** Lo que tardó cada parte de cada armado del grafo (ms). */
    __croquisArmados?: Record<string, number>[];
    /** La cámara, el grafo y el reloj del visor (e2e de cámaras: pose y cabina del conductor). */
    __croquisCamara3d?: PerspectiveCamera;
    __croquisGrafo?: SceneGraph;
    __croquisReloj?: ViewerClock;
    /** La cámara con la que se dibujó el último cuadro (respuesta a los botones de cámara). */
    __croquisCamaraDibujada?: string;
    /**
     * El grafo vigente ya está precompilado y en pantalla (T1.1). No entra en `__croquisReady`
     * (el primer cuadro listo es el paramétrico); las capturas y E6 lo esperan aparte.
     */
    __croquisGraphReady?: boolean;
  }
}

function environmentOf(spec: EscenaSpec, ambiente?: AmbienteVisual): EnvironmentSettings {
  const e = spec.entorno;
  const u = spec.lugar.ubicacion_real;
  const iluminacion = ambiente?.iluminacion ?? e.iluminacion?.valor;
  return environmentFor({
    fechaHora: ambiente?.iluminacion ? undefined : e.fecha_hora?.valor,
    iluminacion,
    clima: ambiente?.clima ?? e.clima?.valor,
    // Una iluminación forzada trae su propio alumbrado; si no, el declarado.
    alumbrado: ambiente?.iluminacion
      ? ambiente.iluminacion === "noche_con_alumbrado"
      : e.alumbrado_publico?.valor,
    lat: u?.lat,
    lon: u?.lon,
    estadoSuperficie: ambiente?.estadoSuperficie ?? spec.lugar.estado_superficie?.valor,
    visibilidadM: ambiente?.visibilidadM ?? (e.visibilidad ? longitudM(e.visibilidad) : undefined),
  });
}

function SceneContent({
  spec,
  resultado,
  clock,
  camera,
  cameraLive,
  driverVehicleId,
  quality,
  env,
  bodiesBaseUrl,
  onPeople,
  hipotesis,
  onExport,
  onProcedural,
  guiada,
  onDeviceLost,
  onGraphReady,
  onShown,
  activo = true,
  fx,
  pasos,
}: Omit<SceneViewerProps, "renderer" | "onRendererInfo" | "onError" | "className"> & {
  /** Contextos de dibujo de la posproducción (alta y ultra), para precompilar en ellos. */
  pasos: MutableRefObject<ContextoRender[]>;
  env: EnvironmentSettings;
  /** Lo que leen los efectos de cine cada cuadro (R10): desenfoque y enfoque. */
  fx: FxState;
}): ReactElement {
  const profile = QUALITY_PROFILES[quality];
  // Vehículos de Sketchfab (R10, ADR 0086): la escena se arma de inmediato con los paramétricos y se
  // vuelve a armar con los modelos cuando llegan (versión completa en alta y ultra, ligera en media).
  const renderer = useThree((s) => s.gl);
  const variant = modelVariantFor(quality);
  const modelKey = useMemo(
    () => `${variant}|${modelClassesFor(resultado.vehiculos.map((v) => v.clase)).join(",")}`,
    [variant, resultado],
  );
  const [loaded, setLoaded] = useState<{
    key: string;
    models: ReadonlyMap<ModelClass, VehicleModelTemplate>;
  } | null>(null);
  useEffect(() => {
    const [v, list] = modelKey.split("|") as [string, string];
    const clases = list ? (list.split(",") as ModelClass[]) : [];
    if (v === "null" || clases.length === 0) {
      window.__croquisVehicleModelsReady = true;
      return undefined;
    }
    let alive = true;
    window.__croquisVehicleModelsReady = false;
    marcar("cargando los modelos de los vehículos");
    loadVehicleModels(clases, v as "alta" | "ligero", renderer)
      .then((models) => {
        if (alive) {
          marcar("llegaron los modelos de los vehículos");
          setLoaded({ key: modelKey, models });
        }
      })
      .catch((err: unknown) => {
        // Sin modelos (p. ej. sin red) quedan los vehículos paramétricos: el grafo se arma sin
        // ellos (si no, el precompilado los esperaba para siempre).
        console.error("No se pudieron cargar los vehículos", err);
        if (alive) {
          window.__croquisVehicleModelsReady = true;
          setLoaded({ key: modelKey, models: new Map() });
        }
      });
    return () => {
      alive = false;
    };
  }, [modelKey, renderer]);
  // Al cambiar entre la versión completa y la ligera (el modo automático sube y baja de calidad según
  // los fps), se quedan los modelos que ya están hasta que llegan los nuevos: volver a los
  // paramétricos mientras tanto se veía como autos que se vuelven cajas. En baja, paramétricos.
  const vehicleModels =
    loaded?.key === modelKey ? loaded.models : variant !== null ? loaded?.models : undefined;
  // Mientras se esperan los modelos de los vehículos, el grafo paramétrico va sin entorno
  // (fachadas, árboles, mobiliario): se arma en una fracción del tiempo y se desecha al llegar
  // los modelos; armarlo completo (≈1 s de hilo principal) solo retrasaba la llegada de los
  // modelos (René, 2026-11-04: ver algo en ≤ 5 s).
  const esperandoModelos = variant !== null && !vehicleModels;
  const graph = useMemo(() => {
    marcar(
      vehicleModels
        ? "armando el grafo (con modelos)"
        : esperandoModelos
          ? "armando el grafo provisional (sin entorno)"
          : "armando el grafo",
    );
    return buildSceneGraph(spec, resultado, {
      quality: profile,
      env,
      vehicleModels,
      // El provisional nunca se muestra: sin daño ni desgaste. El definitivo arma el daño de cada
      // vehículo en una tarea aparte (abajo), antes de precompilar.
      provisional: esperandoModelos,
      diferirDanos: !esperandoModelos,
      diag: {
        gravaPrevia: typeof window !== "undefined" && window.__croquisDiag?.gravaPrevia === true,
        osmSoloCalzada:
          typeof window !== "undefined" && window.__croquisDiag?.osmSoloCalzada === true,
        sinLuminarias:
          typeof window !== "undefined" && window.__croquisDiag?.sinLuminarias === true,
        sinEntorno:
          esperandoModelos ||
          (typeof window !== "undefined" && window.__croquisDiag?.sinEntorno === true),
        sinRelieve: typeof window !== "undefined" && window.__croquisDiag?.sinRelieve === true,
      },
    });
  }, [spec, resultado, profile, env, vehicleModels, esperandoModelos]);
  useEffect(() => {
    if (vehicleModels) window.__croquisVehicleModelsReady = true;
  }, [vehicleModels]);
  // El daño de los vehículos, un vehículo por tarea (René, 2026-11-04: armarlo junto con el grafo
  // era una tarea de 0.3–0.6 s «sin marca»). Restos, personas y el precompilado lo esperan.
  const [danosListos, setDanosListos] = useState<SceneGraph | null>(null);
  useEffect(() => {
    if (graph.pasosPendientes === 0) {
      setDanosListos(graph);
      return undefined;
    }
    let alive = true;
    void (async () => {
      while (alive && graph.pasosPendientes > 0) {
        await cederHilo();
        if (!alive) return;
        marcar(`armando: ${graph.siguientePaso ?? ""}`);
        graph.aplicarPaso();
      }
      if (alive) setDanosListos(graph);
    })();
    return () => {
      alive = false;
    };
  }, [graph]);
  const danosPendientes = danosListos !== graph;
  useEffect(() => {
    onProcedural?.(graph.procedural);
  }, [graph, onProcedural]);
  useEffect(() => {
    const partes = Object.entries(graph.tiempos).sort((a, b) => b[1] - a[1]);
    const total = partes.reduce((a, [, ms]) => a + ms, 0);
    updateDiagnostico({
      armado: `${total} ms: ${partes
        .slice(0, 4)
        .map(([n, ms]) => `${n} ${ms}`)
        .join(", ")}`,
    });
    window.__croquisArmados = [...(window.__croquisArmados ?? []), { ...graph.tiempos }];
  }, [graph]);
  // Cuántas cosas se agregaron al grafo después de armarlo (restos, personas): cada una pide
  // precompilar de nuevo (ver abajo). Lo nuevo se esconde en el acto: entre llegar y el efecto
  // que lo precompila cabía un cuadro real, que compilaba sus programas en el hilo principal
  // (los restos: 400 ms).
  const [attachments, setAttachments] = useState(0);
  const esconderLoNuevo = (g: SceneGraph): void => {
    if (visibleRef.current !== g) return;
    for (const c of g.root.children) if (!compiledChildren.current.has(c)) esconder(c);
  };
  // El grafo al que ya se le aplicaron las texturas: el precompilado lo espera, porque cambiar
  // los materiales después obligaba a compilar de nuevo en el hilo principal (T1.2).
  const [texturedGraph, setTexturedGraph] = useState<SceneGraph | null>(null);
  /** El grafo al que ya se le pusieron (o descartaron) los árboles impostores (T1.3b). */
  const [treedGraph, setTreedGraph] = useState<SceneGraph | null>(null);
  // Hipótesis: fantasmas translúcidos con el mismo reloj que la escena.
  const ghosts = useMemo(
    () =>
      (hipotesis ?? []).map((h, i) => buildGhostLayer(h, GHOST_COLORS[i % GHOST_COLORS.length])),
    [hipotesis],
  );
  useEffect(() => {
    for (const g of ghosts) graph.root.add(g.group);
    window.__croquisGhosts = ghosts.reduce((n, g) => n + g.group.children.length, 0);
    return () => {
      for (const g of ghosts) {
        graph.root.remove(g.group);
        g.dispose();
      }
      window.__croquisGhosts = 0;
    };
  }, [graph, ghosts]);
  // Restos (piezas, vidrios, plásticos): se hornean con Rapier al cargar la escena. Llegan a una
  // rama escondida y se compilan en segundo plano (René, 2026-11-04). Solo sobre el grafo con los
  // modelos ya puestos: hornearlos sobre el paramétrico (1–2 s de hilo principal) era trabajo
  // tirado que además retrasaba la llegada de los modelos.
  const modelsPending = variant !== null && loaded?.key !== modelKey;
  useEffect(() => {
    if (modelsPending || danosPendientes) return undefined;
    let alive = true;
    window.__croquisDebrisReady = false;
    marcar("horneando los restos");
    Promise.all([attachDebris(spec, resultado, graph), attachRollovers(resultado, graph)])
      .then(() => {
        if (!alive) return;
        window.__croquisDebrisReady = true;
        marcar("llegaron los restos");
        esconderLoNuevo(graph);
        setAttachments((n) => n + 1);
      })
      .catch((err: unknown) => {
        console.error("No se pudieron simular los restos", err);
        if (alive) window.__croquisDebrisReady = true;
      });
    return () => {
      alive = false;
    };
  }, [spec, resultado, graph, modelsPending, danosPendientes]);

  // Árboles impostores (T1.3b): en media, alta y ultra (baja conserva las copas de pocas caras).
  useEffect(() => {
    let alive = true;
    window.__croquisTreesReady = false;
    if (quality === "baja" || window.__croquisDiag?.sinArboles === true) {
      window.__croquisTreesReady = true;
      setTreedGraph(graph);
      return undefined;
    }
    loadTreeImpostors(TREE_BASE_URL, fetch)
      .then((set) => {
        if (!alive) return;
        marcar("poniendo los árboles impostores");
        graph.applyTreeImpostors(set);
        setTreedGraph(graph);
        window.__croquisTreesReady = true;
      })
      .catch((err: unknown) => {
        console.error("No se pudieron cargar los árboles", err);
        if (alive) {
          setTreedGraph(graph);
          window.__croquisTreesReady = true;
        }
      });
    return () => {
      alive = false;
    };
  }, [graph, quality]);

  // Texturas PBR del entorno (F8e): solo en calidad media y alta.
  useEffect(() => {
    let alive = true;
    window.__croquisTexturesReady = false;
    if (!texturesWanted(quality) || window.__croquisDiag?.sinTexturas === true) {
      window.__croquisTexturesReady = true;
      return undefined;
    }
    loadEnvTextures(TEXTURE_BASE_URL, fetch, undefined, graph.wantedTextures)
      .then((t) => {
        if (!alive) return;
        marcar("aplicando las texturas del entorno");
        graph.applyTextures(t);
        setTexturedGraph(graph);
        window.__croquisTexturesReady = true;
      })
      .catch((err: unknown) => {
        // Sin texturas (p. ej. sin red) quedan los colores lisos.
        console.error("No se pudieron cargar las texturas", err);
        if (alive) window.__croquisTexturesReady = true;
      });
    return () => {
      alive = false;
    };
  }, [graph, quality]);

  // Personas: cuerpos de MakeHuman, ocupantes y ragdolls calibrados (se hornean al cargar), solo
  // sobre el grafo con los modelos (ver los restos).
  useEffect(() => {
    if (modelsPending || danosPendientes) return undefined;
    let alive = true;
    window.__croquisPeopleReady = false;
    loadBodies(variantsFor(spec), bodiesBaseUrl ?? BODY_BASE_URL)
      .then((templates) => {
        marcar("horneando las personas");
        return attachPeople(spec, resultado, graph, templates);
      })
      .then((people) => {
        if (!alive) return;
        window.__croquisPeople = people;
        onPeople?.(people);
        window.__croquisPeopleReady = true;
        marcar("llegaron las personas");
        esconderLoNuevo(graph);
        setAttachments((n) => n + 1);
      })
      .catch((err: unknown) => {
        // Sin cuerpos (p. ej. sin red) quedan los maniquíes del grafo de escena.
        console.error("No se pudieron cargar los cuerpos", err);
        if (alive) window.__croquisPeopleReady = true;
      });
    return () => {
      alive = false;
    };
  }, [spec, resultado, graph, bodiesBaseUrl, onPeople, modelsPending, danosPendientes]);

  const { scene, camera: cam, gl } = useThree();
  const advance = useThree((s) => s.advance);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const size = useThree((s) => s.size);

  // Exportación (F9): dibuja un instante a demanda y copia el cuadro en la misma tarea, antes de
  // que el navegador presente el lienzo (sirve igual con WebGPU y con WebGL 2).
  useEffect(() => {
    if (!onExport) return undefined;
    const persp = cam as PerspectiveCamera;
    /** Cambia el tamaño del lienzo (relación de píxeles 1) y devuelve cómo restaurarlo. */
    const resizeTo = (width: number, height: number) => {
      const ratio = gl.getPixelRatio();
      gl.setPixelRatio(1);
      gl.setSize(width, height, false);
      persp.aspect = width / height;
      persp.updateProjectionMatrix();
      return () => {
        gl.setPixelRatio(ratio);
        gl.setSize(size.width, size.height, false);
        persp.aspect = size.width / size.height;
        persp.updateProjectionMatrix();
      };
    };
    const drawAt = (t: number) => {
      clock.set((st) => ({ ...seek(st, t), playing: false }));
      advance(performance.now(), true);
    };
    /** Dibuja el instante con la cámara y los marcadores pedidos `cuadros` veces y copia el último. */
    const capturar = (
      { t, width, height, camara: camaraFoto, sinInterfaz }: CaptureOptions,
      cuadros: number,
    ): HTMLCanvasElement => {
      const before = clock.get();
      if (t !== undefined) clock.set((st) => ({ ...seek(st, t), playing: false }));
      const canvas = gl.domElement;
      const restore =
        width !== undefined && height !== undefined ? resizeTo(width, height) : undefined;
      // Lo que todavía está escondido por el precompilado progresivo (ADR 0104) sale en la foto:
      // se revela solo para este cuadro (si falta compilar, compila aquí; la foto manda).
      const escondidos: Object3D[] = [];
      graph.root.traverse((o) => {
        if (o.layers.mask === 2 ** CAPA_OCULTA) {
          escondidos.push(o);
          o.layers.set(0);
        }
      });
      // Sin marcadores de interfaz (anillo del impacto, visión, indicadores de contacto).
      const ocultos: Object3D[] = [];
      if (sinInterfaz) {
        scene.traverse((o) => {
          if (o.userData.interfaz === true && o.visible) {
            ocultos.push(o);
            o.visible = false;
          }
        });
      }
      // La cámara de la foto, sin transición; después vuelve la del visor tal como estaba.
      const eleccionPrevia = lastChoice.current;
      const transicionPrevia = transition.current;
      const posePrevia = lastPose.current;
      if (camaraFoto) {
        camaraCaptura.current = {
          modo: camaraFoto,
          conductor: camaraFoto === "conductor" ? driver?.v.id : undefined,
        };
        lastChoice.current = camaraCaptura.current;
        transition.current = null;
      }
      try {
        for (let k = 0; k < cuadros; k++) advance(performance.now(), true);
        const out = document.createElement("canvas");
        out.width = canvas.width;
        out.height = canvas.height;
        const ctx = out.getContext("2d");
        if (!ctx) throw new Error("No hay contexto 2D para copiar el cuadro");
        ctx.drawImage(canvas, 0, 0);
        return out;
      } finally {
        for (const o of escondidos) o.layers.set(CAPA_OCULTA);
        for (const o of ocultos) o.visible = true;
        if (camaraFoto) {
          camaraCaptura.current = null;
          lastChoice.current = eleccionPrevia;
          transition.current = transicionPrevia;
          lastPose.current = posePrevia;
        }
        restore?.();
        if (t !== undefined) clock.set(() => before);
      }
    };
    const api: ViewerExportApi = {
      tStart: resultado.t_inicio,
      tEnd: resultado.t_fin,
      vehicleCredits: graph.vehicleCredits,
      async captureSequence(times, { width, height }, onFrame, signal) {
        const before = clock.get();
        const restore = resizeTo(width, height);
        try {
          for (let i = 0; i < times.length; i++) {
            if (signal?.aborted) throw new DOMException("Exportación cancelada", "AbortError");
            drawAt(times[i]!);
            await onFrame(gl.domElement, i);
          }
        } finally {
          restore();
          clock.set(() => before);
        }
      },
      captureFrame({ t, width, height, camara: camaraFoto, sinInterfaz } = {}) {
        return capturar({ t, width, height, camara: camaraFoto, sinInterfaz }, 1);
      },
      async captureFrameReady({ esperaMs = 60_000, ...opts } = {}) {
        // Listo: grafo precompilado (modelos, texturas, árboles, HDRI, daño y lo que llegó
        // después). Si tarda más de `esperaMs`, la foto sale con lo que haya.
        // Oculto (el mapa del caso lo tapa), el visor no dibuja y el precompilado, que revela por
        // lotes entre cuadros, se queda a medias: mientras la foto lo espera, dibuja. En una
        // máquina lenta el dictamen esperaba así hasta 3 × 60 s (CI, 2026-11-05).
        const despertar = !activoRef.current && window.__croquisGraphReady !== true;
        if (despertar) setFrameloop("always");
        try {
          const desde = performance.now();
          while (window.__croquisGraphReady !== true && performance.now() - desde < esperaMs) {
            await new Promise((r) => setTimeout(r, 100));
          }
        } finally {
          if (despertar && !activoRef.current) setFrameloop("never");
        }
        // Dos cuadros: el primero pone al día sombras y texturas del instante; el segundo se copia.
        return capturar(opts, 2);
      },
      // GLTFExporter y SkeletonUtils se cargan solo al exportar (no pesan en la carga del visor).
      exportGlb: async (legend) => {
        const { exportSceneGlb, ambienteDe } = await import("../export/gltf");
        // Las cámaras del visor y su ambiente, para el video cinematográfico en Blender (R11).
        return exportSceneGlb(graph, {
          resultado,
          legend,
          vehicleCredits: graph.vehicleCredits,
          cameras: exportCameras(resultado, (v) =>
            driverEye(
              resultado,
              resultado.vehiculos.find((x) => x.id === v.id)!,
            ),
          ),
          ambiente: ambienteDe(env),
          // La cámara lenta del visor viaja al video (T1.5).
          timeWarp: (t) => impactTimeWarp(t, firstImpactTime(resultado)),
        });
      },
    };
    onExport(api);
    window.__croquisExportApi = api;
    window.__croquisEscena = scene;
    window.__croquisCamara3d = cam as PerspectiveCamera;
    window.__croquisGrafo = graph;
    window.__croquisReloj = clock;
    return () => {
      onExport(null);
      window.__croquisExportApi = null;
    };
  }, [onExport, resultado, clock, cam, gl, advance, size, graph, env]);

  // Cielo, niebla y luces.
  // La luz de ambiente sale del HDRI (T1.1, ADR 0094) salvo en baja, que sigue con el hemisferio.
  const ibl =
    profile.level !== "baja" &&
    !(typeof window !== "undefined" && window.__croquisDiag?.sinHdri === true);
  // En media el HDRI solo ilumina a los vehículos (pintura, vidrio, cromo): sobre toda la escena
  // (el pasto y la calzada llenan la pantalla) costaba 7 ms por cuadro en la GPU integrada y la
  // mediana caía de 82 a 51 fps (ADR 0094 §7). Alta y ultra lo aplican a toda la escena.
  const iblScene = ibl && profile.level !== "media";
  const lights = useMemo(() => {
    const group = new Object3D();
    const hemi = new HemisphereLight(
      env.ambientSkyColor,
      env.groundColor,
      env.ambientIntensity * (ibl && iblScene ? HEMISPHERE_WITH_HDRI : 1),
    );
    const sun = new DirectionalLight(env.night ? "#b8c6ff" : "#fff4e0", env.sunIntensity);
    // Mismo marco que usa el grafo de escena para saber qué parte de la vía recibe sombra.
    const frame = sunShadowFrame(resultado, env.lightDirection);
    sun.position.copy(frame.position);
    sun.target.position.copy(frame.target);
    // De noche la luz direccional es la luna (intensidad 0.45 contra 2.8 de día). Su sombra no se ve
    // junto a los faros y el alumbrado (eval/results/e6_sombra_luna.json) pero cuesta un pase de
    // sombras completo: baja y media no la calculan; alta y ultra sí (ADR 0026: no se recortan).
    const forcedMoon = typeof window !== "undefined" && window.__croquisDiag?.sombraLuna === true;
    sun.castShadow = profile.shadows && (!env.night || profile.moonShadow || forcedMoon);
    sun.shadow.camera.left = -frame.extent;
    sun.shadow.camera.right = frame.extent;
    sun.shadow.camera.top = frame.extent;
    sun.shadow.camera.bottom = -frame.extent;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 400;
    sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
    sun.shadow.bias = -0.0004;
    group.add(hemi, sun, sun.target);
    return group;
  }, [env, resultado, profile, ibl, iblScene]);

  // El cielo visible es procedural: Preetham de día; de noche, el domo con estrellas (T1.1).
  const sky = useMemo(() => {
    if (env.night) return buildNightSkyMesh(env.streetLights);
    const s = new SkyMesh();
    s.scale.setScalar(4000);
    s.turbidity.value = env.turbidity;
    // Más Rayleigh y menos Mie (T1.3c): el cielo bajo, que es lo que ve la cámara a nivel de calle,
    // salía casi blanco; así conserva el azul y el gradiente hasta cerca del horizonte.
    s.rayleigh.value = env.turbidity > 5 ? 0.6 : 3.0;
    s.mieCoefficient.value = env.turbidity > 5 ? 0.005 : 0.0015;
    s.cloudSpeed.value = 0; // sin animación: capturas deterministas
    // Nubes con huecos y gradiente también en lo nublado (T1.3b): 0.8 daba un cielo blanco plano.
    s.cloudCoverage.value = env.turbidity > 5 ? 0.58 : 0.44;
    // Nubes más bajas (T1.3c): desde la calle se ve el cielo cerca del horizonte, donde con la
    // elevación por omisión (0.5) no había ninguna.
    s.cloudElevation.value = env.turbidity > 5 ? 0.4 : 0.22;
    const [dx, dy, dz] = env.lightDirection;
    s.sunPosition.value.set(dx, dz, -dy);
    // La franja baja del cielo (lo que ve la cámara a nivel de calle) se oscurece hasta
    // `SKY_HORIZON_DIM` en el horizonte (T1.3c): el modelo de Preetham la da casi blanca y se
    // perdían el gradiente y las nubes; la niebla toma un color acorde (`fogColorFor`).
    const mat = s.material as unknown as { colorNode: Node<"vec4"> | null };
    if (mat.colorNode) {
      const elev = normalize(positionWorld).y;
      const dim = mix(
        float(SKY_HORIZON_DIM),
        float(SKY_ZENITH_DIM),
        smoothstep(float(-0.02), float(0.45), elev),
      );
      // Y un tope de luminancia que conserva el tono: cerca del horizonte el modelo da más de
      // diez veces el blanco del mapeo tonal y cualquier factor seguía recortándose a blanco.
      const rgb = mat.colorNode.rgb.mul(dim);
      const lum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      const cap = mix(
        float(SKY_LUM_CAP_HORIZON),
        float(SKY_LUM_CAP),
        smoothstep(float(-0.02), float(0.4), elev),
      );
      const k = min(float(1), cap.div(max(lum, float(1e-4))));
      mat.colorNode = vec4(rgb.mul(k), mat.colorNode.a);
    }
    return s;
  }, [env]);

  // El cielo físico (con nubes) se hornea una vez en un mapa cúbico: dibujarlo en cada cuadro
  // cuesta un cálculo por píxel que en GPU integrada no cabe en el presupuesto de E6.
  useEffect(() => {
    const cielo = guiada?.cielo ?? env.skyColor;
    // La niebla toma el color del horizonte (perspectiva aérea), no el del cenit.
    scene.fog = new FogExp2(guiada?.cielo ?? fogColorFor(env), env.fogDensity);
    scene.background = new Color(cielo);
    let target: CubeRenderTarget | null = null;
    if (sky) {
      // 512 por cara (T1.3b): a 256 las estrellas y los bordes de las nubes salían como manchas
      // desde la cámara a nivel de calle.
      target = new CubeRenderTarget(512);
      const cubeCamera = new CubeCamera(1, 10_000, target);
      const skyScene = new Scene();
      skyScene.add(sky);
      marcar("horneando el cielo");
      cubeCamera.update(gl, skyScene);
      scene.background = target.texture;
      // Sin HDRI (baja), el cielo horneado da los reflejos del piso mojado.
      if (!ibl) graph.setReflections(target.texture);
    }
    return () => {
      if (!ibl) graph.setReflections(null);
      scene.fog = null;
      scene.background = null;
      target?.dispose();
    };
  }, [scene, env, sky, gl, graph, guiada?.cielo, ibl]);

  // Luz de ambiente y reflejos del HDRI prefiltrado, girado hacia el sol calculado (T1.1). Se
  // prefiltra una vez por cielo (el nombre, no el objeto `env`: un efecto que dependiera de `env` y
  // cambiara estado volvía a prefiltrar en cada render y el visor se iba a 12 fps); aplicarlo al
  // grafo va aparte, porque el grafo se rearma cuando llegan los modelos de los vehículos.
  const hdri = hdriFor(env);
  const [skyEnv, setSkyEnv] = useState<SkyEnvironment | null>(null);
  useEffect(() => {
    if (!ibl) {
      window.__croquisSkyReady = true;
      return undefined;
    }
    window.__croquisSkyReady = false;
    let alive = true;
    let current: SkyEnvironment | null = null;
    buildSkyEnvironment(gl as unknown as WebGPURenderer, hdri)
      .then((e) => {
        if (!alive) {
          e.dispose();
          return;
        }
        current = e;
        marcar("llegó el HDRI del cielo");
        setSkyEnv(e);
        window.__croquisSkyReady = true;
      })
      .catch((err: unknown) => {
        // Sin HDRI (p. ej. sin red) queda la luz de hemisferio.
        console.error("No se pudo cargar el HDRI del cielo", err);
        if (alive) window.__croquisSkyReady = true;
      });
    return () => {
      alive = false;
      setSkyEnv(null);
      current?.dispose();
    };
  }, [gl, hdri, ibl]);
  const envIntensity = skyEnv ? environmentIntensityFor(env, skyEnv.meanLuminance) : 1;
  const envRotationY = skyEnv ? hdriRotationY(env.sun.azimuth, skyEnv.sunAzimuthDeg) : 0;
  useEffect(() => {
    if (!skyEnv) return undefined;
    if (iblScene) {
      scene.environment = skyEnv.texture;
      scene.environmentIntensity = envIntensity;
      scene.environmentRotation.set(0, envRotationY, 0);
    } else {
      graph.setVehicleEnvironment(skyEnv.texture, envIntensity, envRotationY);
    }
    if (window.__croquisDiag?.sinReflejosPiso !== true) graph.setReflections(skyEnv.texture);
    // El prefiltrado del HDRI (PMREM) lo hace three al compilar el primer material que lo usa:
    // ~1.4 s de hilo principal en la laptop de referencia, que caían en el primer cuadro. Se
    // provoca aquí, mientras todavía se esperan los modelos (René, 2026-11-04).
    calentarHdri(gl as unknown as WebGPURenderer, cam, skyEnv.texture);
    return () => {
      scene.environment = null;
      scene.environmentIntensity = 1;
      scene.environmentRotation.set(0, 0, 0);
      graph.setVehicleEnvironment(null, 1, 0);
      graph.setReflections(null);
    };
  }, [scene, graph, skyEnv, envIntensity, envRotationY, iblScene]);

  // Los sombreadores de un grafo nuevo (p. ej. al llegar los modelos de los vehículos, con decenas
  // de materiales) se compilan antes de mostrarlo. Dibujarlos sin compilar los compila en el
  // momento, en el hilo principal: con la luz de ambiente del HDRI eran hasta 15 s de tirones en la
  // GPU integrada (`eval/t1_tirones.mjs`). `compileAsync` los compila en segundo plano.
  // Mientras compila, sigue en pantalla el grafo anterior (p. ej. los paramétricos hasta que
  // llegan los modelos); el anterior se desecha cuando el nuevo lo reemplaza, no antes.
  const [compiled, setCompiled] = useState<SceneGraph | null>(null);
  /** El grafo en pantalla: desde que lo visible está compilado, antes de que todo esté listo. */
  const [visibleGraph, setVisibleGraph] = useState<SceneGraph | null>(null);
  const shown = useRef<SceneGraph | null>(null);
  /** Ramas del grafo (hijos de `root`) cuyos sombreadores ya se generaron, y con qué HDRI. */
  const compiledChildren = useRef(new WeakSet<Object3D>());
  const compiledFor = useRef<SkyEnvironment | null>(null);
  const texturesPending =
    texturesWanted(quality) &&
    !(typeof window !== "undefined" && window.__croquisDiag?.sinTexturas === true) &&
    texturedGraph !== graph;
  // Los árboles impostores también se esperan: así el precompilado los incluye (T1.3b).
  const treesPending = treedGraph !== graph;
  // Y los modelos de los vehículos y el HDRI (René, 2026-11-04): con cada llegada se regeneraban
  // todos los sombreadores en el hilo principal (hasta 2 s de congelamiento durante la
  // reproducción). Los restos y las personas no se esperan: llegan a una rama escondida y se
  // compilan en segundo plano (abajo).
  const skyPending = ibl && skyEnv === null;
  const todoPendiente =
    texturesPending || treesPending || modelsPending || skyPending || danosPendientes;
  const activoRef = useRef(activo);
  activoRef.current = activo;
  /** El grafo que está en pantalla (se monta escondido y se revela objeto por objeto). */
  const visibleRef = useRef<SceneGraph | null>(null);
  /** Cuántos objetos del grafo ya se revelaron (el primer cuadro «con algo» se mide con esto). */
  const revelados = useRef(0);
  /** Trabajo de precompilado en serie: nunca dos `compileAsync` a la vez sobre el renderer. */
  const cola = useRef<Promise<void>>(Promise.resolve());
  const contextos = useCallback(
    (): readonly ContextoRender[] => (pasos.current.length ? pasos.current : [SIN_POSPROCESO]),
    [pasos],
  );
  // Las luces que proyectan sombra viven en `lights` (el foco de la cabina no proyecta).
  const lucesDeEscena = useCallback((): Light[] => {
    const out: Light[] = [];
    lights.traverse((o) => {
      if ((o as Light).isLight) out.push(o as Light);
    });
    return out;
  }, [lights]);
  const progreso = (p: ProgresoPrecompilado): void => {
    updateDiagnostico({ precompilado: `${p.etapa} ${p.hechos}/${p.total}` });
  };
  useEffect(() => {
    window.__croquisGraphReady = false;
  }, []);
  // Precompilado progresivo (René, 2026-11-04; `../precompile`): en cuanto están la base del
  // grafo, los modelos, las texturas, los árboles y el HDRI, el grafo se monta con todos sus
  // objetos escondidos (`CAPA_OCULTA`) y se compilan uno por uno, cediendo el hilo, en orden de
  // revelado (lo grande que ve la cámara, los vehículos, el resto): cada objeto aparece en cuanto
  // sus programas (incluido el de sombras) están listos. Al terminar, el grafo queda «listo» y
  // arranca la reproducción automática. Si cambia el HDRI (cambia la variante de todos los
  // materiales), se esconde todo y se vuelve a compilar y revelar.
  useEffect(() => {
    if (todoPendiente) return undefined;
    const enPantalla = visibleRef.current === graph;
    if (enPantalla && compiledFor.current === skyEnv) return undefined;
    let alive = true;
    const pre = new Precompilador(
      gl as unknown as RendererCompilable,
      scene,
      cam,
      contextos,
      progreso,
    );
    setCompiled(null);
    window.__croquisGraphReady = false;
    const base = [...graph.root.children];
    const luces = lucesDeEscena();
    const deVehiculo = new Set<Object3D>();
    for (const v of graph.vehicles) v.group.traverse((o) => deVehiculo.add(o));
    const todos = base.flatMap((c) => dibujables(c));
    for (const o of todos) o.layers.set(CAPA_OCULTA);
    compiledFor.current = skyEnv;
    compiledChildren.current = new WeakSet<Object3D>(base);
    if (!enPantalla) {
      visibleRef.current = graph;
      revelados.current = 0;
      setVisibleGraph(graph);
    }
    setFrameloop(activoRef.current ? "always" : "never");
    cola.current = cola.current.then(async () => {
      if (!alive) return;
      try {
        marcar(enPantalla ? "nuevo HDRI: precompilando de nuevo" : "precompilando y revelando");
        // Matrices al día antes de decidir qué cae en el encuadre: el grafo aún no está en la
        // escena (React lo monta después del efecto) y sin esto todo quedaba «fuera».
        graph.root.updateMatrixWorld(true);
        (cam as PerspectiveCamera).updateProjectionMatrix();
        poseCamara(clock.get().t);
        const orden = ordenDeRevelado(todos, cam, (o) => deVehiculo.has(o));
        window.__croquisOrdenRevelado = orden.map((o) => o.name || o.type);
        let faltanVehiculos = orden.filter((o) => deVehiculo.has(o)).length;
        await pre.todo(orden, {
          etapa: "revelado",
          sombras: !enPantalla,
          sombrasDespues: true,
          luces,
          revelar: (o) => {
            o.layers.set(0);
            revelados.current++;
            if (
              deVehiculo.has(o) &&
              --faltanVehiculos === 0 &&
              !window.__croquisVehiculosEnPantalla
            )
              window.__croquisVehiculosEnPantalla = performance.now();
          },
        });
        if (!alive) return;
        updateDiagnostico({ precompilado: "listo" });
        setCompiled(graph);
      } catch (err) {
        registrarError("renderer", err);
        if (!alive) return;
        // Sin precompilado (p. ej. API no disponible): se muestra todo y compila al dibujar.
        for (const o of todos) o.layers.set(0);
        setCompiled(graph);
      }
    });
    return () => {
      alive = false;
      pre.cancelar();
    };
    // `visibleGraph` y `attachments` no van aquí: lo que llega después lo compila el efecto de
    // abajo sin volver a empezar.
  }, [graph, gl, cam, scene, skyEnv, todoPendiente, contextos, lucesDeEscena, setFrameloop]);
  // Lo que se agrega al grafo cuando ya está en pantalla (restos, personas, fantasmas): se esconde
  // en `CAPA_OCULTA`, se compila en segundo plano (programas y sombras) y se revela al terminar.
  useEffect(() => {
    if (visibleGraph !== graph) return undefined;
    const nuevas = graph.root.children.filter((c) => !compiledChildren.current.has(c));
    if (nuevas.length === 0) return undefined;
    let alive = true;
    const pre = new Precompilador(
      gl as unknown as RendererCompilable,
      scene,
      cam,
      contextos,
      progreso,
    );
    setCompiled(null);
    window.__croquisGraphReady = false;
    for (const c of nuevas) esconder(c);
    const luces = lucesDeEscena();
    cola.current = cola.current.then(async () => {
      if (!alive) return;
      try {
        marcar(`precompilando lo que llegó (${nuevas.map((c) => c.name || "rama").join(", ")})`);
        const objs = nuevas.flatMap((c) => dibujables(c));
        await pre.todo(objs, { etapa: "llegado", sombras: true, luces });
        if (!alive) return;
      } catch (err) {
        registrarError("renderer", err);
        if (!alive) return;
      }
      for (const c of nuevas) {
        mostrar(c);
        compiledChildren.current.add(c);
      }
      updateDiagnostico({ precompilado: "listo" });
      setCompiled(graph);
    });
    return () => {
      alive = false;
      pre.cancelar();
      for (const c of nuevas) mostrar(c);
    };
  }, [graph, visibleGraph, attachments, gl, cam, scene, contextos, lucesDeEscena]);
  // Inactivo: ni cuadros ni reloj (el mapa del caso lo tapa); activo: vuelve a dibujar.
  useEffect(() => {
    if (activo) {
      setFrameloop("always");
      return undefined;
    }
    setFrameloop("never");
    clock.set((s) => (s.playing ? { ...s, playing: false } : s));
    return undefined;
  }, [activo, setFrameloop, clock]);
  useEffect(() => {
    const prev = shown.current;
    shown.current = visibleGraph;
    if (prev && prev !== visibleGraph) prev.dispose();
    if (visibleGraph) onShown?.();
  }, [visibleGraph, onShown]);
  useEffect(() => {
    window.__croquisGraphReady = compiled === graph;
    onGraphReady?.(compiled === graph);
  }, [compiled, graph, onGraphReady]);
  // Al desmontar se desecha lo que quedó en pantalla (y el grafo nuevo, si era otro).
  useEffect(
    () => () => {
      shown.current?.dispose();
      shown.current = null;
    },
    [],
  );

  // Exposición por escena (T1.1): el tone mapping es el mismo; de noche la cámara abre.
  useEffect(() => {
    gl.toneMappingExposure = exposureFor(env);
    return () => {
      gl.toneMappingExposure = 1;
    };
  }, [gl, env]);

  // Cámaras.
  const controls = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const persp = cam as PerspectiveCamera;
    persp.far = 5000;
    // En los ojos del conductor el plano cercano es corto: el tablero y el parabrisas están a
    // menos de 1 m (René, 2026-11-04).
    persp.near = camera === "conductor" ? DRIVER_NEAR_M : 0.1;
    persp.updateProjectionMatrix();
    if (camera !== "libre" || guiada) return undefined;
    const start = freeCameraStart(resultado);
    applyPose(persp, start);
    const oc = new OrbitControls(persp, gl.domElement);
    oc.target.set(...start.target);
    oc.maxPolarAngle = Math.PI / 2 - 0.03;
    oc.enableDamping = true;
    oc.update();
    controls.current = oc;
    window.__croquisOrbit = oc;
    return () => {
      oc.dispose();
      controls.current = null;
      window.__croquisOrbit = null;
    };
  }, [camera, cam, gl, resultado, guiada]);

  const conductores = useMemo(
    () => new Map(resultado.vehiculos.map((v) => [v.id, { v, eye: driverEye(resultado, v) }])),
    [resultado],
  );
  const driver = useMemo(
    () =>
      (driverVehicleId ? conductores.get(driverVehicleId) : undefined) ??
      conductores.values().next().value,
    [conductores, driverVehicleId],
  );
  // Luz de relleno en la cabina (René, 2026-11-04): desde el asiento, tablero, volante y postes
  // salían negros (dentro del vehículo no llega el sol ni el cielo). Un foco puntual de corto
  // alcance en los ojos del conductor, solo con su cámara, los deja en gris oscuro.
  const cabinLight = useMemo(() => {
    const l = new PointLight(env.night ? "#ffe6c0" : "#ffffff", 0, CABIN_LIGHT_RANGE_M, 2);
    l.name = "luz_cabina";
    return l;
  }, [env.night]);
  useEffect(() => {
    // Siempre visible: quitar o poner una luz cambia el número de luces y regenera todos los
    // sombreadores (un tirón de cientos de ms al cambiar de cámara); con intensidad 0 no pesa.
    cabinLight.intensity = camera === "conductor" ? (env.night ? 2.4 : 6.0) : 0;
  }, [cabinLight, camera, env.night]);
  // Desde los ojos del conductor no se dibuja su propia cabeza ni la de quien va a bordo de su
  // vehículo (quedarían pegadas a la cámara); se restauran al cambiar de cámara.
  useEffect(() => {
    marcar(`cambio de cámara → ${camera}${camera === "conductor" ? ` ${driver?.v.id ?? ""}` : ""}`);
    // La cámara viva ya no hace falta: la propiedad la alcanzó.
    const vivo = cameraLive?.current;
    if (
      cameraLive &&
      vivo &&
      sameCamera(vivo, {
        modo: camera,
        conductor: camera === "conductor" ? driver?.v.id : undefined,
      })
    )
      cameraLive.current = null;
    if (camera !== "conductor" || !driver) return undefined;
    const ocultos = graph.persons.filter(
      (p) => p.vehicleId === driver.v.id && p.mode === "a_bordo_visible",
    );
    for (const p of ocultos) p.group.visible = false;
    // Ni la bolsa de aire del propio vehículo (René, 2026-11-04: tapaba medio tablero tras el
    // impacto); las de los demás vehículos y las demás cámaras la siguen viendo.
    const bolsas: Object3D[] = [];
    graph.vehicles
      .find((v) => v.id === driver.v.id)
      ?.group.traverse((o) => {
        if (o.name.startsWith("bolsa_")) bolsas.push(o);
      });
    for (const b of bolsas) b.visible = false;
    return () => {
      for (const p of ocultos) p.group.visible = true;
      for (const b of bolsas) b.visible = true;
    };
  }, [camera, driver, graph]);

  // El croquis pintado sobre el asfalto (solo en la escena guiada de la portada).
  const pintura = useMemo(() => {
    if (!guiada) return null;
    const p = buildCroquisPaint(resultado);
    const group = new Group();
    group.name = "croquis_pintado";
    const blanco = new MeshBasicMaterial({
      color: "#F4F2EC",
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const naranja = new MeshBasicMaterial({
      color: "#FF6A13",
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const geoLineas = mesh2DToGeometry(p.lines, 0.03);
    const geoImpacto = mesh2DToGeometry(p.impact, 0.035);
    group.add(new Mesh(geoLineas, blanco), new Mesh(geoImpacto, naranja));
    group.renderOrder = 3;
    return {
      group,
      setOpacity(o: number) {
        blanco.opacity = o;
        naranja.opacity = o;
        group.visible = o > 0.001;
      },
      dispose() {
        geoLineas.dispose();
        geoImpacto.dispose();
        blanco.dispose();
        naranja.dispose();
      },
    };
  }, [guiada, resultado]);
  useEffect(() => {
    if (!pintura) return undefined;
    graph.root.add(pintura.group);
    return () => {
      graph.root.remove(pintura.group);
      pintura.dispose();
    };
  }, [graph, pintura]);

  // Lluvia y granizo (F8a): caja centrada en la acción, partículas según el nivel de calidad.
  const precipitation = useMemo(() => {
    const params = precipitationParams(env.precipitation, quality);
    if (!params) return null;
    const b = actionBounds(resultado);
    const [cx, , cz] = toThree(b.cx, b.cy, 0);
    const half = Math.min(45, Math.max(20, 0.6 * b.size));
    return buildPrecipitation(
      params,
      { cx, cz, half, height: PRECIPITATION_HEIGHT },
      spec.meta.semilla,
      env.night,
    );
  }, [env, quality, resultado, spec.meta.semilla]);
  useEffect(() => () => precipitation?.dispose(), [precipitation]);

  // Líneas de vista del conductor (solo en su cámara).
  const overlay = useMemo(() => buildVisibilityOverlay(resultado, graph), [resultado, graph]);
  useEffect(() => () => overlay.dispose(), [overlay]);
  useEffect(() => {
    overlay.setObserver(
      camera === "cenital" || camera === "libre" ? TODOS_LOS_CONDUCTORES : undefined,
    );
  }, [overlay, camera]);

  const puntoImpacto = useMemo(() => graph.root.getObjectByName("punto_impacto") ?? null, [graph]);
  const tImpacto = useMemo(() => firstImpactTime(resultado), [resultado]);
  // Cámara lenta en el contacto, solo con la cinematográfica (T1.5).
  useEffect(() => {
    clock.setWarp(camera === "cinematica" ? (t) => impactTimeWarp(t, tImpacto) : null);
    return () => clock.setWarp(null);
  }, [clock, camera, tImpacto]);
  // Transición suave entre cámaras (T1.5): la pose de donde venimos y cuándo empezó el cambio.
  const lastPose = useRef<CameraPose | null>(null);
  const driverProp = driver;
  // Ajuste de la cinematográfica para que nada quede entre ella y el impacto (se calcula una vez,
  // con el grafo listo; abajo).
  const ajusteCine = useRef<CinematicAdjust | undefined>(undefined);
  useEffect(() => {
    if (compiled !== graph) return undefined;
    let alive = true;
    void cederHilo().then(() => {
      if (!alive) return;
      ajusteCine.current = ajusteSinObstaculos(graph, resultado);
      const a = ajusteCine.current;
      marcar(
        `cinematográfica: ${Math.round((a.dAz * 180) / Math.PI)}° de giro y ${a.dH} m más alta para ver el impacto`,
      );
    });
    return () => {
      alive = false;
    };
  }, [compiled, graph, resultado]);
  const transition = useRef<{ from: CameraPose; start: number } | null>(null);
  /** La cámara de una foto en curso (`captureFrame` con `camara`); null fuera de una foto. */
  const camaraCaptura = useRef<CameraChoice | null>(null);
  /** La última cámara dibujada (modo y conductor): al cambiar empieza la transición. */
  const lastChoice = useRef<CameraChoice | null>(null);
  const settle = (pose: CameraPose): CameraPose => {
    const tr = transition.current;
    if (!tr) {
      lastPose.current = pose;
      return pose;
    }
    const k = (performance.now() - tr.start) / CAMERA_TRANSITION_MS;
    if (k >= 1) {
      transition.current = null;
      lastPose.current = pose;
      return pose;
    }
    const mixed = blendPose(tr.from, pose, k);
    lastPose.current = mixed;
    return mixed;
  };

  const frameErrors = useRef({ seguidos: 0, ultimoAviso: 0 });
  useFrame((state, delta) => {
    try {
      drawFrame(state.size, delta);
      frameErrors.current.seguidos = 0;
    } catch (err) {
      // Se registra en el diagnóstico (a lo más uno por segundo) y, si no para, se trata como
      // una pérdida del visor para que quien lo monta lo recree (René, 2026-11-04).
      const fe = frameErrors.current;
      fe.seguidos += 1;
      const now = performance.now();
      if (now - fe.ultimoAviso > 1000) {
        fe.ultimoAviso = now;
        registrarError("dibujo", err);
      }
      if (fe.seguidos === FRAME_ERRORS_BEFORE_LOSS) {
        onDeviceLost?.(
          registrarPerdida({
            api: "dibujo",
            message: err instanceof Error ? err.message : String(err),
            reason: "excepcion_en_el_ciclo_de_dibujo",
          }),
        );
      }
    }
  });
  /** Coloca la cámara del modo vigente en el instante `t` (también antes del primer cuadro). */
  /** La cámara que se dibuja: la de una foto, la viva (el clic, en el mismo cuadro) o la de la propiedad. */
  const camaraViva = (): CameraChoice =>
    camaraCaptura.current ??
    cameraLive?.current ?? {
      modo: camera,
      conductor: camera === "conductor" ? driver?.v.id : undefined,
    };
  function poseCamara(t: number): void {
    const eleccion = camaraViva();
    const camera = eleccion.modo;
    const driver =
      (eleccion.conductor ? conductores.get(eleccion.conductor) : undefined) ?? driverProp;
    const previa = lastChoice.current;
    if (!previa || !sameCamera(previa, eleccion)) {
      lastChoice.current = eleccion;
      transition.current =
        previa && lastPose.current && camera !== "libre"
          ? { from: lastPose.current, start: performance.now() }
          : null;
      // El plano cercano de la cámara del conductor va con el cuadro, no con React.
      const p = cam as PerspectiveCamera;
      const near = camera === "conductor" ? DRIVER_NEAR_M : 0.1;
      if (p.near !== near) {
        p.near = near;
        p.updateProjectionMatrix();
      }
    }
    const persp = cam as PerspectiveCamera;
    if (camera === "libre") {
      controls.current?.update();
      lastPose.current = {
        position: [persp.position.x, persp.position.y, persp.position.z],
        target: controls.current
          ? [controls.current.target.x, controls.current.target.y, controls.current.target.z]
          : [0, 0, 0],
        fov: persp.fov,
        up: [persp.up.x, persp.up.y, persp.up.z],
      };
    } else if (camera === "cenital") applyPose(persp, settle(overheadCamera(resultado)));
    else if (camera === "conductor" && driver) {
      const pose = settle(driverCamera(driver.v, t, driver.eye));
      applyPose(persp, pose);
      // El foco va con los ojos, un poco más arriba y atrás (ilumina tablero y postes de frente).
      cabinLight.position.set(pose.position[0], pose.position[1] + 0.15, pose.position[2]);
    } else if (camera === "cinematica") {
      const pose = settle(cinematicCamera(resultado, t, undefined, ajusteCine.current));
      applyPose(persp, pose);
      fx.focus = cinematicFocus(pose);
    } else if (camera === "dano") applyPose(persp, settle(damageCamera(resultado, t)));
    else if (camera === "persona") applyPose(persp, settle(personCamera(resultado, t)));
    if (camera !== "cinematica") fx.focus = null;
  }
  const tPrevio = useRef<number | null>(null);
  function drawFrame(size: { width: number; height: number }, delta: number): void {
    clock.tick(Math.min(delta, 0.1), performance.now());
    const t = clock.get().t;
    const prev = tPrevio.current;
    tPrevio.current = t;
    if (prev !== null) {
      const ti = tImpacto ?? 0;
      if (prev < ti && t >= ti) marcar("impacto (t = 0)");
      else if (t < prev - 1) marcar("reinicio del bucle");
    }
    // El instante que se dibuja, para las evaluaciones (`eval/t1_tirones.mjs`: qué cuadro tarda).
    window.__croquisT = t;
    const e = camaraViva();
    window.__croquisCamaraDibujada = e.modo === "conductor" ? `conductor-${e.conductor}` : e.modo;
    const primero = prev === null;
    if (primero) marcar("primer cuadro: update del grafo");
    if (
      window.__croquisPrimerCuadro === undefined &&
      shown.current === graph &&
      revelados.current > 0 &&
      activoRef.current
    )
      window.__croquisPrimerCuadro = performance.now();
    graph.update(t);
    if (primero) marcar("primer cuadro: lo demás");
    if (shown.current && shown.current !== graph) shown.current.update(t);
    precipitation?.setTime(t);
    for (const g of ghosts) g.update(t);
    const persp = cam as PerspectiveCamera;
    if (guiada) {
      // Revelado: la escena se levanta desde la pintura (después de colocarla en el instante t).
      const r = Math.min(1, Math.max(0, guiada.revelado()));
      const sy = Math.max(1e-3, r);
      // Aplastados del todo no se dibujan: la pintura del croquis queda sola sobre el asfalto.
      for (const v of graph.vehicles) {
        v.group.scale.y = sy;
        v.group.visible = r > 0.02;
      }
      for (const p of graph.persons) {
        p.group.scale.y = sy;
        // Respeta a quien va oculto a bordo (scene-graph decide su visibilidad por modo).
        p.group.visible = r > 0.02 && (p.mode === "trayectoria" || p.mode === "a_bordo_visible");
      }
      pintura?.setOpacity(1 - r);
      // La lluvia cae en vertical: vista desde arriba se confunde con la pintura del croquis.
      if (precipitation) precipitation.object.visible = r > 0.98;
      if (puntoImpacto && guiada.marcas) puntoImpacto.visible = guiada.marcas();
      const pose = guiada.pose(t);
      if (pose) {
        applyPose(persp, pose);
        const [cx, cy] = guiada.centro?.() ?? [0.5, 0.5];
        const { width: w, height: h } = size;
        if (Math.abs(cx - 0.5) < 1e-3 && Math.abs(cy - 0.5) < 1e-3) {
          if (persp.view?.enabled) persp.clearViewOffset();
        } else {
          // Una imagen virtual más ancha (o más alta) con el punto en su centro, de la que se
          // muestra la ventana donde ese punto cae en (cx, cy).
          const fw = w * (1 + 2 * Math.abs(cx - 0.5));
          const fh = h * (1 + 2 * Math.abs(cy - 0.5));
          persp.setViewOffset(fw, fh, cx > 0.5 ? 0 : fw - w, cy > 0.5 ? 0 : fh - h, w, h);
        }
        return;
      }
    }
    poseCamara(t);
    fx.blur = clock.get().playing ? impactBlurWeight(t, tImpacto) : 0;
  }

  return (
    <>
      {visibleGraph ? <primitive object={visibleGraph.root} /> : null}
      <primitive object={lights} />
      {precipitation ? <primitive object={precipitation.object} /> : null}
      <primitive object={cabinLight} />
    </>
  );
}

/**
 * Altura del ojo de la cámara del conductor: por clase (`driverEyeHeight`, ADR 0102). A la altura
 * del análisis de visibilidad (1.08 m, AASHTO) el tablero de los modelos ocupaba media pantalla y
 * en una pickup el ojo quedaba bajo el cofre (capturas `docs/cesvi/t1/conductor/`).
 */
function driverEye(_resultado: Resultado, v: Resultado["vehiculos"][number]): number {
  return driverEyeHeight(v.clase, v.dimensiones.alto_m);
}

function applyPose(cam: PerspectiveCamera, pose: CameraPose): void {
  cam.position.set(...pose.position);
  cam.up.set(...pose.up);
  if (cam.fov !== pose.fov) {
    cam.fov = pose.fov;
    cam.updateProjectionMatrix();
  }
  cam.lookAt(new Vector3(...pose.target));
}

function PerfProbe({ backend }: { backend: () => RendererInfo["backend"] | undefined }): null {
  const { gl } = useThree();
  const last = useRef<number | null>(null);
  useEffect(() => {
    window.__croquisPerf = { frameMs: [] };
    return () => {
      window.__croquisPerf = undefined;
      window.__croquisReady = false;
    };
  }, []);
  useFrame(() => {
    const now = performance.now();
    const perf = window.__croquisPerf;
    if (!perf) return;
    if (last.current !== null) {
      perf.frameMs.push(now - last.current);
      if (perf.frameMs.length > 4000) perf.frameMs.splice(0, perf.frameMs.length - 4000);
    }
    last.current = now;
    perf.backend = backend();
    // Contadores del cuadro anterior: el reinicio automático se desactiva y se reinicia aquí.
    const info = (
      gl as unknown as {
        info?: {
          autoReset?: boolean;
          reset?: () => void;
          render?: { drawCalls?: number; triangles?: number };
        };
      }
    ).info;
    if (info) {
      info.autoReset = false;
      perf.drawCalls = info.render?.drawCalls;
      perf.triangles = info.render?.triangles;
      info.reset?.();
    }
    if (
      !window.__croquisDebrisReady ||
      !window.__croquisPeopleReady ||
      !window.__croquisTexturesReady ||
      window.__croquisSkyReady === false
    )
      return;
    if (!window.__croquisReady) window.__croquisReadyAt = performance.now();
    window.__croquisReady = true;
  });
  return null;
}

/** Errores seguidos del ciclo de dibujo que cuentan como pérdida del visor. */
const FRAME_ERRORS_BEFORE_LOSS = 30;
/** Alcance del foco de relleno de la cabina (m): la cabina y nada más. */
const CABIN_LIGHT_RANGE_M = 2.6;
/**
 * Factor del cielo de día en el horizonte y de 20° de elevación hacia arriba (ver el horneado del
 * cielo): el cielo de Preetham sale más brillante que el blanco del mapeo tonal y se recortaba a
 * blanco; así conserva el azul, el gradiente y las nubes.
 */
const SKY_HORIZON_DIM = 0.5;
const SKY_ZENITH_DIM = 0.85;
/**
 * Luminancia máxima del cielo horneado (lineal, antes de la exposición) en el horizonte y de 24°
 * hacia arriba, ver `SKY_HORIZON_DIM`: así el cielo bajo queda azul claro y sube hacia el cenit.
 */
const SKY_LUM_CAP_HORIZON = 0.4;
const SKY_LUM_CAP = 0.8;

/**
 * Límite de error del visor: lo que lance React al montar o actualizar la escena no deja la
 * página en blanco; se registra en el diagnóstico y se avisa a quien monta el visor.
 */
class VisorErrorBoundary extends Component<
  { onError?: (error: Error) => void; children: ReactNode },
  { fallo: boolean }
> {
  override state = { fallo: false };
  static getDerivedStateFromError(): { fallo: boolean } {
    return { fallo: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    registrarError("react", error);
    if (info.componentStack) registrarError("react", new Error(info.componentStack.trim()));
    this.props.onError?.(error);
  }
  override render(): ReactNode {
    return this.state.fallo ? null : this.props.children;
  }
}

/** Qué GPU hay detrás del renderer: `adapterInfo` de WebGPU o la cadena de WebGL 2. */
function adapterName(r: WebGPURenderer): string | null {
  const backend = r.backend as {
    device?: {
      adapterInfo?: {
        vendor?: string;
        architecture?: string;
        device?: string;
        description?: string;
      };
    };
    gl?: WebGL2RenderingContext;
  };
  const info = backend.device?.adapterInfo;
  if (info) {
    const partes = [info.vendor, info.architecture, info.device, info.description].filter(
      (x): x is string => typeof x === "string" && x.length > 0,
    );
    if (partes.length) return partes.join(" · ");
  }
  const gl = backend.gl;
  if (gl) {
    try {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const name: unknown = ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
      if (typeof name === "string") return name;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Lleva el diagnóstico (`?diag=1`): fps cada segundo, memoria estimada cada 4 s, y desecha el
 * renderer al desmontar (R3F no lo hace; con cada cambio de calidad se creaba otro).
 */
/** Lo que no tapa la vista aunque esté entre la cámara y el impacto (el piso y lo de la acción). */
const NO_TAPA =
  /^(suelo|cerros|calzada|rayas|banqueta|guarnicion|marcas|evidencia|perfil_urbano|matas|punto_impacto|restos|vidrios|pieza_|charco|cebo|vista_|objetivo_|oclusor|indicadores)/;

/**
 * El ajuste de la cámara cinematográfica (giro de la órbita y altura) con la vista despejada al
 * impacto un segundo antes, en el impacto y un segundo después (René, 2026-11-04: el poste del
 * semáforo de lateral_interseccion tapaba el impacto). Rayo de la cámara al punto de impacto a
 * 1 m de altura contra todo lo que no es piso ni parte de la acción.
 */
function ajusteSinObstaculos(graph: SceneGraph, resultado: Resultado): CinematicAdjust {
  const deAccion = new Set<Object3D>();
  for (const v of graph.vehicles) v.group.traverse((o) => deAccion.add(o));
  for (const p of graph.persons) p.group.traverse((o) => deAccion.add(o));
  graph.root.updateMatrixWorld(true);
  const obstaculos: Object3D[] = [];
  graph.root.traverse((o) => {
    if (!(o as Mesh).isMesh || deAccion.has(o) || NO_TAPA.test(o.name) || !o.visible) return;
    obstaculos.push(o);
  });
  const ray = new Raycaster();
  const desde = new Vector3();
  const hacia = new Vector3();
  const objetivo = (t: number, a: CinematicAdjust): Vector3 => {
    const pi = resultado.punto_impacto;
    if (pi) return hacia.set(...toThree(pi.x, pi.y, 1.0));
    return hacia.set(...cinematicCamera(resultado, t, undefined, a).target);
  };
  return chooseCinematicAdjust([-1, 0, 1], (a, t) => {
    const pose = cinematicCamera(resultado, t, undefined, a);
    desde.set(...pose.position);
    const dir = objetivo(t, a).clone().sub(desde);
    const largo = dir.length();
    if (largo < 1e-3) return true;
    ray.set(desde, dir.normalize());
    ray.near = 0;
    // El último metro es el impacto mismo.
    ray.far = Math.max(0, largo - 1.0);
    return ray.intersectObjects(obstaculos, false).length === 0;
  });
}

/** Contexto de dibujo directo (sin posproducción): el renderer elige su destino. */
const SIN_POSPROCESO: ContextoRender = { renderTarget: null, mrt: null };

/**
 * Un cuadro a 8 × 8 con una esfera metálica que refleja el HDRI: three genera el PMREM del cielo
 * ahora (síncrono) y lo reutiliza para todos los materiales que lo usen después.
 */
function calentarHdri(r: WebGPURenderer, camera: Camera, texture: Texture): void {
  const s = new Scene();
  const m = new Mesh(
    new SphereGeometry(0.1, 8, 6),
    new MeshStandardMaterial({ envMap: texture, metalness: 1, roughness: 0.3 }),
  );
  m.frustumCulled = false;
  s.add(m);
  const rt = new RenderTarget(8, 8);
  marcar("prefiltrando el HDRI (PMREM)");
  try {
    r.setRenderTarget(rt);
    r.render(s, camera);
  } catch (err) {
    registrarError("renderer", err);
  } finally {
    r.setRenderTarget(null);
    rt.dispose();
    m.geometry.dispose();
    m.material.dispose();
  }
}

function LongTaskProbe(): null {
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return undefined;
    let po: PerformanceObserver | null = null;
    try {
      po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) registrarTareaLarga(e.duration, e.startTime);
      });
      po.observe({ type: "longtask" });
    } catch {
      po = null;
    }
    return () => po?.disconnect();
  }, []);
  return null;
}

function DiagProbe({
  profile,
  dpr,
}: {
  profile: (typeof QUALITY_PROFILES)[QualityLevel];
  dpr: number;
}): null {
  const { gl, scene, size } = useThree();
  useEffect(() => {
    let tick = 0;
    const id = window.setInterval(() => {
      tick += 1;
      const fps = recentFps(window.__croquisPerf?.frameMs ?? [], 60);
      const cambio: Parameters<typeof updateDiagnostico>[0] = {
        fps: Number.isFinite(fps) ? Math.round(fps) : null,
        lienzo: [Math.round(size.width * dpr), Math.round(size.height * dpr)],
      };
      if (tick % 4 === 1) {
        try {
          cambio.memoria = estimarMemoria(
            scene,
            {
              ...pantallaDe(profile.level, size.width, size.height, dpr),
              shadowMapSize: profile.shadowMapSize,
              spotShadowMapSize: profile.spotShadowMapSize,
              spotShadows: profile.spotShadowMapSize > 0 ? 4 : 0,
            },
            gl,
          );
        } catch (err) {
          registrarError("ventana", err);
        }
      }
      updateDiagnostico(cambio);
    }, 1000);
    return () => window.clearInterval(id);
  }, [gl, scene, size, dpr, profile]);
  useEffect(
    () => () => {
      try {
        (gl as unknown as { dispose?: () => void }).dispose?.();
      } catch (err) {
        registrarError("renderer", err);
      }
    },
    [gl],
  );
  return null;
}

export function SceneViewer(props: SceneViewerProps): ReactElement {
  const {
    renderer = "auto",
    onRendererInfo,
    onError,
    onDeviceLost,
    generation = 0,
    quality,
    className,
    ...rest
  } = props;
  const env = useMemo(
    () => environmentOf(props.spec, props.ambiente),
    [props.spec, props.ambiente],
  );
  const profile = QUALITY_PROFILES[quality];
  const backendRef = useRef<RendererInfo["backend"] | undefined>(undefined);
  const fx = useMemo(newFxState, []);
  const pasos = useRef<ContextoRender[]>([]);
  // dpr por nivel y memoria de pantalla (`../dpr`; René, 2026-11-04: en la M1 salía dpr 3).
  const dpr =
    typeof window === "undefined"
      ? 1
      : dprPara(quality, window.devicePixelRatio || 1, window.innerWidth, window.innerHeight, {
          noche: env.night,
        });
  useEffect(() => {
    marcar(`montaje del visor (${quality}, ${renderer})`);
    updateDiagnostico({ calidad: quality, preferencia: renderer, dpr, generacion: generation });
  }, [quality, renderer, dpr, generation]);
  return (
    <div className={className} data-testid="visor-3d">
      <VisorErrorBoundary onError={onError}>
        <Canvas
          key={`${renderer}-${quality}-${generation}`}
          dpr={dpr}
          shadows={profile.shadows ? "percentage" : false}
          camera={{ fov: 45, near: 0.1, far: 5000, position: [30, 30, 30] }}
          gl={async (defaults) => {
            try {
              const { WebGPURenderer: Renderer, UnsignedByteType } = await import("three/webgpu");
              const r = new Renderer({
                canvas: defaults.canvas as HTMLCanvasElement,
                antialias: profile.msaaSamples > 0,
                ...(profile.msaaSamples > 0 ? { samples: profile.msaaSamples } : {}),
                alpha: false,
                forceWebGL: renderer === "webgl",
                // Búfer de 8 bits en baja y media: menos ancho de banda en GPU integrada (E6).
                ...(profile.level === "baja" || profile.level === "media"
                  ? { outputBufferType: UnsignedByteType }
                  : {}),
              });
              await r.init();
              window.__croquisRendererListo = performance.now();
              const backend = (r.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
                ? "webgpu"
                : "webgl2";
              backendRef.current = backend;
              // Pérdida del dispositivo (WebGPU `device.lost`, WebGL `webglcontextlost`): three deja
              // de dibujar; aquí se registra y se avisa para recrear el visor (René, 2026-11-04).
              const rr = r as unknown as {
                onDeviceLost: (info: {
                  api: string;
                  message?: string;
                  reason?: string | null;
                }) => void;
                onError?: (info: { api: string; type?: string; message?: string }) => void;
              };
              rr.onDeviceLost = (info) => {
                onDeviceLost?.(registrarPerdida(info));
              };
              rr.onError = (info) => {
                registrarError(
                  "gpu",
                  new Error(`${info.api} ${info.type ?? ""}: ${info.message ?? ""}`),
                );
              };
              updateDiagnostico({ backend, preferencia: renderer, adaptador: adapterName(r) });
              // Para las pruebas (simular una pérdida) y el diagnóstico desde la consola.
              window.__croquisGl = rr;
              onRendererInfo?.({ backend, preference: renderer });
              return r;
            } catch (err) {
              registrarError("renderer", err);
              onError?.(err instanceof Error ? err : new Error(String(err)));
              throw err;
            }
          }}
        >
          <SceneContent
            {...rest}
            quality={quality}
            env={env}
            fx={fx}
            pasos={pasos}
            onDeviceLost={onDeviceLost}
          />
          {profile.ambientOcclusion || profile.bloom ? (
            <PostEffects profile={profile} fx={fx} pasos={pasos} />
          ) : null}
          <PerfProbe backend={() => backendRef.current} />
          <DiagProbe profile={profile} dpr={dpr} />
          <LongTaskProbe />
        </Canvas>
      </VisorErrorBoundary>
    </div>
  );
}
