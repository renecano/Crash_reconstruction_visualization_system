/**
 * Cinemática previa al impacto (port de `croquis_solver.preimpact`): trayectorias por longitud de
 * arco (recta, arco, cambio de carril, composición, carril curvo) y perfiles de velocidad con
 * percepción-reacción y frenado a desaceleración constante. Paso fijo y doble precisión.
 */
import { G, type State2D, Trajectory, type Vec, wrapAngle } from "./models";
import { pyRound, pySum } from "./pymath";
import * as dmath from "./dmath";

export interface Pose {
  x: number;
  y: number;
  /** rad */
  heading: number;
  /** 1/m (positivo = gira a la izquierda) */
  curvature: number;
}

/** Curva parametrizada por longitud de arco. */
export interface Path {
  readonly length: number;
  pose(s: number): Pose;
}

export class StraightPath implements Path {
  constructor(
    readonly origin: Vec,
    readonly heading: number,
    readonly length: number,
  ) {}

  pose(s: number): Pose {
    return {
      x: this.origin[0] + s * dmath.cos(this.heading),
      y: this.origin[1] + s * dmath.sin(this.heading),
      heading: this.heading,
      curvature: 0.0,
    };
  }
}

/** Arco circular desde `start` con rumbo `heading`; `left` elige el sentido. */
export class ArcPath implements Path {
  constructor(
    readonly start: Vec,
    readonly heading: number,
    readonly radius: number,
    readonly length: number,
    readonly left = true,
  ) {
    if (radius <= 0) throw new Error("El radio debe ser positivo");
  }

  get center(): Vec {
    const sign = this.left ? 1.0 : -1.0;
    return [
      this.start[0] - sign * this.radius * dmath.sin(this.heading),
      this.start[1] + sign * this.radius * dmath.cos(this.heading),
    ];
  }

  pose(s: number): Pose {
    const sign = this.left ? 1.0 : -1.0;
    const dtheta = (sign * s) / this.radius;
    const h = this.heading + dtheta;
    const [cx, cy] = this.center;
    return {
      x: cx + sign * this.radius * dmath.sin(h),
      y: cy - sign * this.radius * dmath.cos(h),
      heading: wrapAngle(h),
      curvature: sign / this.radius,
    };
  }
}

/** Cambio de carril suave (coseno) de `lateral` m (positivo = izquierda) en `length` m. */
export class LaneChangePath implements Path {
  constructor(
    readonly origin: Vec,
    readonly heading: number,
    readonly length: number,
    readonly lateral: number,
  ) {}

  pose(sIn: number): Pose {
    const s = Math.min(Math.max(sIn, 0.0), this.length);
    const u = s / this.length;
    const offset = 0.5 * this.lateral * (1.0 - dmath.cos(Math.PI * u));
    const dOffset = ((0.5 * this.lateral * Math.PI) / this.length) * dmath.sin(Math.PI * u);
    const ddOffset = 0.5 * this.lateral * (Math.PI / this.length) ** 2 * dmath.cos(Math.PI * u);
    const localHeading = dmath.atan(dOffset);
    // q^1.5 como q·√q: `**` con exponente no entero depende del motor (E8, ADR 0029).
    const q = 1.0 + dOffset * dOffset;
    const curvature = ddOffset / (q * Math.sqrt(q));
    const c = dmath.cos(this.heading);
    const sn = dmath.sin(this.heading);
    return {
      x: this.origin[0] + s * c - offset * sn,
      y: this.origin[1] + s * sn + offset * c,
      heading: wrapAngle(this.heading + localHeading),
      curvature,
    };
  }
}

export class CompositePath implements Path {
  constructor(readonly parts: readonly Path[]) {}

  get length(): number {
    return pySum(this.parts.map((p) => p.length));
  }

  pose(s: number): Pose {
    let remaining = s;
    const last = this.parts[this.parts.length - 1]!;
    for (const part of this.parts) {
      if (remaining <= part.length || part === last) return part.pose(remaining);
      remaining -= part.length;
    }
    return last.pose(last.length);
  }
}

/** Desaceleración (m/s²) de frenado a fondo: μ·g·factor·cos α ± g·sin α (subida frena más). */
export function brakingDeceleration(mu: number, absFactor = 1.0, gradePercent = 0.0): number {
  const alpha = dmath.atan(gradePercent / 100.0);
  return G * (mu * absFactor * dmath.cos(alpha) + dmath.sin(alpha));
}

/** Distancia para detenerse desde v0 con desaceleración constante: v0² / (2a). */
export function skidDistance(v0: number, decel: number): number {
  if (decel <= 0) throw new Error("La desaceleración debe ser positiva");
  return (v0 * v0) / (2.0 * decel);
}

/** Velocidad inicial a partir de la distancia de derrape: √(2 a d). */
export function speedFromSkid(distance: number, decel: number): number {
  return Math.sqrt(2.0 * decel * Math.max(distance, 0.0));
}

/** v0 constante; desde `tBrake` desacelera `decel` hasta parar (`decel` 0 = nunca frena). */
export class SpeedProfile {
  constructor(
    readonly v0: number,
    readonly tBrake = Infinity,
    readonly decel = 0.0,
  ) {}

  speed(t: number): number {
    if (t <= this.tBrake || this.decel <= 0) return this.v0;
    if (t >= this.stopTime) return 0.0;
    return this.v0 - this.decel * (t - this.tBrake);
  }

