/**
 * Movimiento posterior al impacto (port de `croquis_solver.postimpact`): modelo planar de 3 grados
 * de libertad con fricción saturada por llanta (bloqueada: −μN en la dirección de deslizamiento;
 * rodando: fuerza lateral saturada más arrastre). Euler semi-implícito con paso fijo hasta el
 * reposo o `tMax`.
 *
 * Los vehículos de un choque entre vehículos se integran juntos (`integrateJoint`, ADR 0063):
 * avanzan al mismo paso y, si sus contornos se encajan más de lo permitido, se resuelve el contacto
 * secundario (impulso plástico en la normal y separación de lo que sobra). En una carambola, los
 * impactos declarados después del primero ocurren en esa misma integración, cuando los contornos
 * del par se tocan acercándose, con el impulso del primer impacto (`planarImpact`, ADR 0066).
 */
import { type ImpactResult, planarImpact } from "./impact";
import {
  type Body2D,
  G,
  type State2D,
  Trajectory,
  type Vec,
  speed,
  velocityAt,
  wrapAngle,
} from "./models";
import { pyRound } from "./pymath";
import * as dmath from "./dmath";

/** Fracción de N (llanta rodando libre, asfalto). */
export const ROLLING_RESISTANCE = 0.015;
/** m/s, ancho de la zona lineal de la saturación lateral. */
export const V_REF_LATERAL = 0.3;
export const STOP_SPEED = 0.05;
export const STOP_YAW_RATE = 0.05;
/**
 * m/s: a qué ritmo se deshace el encaje con que arrancan dos contornos en el instante del impacto
 * (2 mm por paso, 2 cm por cuadro de 0.02 s): lo bastante lento para no verse como un salto y
 * mucho más rápido que lo que dura la fase posterior (ADR 0063).
 */
export const DEPENETRATION_SPEED = 1.0;
/**
 * m: la normal de un contacto secundario se mantiene mientras dure el contacto y solo cambia a otro
 * eje si ese separa con al menos esto menos. Sin ella, dos ejes casi empatados se turnan de un paso
 * a otro por el redondeo y el empujón cambia de dirección (ADR 0063).
 */
export const AXIS_HYSTERESIS = 0.05;

/** Posición de cada llanta en el cuerpo (x adelante, y izquierda) y si va bloqueada. */
export interface WheelConfig {
  positions: readonly (readonly [number, number])[];
  locked: readonly boolean[];
  loadFractions: readonly number[];
}

export function fourWheels(
  wheelbase: number,
  track: number,
  cgFromFrontAxle: number,
  locked: boolean | readonly [boolean, boolean, boolean, boolean] = true,
): WheelConfig {
  const a = cgFromFrontAxle;
  const b = wheelbase - a;
  if (a <= 0 || b <= 0) throw new Error("El centro de gravedad debe quedar entre los ejes");
  const frontShare = b / wheelbase / 2.0;
  const rearShare = a / wheelbase / 2.0;
  const lk = typeof locked === "boolean" ? [locked, locked, locked, locked] : [...locked];
  return {
    positions: [
      [a, track / 2],
      [a, -track / 2],
      [-b, track / 2],
      [-b, -track / 2],
    ],
    locked: lk,
    loadFractions: [frontShare, frontShare, rearShare, rearShare],
  };
}

export interface PostImpactResult {
  trajectory: Trajectory;
  stopped: boolean;
  /** m recorridos por el CG */
  distance: number;
  duration: number;
  energyDissipated: number;
}

/** `math.copysign(1, x)` (distingue −0). */
function sign1(x: number): number {
  return x < 0 || Object.is(x, -0) ? -1 : 1;
}

function tireForce(
  uC: number,
  vC: number,
  normalLoad: number,
  mu: number,
  locked: boolean,
  rollingDrag: number,
): [number, number] {
  if (locked) {
    const speed = dmath.hypot(uC, vC);
    if (speed < 1e-9) return [0.0, 0.0];
    const f = mu * normalLoad;
    return [(-f * uC) / speed, (-f * vC) / speed];
  }
  const fLat = -mu * normalLoad * Math.max(-1.0, Math.min(1.0, vC / V_REF_LATERAL));
  const sgn = uC > 1e-9 ? 1.0 : uC < -1e-9 ? -1.0 : 0.0;
  return [-rollingDrag * normalLoad * sgn, fLat];
}

