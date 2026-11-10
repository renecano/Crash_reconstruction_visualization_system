/**
 * El terreno que afecta la reconstrucción (C3, W5): port de `croquis_solver.terrain`. Ver ahí el
 * modelo y sus supuestos, y `docs/physics.md`, «Terreno».
 *
 * Sin `lugar.terreno` (o con todo vacío y sin relieve, o con una malla plana) `terrainFromSpec`
 * devuelve null y el solver sigue exactamente el camino de siempre.
 */
import { G, type Vec } from "./models";
import { type Path, ReversePath, SpeedProfile } from "./preimpact";
import { pySum, radians } from "./pymath";
import * as dmath from "./dmath";

type Json = Record<string, unknown>;

/** Supuestos del cruce de un tope: valor nominal y rango. η y κ en `docs/physics.md`. */
export const BUMP_ENERGY = [1.0, 0.5, 1.5] as const;
export const BUMP_CONTACT = [0.5, 0.0, 1.0] as const;
/** m: la ondulación se desvanece hacia la orilla de su zona. */
export const WAVE_FADE_M = 3.0;
/** Cada cuántos pasos de la integración posterior se vuelve a leer el terreno bajo las llantas. */
export const TERRAIN_STRIDE = 5;
/** m: paso de la tabla de frenado sobre terreno. */
export const BRAKE_STEP_M = 0.05;
/** 2 km: más allá, el vehículo no se detiene con ese terreno. */
export const BRAKE_MAX_STEPS = 40000;

type Box = readonly [number, number, number, number];

function boxOf(poly: readonly Vec[]): Box {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Si (x, y) está dentro del polígono (regla par-impar). */
function inside(poly: readonly Vec[], x: number, y: number): boolean {
  let isIn = false;
  const n = poly.length;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) isIn = !isIn;
    j = i;
  }
  return isIn;
}

/** Distancia de (x, y) al borde del polígono. */
function edgeDistance(poly: readonly Vec[], x: number, y: number): number {
  let best = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i]!;
    const [bx, by] = poly[(i + 1) % n]!;
    const dx = bx - ax;
    const dy = by - ay;
    const ln2 = dx * dx + dy * dy;
    const u = ln2 === 0 ? 0.0 : Math.min(1.0, Math.max(0.0, ((x - ax) * dx + (y - ay) * dy) / ln2));
    const d = dmath.hypot(x - (ax + u * dx), y - (ay + u * dy));
    best = Math.min(best, d);
  }
  return best;
}

export interface Zone {
  id: string;
  poly: readonly Vec[];
  box: Box;
  mu: number;
}

export class Wave {
  constructor(
    readonly poly: readonly Vec[],
    readonly box: Box,
    readonly amplitude: number,
    readonly wavelength: number,
    readonly cosR: number,
    readonly sinR: number,
  ) {}

  height(x: number, y: number): number {
    const b = this.box;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3] || !inside(this.poly, x, y)) return 0.0;
    const fade = Math.min(1.0, edgeDistance(this.poly, x, y) / WAVE_FADE_M);
    const s = x * this.cosR + y * this.sinR;
    return this.amplitude * (0.5 + 0.5 * dmath.sin((2.0 * Math.PI * s) / this.wavelength)) * fade;
  }
}

/** Un tope: la línea a–b que cruza la vía, con su altura y su largo en el sentido de marcha. */
export class Bump {
  private constructor(
    readonly id: string,
    readonly a: Vec,
    readonly b: Vec,
    readonly height: number,
    readonly length: number,
    /** Largo de la línea (m). */
    readonly span: number,
    /** Unitario a lo largo de la línea. */
    readonly ux: number,
    readonly uy: number,
    /** De la cresta: (L²/4 + h²) / (2h). */
    readonly radius: number,
  ) {}

  static make(id: string, a: Vec, b: Vec, height: number, length: number): Bump {
    const span = dmath.hypot(b[0] - a[0], b[1] - a[1]);
    const radius = ((length * length) / 4.0 + height * height) / (2.0 * height);
    return new Bump(
      id,
      a,
      b,
      height,
      length,
      span,
      (b[0] - a[0]) / span,
      (b[1] - a[1]) / span,
      radius,
    );
  }

