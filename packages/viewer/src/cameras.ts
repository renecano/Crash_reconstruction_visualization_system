/**
 * Cámaras predefinidas del visor (PLAN §7.5): libre, cenital, vista de cada conductor y
 * cinematográfica automática. Funciones puras: dado el resultado del solver y el tiempo t,
 * devuelven posición, objetivo y campo de visión en coordenadas de three.js.
 */
import { toThree, type Vec3 } from "./coords";
import { samplePerson, sampleVehicle, type PersonTrackData, type VehicleTrack } from "./sample";

export type CameraMode = "libre" | "cenital" | "conductor" | "cinematica" | "dano" | "persona";

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  /** Campo de visión vertical (grados). */
  fov: number;
  /** Vector "arriba" en three.js. */
  up: Vec3;
}

export interface CameraVehicle {
  id: string;
  clase?: string;
  rol: string;
  involucrado: boolean;
  dimensiones: {
    largo_m: number;
    ancho_m: number;
    alto_m: number;
    distancia_entre_ejes_m?: number;
  };
  trayectoria: VehicleTrack;
  dano?: { perfil_m: readonly number[]; cdc?: { lado: string } };
}

export interface CameraScene {
  t_inicio: number;
  t_fin: number;
  eventos?: readonly { tipo: string }[];
  punto_impacto?: { x: number; y: number };
  vehiculos: readonly CameraVehicle[];
  personas?: readonly { id: string; trayectoria: PersonTrackData; proyeccion?: unknown }[];
}

/** Ventana de tiempo alrededor del impacto que se encuadra (s). */
export const FRAME_WINDOW: readonly [number, number] = [-1.2, 2];

/**
 * Caja que encuadra la acción: posiciones de los vehículos involucrados (o de todos) entre
 * 1.2 s antes y 2 s después del impacto, centrada en el punto de impacto cuando existe.
 */