/** Avanza `value` en `delta` sin que la fricción invierta el sentido en un solo paso. */
function stepComponent(value: number, delta: number, other: number): number {
  const reverses =
    Math.abs(delta) > Math.abs(value) && (value === 0 || sign1(delta) !== sign1(value));
  if (reverses) return Math.abs(other) < STOP_SPEED ? 0.0 : value + delta;
  return value + delta;
}

/** Un paso de las velocidades (u, v, r), en el marco del cuerpo, con la fricción de llantas. */
function advance(
  body: Body2D,
  wheels: WheelConfig,
  mu: number,
  rollingDrag: number,
  u: number,
  v: number,
  r: number,
  dt: number,
): [number, number, number] {
  const m = body.mass;
  const inertia = body.inertia;
  let fxTot = 0.0;
  let fyTot = 0.0;
  let mz = 0.0;
  for (let k = 0; k < wheels.positions.length; k++) {
    const [px, py] = wheels.positions[k]!;
    const uC = u - r * py;
    const vC = v + r * px;
    const [fx, fy] = tireForce(
      uC,
      vC,
      m * G * wheels.loadFractions[k]!,
      mu,
      wheels.locked[k]!,
      rollingDrag,
    );
    fxTot += fx;
    fyTot += fy;
    mz += px * fy - py * fx;
  }
  const du = (fxTot / m + r * v) * dt;
  const dv = (fyTot / m - r * u) * dt;
  const dr = (mz / inertia) * dt;
  const uNew = stepComponent(u, du, v);
  const vNew = stepComponent(v, dv, u);
  const rNew = Math.abs(dr) > Math.abs(r) && (r === 0 || sign1(dr) !== sign1(r)) ? 0.0 : r + dr;
  return [uNew, vNew, rNew];
}

export interface IntegrateOptions {
  dt?: number;
  dtOut?: number;
  tMax?: number;
  rollingDrag?: number;
}

/** Integra desde `start` hasta el reposo (`start.t` es el instante inicial). */
export function integrate(
  body: Body2D,
  start: State2D,
  wheels: WheelConfig,
  mu: number,
  opts: IntegrateOptions = {},
): PostImpactResult {
  const { dt = 0.002, dtOut = 0.02, tMax = 30.0, rollingDrag = ROLLING_RESISTANCE } = opts;
  if (dt <= 0 || dtOut < dt) throw new Error("dt debe ser positivo y dt_out ≥ dt");
  const m = body.mass;
  const inertia = body.inertia;
  let x = start.x;
  let y = start.y;
  let yaw = start.yaw;
  let c = dmath.cos(yaw);
  let s = dmath.sin(yaw);
  let u = start.vx * c + start.vy * s;
  let v = -start.vx * s + start.vy * c;
  let r = start.yawRate;
  let t = start.t;
  const traj = new Trajectory();
  traj.append(start);
  const ke0 = 0.5 * m * (u * u + v * v) + 0.5 * inertia * r * r;
  const stepsPerOut = Math.max(1, pyRound(dtOut / dt));
  let step = 0;
  let distance = 0.0;
  let stopped = false;
  let xPrev = x;
  let yPrev = y;
  while (t < start.t + tMax - 1e-12) {
    [u, v, r] = advance(body, wheels, mu, rollingDrag, u, v, r, dt);
    yaw = wrapAngle(yaw + r * dt);
    c = dmath.cos(yaw);
    s = dmath.sin(yaw);
    const vx = u * c - v * s;
    const vy = u * s + v * c;
    x += vx * dt;
    y += vy * dt;
    t += dt;
    step += 1;
    const speed = dmath.hypot(u, v);
    if (step % stepsPerOut === 0) {
      traj.append({ x, y, yaw, vx, vy, yawRate: r, t });
      distance += dmath.hypot(x - xPrev, y - yPrev);
      xPrev = x;
      yPrev = y;
    }
    if (speed < STOP_SPEED && Math.abs(r) < STOP_YAW_RATE) {
      stopped = true;
      if (step % stepsPerOut !== 0) {
        traj.append({ x, y, yaw, vx: 0.0, vy: 0.0, yawRate: 0.0, t });
        distance += dmath.hypot(x - xPrev, y - yPrev);
      }
      break;
    }
  }
  const ke1 = 0.5 * m * (u * u + v * v) + 0.5 * inertia * r * r;
  return {
    trajectory: traj,
    stopped,
    distance,
    duration: t - start.t,
    energyDissipated: Math.max(ke0 - ke1, 0.0),
  };
}

