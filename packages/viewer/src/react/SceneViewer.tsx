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
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
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
  HemisphereLight,
  Object3D,
  PointLight,
  PerspectiveCamera,
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
  cinematicCamera,
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
import { NIGHT_PIXEL_RATIO_MEDIA, QUALITY_PROFILES, type QualityLevel } from "../quality";
import {
  estimarMemoria,
  registrarError,
  registrarPerdida,
  updateDiagnostico,
  type DiagPerdida,
} from "../diagnostics";
import { recentFps } from "../backend-choice";
import { attachDebris } from "../debris-scene";
import { attachRollovers } from "../rollover-scene";
import { buildVisibilityOverlay } from "../visibility-overlay";
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
import type { ViewerExportApi } from "../export/capture";
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
  fx,
}: Omit<SceneViewerProps, "renderer" | "onRendererInfo" | "onError" | "className"> & {
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
    loadVehicleModels(clases, v as "alta" | "ligero", renderer)
      .then((models) => {
        if (alive) setLoaded({ key: modelKey, models });
      })
      .catch((err: unknown) => {
        // Sin modelos (p. ej. sin red) quedan los vehículos paramétricos.
        console.error("No se pudieron cargar los vehículos", err);
        if (alive) window.__croquisVehicleModelsReady = true;
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
  const graph = useMemo(
    () =>
      buildSceneGraph(spec, resultado, {
        quality: profile,
        env,
        vehicleModels,
        diag: {
          gravaPrevia: typeof window !== "undefined" && window.__croquisDiag?.gravaPrevia === true,
          osmSoloCalzada:
            typeof window !== "undefined" && window.__croquisDiag?.osmSoloCalzada === true,
          sinLuminarias:
            typeof window !== "undefined" && window.__croquisDiag?.sinLuminarias === true,
          sinEntorno: typeof window !== "undefined" && window.__croquisDiag?.sinEntorno === true,
          sinRelieve: typeof window !== "undefined" && window.__croquisDiag?.sinRelieve === true,
        },
      }),
    [spec, resultado, profile, env, vehicleModels],
  );
  useEffect(() => {
    if (vehicleModels) window.__croquisVehicleModelsReady = true;
  }, [vehicleModels]);
  useEffect(() => {
    onProcedural?.(graph.procedural);
  }, [graph, onProcedural]);
  // Cuántas cosas se agregaron al grafo después de armarlo (restos, personas): cada una pide
  // precompilar de nuevo (ver abajo).
  const [attachments, setAttachments] = useState(0);
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
  // Restos (piezas, vidrios, plásticos): se hornean con Rapier al cargar la escena.
  useEffect(() => {
    let alive = true;
    window.__croquisDebrisReady = false;
    Promise.all([attachDebris(spec, resultado, graph), attachRollovers(resultado, graph)])
      .then(() => {
        if (!alive) return;
        window.__croquisDebrisReady = true;
        setAttachments((n) => n + 1);
      })
      .catch((err: unknown) => {
        console.error("No se pudieron simular los restos", err);
        if (alive) window.__croquisDebrisReady = true;
      });
    return () => {
      alive = false;
    };
  }, [spec, resultado, graph]);

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

  // Personas: cuerpos de MakeHuman, ocupantes y ragdolls calibrados (se hornean al cargar).
  useEffect(() => {
    let alive = true;
    window.__croquisPeopleReady = false;
    loadBodies(variantsFor(spec), bodiesBaseUrl ?? BODY_BASE_URL)
      .then((templates) => attachPeople(spec, resultado, graph, templates))
      .then((people) => {
        if (!alive) return;
        window.__croquisPeople = people;
        onPeople?.(people);
        window.__croquisPeopleReady = true;
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
  }, [spec, resultado, graph, bodiesBaseUrl, onPeople]);

  const { scene, camera: cam, gl } = useThree();
  const advance = useThree((s) => s.advance);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
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
      captureFrame({ t, width, height } = {}) {
        const before = clock.get();
        if (t !== undefined) clock.set((st) => ({ ...seek(st, t), playing: false }));
        const canvas = gl.domElement;
        const restore =
          width !== undefined && height !== undefined ? resizeTo(width, height) : undefined;
        try {
          advance(performance.now(), true);
          const out = document.createElement("canvas");
          out.width = canvas.width;
          out.height = canvas.height;
          const ctx = out.getContext("2d");
          if (!ctx) throw new Error("No hay contexto 2D para copiar el cuadro");
          ctx.drawImage(canvas, 0, 0);
          return out;
        } finally {
          restore?.();
          if (t !== undefined) clock.set(() => before);
        }
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
    return () => onExport(null);
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
  useEffect(() => {
    if (texturesPending || treesPending) return undefined;
    let alive = true;
    window.__croquisGraphReady = compiled === graph;
    // Mientras compila, el bucle de dibujo baja a unos 10 cuadros por segundo: a cuadro libre (sin
    // vsync, como mide E6) el dibujo acaparaba la GPU y el precompilado tardaba minutos.
    setFrameloop("demand");
    const pulso = window.setInterval(() => invalidate(), 100);
    const liberar = () => {
      window.clearInterval(pulso);
      setFrameloop("always");
    };
    // `compileAsync` recoge los objetos de forma síncrona (solo los visibles y dentro del
    // encuadre) y genera sus sombreadores ahí mismo (eso sí bloquea); compila después. Durante la
    // recogida se fuerzan visibles y sin recorte por encuadre las ramas nuevas del grafo (lo que
    // aparece más tarde, como restos y personas, o queda fuera de la cámara) y se esconden las que
    // ya se compilaron: volver a generar todo el grafo al llegar las personas costaba 9 s.
    // Con otro HDRI (o al llegar), los materiales de los vehículos cambian de variante: se
    // vuelve a generar todo.
    if (compiledFor.current !== skyEnv) {
      compiledFor.current = skyEnv;
      compiledChildren.current = new WeakSet<Object3D>();
    }
    const forzados: { o: Object3D; visible: boolean; culled: boolean }[] = [];
    for (const child of graph.root.children) {
      const nuevo = !compiledChildren.current.has(child);
      child.traverse((o) => {
        forzados.push({ o, visible: o.visible, culled: o.frustumCulled });
        o.visible = nuevo;
        o.frustumCulled = false;
      });
    }
    const compilando = (gl as unknown as WebGPURenderer).compileAsync(graph.root, cam, scene);
    for (const f of forzados) {
      f.o.visible = f.visible;
      f.o.frustumCulled = f.culled;
    }
    for (const child of graph.root.children) compiledChildren.current.add(child);
    void compilando
      .catch((err: unknown) => {
        console.warn("No se pudieron precompilar los sombreadores", err);
      })
      .then(() => {
        if (!alive) return;
        liberar();
        setCompiled(graph);
      });
    return () => {
      alive = false;
      liberar();
    };
    // `compiled` solo marca la bandera: no hace falta recompilar cuando cambia. `attachments`
    // cuenta lo agregado al grafo después (restos, personas): sí recompila.
  }, [
    graph,
    gl,
    cam,
    scene,
    skyEnv,
    attachments,
    texturesPending,
    treesPending,
    setFrameloop,
    invalidate,
  ]);
  useEffect(() => {
    const prev = shown.current;
    shown.current = compiled;
    if (prev && prev !== compiled) prev.dispose();
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
    return () => {
      oc.dispose();
      controls.current = null;
    };
  }, [camera, cam, gl, resultado, guiada]);

  const driver = useMemo(() => {
    const v = resultado.vehiculos.find((x) => x.id === driverVehicleId) ?? resultado.vehiculos[0];
    if (!v) return undefined;
    return { v, eye: driverEye(resultado, v) };
  }, [resultado, driverVehicleId]);
  // Luz de relleno en la cabina (René, 2026-11-04): desde el asiento, tablero, volante y postes
  // salían negros (dentro del vehículo no llega el sol ni el cielo). Un foco puntual de corto
  // alcance en los ojos del conductor, solo con su cámara, los deja en gris oscuro.
  const cabinLight = useMemo(() => {
    const l = new PointLight(env.night ? "#ffe6c0" : "#ffffff", 0, CABIN_LIGHT_RANGE_M, 2);
    l.name = "luz_cabina";
    return l;
  }, [env.night]);
  useEffect(() => {
    cabinLight.intensity = camera === "conductor" ? (env.night ? 2.4 : 6.0) : 0;
    cabinLight.visible = camera === "conductor";
  }, [cabinLight, camera, env.night]);
  // Desde los ojos del conductor no se dibuja su propia cabeza ni la de quien va a bordo de su
  // vehículo (quedarían pegadas a la cámara); se restauran al cambiar de cámara.
  useEffect(() => {
    if (camera !== "conductor" || !driver) return undefined;
    const ocultos = graph.persons.filter(
      (p) => p.vehicleId === driver.v.id && p.mode === "a_bordo_visible",
    );
    for (const p of ocultos) p.group.visible = false;
    return () => {
      for (const p of ocultos) p.group.visible = true;
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
    overlay.setObserver(camera === "conductor" ? driver?.v.id : undefined);
  }, [overlay, camera, driver]);

  const puntoImpacto = useMemo(() => graph.root.getObjectByName("punto_impacto") ?? null, [graph]);
  const tImpacto = useMemo(() => firstImpactTime(resultado), [resultado]);
  // Cámara lenta en el contacto, solo con la cinematográfica (T1.5).
  useEffect(() => {
    clock.setWarp(camera === "cinematica" ? (t) => impactTimeWarp(t, tImpacto) : null);
    return () => clock.setWarp(null);
  }, [clock, camera, tImpacto]);
  // Transición suave entre cámaras (T1.5): la pose de donde venimos y cuándo empezó el cambio.
  const lastPose = useRef<CameraPose | null>(null);
  const transition = useRef<{ from: CameraPose; start: number } | null>(null);
  const lastMode = useRef<CameraMode>(camera);
  useEffect(() => {
    if (lastMode.current !== camera) {
      lastMode.current = camera;
      transition.current =
        lastPose.current && camera !== "libre"
          ? { from: lastPose.current, start: performance.now() }
          : null;
    }
  }, [camera]);
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
  function drawFrame(size: { width: number; height: number }, delta: number): void {
    clock.tick(Math.min(delta, 0.1), performance.now());
    const t = clock.get().t;
    // El instante que se dibuja, para las evaluaciones (`eval/t1_tirones.mjs`: qué cuadro tarda).
    window.__croquisT = t;
    graph.update(t);
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
      const pose = settle(cinematicCamera(resultado, t));
      applyPose(persp, pose);
      fx.focus = cinematicFocus(pose);
    } else if (camera === "dano") applyPose(persp, settle(damageCamera(resultado, t)));
    else if (camera === "persona") applyPose(persp, settle(personCamera(resultado, t)));
    if (camera !== "cinematica") fx.focus = null;
    fx.blur = clock.get().playing ? impactBlurWeight(t, tImpacto) : 0;
  }

  return (
    <>
      {compiled ? <primitive object={compiled.root} /> : null}
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
              ancho: size.width,
              alto: size.height,
              dpr,
              // Con postproceso los pases van sin MSAA (ADR 0102); sin él, el lienzo lleva las
              // muestras del perfil.
              msaaSamples: profile.ambientOcclusion || profile.bloom ? 0 : profile.msaaSamples,
              pasosPost:
                (profile.bloom ? 2 : 0) +
                (profile.ambientOcclusion ? 2 : 0) +
                (profile.temporalAA ? 2 : 0) +
                (profile.depthOfField ? 2 : 0) +
                (profile.motionBlur ? 1 : 0) +
                (profile.screenReflections ? 2 : 0),
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
  const dpr =
    typeof window === "undefined"
      ? 1
      : Math.min(2, window.devicePixelRatio || 1) *
        profile.pixelRatio *
        (env.night && profile.level === "media" ? NIGHT_PIXEL_RATIO_MEDIA : 1);
  useEffect(() => {
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
          <SceneContent {...rest} quality={quality} env={env} fx={fx} onDeviceLost={onDeviceLost} />
          {profile.ambientOcclusion || profile.bloom ? (
            <PostEffects profile={profile} fx={fx} />
          ) : null}
          <PerfProbe backend={() => backendRef.current} />
          <DiagProbe profile={profile} dpr={dpr} />
        </Canvas>
      </VisorErrorBoundary>
    </div>
  );
}