export function actionBounds(scene: CameraScene): { cx: number; cy: number; size: number } {
  const vs = scene.vehiculos.some((v) => v.involucrado)
    ? scene.vehiculos.filter((v) => v.involucrado)
    : scene.vehiculos;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of vs) {
    const tr = v.trayectoria;
    for (let i = 0; i < tr.t.length; i++) {
      const t = tr.t[i] ?? 0;
      if (t < FRAME_WINDOW[0] || t > FRAME_WINDOW[1]) continue;
      const x = tr.x[i] ?? 0;
      const y = tr.y[i] ?? 0;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return { cx: 0, cy: 0, size: 20 };
  const p = scene.punto_impacto;
  // Se centra en el impacto cuando existe: es lo que más importa ver.
  const cx = p ? p.x : (minX + maxX) / 2;
  const cy = p ? p.y : (minY + maxY) / 2;
  const half = Math.max(maxX - cx, cx - minX, maxY - cy, cy - minY, 5);
  return { cx, cy, size: 2 * half };
}

const UP_Y: Vec3 = [0, 1, 0];

/** Vista desde arriba que encuadra toda la acción; el norte queda hacia arriba de la pantalla. */
export function overheadCamera(scene: CameraScene, fov = 40): CameraPose {
  const b = actionBounds(scene);
  const h = (b.size * 0.6) / Math.tan((fov * Math.PI) / 360);
  return {
    position: toThree(b.cx, b.cy, Math.max(18, h)),
    target: toThree(b.cx, b.cy, 0),
    fov,
    up: [0, 0, -1],
  };
}

/** Vista inicial de la cámara libre: desde el suroeste a 35° de elevación. */
export function freeCameraStart(scene: CameraScene, fov = 45): CameraPose {
  const b = actionBounds(scene);
  const dist = Math.max(12, (b.size * 0.5) / Math.tan((fov * Math.PI) / 360));
  const el = (35 * Math.PI) / 180;
  const az = (-135 * Math.PI) / 180;
  const x = b.cx + dist * Math.cos(el) * Math.cos(az);
  const y = b.cy + dist * Math.cos(el) * Math.sin(az);
  return {
    position: toThree(x, y, dist * Math.sin(el)),
    target: toThree(b.cx, b.cy, 0),
    fov,
    up: UP_Y,
  };
}

/** Campo de visión y plano cercano de la cámara del conductor (René, 2026-11-04). */
export const DRIVER_FOV = 70;
export const DRIVER_NEAR_M = 0.05;
/**
 * Inclinación hacia abajo de la mirada (grados): con 70° de campo vertical, 7° dejan el
 * horizonte cerca del tercio superior de la pantalla, el techo apenas asoma y el tablero no ocupa
 * media pantalla (René, 2026-11-04; con 10° el tablero y el volante llenaban el 50 %).
 */
export const DRIVER_PITCH_DEG = 7;
/** A qué distancia se fija la mirada (m). */
export const DRIVER_LOOK_M = 25;

/**
 * Altura del ojo del conductor sobre el piso por clase (m): asiento real de cada tipo (sedán
 * 1.15, SUV 1.3–1.45, pickup 1.45, van 1.65, camión y autobús 2.1–2.4, dos ruedas 1.25–1.45),
 * y nunca más arriba que el techo menos 0.22 m. Es la cámara; el análisis de visibilidad del
 * solver conserva su propio ojo (AASHTO).
 */
const DRIVER_EYE_M: Record<string, number> = {
  sedan_compacto: 1.2,
  sedan_mediano: 1.2,
  hatchback: 1.22,
  suv_compacta: 1.36,
  suv_grande: 1.62,
  pickup: 1.5,
  van: 1.65,
  microbus_combi: 1.65,
  camion_unitario: 2.1,
  autobus: 2.3,
  tractocamion: 2.4,
  motocicleta: 1.35,
  bicicleta: 1.45,
  scooter: 1.25,
};

export function driverEyeHeight(clase: string | undefined, altoM: number): number {
  const eye = DRIVER_EYE_M[clase ?? "sedan_compacto"] ?? 1.15;
  return Math.min(eye, Math.max(0.9, altoM - 0.22));
}

const FRONT_CAB = new Set(["autobus", "camion_unitario", "tractocamion", "microbus_combi", "van"]);
const TWO_WHEEL = new Set(["motocicleta", "scooter", "bicicleta"]);

/**
 * Ojos del conductor en el marco del vehículo (x adelante desde el centro de masa, y a la
 * izquierda), para la cámara: en el asiento del conductor, delante del respaldo. El centro de masa
 * está a 0.45 del eje delantero (`cgFromFront`), así que el centro entre ejes queda 0.05·wb atrás
 * de él; el ojo va 0.2 m delante de ese centro (la cabeza queda junto al pilar B) y 0.37 m a la
 * izquierda del eje del vehículo. Con cabina adelantada (van, autobús, tracto), 1.0 m detrás del
 * frente; en dos ruedas, sobre el asiento. El análisis de visibilidad del solver conserva su
 * propio ojo (`eyeOffset`).
 */
export function driverEyeOffset(
  clase: string,
  length: number,
  width: number,
  wheelbase: number,
): [number, number] {
  if (TWO_WHEEL.has(clase)) return [-0.1, 0];
  if (FRONT_CAB.has(clase)) return [0.5 * length - 1.0, Math.min(0.5 * width - 0.45, 0.45)];
  const left = Math.min(0.37, Math.max(0, 0.5 * width - 0.5));
  // En la pickup la cabina queda bien adelante del centro entre ejes (la caja ocupa la mitad
  // trasera): con el ojo cerca del centro la cámara quedaba detrás del respaldo (capturas,
  // 2026-11-04).
  if (clase === "pickup") return [-0.05 * wheelbase + 0.6, left];
  if (clase === "suv_grande") return [-0.05 * wheelbase - 0.1, left];
  return [-0.05 * wheelbase + 0.2, left];
}

/** Ojos del conductor (en su asiento, a la altura del análisis de visibilidad), mirando 25 m al frente. */
export function driverCamera(
  v: CameraVehicle,
  t: number,
  eyeHeight: number,
  fov = DRIVER_FOV,
): CameraPose {
  const p = sampleVehicle(v.trayectoria, t);
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const [fwd, left] = driverEyeOffset(
    v.clase ?? "sedan_compacto",
    v.dimensiones.largo_m,
    v.dimensiones.ancho_m,
    v.dimensiones.distancia_entre_ejes_m ?? 0.58 * v.dimensiones.largo_m,
  );
  const ex = p.x + c * fwd - s * left;
  const ey = p.y + s * fwd + c * left;
  const drop = DRIVER_LOOK_M * Math.tan((DRIVER_PITCH_DEG * Math.PI) / 180);
  return {
    position: toThree(ex, ey, eyeHeight),
    target: toThree(ex + DRIVER_LOOK_M * c, ey + DRIVER_LOOK_M * s, eyeHeight - drop),
    fov,
    up: UP_Y,
  };
}

/** Campo de visión vertical (grados) de una lente de `mm` sobre un sensor de 24 mm de alto. */
export function fovFromFocalMm(mm: number): number {
  return (2 * Math.atan(12 / mm) * 180) / Math.PI;
}

/** La cinematográfica (T1.5): altura de la cámara (m), lente (mm) y giro de la órbita (rad/s). */
export const CINEMATIC = {
  heightMin: 3,
  heightMax: 6,
  focalMin: 35,
  focalMax: 50,
  orbitRadS: 0.06,
  /** Altura del punto que mira (m): a media altura de los vehículos. */
  targetHeight: 1.0,
  /** Hasta dónde se aleja para encuadrar la acción (m). */
  distMax: 34,
} as const;

/**
 * Cámara cinematográfica a nivel de calle (T1.5, PLAN-CESVI): entre 3 y 6 m de altura, lente de 35 a
 * 50 mm, mirando a media altura de los vehículos con el horizonte en el tercio superior (ve el
 * cielo y los cerros), en una órbita lenta alrededor del impacto que sigue al centro de los
 * vehículos involucrados. Cuanto más grande es la acción, más lejos, más alto y más angular.
 */
export function cinematicCamera(scene: CameraScene, t: number, fov?: number): CameraPose {
  const b = actionBounds(scene);
  const involved = scene.vehiculos.filter((v) => v.involucrado);
  const vs = involved.length > 0 ? involved : scene.vehiculos;
  let tx = 0;
  let ty = 0;
  for (const v of vs) {
    const p = sampleVehicle(v.trayectoria, t);
    tx += p.x;
    ty += p.y;
  }
  tx = vs.length ? tx / vs.length : b.cx;
  ty = vs.length ? ty / vs.length : b.cy;
  // Objetivo a medio camino entre el impacto y el centro de los vehículos: suaviza el encuadre.
  const gx = (tx + b.cx) / 2;
  const gy = (ty + b.cy) / 2;
  // Acción pequeña (un alcance): 50 mm; grande (una carambola o un cruce ancho): 35 mm.
  const k = Math.min(1, Math.max(0, (b.size - 12) / 30));
  const focal = CINEMATIC.focalMax - k * (CINEMATIC.focalMax - CINEMATIC.focalMin);
  const vfov = fov ?? fovFromFocalMm(focal);
  // Distancia que encuadra la acción a lo ancho de una pantalla 16:9, con margen.
  const hfov = 2 * Math.atan(Math.tan((vfov * Math.PI) / 360) * (16 / 9));
  // Más cerca que el encuadre completo: la acción llena el cuadro y lo lejano se recorta.
  const dist = Math.min(CINEMATIC.distMax, Math.max(12, (b.size * 0.5) / Math.tan(hfov / 2)));
  const height = CINEMATIC.heightMin + k * (CINEMATIC.heightMax - CINEMATIC.heightMin);
  const az = (-120 * Math.PI) / 180 + CINEMATIC.orbitRadS * (t - scene.t_inicio);
  const x = gx + dist * Math.cos(az);
  const y = gy + dist * Math.sin(az);
  return {
    position: toThree(x, y, height),
    target: toThree(gx, gy, CINEMATIC.targetHeight),
    fov: vfov,
    up: UP_Y,
  };
}

/** Suavizado de entrada y salida (0–1 → 0–1). */
export function easeInOut(k: number): number {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
}

/** Mezcla dos poses (posición, objetivo y campo de visión) con el peso `k` suavizado. */
export function blendPose(a: CameraPose, b: CameraPose, k: number): CameraPose {
  const w = easeInOut(k);
  const mix = (p: Vec3, q: Vec3): Vec3 => [
    p[0] + (q[0] - p[0]) * w,
    p[1] + (q[1] - p[1]) * w,
    p[2] + (q[2] - p[2]) * w,
  ];
  return {
    position: mix(a.position, b.position),
    target: mix(a.target, b.target),
    fov: a.fov + (b.fov - a.fov) * w,
    up: b.up,
  };
}

/** Duración de la transición entre cámaras (ms). */
export const CAMERA_TRANSITION_MS = 1200;

/** Vehículo con más aplastamiento (para la cámara de acercamiento al daño). */
export function mostDamaged(scene: CameraScene): CameraVehicle | undefined {
  let best: CameraVehicle | undefined;
  let crush = 0;
  for (const v of scene.vehiculos) {
    const c = Math.max(0, ...(v.dano?.perfil_m ?? [0]));
    if (c > crush) {
      crush = c;
      best = v;
    }
  }
  return best ?? scene.vehiculos.find((v) => v.involucrado) ?? scene.vehiculos[0];
}

/**
 * Acercamiento al daño: órbita fija frente a la cara golpeada del vehículo más deformado, a 60°
 * de la normal de esa cara (lo que golpeó queda justo enfrente y no debe tapar) y 32° de elevación, a una distancia que encuadra el vehículo.
 */
export function damageCamera(scene: CameraScene, t: number, fov = 40): CameraPose {
  const v = mostDamaged(scene);
  if (!v) return freeCameraStart(scene, fov);
  const p = sampleVehicle(v.trayectoria, t);
  const lado = v.dano?.cdc?.lado ?? "F";
  const faceAngle = { F: 0, B: Math.PI, L: Math.PI / 2, R: -Math.PI / 2 }[lado] ?? 0;
  // Lo que golpeó (otro vehículo u objeto) queda justo frente a la cara: la cámara se abre 60°.
  const az = p.yaw + faceAngle + (60 * Math.PI) / 180;
  const el = (32 * Math.PI) / 180;
  const dist = Math.max(5.5, 1.7 * v.dimensiones.largo_m);
  const tx = p.x;
  const ty = p.y;
  const h = 0.5 * v.dimensiones.alto_m;
  return {
    position: toThree(
      tx + dist * Math.cos(el) * Math.cos(az),
      ty + dist * Math.cos(el) * Math.sin(az),
      h + dist * Math.sin(el),
    ),
    target: toThree(tx, ty, h),
    fov,
    up: UP_Y,
  };
}

/**
 * Sigue a la persona proyectada (o, si no hay, a la primera que camina) desde un costado de su
 * recorrido, a una distancia que encuadra el vuelo y el deslizamiento.
 */
export function personCamera(scene: CameraScene, t: number, fov = 40): CameraPose {
  const ps = scene.personas ?? [];
  const p =
    ps.find((x) => x.proyeccion && x.trayectoria.t.length > 0) ??
    ps.find((x) => x.trayectoria.t.length > 0);
  if (!p) return damageCamera(scene, t, fov);
  const tr = p.trayectoria;
  const a = samplePerson(tr, Math.max(tr.t[0] ?? 0, FRAME_WINDOW[0]))!;
  const b = samplePerson(tr, tr.t[tr.t.length - 1] ?? 0)!;
  const now = samplePerson(tr, t)!;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    dx = Math.cos(now.yaw);
    dy = Math.sin(now.yaw);
  } else {
    dx /= len;
    dy /= len;
  }
  const dist = Math.max(6, 0.45 * len);
  // A la derecha del recorrido y un poco atrás de su punto medio.
  const mx = (a.x + b.x) / 2 - 0.2 * len * dx;
  const my = (a.y + b.y) / 2 - 0.2 * len * dy;
  return {
    position: toThree(mx + dist * dy, my - dist * dx, 2.4),
    target: toThree(now.x, now.y, Math.max(0.6, now.z)),
    fov,
    up: UP_Y,
  };
}