// ---- integración conjunta y contacto secundario (ADR 0063) ----------------------------------

/**
 * Un vehículo en la integración conjunta: cuerpo, arranque, llantas y aplastamiento. `crush` es
 * la profundidad máxima de su perfil de daño (m) y `crushFace` la cara dañada según el lado de su
 * CDC (F, B, L o R): su contorno para el contacto secundario es la caja con esa cara hundida esa
 * profundidad.
 *
 * `dragAfterImpact`: en una carambola, un vehículo que todavía no choca rueda con `rollingDrag` y
 * pasa a este arrastre desde su primer impacto (ADR 0066). Sin él, siempre `rollingDrag`.
 */
export interface JointBody {
  body: Body2D;
  start: State2D;
  wheels: WheelConfig;
  mu: number;
  rollingDrag?: number;
  crush?: number;
  crushFace?: string;
  dragAfterImpact?: number | null;
}

/** Adelante, atrás, izquierda, derecha (m, desde el CG). */
export type Extents = readonly [number, number, number, number];

/**
 * Distancias del CG a cada cara de la caja, con la cara dañada hundida `crush` metros. El
 * hundimiento se acota a la mitad de la dimensión para que la caja nunca se invierta.
 */
export function deformedExtents(
  length: number,
  width: number,
  crush: number,
  face: string,
): Extents {
  const hl = length / 2;
  const hw = width / 2;
  let front = hl;
  let rear = hl;
  let left = hw;
  let right = hw;
  if (face === "B") rear = hl - Math.min(crush, hl);
  else if (face === "L") left = hw - Math.min(crush, hw);
  else if (face === "R") right = hw - Math.min(crush, hw);
  else front = hl - Math.min(crush, hl);
  return [front, rear, left, right];
}

/** Esquinas de la caja con esas distancias a sus caras, en el mundo (CG en (x, y)). */
export function boxCorners(x: number, y: number, yaw: number, extents: Extents): Vec[] {
  return corners(x, y, dmath.cos(yaw), dmath.sin(yaw), extents);
}

function corners(x: number, y: number, c: number, s: number, extents: Extents): Vec[] {
  const [front, rear, left, right] = extents;
  const local: [number, number][] = [
    [front, left],
    [front, -right],
    [-rear, -right],
    [-rear, left],
  ];
  return local.map(([a, b]) => [x + a * c - b * s, y + a * s + b * c] as const);
}

/**
 * Traslapes de dos rectángulos convexos por el teorema del eje separador: para cada eje (las
 * normales de las aristas de `a`, luego las de `b`) y cada sentido, cuánto hay que mover `b` en ese
 * sentido para separarlos y ese sentido unitario; 16 pares, en ese orden. Si algún eje los separa,
 * devuelve null.
 */
export function axisOverlaps(a: readonly Vec[], b: readonly Vec[]): [number, Vec][] | null {
  const out: [number, Vec][] = [];
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % 4]!;
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      const ln = dmath.hypot(nx, ny);
      const ex = nx / ln;
      const ey = ny / ln;
      const pa = a.map(([vx, vy]) => vx * ex + vy * ey);
      const pb = b.map(([vx, vy]) => vx * ex + vy * ey);
      const forward = Math.max(...pa) - Math.min(...pb);
      const backward = Math.max(...pb) - Math.min(...pa);
      if (forward <= 0 || backward <= 0) return null;
      out.push([forward, [ex, ey]]);
      out.push([backward, [-ex, -ey]]);
    }
  }
  return out;
}

