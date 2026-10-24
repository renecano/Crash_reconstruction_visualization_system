/**
 * Cámaras predefinidas del visor (PLAN §7.5): libre, cenital, vista de cada conductor y
 * cinematográfica automática. Funciones puras: dado el resultado del solver y el tiempo t,
 * devuelven posición, objetivo y campo de visión en coordenadas de three.js.
 */
import { toThree, type Vec3 } from "./coords";
import { samplePerson, sampleVehicle, type PersonTrackData, type VehicleTrack } from "./sample";
import { eyeOffset } from "./visibility-overlay";

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

/** Ojos del conductor (posición y altura del análisis de visibilidad), mirando 25 m al frente. */
export function driverCamera(v: CameraVehicle, t: number, eyeHeight: number, fov = 70): CameraPose {
  const p = sampleVehicle(v.trayectoria, t);
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const [fwd, left] = eyeOffset(
    v.clase ?? "sedan_compacto",
    v.dimensiones.largo_m,
    v.dimensiones.ancho_m,
  );
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
