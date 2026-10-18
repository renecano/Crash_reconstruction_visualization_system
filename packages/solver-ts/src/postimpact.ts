/**
 * Movimiento posterior al impacto (port de `croquis_solver.postimpact`): modelo planar de 3 grados
 * de libertad con fricción saturada por llanta (bloqueada: −μN en la dirección de deslizamiento;
 * rodando: fuerza lateral saturada más arrastre). Euler semi-implícito con paso fijo hasta el
 * reposo o `tMax`.
 */
import { type Body2D, G, type State2D, Trajectory, wrapAngle } from "./models";
import { pyRound } from "./pymath";
import * as dmath from "./dmath";

/** Fracción de N (llanta rodando libre, asfalto). */
export const ROLLING_RESISTANCE = 0.015;
/** m/s, ancho de la zona lineal de la saturación lateral. */
export const V_REF_LATERAL = 0.3;
export const STOP_SPEED = 0.05;
export const STOP_YAW_RATE = 0.05;

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
    if (Math.abs(dr) > Math.abs(r) && (r === 0 || sign1(dr) !== sign1(r))) r = 0.0;
    else r += dr;
    u = uNew;
    v = vNew;
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