/** Una cámara del visor para exportar a glTF (R11): su clave, su nombre y su pose en cada instante. */
export interface ExportCamera {
  clave: CameraMode | `conductor_${string}`;
  nombre: string;
  pose: (t: number) => CameraPose;
}

/**
 * Las cámaras del visor que viajan en la escena glTF, con las mismas poses que en pantalla: la
 * cinematográfica primero (la del video), luego la cenital, la del daño, la de cada conductor y,
 * si hay personas, la que las sigue.
 */
export function exportCameras(
  scene: CameraScene,
  eyeHeight: (v: CameraVehicle) => number,
): ExportCamera[] {
  const out: ExportCamera[] = [
    { clave: "cinematica", nombre: "Cinematográfica", pose: (t) => cinematicCamera(scene, t) },
    { clave: "cenital", nombre: "Cenital", pose: () => overheadCamera(scene) },
  ];
  if (scene.vehiculos.length > 0) {
    out.push({ clave: "dano", nombre: "Daño", pose: (t) => damageCamera(scene, t) });
  }
  for (const v of scene.vehiculos) {
    const eye = eyeHeight(v);
    out.push({
      clave: `conductor_${v.id}`,
      nombre: `Conductor ${v.id}`,
      pose: (t) => driverCamera(v, t, eye),
    });
  }
  if ((scene.personas ?? []).some((p) => p.trayectoria.t.length > 0)) {
    out.push({ clave: "persona", nombre: "Persona", pose: (t) => personCamera(scene, t) });
  }
  return out;
}
