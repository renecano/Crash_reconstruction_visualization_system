/**
 * Posturas de los cuerpos articulados (PLAN §7.4): de pie, caminando, manejando, de copiloto o
 * pasajero, montado en moto o bici, y el torso de un ocupante que se desplaza en el impacto.
 *
 * El esqueleto (16 segmentos, `assets/pipeline/croquis_assets/humans.py`) tiene rotaciones de
 * reposo nulas: cada hueso apunta de su cabeza a su punta en la A-pose de MakeHuman, en el marco
 * del cuerpo (x a la izquierda de la persona, y arriba, z al frente). Una postura se describe con
 * la dirección deseada de cada segmento en ese marco; la rotación local de cada hueso es la mínima
 * que lleva su dirección de reposo, ya rotada por su padre, a la deseada (cinemática directa).
 *
 * Marcha: ángulos sagitales de cadera, rodilla y tobillo a lo largo del ciclo con puntos de control
 * tomados de las curvas normativas de Winter (2009, Biomechanics and Motor Control of Human
 * Movement, cap. 1–2: cadera de +30° a −10°, rodilla con pico de ~60° en balanceo, tobillo de
 * +10° a −18°), interpolados con Catmull-Rom periódica. La longitud de paso se toma como 0.415 de
 * la estatura (proporción de uso común; supuesto) y la cadencia sale de la velocidad del solver.
 */
import { Quaternion, Vector3 } from "three";

export interface BoneSpec {
  nombre: string;
  padre: string | null;
  cabeza: [number, number, number];
  punta: [number, number, number];
  radio: number;
  fraccion_masa: number;
}

export type BoneName =
  | "cadera"
  | "abdomen"
  | "pecho"
  | "cuello"
  | "cabeza"
  | "brazo_i"
  | "antebrazo_i"
  | "mano_i"
  | "brazo_d"
  | "antebrazo_d"
  | "mano_d"
  | "muslo_i"
  | "pierna_i"
  | "pie_i"
  | "muslo_d"
  | "pierna_d"
  | "pie_d";

export type Pose = Map<string, Quaternion>;

export const STEP_LENGTH_FACTOR = 0.415;
const DEG = Math.PI / 180;

/** Puntos de control (fase del ciclo, ángulo en grados) desde el contacto del talón. */
export const GAIT_HIP: readonly (readonly [number, number])[] = [
  [0, 30],
  [0.1, 28],
  [0.3, 10],
  [0.5, -10],
  [0.6, 0],
  [0.75, 25],
  [0.87, 32],
];
export const GAIT_KNEE: readonly (readonly [number, number])[] = [
  [0, 5],
  [0.15, 18],
  [0.4, 5],
  [0.6, 35],
  [0.72, 60],
  [0.87, 30],
];
export const GAIT_ANKLE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.07, -5],
  [0.4, 10],
  [0.62, -18],
  [0.75, 0],
];

/** Interpolación Catmull-Rom periódica (periodo 1) por puntos de control ordenados. */
export function periodicSpline(
  points: readonly (readonly [number, number])[],
  phase: number,
): number {
  const n = points.length;
  let x = ((phase % 1) + 1) % 1;
  // Punto de control k extendido periódicamente (k puede salir de [0, n)).
  const at = (k: number): readonly [number, number] => {
    const m = ((k % n) + n) % n;
    const p = points[m]!;
    return [p[0] + Math.floor(k / n), p[1]];
  };
  if (x < at(0)[0]) x += 1;
  let i = 0;
  while (i < n - 1 && x >= at(i + 1)[0]) i++;
  const p0 = at(i - 1);
  const p1 = at(i);
  const p2 = at(i + 1);
  const p3 = at(i + 2);
  const h = p2[0] - p1[0];
  const u = (x - p1[0]) / h;
  // Hermite cúbica con tangentes por diferencias centrales (Catmull-Rom no uniforme).
  const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * h;
  const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * p1[1] +
    (u3 - 2 * u2 + u) * m1 +
    (-2 * u3 + 3 * u2) * p2[1] +
    (u3 - u2) * m2
  );
}

export function gaitAngles(phase: number): { hip: number; knee: number; ankle: number } {
  return {
    hip: periodicSpline(GAIT_HIP, phase),
    knee: periodicSpline(GAIT_KNEE, phase),
    ankle: periodicSpline(GAIT_ANKLE, phase),
  };
}

/** Frecuencia del ciclo de marcha (ciclos/s) para una velocidad y estatura. */
export function gaitFrequency(speed: number, stature: number): number {
  const step = STEP_LENGTH_FACTOR * stature;
  return speed > 0 ? speed / (2 * step) : 0;
}