function argmin(overlaps: readonly [number, Vec][]): number {
  let best = 0;
  for (let k = 1; k < overlaps.length; k++) if (overlaps[k]![0] < overlaps[best]![0]) best = k;
  return best;
}

/**
 * Penetración de dos rectángulos convexos: el menor desplazamiento de `b` que los separa y su
 * sentido (en un empate gana el primero de `axisOverlaps`). Si no se tocan, [0, [0, 0]].
 */
export function boxPenetration(a: readonly Vec[], b: readonly Vec[]): [number, Vec] {
  const ov = axisOverlaps(a, b);
  if (ov === null) return [0.0, [0.0, 0.0]];
  return ov[argmin(ov)]!;
}

/** Estado mutable de un cuerpo durante la integración conjunta. */
export class JointState {
  ke1 = 0.0;
  readonly traj = new Trajectory();
  keep = 1;
  moved = false;
  distance = 0.0;
  xPrev = 0.0;
  yPrev = 0.0;
  drag = 0.0;

  private constructor(
    readonly spec: JointBody,
    readonly extents: Extents,
    public x: number,
    public y: number,
    public yaw: number,
    public c: number,
    public s: number,
    public u: number,
    public v: number,
    public r: number,
    public vx: number,
    public vy: number,
    public active: boolean,
    readonly ke0: number,
  ) {}

  /** Estado inicial: velocidades al marco del cuerpo; en reposo si arranca sin velocidad. */
  static fromBody(spec: JointBody): JointState {
    const st = spec.start;
    const c = dmath.cos(st.yaw);
    const s = dmath.sin(st.yaw);
    const u = st.vx * c + st.vy * s;
    const v = -st.vx * s + st.vy * c;
    const r = st.yawRate;
    const m = spec.body.mass;
    const inertia = spec.body.inertia;
    const ke0 = 0.5 * m * (u * u + v * v) + 0.5 * inertia * r * r;
    const active = dmath.hypot(st.vx, st.vy) > STOP_SPEED || Math.abs(st.yawRate) > STOP_YAW_RATE;
    const ext = deformedExtents(
      spec.body.length,
      spec.body.width,
      spec.crush ?? 0.0,
      spec.crushFace ?? "F",
    );
    const j = new JointState(
      spec,
      ext,
      st.x,
      st.y,
      st.yaw,
      c,
      s,
      u,
      v,
      r,
      st.vx,
      st.vy,
      active,
      ke0,
    );
    j.drag = spec.rollingDrag ?? ROLLING_RESISTANCE;
    if (!active) {
      j.ke1 = ke0;
      j.u = j.v = j.r = j.vx = j.vy = 0.0;
    }
    j.traj.append(st);
    j.xPrev = st.x;
    j.yPrev = st.y;
    return j;
  }
}

function cornersOf(j: JointState): Vec[] {
  // j.c y j.s son siempre cos y sin de j.yaw: los mismos bits, sin volver a calcularlos.
  return corners(j.x, j.y, j.c, j.s, j.extents);
}

function kinetic(j: JointState): number {
  const m = j.spec.body.mass;
  const inertia = j.spec.body.inertia;
  return 0.5 * m * (j.u * j.u + j.v * j.v) + 0.5 * inertia * j.r * j.r;
}

function setWorldVelocity(j: JointState, vx: number, vy: number): void {
  j.vx = vx;
  j.vy = vy;
  j.u = vx * j.c + vy * j.s;
  j.v = -vx * j.s + vy * j.c;
}

/**
 * Contacto secundario entre dos contornos deformados que se encajan más que `allowance` (m); port
 * de `croquis_solver.postimpact.resolve_secondary_contact` (ver ahí el modelo). La normal es la del
 * menor traslape, conservada mientras dura el contacto (`axis`) salvo que otra separe con
 * `AXIS_HYSTERESIS` menos. Devuelve el encaje que queda en esa normal y la normal del contacto
 * (null si no hay contacto).
 */