  /** Distancia con signo de (x, y) a la línea del tope (positiva a su izquierda). */
  signed(x: number, y: number): number {
    return (x - this.a[0]) * -this.uy + (y - this.a[1]) * this.ux;
  }

  /** Posición de (x, y) a lo largo de la línea, en metros desde `a`. */
  along(x: number, y: number): number {
    return (x - this.a[0]) * this.ux + (y - this.a[1]) * this.uy;
  }

  /** Si (x, y) está sobre el tope. */
  over(x: number, y: number): boolean {
    const w = this.along(x, y);
    return 0.0 <= w && w <= this.span && Math.abs(this.signed(x, y)) < this.length / 2.0;
  }

  heightAt(x: number, y: number): number {
    const w = this.along(x, y);
    if (w < 0.0 || w > this.span) return 0.0;
    const d = Math.abs(this.signed(x, y));
    if (d >= this.length / 2.0) return 0.0;
    return Math.sqrt(this.radius * this.radius - d * d) - (this.radius - this.height);
  }

  /** Si el tramo p0→p1 cruza la línea del tope dentro de su largo. */
  crosses(p0: Vec, p1: Vec): boolean {
    const d0 = this.signed(p0[0], p0[1]);
    const d1 = this.signed(p1[0], p1[1]);
    if (d0 > 0.0 === d1 > 0.0) return false;
    const f = d0 / (d0 - d1);
    const w = this.along(p0[0] + f * (p1[0] - p0[0]), p0[1] + f * (p1[1] - p0[1]));
    return 0.0 <= w && w <= this.span;
  }

  /** Cuánta carga conserva una rueda rígida en la cresta a esa velocidad: 1 − v²/(g·R). */
  contact(vNormal: number): number {
    return Math.max(0.0, 1.0 - (vNormal * vNormal) / (G * this.radius));
  }

  /** Lo que tarda en caer la altura del tope una rueda que despega en la cresta. */
  get flightS(): number {
    return Math.sqrt((2.0 * this.height) / G);
  }
}

/** La malla de relieve del paquete caso-3d: filas de sur a norte, columnas de oeste a este. */
export class ReliefMesh {
  constructor(
    readonly x0: number,
    readonly y0: number,
    readonly step: number,
    readonly nx: number,
    readonly ny: number,
    readonly heights: readonly number[],
  ) {}

  height(x: number, y: number): number {
    const fx = Math.min(Math.max((x - this.x0) / this.step, 0.0), this.nx - 1.0);
    const fy = Math.min(Math.max((y - this.y0) / this.step, 0.0), this.ny - 1.0);
    const i = Math.min(Math.trunc(fx), this.nx - 2);
    const j = Math.min(Math.trunc(fy), this.ny - 2);
    const tx = fx - i;
    const ty = fy - j;
    const h = this.heights;
    const k = j * this.nx + i;
    const low = h[k]! + (h[k + 1]! - h[k]!) * tx;
    const high = h[k + this.nx]! + (h[k + this.nx + 1]! - h[k + this.nx]!) * tx;
    return low + (high - low) * ty;
  }
}

function points(raw: unknown): Vec[] {
  return (raw as Json[]).map((p) => [Number(p.x), Number(p.y)] as const);
}

export class Terrain {
  constructor(
    readonly zones: readonly Zone[],
    readonly waves: readonly Wave[],
    readonly bumps: readonly Bump[],
    readonly relief: ReliefMesh | null,
  ) {}

  get hasHeight(): boolean {
    return this.waves.length > 0 || this.bumps.length > 0 || this.relief !== null;
  }

  height(x: number, y: number): number {
    let z = this.relief === null ? 0.0 : this.relief.height(x, y);
    for (const w of this.waves) z += w.height(x, y);
    for (const b of this.bumps) z += b.heightAt(x, y);
    return z;
  }

