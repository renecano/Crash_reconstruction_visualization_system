/**
 * Impacto planar entre dos cuerpos rígidos con modelo de impulso (port de
 * `croquis_solver.impact`; Brach, Kudlich–Slibar).
 *
 * Contacto instantáneo en un punto P; momento lineal y angular conservados por construcción;
 * restitución `e` en la normal; en la tangente, fracción `mu` del impulso normal salvo que baste
 * menos para anular la velocidad tangencial (adherencia). Si la combinación ganaría energía
 * (paradoja de Kane) se prueban candidatos en orden y se toma el primero que no la gane.
 */
import {
  type Body2D,
  cross,
  dot,
  perp,
  rot,
  type State2D,
  unit,
  type Vec,
  velocityAt,
  withVelocity,
} from "./models";
import { degrees, pyMod } from "./pymath";
import * as dmath from "./dmath";

/**
 * Velocidad tangencial relativa que se toma como cero: si la normal sale de la velocidad relativa,
 * v_t es solo ruido de redondeo y su signo no debe decidir hacia dónde actúa la fricción.
 */
export const TANGENTIAL_ZERO_REL = 1e-9;

/** Resultado del impacto. `impulse` actúa sobre B; sobre A actúa `-impulse`. */
export interface ImpactResult {
  impulse: Vec;
  impulseNormal: number;
  impulseTangential: number;
  sticking: boolean;
  frictionUsed: number;
  aAfter: State2D;
  bAfter: State2D | null;
  deltaVA: number;
  deltaVB: number;
  /** 0 = frente, horario. */
  pdofADeg: number;
  pdofBDeg: number;
  energyLoss: number;
}

/** Grados horarios (0 = 12 h) → horas de reloj en [0, 12). */
export function pdofHours(deg: number): number {
  const h = pyMod(deg, 360.0) / 30.0;
  return Math.abs(h - 12.0) < 1e-12 ? 0.0 : h;
}

/** Dirección de la que viene la fuerza, en el marco del cuerpo, grados horarios (0 = frente). */
export function pdofDegrees(s: State2D, forceWorld: Vec): number {
  const fBody = rot(forceWorld, -s.yaw);
  const d: Vec = [-fBody[0], -fBody[1]];
  const deg = pyMod(degrees(dmath.atan2(-d[1], d[0])), 360.0);
  return deg >= 360.0 - 1e-9 ? 0.0 : deg;
}

function kMatrix(body: Body2D, s: State2D, point: Vec): [number, number, number] {
  const r: Vec = [point[0] - s.x, point[1] - s.y];
  const sv = perp(r);
  const invM = 1.0 / body.mass;
  const invI = 1.0 / body.inertia;
  return [invM + sv[0] * sv[0] * invI, sv[0] * sv[1] * invI, invM + sv[1] * sv[1] * invI];
}

function apply(body: Body2D, s: State2D, point: Vec, impulse: Vec): State2D {
  const r: Vec = [point[0] - s.x, point[1] - s.y];
  return withVelocity(
    s,
    s.vx + impulse[0] / body.mass,
    s.vy + impulse[1] / body.mass,
    s.yawRate + cross(r, impulse) / body.inertia,
  );
}

function ke(body: Body2D, s: State2D): number {
  return 0.5 * body.mass * (s.vx ** 2 + s.vy ** 2) + 0.5 * body.inertia * s.yawRate ** 2;
}

interface Candidate {
  jN: number;
  jT: number;
  sticking: boolean;
  friction: number;
}

function candidates(
  kNN: number,
  kNT: number,
  kTT: number,
  vN: number,
  vT: number,
  restitution: number,
  friction: number,
): Candidate[] {
  const rhsN = -(1.0 + restitution) * vN;
  const out: Candidate[] = [];
  const det = kNN * kTT - kNT * kNT;
  if (det > 0) {
    const jNStick = (rhsN * kTT + kNT * vT) / det;
    const jTStick = (-kNN * vT - kNT * rhsN) / det;
    if (jNStick > 0 && Math.abs(jTStick) <= friction * jNStick * (1 + 1e-12)) {
      out.push({ jN: jNStick, jT: jTStick, sticking: true, friction });
    }
  }
  const sgn = vT > 0 ? -1.0 : vT < 0 ? 1.0 : 0.0;
  let mu = friction;
  for (let i = 0; i < 8; i++) {
    const denom = kNN + sgn * mu * kNT;
    if (denom > 0) {
      const jN = rhsN / denom;
      if (jN > 0) out.push({ jN, jT: sgn * mu * jN, sticking: false, friction: mu });
    }
    if (mu === 0.0) break;
    mu = mu < 1e-6 ? 0.0 : mu / 2.0;
  }
  if (out.length === 0 || out[out.length - 1]!.friction !== 0.0) {
    out.push({ jN: rhsN / kNN, jT: 0.0, sticking: false, friction: 0.0 });
  }
  return out;
}

export interface ImpactOptions {
  restitution?: number;
  friction?: number;
}