export function resolveSecondaryContact(
  a: JointState,
  b: JointState,
  allowance: number,
  axis: number | null = null,
): [number, number | null] {
  const ov = axisOverlaps(cornersOf(a), cornersOf(b));
  if (ov === null) return [0.0, null];
  let k = argmin(ov);
  if (axis !== null && ov[k]![0] >= ov[axis]![0] - AXIS_HYSTERESIS) k = axis;
  const [depth, n] = ov[k]!;
  const excess = depth - allowance;
  if (excess <= 0) return [depth, axis === null ? null : k];
  let wa = 1.0 / a.spec.body.mass;
  let wb = 1.0 / b.spec.body.mass;
  const vRel = (b.vx - a.vx) * n[0] + (b.vy - a.vy) * n[1];
  if (vRel < 0) {
    const impulse = -vRel / (wa + wb);
    const ax = a.vx - impulse * wa * n[0];
    const ay = a.vy - impulse * wa * n[1];
    const bx = b.vx + impulse * wb * n[0];
    const by = b.vy + impulse * wb * n[1];
    const aMoves = a.active || dmath.hypot(ax, ay) >= STOP_SPEED;
    const bMoves = b.active || dmath.hypot(bx, by) >= STOP_SPEED;
    if (aMoves && bMoves) {
      setWorldVelocity(a, ax, ay);
      setWorldVelocity(b, bx, by);
      a.active = true;
      b.active = true;
    } else if (aMoves) {
      setWorldVelocity(a, a.vx + vRel * n[0], a.vy + vRel * n[1]);
    } else if (bMoves) {
      setWorldVelocity(b, b.vx - vRel * n[0], b.vy - vRel * n[1]);
    }
  }
  if (a.active || b.active) {
    wa = a.active ? wa : 0.0;
    wb = b.active ? wb : 0.0;
  }
  const shareA = wa / (wa + wb);
  const shareB = wb / (wa + wb);
  if (shareA > 0) {
    a.x -= excess * shareA * n[0];
    a.y -= excess * shareA * n[1];
    a.moved = true;
  }
  if (shareB > 0) {
    b.x += excess * shareB * n[0];
    b.y += excess * shareB * n[1];
    b.moved = true;
  }
  return [allowance, k];
}

/**
 * Un impacto declarado después del primero, entre los cuerpos `a` y `b` (índices en la integración
 * conjunta): ocurre la primera vez que sus contornos se tocan acercándose.
 */
export interface PlannedImpact {
  a: number;
  b: number;
  eventId: string;
  restitution: number;
  friction: number;
}

/** Un impacto posterior que ocurrió: cuándo, dónde, entre quiénes y su impulso. */
export interface JointImpact {
  eventId: string;
  t: number;
  a: number;
  b: number;
  point: Vec;
  /** De `a` hacia `b`. */
  normal: Vec;
  aBefore: State2D;
  bBefore: State2D;
  result: ImpactResult;
}

/** Si `p` está dentro del cuadrilátero convexo `poly` (o en su borde). */
function inside(p: Vec, poly: readonly Vec[]): boolean {
  let sign = 0.0;
  for (let i = 0; i < 4; i++) {
    const q = poly[i]!;
    const r = poly[(i + 1) % 4]!;
    const cr = (r[0] - q[0]) * (p[1] - q[1]) - (r[1] - q[1]) * (p[0] - q[0]);
    if (cr === 0) continue;
    if (sign === 0) sign = cr;
    else if (cr > 0 !== sign > 0) return false;
  }
  return true;
}

const mean = (pts: readonly Vec[]): Vec => [
  pts.reduce((acc, q) => acc + q[0], 0) / pts.length,
  pts.reduce((acc, q) => acc + q[1], 0) / pts.length,
];

/**
 * Punto de contacto de dos contornos que se encajan: el promedio de las esquinas de cada uno que
 * quedan dentro del otro; si ninguna queda dentro (se cruzan solo las aristas), el punto medio
 * entre los centros de los dos.
 */
export function contactPoint(a: readonly Vec[], b: readonly Vec[]): Vec {
  let pts = [...a.filter((p) => inside(p, b)), ...b.filter((p) => inside(p, a))];
  if (pts.length === 0) pts = [mean(a), mean(b)];
  return mean(pts);
}

function stateOf(j: JointState, t: number): State2D {
  return { x: j.x, y: j.y, yaw: j.yaw, vx: j.vx, vy: j.vy, yawRate: j.r, t };
}