  /** La fricción bajo (x, y): la de la última zona declarada que lo contiene, o `base`. */
  mu(x: number, y: number, base: number): number {
    for (let k = this.zones.length - 1; k >= 0; k--) {
      const z = this.zones[k]!;
      const b = z.box;
      if (b[0] <= x && x <= b[2] && b[1] <= y && y <= b[3] && inside(z.poly, x, y)) return z.mu;
    }
    return base;
  }

  bumpOver(x: number, y: number): Bump | null {
    for (const b of this.bumps) if (b.over(x, y)) return b;
    return null;
  }
}

/**
 * La malla de relieve no viaja en la escena (ADR 0111): va en el paquete caso-3d. Para que la
 * inversión y el Monte Carlo, que reconstruyen cientos de veces, no tengan que pasarla de mano en
 * mano, quien llama la adjunta en memoria a `lugar.terreno.relieve` con esta llave, que no es del
 * contrato y nunca se guarda.
 */
export const ATTACHED = "_malla";

/** La escena con la malla de relieve adjunta en memoria (la original no se toca). */
export function withRelief(spec: Json, relieve: Json | null): Json {
  const lugar = spec.lugar as Json;
  const terreno = (lugar.terreno ?? {}) as Json;
  const declared = (terreno.relieve ?? {}) as Json;
  if (relieve === null || Object.keys(declared).length === 0) return spec;
  return {
    ...spec,
    lugar: { ...lugar, terreno: { ...terreno, relieve: { ...declared, [ATTACHED]: relieve } } },
  };
}

/** La malla adjunta con `withRelief`, si la hay. */
export function attachedRelief(lugar: Json): Json | null {
  const terreno = (lugar.terreno ?? {}) as Json;
  const declared = (terreno.relieve ?? {}) as Json;
  return (declared[ATTACHED] as Json | undefined) ?? null;
}

/** El `id` de la malla que cita la escena (una cadena, por contrato), o null si no cita ninguna. */
const citedMesh = (declared: Json): string | null =>
  typeof declared.malla_id === "string" ? declared.malla_id : null;

