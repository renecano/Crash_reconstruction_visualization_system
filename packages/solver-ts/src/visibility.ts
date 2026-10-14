/**
 * Visibilidad desde el ojo de cada conductor (port de `croquis_solver.visibility`; PLAN §6.1.9):
 * línea de vista en 3D desde el ojo hasta varios puntos del objetivo, con oclusores de la misma
 * geometría que dibuja el visor, límites de noche sin alumbrado y de visibilidad meteorológica.
 */
import { pyRound, radians } from "./pymath";
import { footprintRadius, type SceneObject } from "./scene-objects";

export const SAMPLE_DT = 0.1;
export const NIGHT_DETECTION_M = 30.0;
export const NIGHT_DETECTION_RANGE_M = [10.0, 60.0] as const;
export const HEADLIGHT_HALF_ANGLE_DEG = 30.0;
const EPS = 1e-9;

export const EYE_HEIGHT_M: Readonly<Record<string, number>> = {
  sedan_compacto: 1.08,
  sedan_mediano: 1.08,
  hatchback: 1.08,
  suv_compacta: 1.3,
  suv_grande: 1.4,
  pickup: 1.4,
  van: 1.6,
  microbus_combi: 1.7,
  autobus: 2.33,
  camion_unitario: 2.33,
  tractocamion: 2.33,
  motocicleta: 1.45,
  scooter: 1.4,
  bicicleta: 1.55,
};
export const AASHTO_CLASSES = new Set([
  "sedan_compacto",
  "sedan_mediano",
  "hatchback",
  "autobus",
  "camion_unitario",
  "tractocamion",
]);
const FRONT_CAB = new Set(["autobus", "camion_unitario", "tractocamion", "microbus_combi", "van"]);
const TWO_WHEEL = new Set(["motocicleta", "scooter", "bicicleta"]);

/** Ojo en el marco del vehículo (x adelante, y izquierda), con el volante a la izquierda. */
export function eyeOffset(clase: string, length: number, width: number): [number, number] {
  if (TWO_WHEEL.has(clase)) return [-0.1, 0.0];
  if (FRONT_CAB.has(clase)) return [0.5 * length - 1.0, 0.5 * width - 0.6];
  return [-0.05 * length, Math.max(0.0, 0.5 * width - 0.55)];
}

export interface Occluder {
  /** "objeto:<id>" o "vehiculo:<id>" */
  id: string;
  /** "cylinder" | "sphere" | "box" */
  kind: string;
  cx: number;
  cy: number;
  z0: number;
  z1: number;
  radius: number;
  yaw: number;
  hx: number;
  hy: number;
  zc: number;
  /** Radio de descarte en planta. */
  reach: number;
}

export type Point3 = readonly [number, number, number];

function occluder(
  p: Partial<Occluder> & Pick<Occluder, "id" | "kind" | "cx" | "cy" | "z0" | "z1">,
): Occluder {
  return { radius: 0.0, yaw: 0.0, hx: 0.0, hy: 0.0, zc: 0.0, reach: 0.0, ...p };
}

export function boxOccluder(
  oid: string,
  cx: number,
  cy: number,
  yaw: number,
  lx: number,
  ly: number,
  h: number,
): Occluder {
  return occluder({
    id: oid,
    kind: "box",
    cx,
    cy,
    z0: 0.0,
    z1: h,
    yaw,
    hx: lx / 2,
    hy: ly / 2,
    reach: 0.5 * Math.hypot(lx, ly),
  });
}

export function objectOccluders(o: SceneObject): Occluder[] {
  const oid = `objeto:${o.id}`;
  const reach = footprintRadius(o);
  if (o.forma === "arbol") {
    return [
      occluder({
        id: oid,
        kind: "cylinder",
        cx: o.x,
        cy: o.y,
        z0: 0.0,
        z1: o.troncoAlto,
        radius: o.radio,
        reach,
      }),
      occluder({
        id: oid,
        kind: "sphere",
        cx: o.x,
        cy: o.y,
        z0: o.copaCentro - o.copaRadio,
        z1: o.copaCentro + o.copaRadio,
        radius: o.copaRadio,
        zc: o.copaCentro,
        reach,
      }),
    ];
  }
  if (o.forma === "cilindro" || o.forma === "senal") {
    const occ = [
      occluder({
        id: oid,
        kind: "cylinder",
        cx: o.x,
        cy: o.y,
        z0: 0.0,
        z1: o.alto,
        radius: o.radio,
        reach,
      }),
    ];
    if (o.forma === "senal") {
      occ.push(
        occluder({
          id: oid,
          kind: "box",
          cx: o.x,
          cy: o.y,
          z0: 2.0,
          z1: 2.6,
          yaw: radians(o.rumboDeg),
          hx: 0.02,
          hy: 0.3,
          reach: 0.3,
        }),
      );
    }
    return occ;
  }
  return [boxOccluder(oid, o.x, o.y, radians(o.rumboDeg), o.largo, o.ancho, o.alto)];
}