  distance(t: number): number {
    if (t <= this.tBrake || this.decel <= 0) return this.v0 * t;
    let tb = t - this.tBrake;
    const tStop = this.v0 / this.decel;
    tb = Math.min(tb, tStop);
    return this.v0 * this.tBrake + this.v0 * tb - 0.5 * this.decel * tb * tb;
  }

  get stopTime(): number {
    if (this.decel <= 0 || this.tBrake === Infinity) return Infinity;
    return this.tBrake + this.v0 / this.decel;
  }

  /** Instante en que se recorre `s`; null si se detiene antes. */
  timeToDistance(s: number): number | null {
    if (s <= 0) return 0.0;
    if (this.v0 <= 0) return null;
    const sBrake = this.tBrake !== Infinity ? this.v0 * this.tBrake : Infinity;
    if (s <= sBrake || this.decel <= 0) return s / this.v0;
    const rem = s - sBrake;
    const disc = this.v0 * this.v0 - 2.0 * this.decel * rem;
    if (disc < 0) return null;
    return this.tBrake + (this.v0 - Math.sqrt(disc)) / this.decel;
  }
}

/** Posición, rumbo y velocidad de t0 a tEnd (incluidos) sobre `path` con `profile`. */
export function simulate(
  path: Path,
  profile: SpeedProfile,
  opts: { tEnd: number; dt?: number; t0?: number; s0?: number },
): Trajectory {
  const { tEnd, dt = 0.02, t0 = 0.0, s0 = 0.0 } = opts;
  if (dt <= 0 || tEnd < t0) throw new Error("dt debe ser positivo y t_end ≥ t0");
  const traj = new Trajectory();
  const n = pyRound((tEnd - t0) / dt);
  for (let i = 0; i <= n; i++) {
    const t = t0 + i * dt;
    const tau = t - t0;
    const s = s0 + profile.distance(tau);
    const v = profile.speed(tau);
    const p = path.pose(Math.min(s, path.length));
    const st: State2D = {
      x: p.x,
      y: p.y,
      yaw: p.heading,
      vx: v * dmath.cos(p.heading),
      vy: v * dmath.sin(p.heading),
      yawRate: v * p.curvature,
      t,
    };
    traj.append(st);
  }
  return traj;
}

/** `bisect.bisect_left` de Python. */
export function bisectLeft(xs: readonly number[], x: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Sigue un carril circular (centro, radio inicial) y opcionalmente cambia de carril con el perfil
 * coseno de `LaneChangePath` a lo largo de `changeLength` m. La longitud de arco real sale de una
 * tabla fina, así que `s` es distancia recorrida.
 */
export class CurvedLanePath implements Path {
  private table: [number[], number[]] | null = null;

  constructor(
    readonly center: Vec,
    readonly r0: number,
    readonly phi0: number,
    readonly ccw: boolean,
    readonly length: number,
    readonly lateral = 0.0,
    readonly changeLength = 40.0,
    readonly samples = 4000,
  ) {}

  private radius(u: number): number {
    if (this.lateral === 0.0) return this.r0;
    const d =
      0.5 *
      this.lateral *
      (1.0 -
        dmath.cos((Math.PI * Math.min(Math.max(u, 0.0), this.changeLength)) / this.changeLength));
    // A la izquierda: hacia el centro si gira antihorario, hacia afuera si gira horario.
    return this.ccw ? this.r0 - d : this.r0 + d;
  }

  private point(u: number): Vec {
    const phi = this.phi0 + (this.ccw ? u / this.r0 : -u / this.r0);
    const r = this.radius(u);
    return [this.center[0] + r * dmath.cos(phi), this.center[1] + r * dmath.sin(phi)];
  }

  private getTable(): [number[], number[]] {
    if (this.table === null) {
      const uMax = 1.2 * this.length + Math.abs(this.lateral);
      const us: number[] = [];
      for (let i = 0; i <= this.samples; i++) us.push((uMax * i) / this.samples);
      const ss = [0.0];
      let prev = this.point(0.0);
      for (const u of us.slice(1)) {
        const p = this.point(u);
        ss.push(ss[ss.length - 1]! + dmath.hypot(p[0] - prev[0], p[1] - prev[1]));
        prev = p;
      }
      this.table = [us, ss];
    }
    return this.table;
  }

  private uAt(sIn: number): number {
    const [us, ss] = this.getTable();
    const s = Math.min(Math.max(sIn, 0.0), ss[ss.length - 1]!);
    const i = bisectLeft(ss, s);
    if (i <= 0) return 0.0;
    const f = ss[i]! > ss[i - 1]! ? (s - ss[i - 1]!) / (ss[i]! - ss[i - 1]!) : 0.0;
    return us[i - 1]! + f * (us[i]! - us[i - 1]!);
  }

  pose(sIn: number): Pose {
    const s = Math.min(Math.max(sIn, 0.0), this.length);
    const u = this.uAt(s);
    const h = 1e-3;
    const p0 = this.point(u - h);
    const p1 = this.point(u + h);
    const heading = dmath.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const q0 = this.point(u - 2 * h);
    const q1 = this.point(u + 2 * h);
    const pu = this.point(u);
    const h0 = dmath.atan2(pu[1] - q0[1], pu[0] - q0[0]);
    const h1 = dmath.atan2(q1[1] - pu[1], q1[0] - pu[0]);
    const dist = dmath.hypot(q1[0] - q0[0], q1[1] - q0[1]);
    const dh = dmath.atan2(dmath.sin(h1 - h0), dmath.cos(h1 - h0));
    return { x: pu[0], y: pu[1], heading, curvature: dist > 0 ? dh / (dist / 2) : 0.0 };
  }
}