/** La malla que cita la escena, si viene y no es plana. Una malla plana no cambia nada. */
export function reliefMesh(declared: Json | undefined, relieve: Json | null): ReliefMesh | null {
  if (!declared || declared.fuente === "plano" || relieve === null) return null;
  const cited = citedMesh(declared);
  if (cited !== null && cited !== relieve.id) return null;
  const heights = (relieve.alturas_m as number[]).map(Number);
  let lo = Infinity;
  let hi = -Infinity;
  for (const h of heights) {
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  if (hi === lo) return null;
  const origen = relieve.origen as Json;
  return new ReliefMesh(
    Number(origen.x),
    Number(origen.y),
    Number(relieve.resolucion_m),
    Number(relieve.ancho),
    Number(relieve.alto),
    heights,
  );
}

/** El terreno de la escena, o null si no cambia nada respecto a un plano. */
export function terrainFromSpec(lugar: Json, relieve: Json | null = null): Terrain | null {
  const t = (lugar.terreno ?? {}) as Json;
  const zones: Zone[] = ((t.superficies ?? []) as Json[]).map((z) => {
    const poly = points(z.poligono);
    return {
      id: String(z.id),
      poly,
      box: boxOf(poly),
      mu: Number((z.friccion as Json).valor),
    };
  });
  const waves: Wave[] = ((t.ondulaciones ?? []) as Json[]).map((o) => {
    const poly = points(o.poligono);
    const r = radians(Number(o.rumbo_deg));
    return new Wave(
      poly,
      boxOf(poly),
      Number(o.amplitud_m),
      Number(o.longitud_onda_m),
      dmath.cos(r),
      dmath.sin(r),
    );
  });
  const bumps: Bump[] = [];
  for (const tp of (t.topes ?? []) as Json[]) {
    const [a, b] = points(tp.linea) as [Vec, Vec];
    if (a[0] !== b[0] || a[1] !== b[1])
      bumps.push(Bump.make(String(tp.id), a, b, Number(tp.alto_m), Number(tp.largo_m)));
  }
  const mesh = reliefMesh(t.relieve as Json | undefined, relieve);
  if (!zones.length && !waves.length && !bumps.length && mesh === null) return null;
  return new Terrain(zones, waves, bumps, mesh);
}

/** Si la escena cita un relieve real y la malla no llegó (se reconstruye sin relieve). */
export function reliefMissing(lugar: Json, relieve: Json | null): boolean {
  const terreno = (lugar.terreno ?? {}) as Json;
  const declared = (terreno.relieve ?? {}) as Json;
  if (declared.fuente !== "dem" && declared.fuente !== "declarado") return false;
  const cited = citedMesh(declared);
  return relieve === null || (cited !== null && cited !== relieve.id);
}

// ---- pose sobre el terreno ----------------------------------------------------------------------

const mean = (xs: readonly number[]): number => pySum(xs) / xs.length;

type Wheels = readonly (readonly [number, number])[];

/**
 * (z del centro, pendiente a lo largo, pendiente de lado) del plano de las llantas. La pendiente a
 * lo largo es positiva con la nariz arriba; la de lado, con el costado izquierdo arriba (el derecho
 * hacia abajo). `wheels` son las posiciones en el cuerpo (x adelante, y a la izquierda); (c, s) son
 * el coseno y el seno del rumbo.
 */
export function slopes(
  terrain: Terrain,
  wheels: Wheels,
  x: number,
  y: number,
  c: number,
  s: number,
): [number, number, number] {
  const zs = wheels.map(([px, py]) => terrain.height(x + px * c - py * s, y + px * s + py * c));
  const idx = wheels.map((_, k) => k);
  const front = idx.filter((k) => wheels[k]![0] > 0.0);
  const rear = idx.filter((k) => wheels[k]![0] <= 0.0);
  const left = idx.filter((k) => wheels[k]![1] > 0.0);
  const right = idx.filter((k) => wheels[k]![1] <= 0.0);
  if (!front.length || !rear.length || !left.length || !right.length) return [mean(zs), 0.0, 0.0];
  const zf = mean(front.map((k) => zs[k]!));
  const zr = mean(rear.map((k) => zs[k]!));
  const xf = mean(front.map((k) => wheels[k]![0]));
  const xr = mean(rear.map((k) => wheels[k]![0]));
  const zl = mean(left.map((k) => zs[k]!));
  const zd = mean(right.map((k) => zs[k]!));
  const yl = mean(left.map((k) => wheels[k]![1]));
  const yd = mean(right.map((k) => wheels[k]![1]));
  const along = (zf - zr) / (xf - xr);
  return [zr + along * (0.0 - xr), along, (zl - zd) / (yl - yd)];
}

/** (z, cabeceo, alabeo) en m y rad; positivos: nariz arriba y costado derecho abajo. */
export function poseOn(
  terrain: Terrain,
  wheels: Wheels,
  x: number,
  y: number,
  yaw: number,
): [number, number, number] {
  const [z, along, side] = slopes(terrain, wheels, x, y, dmath.cos(yaw), dmath.sin(yaw));
  return [z, dmath.atan(along), dmath.atan(side)];
}

// ---- contacto de las llantas en la integración posterior ---------------------------------------

/** Lo que el terreno le da a cada llanta de un cuerpo, entre una lectura y la siguiente. */
export class WheelContact {
  mu: number[] = [];
  /** Factor sobre la carga estática. */
  load: number[] = [];
  /** Gravedad a lo largo del cuerpo (m/s²) y de lado. */
  gU = 0.0;
  gV = 0.0;
  prev: Vec[] = [];
  flyUntil: number[] = [];
}

/**
 * Lee el terreno bajo las llantas y devuelve la fracción de energía de traslación que queda después
 * de los topes cruzados desde la lectura anterior (1 si no cruzó ninguno). `pose` es (x, y, cos,
 * sen) del cuerpo y `vel` es (u, v, r) en su marco.
 */
export function readContact(
  terrain: Terrain,
  st: WheelContact,
  wheels: Wheels,
  shares: readonly number[],
  pose: readonly [number, number, number, number],
  vel: readonly [number, number, number],
  t: number,
  muBase: number,
  zoneFriction: boolean,
): number {
  const [x, y, c, s] = pose;
  const [u, v, r] = vel;
  const n = wheels.length;
  const first = st.prev.length === 0;
  if (first) {
    st.mu = new Array<number>(n).fill(muBase);
    st.load = new Array<number>(n).fill(1.0);
    st.flyUntil = new Array<number>(n).fill(-Infinity);
  }
  let slopeCos = 1.0;
  if (terrain.hasHeight) {
    const [, along, side] = slopes(terrain, wheels, x, y, c, s);
    const norm = Math.sqrt(1.0 + along * along + side * side);
    slopeCos = 1.0 / norm;
    st.gU = (-G * along) / norm;
    st.gV = (-G * side) / norm;
  }
  const ke = 0.5 * (u * u + v * v); // por unidad de masa
  let lost = 0.0;
  const now: Vec[] = [];
  for (let k = 0; k < n; k++) {
    const [px, py] = wheels[k]!;
    const wx = x + px * c - py * s;
    const wy = y + px * s + py * c;
    now.push([wx, wy]);
    st.mu[k] = zoneFriction ? terrain.mu(wx, wy, muBase) : muBase;
    let load = slopeCos;
    if (terrain.bumps.length > 0) {
      // Velocidad de la llanta en el mundo.
      const ub = u - r * py;
      const vb = v + r * px;
      const vwx = ub * c - vb * s;
      const vwy = ub * s + vb * c;
      const over = terrain.bumpOver(wx, wy);
      if (over !== null) {
        const rigid = over.contact(Math.abs(vwx * -over.uy + vwy * over.ux));
        load *= 1.0 - BUMP_CONTACT[0] * (1.0 - rigid);
        if (rigid === 0.0) st.flyUntil[k] = t + over.flightS;
      } else if (t < st.flyUntil[k]!) {
        load *= 1.0 - BUMP_CONTACT[0];
      }
      if (!first) {
        for (const b of terrain.bumps) {
          if (b.crosses(st.prev[k]!, [wx, wy])) lost += BUMP_ENERGY[0] * G * shares[k]! * b.height;
        }
      }
    }
    st.load[k] = load;
  }
  st.prev = now;
  if (lost <= 0.0 || ke <= 0.0) return 1.0;
  return Math.max(0.0, 1.0 - lost / ke);
}

// ---- frenado previo sobre terreno ----------------------------------------------------------------

/**
 * `SpeedProfile` con el frenado integrado sobre el terreno: desde `tBrake`, la velocidad sale de
 * una tabla (distancia, velocidad, tiempo) en lugar de una desaceleración constante. `decel`
 * conserva la nominal del lugar (la usan los agentes).
 */
export class TerrainProfile extends SpeedProfile {
  constructor(
    v0: number,
    tBrake: number,
    decel: number,
    /** m desde el inicio del frenado. */
    readonly ss: readonly number[],
    readonly vs: readonly number[],
    /** s desde `tBrake`. */
    readonly ts: readonly number[],
    readonly stops: boolean,
  ) {
    super(v0, tBrake, decel);
  }

  /** (distancia desde el inicio del frenado, velocidad) a `tau` s de empezar a frenar. */
  private at(tau: number): [number, number] {
    const ts = this.ts;
    const last = ts.length - 1;
    if (tau >= ts[last]!) {
      const extra = this.stops ? 0.0 : this.vs[last]! * (tau - ts[last]!);
      return [this.ss[last]! + extra, this.vs[last]!];
    }
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (ts[mid]! <= tau) lo = mid;
      else hi = mid;
    }
    const span = ts[hi]! - ts[lo]!;
    const d = tau - ts[lo]!;
    const acc = span > 0 ? (this.vs[hi]! - this.vs[lo]!) / span : 0.0;
    return [this.ss[lo]! + this.vs[lo]! * d + 0.5 * acc * d * d, this.vs[lo]! + acc * d];
  }

  override speed(t: number): number {
    if (t <= this.tBrake) return this.v0;
    return this.at(t - this.tBrake)[1];
  }

  override distance(t: number): number {
    if (t <= this.tBrake) return this.v0 * t;
    return this.v0 * this.tBrake + this.at(t - this.tBrake)[0];
  }

  override get stopTime(): number {
    return this.stops ? this.tBrake + this.ts[this.ts.length - 1]! : Infinity;
  }

  override timeToDistance(s: number): number | null {
    if (s <= 0) return 0.0;
    if (this.v0 <= 0) return null;
    const sBrake = this.v0 * this.tBrake;
    if (s <= sBrake) return s / this.v0;
    const rem = s - sBrake;
    const ss = this.ss;
    const last = ss.length - 1;
    if (rem > ss[last]!) {
      if (this.stops || this.vs[last]! <= 0) return null;
      return this.tBrake + this.ts[last]! + (rem - ss[last]!) / this.vs[last]!;
    }
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (ss[mid]! <= rem) lo = mid;
      else hi = mid;
    }
    const span = this.ts[hi]! - this.ts[lo]!;
    const acc = span > 0 ? (this.vs[hi]! - this.vs[lo]!) / span : 0.0;
    const ds = rem - ss[lo]!;
    const v = this.vs[lo]!;
    if (acc === 0.0) return this.tBrake + this.ts[lo]! + (v > 0 ? ds / v : 0.0);
    const disc = Math.max(0.0, v * v + 2.0 * acc * ds);
    return this.tBrake + this.ts[lo]! + (Math.sqrt(disc) - v) / acc;
  }
}