/** Las velocidades de `st` (mundo) en el cuerpo; activo si con ellas no está en reposo. */
function setMotion(j: JointState, st: State2D): void {
  setWorldVelocity(j, st.vx, st.vy);
  j.r = st.yawRate;
  j.active = speed(st) > STOP_SPEED || Math.abs(st.yawRate) > STOP_YAW_RATE;
  if (!j.active) j.u = j.v = j.r = j.vx = j.vy = 0.0;
}

/**
 * El impacto declarado entre `a` y `b` si sus contornos se tocan y se acercan en el punto de
 * contacto; aplica el impulso a los dos. null si todavía no ocurre.
 */
function tryImpact(
  a: JointState,
  b: JointState,
  plan: PlannedImpact,
  t: number,
): JointImpact | null {
  const ca = cornersOf(a);
  const cb = cornersOf(b);
  const ov = axisOverlaps(ca, cb);
  if (ov === null) return null;
  const n = ov[argmin(ov)]![1];
  const point = contactPoint(ca, cb);
  const sa = stateOf(a, t);
  const sb = stateOf(b, t);
  const va = velocityAt(sa, point);
  const vb = velocityAt(sb, point);
  if ((vb[0] - va[0]) * n[0] + (vb[1] - va[1]) * n[1] >= 0) return null;
  const res = planarImpact(a.spec.body, sa, b.spec.body, sb, point, n, {
    restitution: plan.restitution,
    friction: plan.friction,
  });
  for (const [j, st] of [
    [a, res.aAfter],
    [b, res.bAfter!],
  ] as const) {
    setMotion(j, st);
    j.moved = true;
    if (j.spec.dragAfterImpact !== undefined && j.spec.dragAfterImpact !== null)
      j.drag = j.spec.dragAfterImpact;
  }
  return {
    eventId: plan.eventId,
    t,
    a: plan.a,
    b: plan.b,
    point,
    normal: n,
    aBefore: sa,
    bBefore: sb,
    result: res,
  };
}

function sample(j: JointState, s: State2D): void {
  j.traj.append(s);
  j.distance += dmath.hypot(j.x - j.xPrev, j.y - j.yPrev);
  j.xPrev = j.x;
  j.yPrev = j.y;
}

function truncate(tr: Trajectory, n: number): void {
  for (const col of [tr.t, tr.x, tr.y, tr.yaw, tr.vx, tr.vy, tr.yawRate]) col.length = n;
}

export interface JointOptions {
  dt?: number;
  dtOut?: number;
  tMax?: number;
  /** Impactos declarados después del primero (carambola, ADR 0066). */
  impacts?: readonly PlannedImpact[];
}

/** `integrateJointImpacts` sin impactos posteriores: solo las trayectorias. */
export function integrateJoint(
  bodies: readonly JointBody[],
  opts: JointOptions = {},
): PostImpactResult[] {
  return integrateJointImpacts(bodies, opts)[0];
}

/**
 * Integra juntos los vehículos de un choque entre vehículos, con contacto secundario (port de
 * `croquis_solver.postimpact.integrate_joint_impacts`; ver ahí el modelo y sus límites, y los ADR
 * 0063 y 0066). Sin contacto, cada resultado es idéntico al de `integrate`. Devuelve también los
 * impactos posteriores que ocurrieron, en orden.
 */