/**
 * Impulso en `point` con normal `normal` (de A hacia B). Si `bodyB` es null, B es una barrera
 * fija (masa infinita).
 */
export function planarImpact(
  bodyA: Body2D,
  stateA: State2D,
  bodyB: Body2D | null,
  stateB: State2D | null,
  point: Vec,
  normal: Vec,
  opts: ImpactOptions = {},
): ImpactResult {
  const restitution = opts.restitution ?? 0.1;
  const friction = opts.friction ?? 0.4;
  if (!(restitution >= 0.0 && restitution <= 1.0)) {
    throw new Error("La restitución debe estar en [0, 1]");
  }
  if (friction < 0) throw new Error("La fricción de contacto no puede ser negativa");
  const n = unit(normal);
  const t = perp(n);
  const hasB = bodyB !== null && stateB !== null;
  const vPA = velocityAt(stateA, point);
  const vPB: Vec = stateB !== null ? velocityAt(stateB, point) : [0.0, 0.0];
  const vRel: Vec = [vPB[0] - vPA[0], vPB[1] - vPA[1]];
  const vN = dot(vRel, n);
  let vT = dot(vRel, t);
  if (Math.abs(vT) <= TANGENTIAL_ZERO_REL * Math.abs(vN)) vT = 0.0;
  if (vN >= 0) {
    return {
      impulse: [0.0, 0.0],
      impulseNormal: 0.0,
      impulseTangential: 0.0,
      sticking: false,
      frictionUsed: friction,
      aAfter: stateA,
      bAfter: stateB,
      deltaVA: 0.0,
      deltaVB: 0.0,
      pdofADeg: pdofDegrees(stateA, [-n[0], -n[1]]),
      pdofBDeg: stateB !== null ? pdofDegrees(stateB, n) : 0.0,
      energyLoss: 0.0,
    };
  }
  let [kxx, kxy, kyy] = kMatrix(bodyA, stateA, point);
  if (bodyB !== null && stateB !== null) {
    const [bxx, bxy, byy] = kMatrix(bodyB, stateB, point);
    [kxx, kxy, kyy] = [kxx + bxx, kxy + bxy, kyy + byy];
  }
  const kNN = kxx * n[0] * n[0] + 2 * kxy * n[0] * n[1] + kyy * n[1] * n[1];
  const kTT = kxx * t[0] * t[0] + 2 * kxy * t[0] * t[1] + kyy * t[1] * t[1];
  const kNT = kxx * n[0] * t[0] + kxy * (n[0] * t[1] + n[1] * t[0]) + kyy * n[1] * t[1];
  const keBefore = ke(bodyA, stateA) + (hasB ? ke(bodyB, stateB) : 0.0);
  let chosen: [Candidate, Vec, State2D, State2D | null, number] | null = null;
  for (const cand of candidates(kNN, kNT, kTT, vN, vT, restitution, friction)) {
    const impulse: Vec = [cand.jN * n[0] + cand.jT * t[0], cand.jN * n[1] + cand.jT * t[1]];
    const aAfter = apply(bodyA, stateA, point, [-impulse[0], -impulse[1]]);
    const bAfter = hasB ? apply(bodyB, stateB, point, impulse) : null;
    const keAfter = ke(bodyA, aAfter) + (hasB && bAfter ? ke(bodyB, bAfter) : 0.0);
    const loss = keBefore - keAfter;
    if (loss >= -1e-9 * Math.max(keBefore, 1.0)) {
      chosen = [cand, impulse, aAfter, bAfter, Math.max(loss, 0.0)];
      break;
    }
  }
  if (chosen === null) throw new Error("No se encontró un impulso que no gane energía");
  const [cand, impulse, aAfter, bAfter, loss] = chosen;
  const jMag = dmath.hypot(impulse[0], impulse[1]);
  const forceOnA: Vec = jMag > 0 ? [-impulse[0], -impulse[1]] : [-n[0], -n[1]];
  const forceOnB: Vec = jMag > 0 ? impulse : n;
  return {
    impulse,
    impulseNormal: cand.jN,
    impulseTangential: cand.jT,
    sticking: cand.sticking,
    frictionUsed: cand.friction,
    aAfter,
    bAfter,
    deltaVA: jMag / bodyA.mass,
    deltaVB: bodyB !== null ? jMag / bodyB.mass : 0.0,
    pdofADeg: pdofDegrees(stateA, forceOnA),
    pdofBDeg: stateB !== null ? pdofDegrees(stateB, forceOnB) : 0.0,
    energyLoss: loss,
  };
}

/** Choque central en línea (solución cerrada) para verificar el modelo planar. */
export function centralCollision1d(
  mA: number,
  vA: number,
  mB: number,
  vB: number,
  e: number,
): [number, number] {
  const total = mA + mB;
  return [
    (mA * vA + mB * vB + mB * e * (vB - vA)) / total,
    (mA * vA + mB * vB + mA * e * (vA - vB)) / total,
  ];
}