/**
 * El perfil de un vehículo que frena a fondo desde `sBrake` (m sobre `path`) con el terreno. En
 * cada paso de `BRAKE_STEP_M`, d(v²)/ds = −2·g·(μ·k·cos α + sen α), con μ la de los dos ejes pesada
 * por su carga y por su contacto, y α la pendiente entre ejes (más la `pendiente` del lugar). Al
 * cruzar la línea de un tope, cada eje resta 2·η·g·(su fracción de carga)·h a v².
 */
export function brakeProfile(
  path: Path,
  v0: number,
  sBrake: number,
  decelNominal: number,
  terrain: Terrain,
  muBase: number,
  absFactor: number,
  gradePercent: number,
  cgFromFront: number,
  wheelbase: number,
): TerrainProfile {
  const reverse = path instanceof ReversePath;
  const aFront = cgFromFront;
  const bRear = wheelbase - cgFromFront;
  // El eje que va por delante en el sentido de marcha y el que va atrás: (distancia, carga).
  const lead: [number, number] = reverse
    ? [bRear, aFront / wheelbase]
    : [aFront, bRear / wheelbase];
  const trail: [number, number] = reverse
    ? [aFront, bRear / wheelbase]
    : [bRear, aFront / wheelbase];
  const ss = [0.0];
  const vs = [v0];
  const ts = [0.0];
  let v2 = v0 * v0;
  let v = v0;
  let t = 0.0;
  const fly = [-Infinity, -Infinity]; // hasta qué distancia sigue sin carga cada eje
  let prev: Vec[] = [];
  let stops = false;
  const shares = [lead[1], trail[1]];
  for (let k = 0; k < BRAKE_MAX_STEPS; k++) {
    const s = sBrake + k * BRAKE_STEP_M;
    const p = path.pose(Math.min(s, path.length));
    let px = p.x;
    let py = p.y;
    if (s > path.length) {
      const overS = s - path.length;
      px = p.x + overS * dmath.cos(p.heading) * (reverse ? -1.0 : 1.0);
      py = p.y + overS * dmath.sin(p.heading) * (reverse ? -1.0 : 1.0);
    }
    const hx = dmath.cos(p.heading);
    const hy = dmath.sin(p.heading);
    const tx = reverse ? -hx : hx; // sentido de marcha
    const ty = reverse ? -hy : hy;
    const axles: Vec[] = [
      [px + lead[0] * tx, py + lead[0] * ty],
      [px - trail[0] * tx, py - trail[0] * ty],
    ];
    let slope = gradePercent / 100.0;
    if (terrain.hasHeight) {
      slope +=
        (terrain.height(axles[0]![0], axles[0]![1]) - terrain.height(axles[1]![0], axles[1]![1])) /
        wheelbase;
    }
    const alpha = dmath.atan(slope);
    let grip = 0.0;
    let dropped = false;
    for (let i = 0; i < 2; i++) {
      const q = axles[i]!;
      const share = shares[i]!;
      let contact = 1.0;
      const over = terrain.bumpOver(q[0], q[1]);
      if (over !== null) {
        const rigid = over.contact(v * Math.abs(tx * -over.uy + ty * over.ux));
        contact = 1.0 - BUMP_CONTACT[0] * (1.0 - rigid);
        if (rigid === 0.0) fly[i] = s + v * over.flightS;
      } else if (s < fly[i]!) {
        contact = 1.0 - BUMP_CONTACT[0];
      }
      grip += share * terrain.mu(q[0], q[1], muBase) * contact;
      if (prev.length > 0) {
        for (const b of terrain.bumps) {
          if (b.crosses(prev[i]!, q)) {
            v2 -= 2.0 * BUMP_ENERGY[0] * G * share * b.height;
            dropped = true;
          }
        }
      }
    }
    prev = axles;
    if (v2 <= 0.0) {
      stops = true;
      vs[vs.length - 1] = 0.0;
      break;
    }
    if (dropped) {
      v = Math.sqrt(v2);
      vs[vs.length - 1] = v;
    }
    const acc = G * (grip * absFactor * dmath.cos(alpha) + dmath.sin(alpha));
    const v2Next = v2 - 2.0 * acc * BRAKE_STEP_M;
    if (v2Next <= 0.0) {
      const ds = v2 / (2.0 * acc);
      t += (2.0 * ds) / v;
      ss.push(ss[ss.length - 1]! + ds);
      vs.push(0.0);
      ts.push(t);
      stops = true;
      break;
    }
    const vNext = Math.sqrt(v2Next);
    t += (2.0 * BRAKE_STEP_M) / (v + vNext);
    ss.push(ss[ss.length - 1]! + BRAKE_STEP_M);
    vs.push(vNext);
    ts.push(t);
    v2 = v2Next;
    v = vNext;
  }
  if (ss.length === 1) {
    // Se detuvo en el primer paso (un tope justo donde empieza a frenar): tabla mínima.
    ss.push(0.0);
    vs.push(0.0);
    ts.push(0.0);
  }
  return new TerrainProfile(v0, sBrake / v0, decelNominal, ss, vs, ts, stops);
}

