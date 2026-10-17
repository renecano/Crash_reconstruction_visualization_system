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
import { useEffect, useMemo, useRef, type ReactElement } from "react";
import {
  Color,
  CubeCamera,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SkyMesh } from "three/examples/jsm/objects/SkyMesh.js";
import { CubeRenderTarget } from "three/webgpu";
import {
  actionBounds,
  cinematicCamera,
  damageCamera,
  personCamera,
  driverCamera,
  freeCameraStart,
  overheadCamera,
  type CameraMode,
  type CameraPose,
} from "../cameras";
import type { ViewerClock } from "../clock";
import { environmentFor, type EnvironmentSettings } from "../environment";
import { PRECIPITATION_HEIGHT, precipitationParams } from "../precipitation";
import { buildPrecipitation } from "../precipitation-scene";
import { toThree } from "../coords";
import { QUALITY_PROFILES, type QualityLevel } from "../quality";
import { attachDebris } from "../debris-scene";
import { attachRollovers } from "../rollover-scene";
import { buildVisibilityOverlay, eyeHeightFor } from "../visibility-overlay";
import { sunShadowFrame } from "../shadow-frame";
import { BODY_BASE_URL, loadBodies } from "../body-assets";
import { loadEnvTextures, TEXTURE_BASE_URL, texturesWanted } from "../env-textures";
import { attachPeople, variantsFor, type PeopleAttachment } from "../people-scene";
import { buildGhostLayer, GHOST_COLORS } from "../ghosts";
import { buildSceneGraph } from "../scene-graph";
import { seatHeight } from "../vehicle-geometry";

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
  onError?: (error: Error) => void;
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
    __croquisPeople?: PeopleAttachment;
    /**
     * Interruptores de diagnóstico para las evaluaciones (`eval/`); la página nunca los pone.
     * `sombraLuna`: dibuja la sombra de la luna de noche, para medir que no se ve.
     * `texturasSinCorte`: lee las texturas del entorno a toda distancia (sin corte por mip).
     */
    __croquisDiag?: { sombraLuna?: boolean; texturasSinCorte?: boolean };
    /** `performance.now()` del primer cuadro listo (E6: tiempo hasta interactivo). */
    __croquisReadyAt?: number;
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
}: Omit<SceneViewerProps, "renderer" | "onRendererInfo" | "onError" | "className"> & {
  env: EnvironmentSettings;
}): ReactElement {
  const profile = QUALITY_PROFILES[quality];
  const graph = useMemo(
    () => buildSceneGraph(spec, resultado, { quality: profile, env }),
    [spec, resultado, profile, env],
  );
  useEffect(() => () => graph.dispose(), [graph]);
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
        if (alive) window.__croquisDebrisReady = true;
      })
      .catch((err: unknown) => {
        console.error("No se pudieron simular los restos", err);
        if (alive) window.__croquisDebrisReady = true;
      });
    return () => {
      alive = false;
    };
  }, [spec, resultado, graph]);

  // Texturas PBR del entorno (F8e): solo en calidad media y alta.
  useEffect(() => {
    let alive = true;
    window.__croquisTexturesReady = false;
    if (!texturesWanted(quality)) {
      window.__croquisTexturesReady = true;
      return undefined;
    }
    loadEnvTextures(TEXTURE_BASE_URL)
      .then((t) => {
        if (!alive) return;
        graph.applyTextures(t);
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

  // Cielo, niebla y luces.
  const lights = useMemo(() => {
    const group = new Object3D();
    const hemi = new HemisphereLight(env.ambientSkyColor, env.groundColor, env.ambientIntensity);
    const sun = new DirectionalLight(env.night ? "#b8c6ff" : "#fff4e0", env.sunIntensity);
    // Mismo marco que usa el grafo de escena para saber qué parte de la vía recibe sombra.
    const frame = sunShadowFrame(resultado, env.lightDirection);
    sun.position.copy(frame.position);
    sun.target.position.copy(frame.target);
    // De noche la luz direccional es la luna (intensidad 0.45 contra 2.8 de día) y su sombra no se
    // ve junto a los faros y el alumbrado (eval/results/e6_sombra_luna.json), pero cuesta un pase
    // de sombras completo y su muestreo en cada píxel: de noche no se calcula.
    const moonShadow = typeof window !== "undefined" && window.__croquisDiag?.sombraLuna === true;
    sun.castShadow = profile.shadows && (!env.night || moonShadow);
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
  }, [env, resultado, profile]);

  const sky = useMemo(() => {
    if (env.night) return null;
    const s = new SkyMesh();
    s.scale.setScalar(4000);
    s.turbidity.value = env.turbidity;
    s.rayleigh.value = env.turbidity > 5 ? 0.6 : 1.4;
    s.cloudSpeed.value = 0; // sin animación: capturas deterministas
    s.cloudCoverage.value = env.turbidity > 5 ? 0.8 : 0.25;
    const [dx, dy, dz] = env.lightDirection;
    s.sunPosition.value.set(dx, dz, -dy);
    return s;
  }, [env]);

  // El cielo físico (con nubes) se hornea una vez en un mapa cúbico: dibujarlo en cada cuadro
  // cuesta un cálculo por píxel que en GPU integrada no cabe en el presupuesto de E6.
  useEffect(() => {
    scene.fog = new FogExp2(env.skyColor, env.fogDensity);
    scene.background = new Color(env.skyColor);
    let target: CubeRenderTarget | null = null;
    if (sky) {
      target = new CubeRenderTarget(256);
      const cubeCamera = new CubeCamera(1, 10_000, target);
      const skyScene = new Scene();
      skyScene.add(sky);
      cubeCamera.update(gl, skyScene);
      scene.background = target.texture;
      graph.setReflections(target.texture);
    }
    return () => {
      graph.setReflections(null);
      scene.fog = null;
      scene.background = null;
      target?.dispose();
    };
  }, [scene, env, sky, gl, graph]);

  // Cámaras.
  const controls = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const persp = cam as PerspectiveCamera;
    persp.far = 5000;
    persp.near = 0.1;
    if (camera !== "libre") return undefined;
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
  }, [camera, cam, gl, resultado]);

  const driver = useMemo(() => {
    const v = resultado.vehiculos.find((x) => x.id === driverVehicleId) ?? resultado.vehiculos[0];
    if (!v) return undefined;
    // Altura del ojo del análisis de visibilidad del solver; sin él, asiento + 0.62 m.
    const eye =
      eyeHeightFor(resultado, v.id) ??
      seatHeight(v.clase, {
        length: v.dimensiones.largo_m,
        width: v.dimensiones.ancho_m,
        height: v.dimensiones.alto_m,
        wheelbase: v.dimensiones.distancia_entre_ejes_m,
      }) + 0.62;
    return { v, eye };
  }, [resultado, driverVehicleId]);

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

  useFrame((_, delta) => {
    clock.tick(Math.min(delta, 0.1), performance.now());
    const t = clock.get().t;
    graph.update(t);
    precipitation?.setTime(t);
    for (const g of ghosts) g.update(t);
    const persp = cam as PerspectiveCamera;
    if (camera === "libre") controls.current?.update();
    else if (camera === "cenital") applyPose(persp, overheadCamera(resultado));
    else if (camera === "conductor" && driver)
      applyPose(persp, driverCamera(driver.v, t, driver.eye));
    else if (camera === "cinematica") applyPose(persp, cinematicCamera(resultado, t));
    else if (camera === "dano") applyPose(persp, damageCamera(resultado, t));
    else if (camera === "persona") applyPose(persp, personCamera(resultado, t));
  });

  return (
    <>
      <primitive object={graph.root} />
      <primitive object={lights} />
      {precipitation ? <primitive object={precipitation.object} /> : null}
    </>
  );
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
      !window.__croquisTexturesReady
    )
      return;
    if (!window.__croquisReady) window.__croquisReadyAt = performance.now();
    window.__croquisReady = true;
  });
  return null;
}