export function integrateJointImpacts(
  bodies: readonly JointBody[],
  opts: JointOptions = {},
): [PostImpactResult[], JointImpact[]] {
  const { dt = 0.002, dtOut = 0.02, tMax = 30.0, impacts = [] } = opts;
  if (dt <= 0 || dtOut < dt) throw new Error("dt debe ser positivo y dt_out ≥ dt");
  const t0 = bodies.length > 0 ? bodies[0]!.start.t : 0.0;
  const joints = bodies.map((spec) => JointState.fromBody(spec));
  const pairs: [JointState, JointState][] = [];
  const allowances: number[] = [];
  const axes: (number | null)[] = [];
  const pending = new Map<number, PlannedImpact>();
  for (let i = 0; i < joints.length; i++) {
    for (let k = i + 1; k < joints.length; k++) {
      const a = joints[i]!;
      const b = joints[k]!;
      for (const plan of impacts) {
        const samePair = (plan.a === i && plan.b === k) || (plan.a === k && plan.b === i);
        if (samePair && !pending.has(pairs.length)) pending.set(pairs.length, plan);
      }
      pairs.push([a, b]);
      allowances.push(boxPenetration(cornersOf(a), cornersOf(b))[0]);
      axes.push(null);
    }
  }
  const happened: JointImpact[] = [];
  const stepsPerOut = Math.max(1, pyRound(dtOut / dt));
  let step = 0;
  let t = t0;
  const relax = DEPENETRATION_SPEED * dt;
  while (t < t0 + tMax - 1e-12 && (joints.some((j) => j.active) || allowances.some((w) => w > 0))) {
    for (const j of joints) {
      if (!j.active) continue;
      const sp = j.spec;
      [j.u, j.v, j.r] = advance(sp.body, sp.wheels, sp.mu, j.drag, j.u, j.v, j.r, dt);
      j.yaw = wrapAngle(j.yaw + j.r * dt);
      j.c = dmath.cos(j.yaw);
      j.s = dmath.sin(j.yaw);
      j.vx = j.u * j.c - j.v * j.s;
      j.vy = j.u * j.s + j.v * j.c;
      j.x += j.vx * dt;
      j.y += j.vy * dt;
    }
    t += dt;
    step += 1;
    for (let k = 0; k < pairs.length; k++) {
      const [a, b] = pairs[k]!;
      const plan = pending.get(k);
      if (plan !== undefined) {
        const hit = tryImpact(joints[plan.a]!, joints[plan.b]!, plan, t);
        if (hit !== null) {
          happened.push(hit);
          pending.delete(k);
          // Desde ahí el encaje de ese instante es el permitido, como en el primero.
          const ov = axisOverlaps(cornersOf(a), cornersOf(b));
          if (ov !== null) {
            const ax = argmin(ov);
            axes[k] = ax;
            allowances[k] = Math.max(allowances[k]!, ov[ax]![0]);
          }
        }
      }
      const [left, axis] = resolveSecondaryContact(a, b, allowances[k]!, axes[k] ?? null);
      axes[k] = axis;
      allowances[k] = Math.max(0.0, Math.min(allowances[k]!, left) - relax);
    }
    const onGrid = step % stepsPerOut === 0;
    for (const j of joints) {
      if (j.active) {
        const spd = dmath.hypot(j.u, j.v);
        if (onGrid) sample(j, { x: j.x, y: j.y, yaw: j.yaw, vx: j.vx, vy: j.vy, yawRate: j.r, t });
        if (spd < STOP_SPEED && Math.abs(j.r) < STOP_YAW_RATE) {
          if (!onGrid) sample(j, { x: j.x, y: j.y, yaw: j.yaw, vx: 0.0, vy: 0.0, yawRate: 0.0, t });
          j.ke1 = kinetic(j);
          j.active = false;
          j.u = j.v = j.r = j.vx = j.vy = 0.0;
        }
        j.keep = j.traj.length;
        j.moved = false;
      } else if (onGrid) {
        sample(j, { x: j.x, y: j.y, yaw: j.yaw, vx: 0.0, vy: 0.0, yawRate: 0.0, t });
        if (j.moved) {
          j.keep = j.traj.length;
          j.moved = false;
        }
      }
    }
  }
  const results = joints.map((j) => {
    if (j.moved) {
      sample(j, { x: j.x, y: j.y, yaw: j.yaw, vx: 0.0, vy: 0.0, yawRate: 0.0, t });
      j.keep = j.traj.length;
    }
    if (j.active) j.ke1 = kinetic(j);
    const tr = j.traj;
    truncate(tr, j.keep);
    const end = j.active ? t : tr.t[tr.length - 1]!;
    return {
      trajectory: tr,
      stopped: !j.active,
      distance: j.distance,
      duration: end - j.spec.start.t,
      energyDissipated: Math.max(j.ke0 - j.ke1, 0.0),
    };
  });
  return [results, happened];
}
