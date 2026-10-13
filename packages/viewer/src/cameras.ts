/**
 * Cámaras predefinidas del visor (PLAN §7.5): libre, cenital, vista de cada conductor y
 * cinematográfica automática. Funciones puras: dado el resultado del solver y el tiempo t,
 * devuelven posición, objetivo y campo de visión en coordenadas de three.js.
 */
import { toThree, type Vec3 } from "./coords";
import { sampleVehicle, type VehicleTrack } from "./sample";

export type CameraMode = "libre" | "cenital" | "conductor" | "cinematica" | "dano";

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
  rol: string;
  involucrado: boolean;
  dimensiones: { largo_m: number; ancho_m: number; alto_m: number };
  trayectoria: VehicleTrack;
  dano?: { perfil_m: readonly number[]; cdc?: { lado: string } };
}

export interface CameraScene {
  t_inicio: number;
  t_fin: number;
  eventos?: readonly { tipo: string }[];
  punto_impacto?: { x: number; y: number };
  vehiculos: readonly CameraVehicle[];
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

/** Ojos del conductor: asiento izquierdo, a la altura de los ojos, mirando 25 m al frente. */
export function driverCamera(v: CameraVehicle, t: number, eyeHeight: number, fov = 70): CameraPose {
  const p = sampleVehicle(v.trayectoria, t);
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const fwd = -0.05 * v.dimensiones.largo_m;
  const left = 0.22 * v.dimensiones.ancho_m;
  const ex = p.x + c * fwd - s * left;
  const ey = p.y + s * fwd + c * left;
  return {
    position: toThree(ex, ey, eyeHeight),
    target: toThree(ex + 25 * c, ey + 25 * s, eyeHeight - 0.4),
    fov,
    up: UP_Y,
  };
}

/** Órbita lenta alrededor del impacto que sigue al centro de los vehículos involucrados. */
export function cinematicCamera(scene: CameraScene, t: number, fov = 38): CameraPose {
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
  const dist = Math.max(14, (b.size * 0.5) / Math.tan((fov * Math.PI) / 360));
  const az = (-120 * Math.PI) / 180 + 0.12 * (t - scene.t_inicio);
  const el = (24 * Math.PI) / 180;
  const x = gx + dist * Math.cos(el) * Math.cos(az);
  const y = gy + dist * Math.cos(el) * Math.sin(az);
  return {
    position: toThree(x, y, dist * Math.sin(el)),
    target: toThree(gx, gy, 0.5),
    fov,
    up: UP_Y,
  };
}

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
