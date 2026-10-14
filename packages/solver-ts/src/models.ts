/**
 * Tipos básicos del solver (port de `croquis_solver.models`): cuerpos rígidos planos y estados
 * cinemáticos, todo en SI.
 *
 * Marco de referencia: X al este, Y al norte, ángulos en radianes antihorarios desde +X. Marco del
 * cuerpo: x hacia el frente, y hacia la izquierda.
 */
export const G = 9.80665;

export type Vec = readonly [number, number];

export function rot(v: Vec, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

export function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1];
}

/** Producto cruz escalar en 2D (componente z). */
export function cross(a: Vec, b: Vec): number {
  return a[0] * b[1] - a[1] * b[0];
}

export function norm(v: Vec): number {
  return Math.hypot(v[0], v[1]);
}

export function unit(v: Vec): Vec {
  const n = norm(v);
  if (n === 0) throw new Error("No se puede normalizar el vector cero");
  return [v[0] / n, v[1] / n];
}

/** Vector girado +90° (k × v). */
export function perp(v: Vec): Vec {
  return [-v[1], v[0]];
}

/** Lleva un ángulo a (−π, π]. */
export function wrapAngle(a: number): number {
  let r = (a + Math.PI) % (2 * Math.PI);
  if (r <= 0) r += 2 * Math.PI;
  return r - Math.PI;
}

/** Cuerpo rígido plano (vehículo visto desde arriba). */
export class Body2D {
  constructor(
    readonly mass: number,
    readonly inertia: number,
    readonly length: number,
    readonly width: number,
  ) {
    if (mass <= 0 || inertia <= 0 || length <= 0 || width <= 0) {
      throw new Error("Masa, inercia y dimensiones deben ser positivas");
    }
  }

  /** Inercia de guiñada de una placa rectangular uniforme (aproximación documentada). */
  static boxInertia(mass: number, length: number, width: number): number {
    return (mass * (length ** 2 + width ** 2)) / 12;
  }

  static fromDimensions(mass: number, length: number, width: number): Body2D {
    return new Body2D(mass, Body2D.boxInertia(mass, length, width), length, width);
  }
}

/** Estado cinemático en el marco del mundo. */
export interface State2D {
  readonly x: number;
  readonly y: number;
  readonly yaw: number;
  readonly vx: number;
  readonly vy: number;
  readonly yawRate: number;
  readonly t: number;
}

export function state(p: Partial<State2D> = {}): State2D {
  return {
    x: p.x ?? 0,
    y: p.y ?? 0,
    yaw: p.yaw ?? 0,
    vx: p.vx ?? 0,
    vy: p.vy ?? 0,
    yawRate: p.yawRate ?? 0,
    t: p.t ?? 0,
  };
}

export function speed(s: State2D): number {
  return Math.hypot(s.vx, s.vy);
}

/** Velocidad del punto material `point` (mundo) del cuerpo: v + ω × r. */
export function velocityAt(s: State2D, point: Vec): Vec {
  const r: Vec = [point[0] - s.x, point[1] - s.y];
  return [s.vx - s.yawRate * r[1], s.vy + s.yawRate * r[0]];
}

export function withVelocity(s: State2D, vx: number, vy: number, yawRate: number): State2D {
  return { ...s, vx, vy, yawRate };
}

export function bodyToWorld(s: State2D, local: Vec): Vec {
  const w = rot(local, s.yaw);
  return [s.x + w[0], s.y + w[1]];
}

export function worldToBody(s: State2D, world: Vec): Vec {
  return rot([world[0] - s.x, world[1] - s.y], -s.yaw);
}

export function kineticEnergy(body: Body2D, s: State2D): number {
  return 0.5 * body.mass * (s.vx ** 2 + s.vy ** 2) + 0.5 * body.inertia * s.yawRate ** 2;
}

export function linearMomentum(body: Body2D, s: State2D): Vec {
  return [body.mass * s.vx, body.mass * s.vy];
}

/** Momento angular respecto a un punto fijo del mundo (componente z). */
export function angularMomentumAbout(body: Body2D, s: State2D, origin: Vec): number {
  const r: Vec = [s.x - origin[0], s.y - origin[1]];
  return body.inertia * s.yawRate + body.mass * cross(r, [s.vx, s.vy]);
}

/** Muestras de un cuerpo en el tiempo (listas paralelas, SI). */
export class Trajectory {
  t: number[] = [];
  x: number[] = [];
  y: number[] = [];
  yaw: number[] = [];
  vx: number[] = [];
  vy: number[] = [];
  yawRate: number[] = [];

  append(s: State2D): void {
    this.t.push(s.t);
    this.x.push(s.x);
    this.y.push(s.y);
    this.yaw.push(s.yaw);
    this.vx.push(s.vx);
    this.vy.push(s.vy);
    this.yawRate.push(s.yawRate);
  }

  get length(): number {
    return this.t.length;
  }

  state(i: number): State2D {
    return {
      x: this.x[i]!,
      y: this.y[i]!,
      yaw: this.yaw[i]!,
      vx: this.vx[i]!,
      vy: this.vy[i]!,
      yawRate: this.yawRate[i]!,
      t: this.t[i]!,
    };
  }

  last(): State2D {
    return this.state(this.t.length - 1);
  }

  extend(other: Trajectory): void {
    for (let i = 0; i < other.length; i++) this.append(other.state(i));
  }
}