// ---- cruces de topes sobre una trayectoria ya calculada -----------------------------------------

/**
 * (tope, instante, velocidad en m/s) de la primera vez que el eje delantero cruza cada tope. `lead`
 * es la distancia del centro al eje delantero. El instante se interpola entre muestras.
 */
export function bumpCrossings(
  terrain: Terrain,
  lead: number,
  ts: readonly number[],
  xs: readonly number[],
  ys: readonly number[],
  yaws: readonly number[],
  vxs: readonly number[],
  vys: readonly number[],
): [string, number, number][] {
  const out: [string, number, number][] = [];
  for (const b of terrain.bumps) {
    for (let i = 1; i < ts.length; i++) {
      const p0: Vec = [
        xs[i - 1]! + lead * dmath.cos(yaws[i - 1]!),
        ys[i - 1]! + lead * dmath.sin(yaws[i - 1]!),
      ];
      const p1: Vec = [xs[i]! + lead * dmath.cos(yaws[i]!), ys[i]! + lead * dmath.sin(yaws[i]!)];
      if ((p0[0] === p1[0] && p0[1] === p1[1]) || !b.crosses(p0, p1)) continue;
      const d0 = b.signed(p0[0], p0[1]);
      const d1 = b.signed(p1[0], p1[1]);
      const f = d0 / (d0 - d1);
      const v0 = dmath.hypot(vxs[i - 1]!, vys[i - 1]!);
      const v1 = dmath.hypot(vxs[i]!, vys[i]!);
      out.push([b.id, ts[i - 1]! + f * (ts[i]! - ts[i - 1]!), v0 + f * (v1 - v0)]);
      break;
    }
  }
  return out;
}