const tmpQ = new Quaternion();
const tmpV = new Vector3();

export function restDirection(b: BoneSpec): Vector3 {
  return new Vector3(
    b.punta[0] - b.cabeza[0],
    b.punta[1] - b.cabeza[1],
    b.punta[2] - b.cabeza[2],
  ).normalize();
}

/**
 * Rotaciones locales que llevan cada segmento a la dirección deseada (marco del cuerpo).
 * Los huesos sin dirección indicada conservan la orientación de su padre.
 */
export function poseFromDirections(
  bones: readonly BoneSpec[],
  dirs: Partial<Record<BoneName, Vector3>>,
): Pose {
  const world = new Map<string, Quaternion>();
  const pose: Pose = new Map();
  for (const b of bones) {
    const parentWorld = b.padre ? (world.get(b.padre) ?? new Quaternion()) : new Quaternion();
    const target = dirs[b.nombre as BoneName];
    let local = new Quaternion();
    if (target) {
      const rest = restDirection(b);
      const localTarget = tmpV
        .copy(target)
        .normalize()
        .applyQuaternion(tmpQ.copy(parentWorld).invert());
      local = new Quaternion().setFromUnitVectors(rest, localTarget);
    }
    pose.set(b.nombre, local);
    world.set(b.nombre, parentWorld.clone().multiply(local));
  }
  return pose;
}

/** Dirección en el plano sagital con un ángulo desde la vertical hacia abajo (+ = al frente). */
function down(angleDeg: number, lateral = 0): Vector3 {
  const a = angleDeg * DEG;
  return new Vector3(lateral, -Math.cos(a), Math.sin(a)).normalize();
}

function up(leanDeg: number): Vector3 {
  const a = leanDeg * DEG;
  return new Vector3(0, Math.cos(a), Math.sin(a));
}

function footDir(legAngleDeg: number, ankleDeg: number): Vector3 {
  // El pie apunta al frente y ligeramente abajo; gira con la pierna y el tobillo.
  const a = (legAngleDeg + ankleDeg + 90 - 25) * DEG;
  return new Vector3(0, -Math.cos(a), Math.sin(a)).normalize();
}

const SPINE_UP = { cadera: up(0), abdomen: up(0), pecho: up(0), cuello: up(4), cabeza: up(0) };

export function standingDirections(): Partial<Record<BoneName, Vector3>> {
  return {
    ...SPINE_UP,
    brazo_i: down(2, 0.16),
    brazo_d: down(2, -0.16),
    antebrazo_i: down(12, 0.08),
    antebrazo_d: down(12, -0.08),
    mano_i: down(14, 0.05),
    mano_d: down(14, -0.05),
    muslo_i: down(0, 0.03),
    muslo_d: down(0, -0.03),
    pierna_i: down(0),
    pierna_d: down(0),
    pie_i: footDir(0, 0),
    pie_d: footDir(0, 0),
  };
}

/** Marcha: fase del ciclo de la pierna izquierda (la derecha va medio ciclo después). */
export function walkingDirections(phase: number): Partial<Record<BoneName, Vector3>> {
  const l = gaitAngles(phase);
  const r = gaitAngles(phase + 0.5);
  // Braceo opuesto a la pierna del mismo lado (≈ 0.6 de la flexión de cadera contraria).
  const armL = 0.6 * (r.hip - 10);
  const armR = 0.6 * (l.hip - 10);
  return {
    ...SPINE_UP,
    pecho: up(3),
    brazo_i: down(armL, 0.14),
    brazo_d: down(armR, -0.14),
    antebrazo_i: down(armL + 18, 0.06),
    antebrazo_d: down(armR + 18, -0.06),
    mano_i: down(armL + 20, 0.04),
    mano_d: down(armR + 20, -0.04),
    muslo_i: down(l.hip, 0.02),
    muslo_d: down(r.hip, -0.02),
    pierna_i: down(l.hip - l.knee),
    pierna_d: down(r.hip - r.knee),
    pie_i: footDir(l.hip - l.knee, l.ankle),
    pie_d: footDir(r.hip - r.knee, r.ankle),
  };
}

/** Sentado al volante: torso reclinado, muslos al frente, manos hacia el volante. */
export function drivingDirections(): Partial<Record<BoneName, Vector3>> {
  return {
    cadera: up(-15),
    abdomen: up(-15),
    pecho: up(-12),
    cuello: up(0),
    cabeza: up(5),
    muslo_i: down(95, 0.06),
    muslo_d: down(95, -0.06),
    pierna_i: down(25),
    pierna_d: down(25),
    pie_i: footDir(25, 10),
    pie_d: footDir(25, 10),
    brazo_i: down(50, 0.12),
    brazo_d: down(50, -0.12),
    antebrazo_i: new Vector3(-0.2, 0.3, 0.93).normalize(),
    antebrazo_d: new Vector3(0.2, 0.3, 0.93).normalize(),
    mano_i: new Vector3(-0.2, 0.2, 0.96).normalize(),
    mano_d: new Vector3(0.2, 0.2, 0.96).normalize(),
  };
}