/** Intervalo u ∈ [0, 1] en que la proyección en planta está dentro del círculo. */
function segmentCircle(
  p0: Point3,
  p1: Point3,
  cx: number,
  cy: number,
  r: number,
): [number, number] | null {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const fx = p0[0] - cx;
  const fy = p0[1] - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (a < EPS) return c <= 0 ? [0.0, 1.0] : null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const u0 = (-b - sq) / (2 * a);
  const u1 = (-b + sq) / (2 * a);
  const lo = Math.max(0.0, u0);
  const hi = Math.min(1.0, u1);
  return lo <= hi ? [lo, hi] : null;
}

function zOverlap(p0: Point3, p1: Point3, lo: number, hi: number, z0: number, z1: number): boolean {
  const za = p0[2] + (p1[2] - p0[2]) * lo;
  const zb = p0[2] + (p1[2] - p0[2]) * hi;
  return Math.max(Math.min(za, zb), z0) <= Math.min(Math.max(za, zb), z1);
}

/** ¿El segmento p0→p1 cruza el oclusor? (exacto para cilindro vertical, esfera y caja). */
export function segmentBlocked(occ: Occluder, p0: Point3, p1: Point3): boolean {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const seg2 = dx * dx + dy * dy;
  if (seg2 > EPS) {
    const u = Math.max(0.0, Math.min(1.0, ((occ.cx - p0[0]) * dx + (occ.cy - p0[1]) * dy) / seg2));
    const qx = p0[0] + u * dx - occ.cx;
    const qy = p0[1] + u * dy - occ.cy;
    if (qx * qx + qy * qy > (occ.reach + 1e-6) ** 2) return false;
  }
  if (occ.kind === "cylinder") {
    const iv = segmentCircle(p0, p1, occ.cx, occ.cy, occ.radius);
    return iv !== null && zOverlap(p0, p1, iv[0], iv[1], occ.z0, occ.z1);
  }
  if (occ.kind === "sphere") {
    const ex = p1[0] - p0[0];
    const ey = p1[1] - p0[1];
    const ez = p1[2] - p0[2];
    const fx = p0[0] - occ.cx;
    const fy = p0[1] - occ.cy;
    const fz = p0[2] - occ.zc;
    const a = ex * ex + ey * ey + ez * ez;
    if (a < EPS) return fx * fx + fy * fy + fz * fz <= occ.radius ** 2;
    const u = Math.max(0.0, Math.min(1.0, -(fx * ex + fy * ey + fz * ez) / a));
    const qx = fx + u * ex;
    const qy = fy + u * ey;
    const qz = fz + u * ez;
    return qx * qx + qy * qy + qz * qz <= occ.radius ** 2;
  }
  // Caja orientada: método de las placas en su marco local.
  const c = Math.cos(occ.yaw);
  const s = Math.sin(occ.yaw);
  const local = (p: Point3): Point3 => {
    const rx = p[0] - occ.cx;
    const ry = p[1] - occ.cy;
    return [c * rx + s * ry, -s * rx + c * ry, p[2]];
  };
  const a0 = local(p0);
  const a1 = local(p1);
  let lo = 0.0;
  let hi = 1.0;
  const slabs: [number, number][] = [
    [-occ.hx, occ.hx],
    [-occ.hy, occ.hy],
    [occ.z0, occ.z1],
  ];
  for (let k = 0; k < 3; k++) {
    const [mn, mx] = slabs[k]!;
    const d = a1[k]! - a0[k]!;
    if (Math.abs(d) < EPS) {
      if (a0[k]! < mn || a0[k]! > mx) return false;
      continue;
    }
    let t0 = (mn - a0[k]!) / d;
    let t1 = (mx - a0[k]!) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    lo = Math.max(lo, t0);
    hi = Math.min(hi, t1);
    if (lo > hi) return false;
  }
  return true;
}

/** Objetivo o vehículo en movimiento con su pose en cada instante de muestreo. */
export class Actor {
  constructor(
    readonly id: string,
    /** "vehiculo" | "persona" | "objeto" */
    readonly tipo: string,
    readonly poses: (readonly [number, number, number])[],
    readonly length = 0.0,
    readonly width = 0.0,
    readonly height = 0.0,
    readonly lights = false,
    /** Persona: si está en la escena. */
    readonly present: boolean[] = [],
  ) {}

  points(k: number): Point3[] {
    const [x, y, yaw] = this.poses[k]!;
    if (this.tipo === "persona") {
      return [
        [x, y, 0.5],
        [x, y, 0.55 * this.height],
        [x, y, this.height - 0.1],
      ];
    }
    if (this.tipo === "objeto") {
      return [
        [x, y, 0.5],
        [x, y, Math.min(1.5, this.height)],
      ];
    }
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const pts: Point3[] = [];
    const corners: [number, number][] = [
      [0.5, 0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [-0.5, -0.5],
      [0.0, 0.0],
    ];
    for (const [fx, fy] of corners) {
      const lx = fx * this.length * 0.95;
      const ly = fy * this.width * 0.95;
      const px = x + c * lx - s * ly;
      const py = y + s * lx + c * ly;
      for (const z of [0.6, Math.max(0.7, this.height - 0.1)]) pts.push([px, py, z]);
    }
    return pts;
  }
}

export class Observer {
  constructor(
    readonly vehicleId: string,
    readonly clase: string,
    readonly poses: (readonly [number, number, number])[],
    readonly length: number,
    readonly width: number,
    readonly lights: boolean,
  ) {}