export function SceneViewer(props: SceneViewerProps): ReactElement {
  const { renderer = "auto", onRendererInfo, onError, quality, className, ...rest } = props;
  const env = useMemo(
    () => environmentOf(props.spec, props.ambiente),
    [props.spec, props.ambiente],
  );
  const profile = QUALITY_PROFILES[quality];
  const backendRef = useRef<RendererInfo["backend"] | undefined>(undefined);
  const dpr =
    typeof window === "undefined"
      ? 1
      : Math.min(2, window.devicePixelRatio || 1) * profile.pixelRatio;
  return (
    <div className={className} data-testid="visor-3d">
      <Canvas
        key={`${renderer}-${quality}`}
        dpr={dpr}
        shadows={profile.shadows ? "percentage" : false}
        camera={{ fov: 45, near: 0.1, far: 5000, position: [30, 30, 30] }}
        gl={async (defaults) => {
          try {
            const { WebGPURenderer: Renderer, UnsignedByteType } = await import("three/webgpu");
            const r = new Renderer({
              canvas: defaults.canvas as HTMLCanvasElement,
              antialias: profile.antialias,
              alpha: false,
              forceWebGL: renderer === "webgl",
              // Búfer de 8 bits en baja y media: menos ancho de banda en GPU integrada (E6).
              ...(profile.level === "alta" ? {} : { outputBufferType: UnsignedByteType }),
            });
            await r.init();
            const backend = (r.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
              ? "webgpu"
              : "webgl2";
            backendRef.current = backend;
            onRendererInfo?.({ backend, preference: renderer });
            return r;
          } catch (err) {
            onError?.(err instanceof Error ? err : new Error(String(err)));
            throw err;
          }
        }}
      >
        <SceneContent {...rest} quality={quality} env={env} />
        <PerfProbe backend={() => backendRef.current} />
      </Canvas>
    </div>
  );
}