/** Sentado sin volante: manos sobre los muslos. */
export function passengerDirections(): Partial<Record<BoneName, Vector3>> {
  return {
    ...drivingDirections(),
    brazo_i: down(20, 0.1),
    brazo_d: down(20, -0.1),
    antebrazo_i: new Vector3(-0.05, -0.35, 0.94).normalize(),
    antebrazo_d: new Vector3(0.05, -0.35, 0.94).normalize(),
    mano_i: new Vector3(0, -0.4, 0.92).normalize(),
    mano_d: new Vector3(0, -0.4, 0.92).normalize(),
  };
}

/** Montado en moto o bici: torso inclinado al frente, piernas abiertas, manos al manubrio. */
export function ridingDirections(): Partial<Record<BoneName, Vector3>> {
  return {
    cadera: up(15),
    abdomen: up(25),
    pecho: up(28),
    cuello: up(10),
    cabeza: up(-5),
    muslo_i: down(65, 0.3),
    muslo_d: down(65, -0.3),
    pierna_i: down(-8, 0.05),
    pierna_d: down(-8, -0.05),
    pie_i: footDir(-8, 5),
    pie_d: footDir(-8, 5),
    brazo_i: down(55, 0.25),
    brazo_d: down(55, -0.25),
    antebrazo_i: new Vector3(0.05, -0.25, 0.97).normalize(),
    antebrazo_d: new Vector3(-0.05, -0.25, 0.97).normalize(),
    mano_i: new Vector3(0, -0.2, 0.98).normalize(),
    mano_d: new Vector3(0, -0.2, 0.98).normalize(),
  };
}

/**
 * Inclina el torso de un ocupante para que el pecho se desplace (dx al frente, dy a la izquierda,
 * en metros, marco del vehículo) respecto al asiento. Devuelve las direcciones modificadas.
 */
export function occupantLean(
  base: Partial<Record<BoneName, Vector3>>,
  dx: number,
  dy: number,
  torsoLength: number,
): Partial<Record<BoneName, Vector3>> {
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return base;
  const out = { ...base };
  const tilt = Math.atan2(d, torsoLength);
  for (const [bone, share] of [
    ["abdomen", 0.6],
    ["pecho", 1],
    ["cuello", 1.15],
    ["cabeza", 1.2],
  ] as const) {
    const dir = (out[bone] ?? up(0)).clone();
    const a = tilt * share;
    // Inclinar hacia (dy → +x del cuerpo, dx → +z del cuerpo).
    const h = new Vector3(dy / d, 0, dx / d);
    dir.multiplyScalar(Math.cos(a)).addScaledVector(h, Math.sin(a)).normalize();
    out[bone] = dir;
  }
  return out;
}

/** Aplica una postura a los huesos de un esqueleto (por nombre). */
export function applyPose(bones: Map<string, { quaternion: Quaternion }>, pose: Pose): void {
  for (const [name, q] of pose) bones.get(name)?.quaternion.copy(q);
}

/** Posición mundial (marco del cuerpo, normalizada) de la cabeza de cada hueso con una postura. */
export function posedJoints(
  bones: readonly BoneSpec[],
  pose: Pose,
): Map<string, { head: Vector3; tail: Vector3; world: Quaternion }> {
  const out = new Map<string, { head: Vector3; tail: Vector3; world: Quaternion }>();
  for (const b of bones) {
    const local = pose.get(b.nombre) ?? new Quaternion();
    const parent = b.padre ? out.get(b.padre) : undefined;
    const world = parent ? parent.world.clone().multiply(local) : local.clone();
    let head: Vector3;
    if (parent) {
      const pb = bones.find((x) => x.nombre === b.padre)!;
      const off = new Vector3(
        b.cabeza[0] - pb.cabeza[0],
        b.cabeza[1] - pb.cabeza[1],
        b.cabeza[2] - pb.cabeza[2],
      );
      head = parent.head.clone().add(off.applyQuaternion(parent.world));
    } else head = new Vector3(...b.cabeza);
    const len = new Vector3(
      b.punta[0] - b.cabeza[0],
      b.punta[1] - b.cabeza[1],
      b.punta[2] - b.cabeza[2],
    );
    const tail = head.clone().add(len.applyQuaternion(world));
    out.set(b.nombre, { head, tail, world });
  }
  return out;
}