  get eyeHeight(): number {
    return EYE_HEIGHT_M[this.clase] ?? 1.08;
  }

  eye(k: number): Point3 {
    const [x, y, yaw] = this.poses[k]!;
    const [ox, oy] = eyeOffset(this.clase, this.length, this.width);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return [x + c * ox - s * oy, y + s * ox + c * oy, this.eyeHeight];
  }
}

export interface PairResult {
  observador: string;
  objetivo: string;
  tipoObjetivo: string;
  t: number[];
  visible: boolean[];
  fraccion: number[];
  distancia: number[];
  causa: string[];
}

/** El más frecuente; en empate, el que apareció primero (como `Counter.most_common(1)`). */
function mostCommon(xs: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [x, n] of counts) {
    if (n > bestN) {
      best = x;
      bestN = n;
    }
  }
  return best;
}

export function pairSummary(r: PairResult): Record<string, unknown> {
  const n = r.t.length;
  let k = n - 1;
  while (k >= 0 && r.visible[k]) k -= 1;
  const since = k + 1;
  const visibleAtEnd = n > 0 && r.visible[n - 1]!;
  const before = r.causa.slice(0, visibleAtEnd ? since : n).filter((c) => c);
  const main = mostCommon(before);
  const out: Record<string, unknown> = {
    visible_al_impacto: visibleAtEnd,
    limitado_por: [...new Set(before)].sort(),
  };
  if (main !== null) out.oclusor_principal = main;
  if (visibleAtEnd) {
    out.visible_desde_s = r.t[since];
    out.distancia_al_verse_m = r.distancia[since];
    out.tiempo_disponible_s = r.t[n - 1]! - r.t[since]!;
    out.visible_toda_la_aproximacion = since === 0;
  }
  return out;
}

export function analyzePair(
  obs: Observer,
  target: Actor,
  staticOcc: readonly Occluder[],
  movers: readonly Actor[],
  times: readonly number[],
  opts: { nightUnlit: boolean; metVisibilityM: number | null; nightDetectionM?: number },
): PairResult {
  const nightDetectionM = opts.nightDetectionM ?? NIGHT_DETECTION_M;
  const res: PairResult = {
    observador: obs.vehicleId,
    objetivo: target.id,
    tipoObjetivo: target.tipo,
    t: [],
    visible: [],
    fraccion: [],
    distancia: [],
    causa: [],
  };
  const exclude = new Set([`vehiculo:${obs.vehicleId}`, `${target.tipo}:${target.id}`]);
  const half = radians(HEADLIGHT_HALF_ANGLE_DEG);
  times.forEach((t, k) => {
    if (target.present.length > 0 && !target.present[k]) return;
    const eye = obs.eye(k);
    const pts = target.points(k);
    const [tx, ty] = target.poses[k]!;
    const dist = Math.hypot(tx - eye[0], ty - eye[1]);
    const occ = staticOcc.filter((o) => !exclude.has(o.id));
    for (const mv of movers) {
      if (exclude.has(`vehiculo:${mv.id}`)) continue;
      const [mx, my, myaw] = mv.poses[k]!;
      occ.push(boxOccluder(`vehiculo:${mv.id}`, mx, my, myaw, mv.length, mv.width, mv.height));
    }
    let cause = "";
    if (opts.metVisibilityM !== null && dist > opts.metVisibilityM) cause = "clima";
    else if (opts.nightUnlit && !(target.tipo === "vehiculo" && target.lights)) {
      const yaw = obs.poses[k]![2];
      const bearing = Math.atan2(ty - eye[1], tx - eye[0]);
      const off = Math.abs(Math.atan2(Math.sin(bearing - yaw), Math.cos(bearing - yaw)));
      if (!obs.lights || dist > nightDetectionM || off > half) cause = "noche";
    }
    let seen = 0;
    let firstBlock = "";
    if (!cause) {
      for (const p of pts) {
        const blocker = occ.find((o) => segmentBlocked(o, eye, p))?.id ?? null;
        if (blocker === null) seen += 1;
        else if (!firstBlock) firstBlock = blocker;
      }
    }
    const frac = !cause ? seen / pts.length : 0.0;
    res.t.push(pyRound(t, 6));
    res.visible.push(seen > 0);
    res.fraccion.push(pyRound(frac, 4));
    res.distancia.push(pyRound(dist, 4));
    res.causa.push(seen > 0 ? "" : cause || firstBlock);
  });
  return res;
}
