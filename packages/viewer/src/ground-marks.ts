/**
 * Marcas en el piso desde las trayectorias del solver (PLAN §7.3.6).
 *
 * - Frenado: llantas bloqueadas entre el inicio de frenado y el impacto, si el vehículo frenó y no
 *   tiene ABS (con ABS la llanta no se bloquea y la marca es apenas visible: no se dibuja).
 * - Derrape/guiñada después del impacto: en cada llanta se calcula la velocidad del punto de
 *   contacto (v + ω × r). Con llantas bloqueadas deja marca si desliza (> 0.3 m/s); rodando, solo
 *   si desliza de lado (componente lateral > 0.5 m/s, la marca curva típica de guiñada).
 * - Fluidos: charco bajo el frente del vehículo en reposo cuando el aplastamiento frontal alcanza
 *   el radiador (≥ 0.25 m, ilustrativo), que crece durante 3 s.
 *
 * Cada segmento lleva su instante, así el visor los muestra conforme ocurren. Un vehículo que se
 * vuelca no deja marcas posteriores desde la trayectoria plana (su pose sale de Rapier).
 */
import { axlePositions, profileFor, type VehicleDimensions } from "./vehicle-geometry";

export interface TimedQuad {
  /** Cuatro esquinas (x, y) en el mundo. */
  corners: [number, number, number, number, number, number, number, number];
  t: number;
}

export interface GroundMarks {
  frenado: TimedQuad[];
  derrape: TimedQuad[];
  charcos: { x: number; y: number; t0: number; radius: number }[];
}

export interface MarkVehicle {
  id: string;
  clase: string;
  dims: VehicleDimensions;
  track: {
    t: readonly number[];
    x: readonly number[];
    y: readonly number[];
    rumbo: readonly number[];
    vx: readonly number[];
    vy: readonly number[];
    vel_angular: readonly number[];
  };
  /** Instante de inicio de frenado (s) si frenó; undefined si no. */
  tFrenado?: number;
  abs: boolean;
  /** Llantas bloqueadas después del impacto (frenaba). */
  bloqueadas: boolean;
  aplastamientoFrontal: number;
  tReposo?: number;
  /** Se vuelca: después del tropiezo su pose sale de Rapier, no de la trayectoria plana. */
  volcado?: boolean;
}

export const MARK_WIDTH_M = 0.2;
export const SLIDE_SPEED_MS = 0.3;
export const LATERAL_SLIP_MS = 0.5;
export const RADIATOR_CRUSH_M = 0.25;

function wheelOffsets(v: MarkVehicle): [number, number][] {
  const p = profileFor(v.clase);
  if (p.kind === "two_wheel") {
    const half = Math.min(v.dims.wheelbase, v.dims.length - 0.4) / 2;
    return [
      [half, 0],
      [-half, 0],
    ];
  }
  const { front, rear } = axlePositions(v.dims, p.frontShare);
  const half = 0.42 * v.dims.width;
  return [
    [front, half],
    [front, -half],
    [rear, half],
    [rear, -half],
  ];
}

function quad(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  w: number,
  t: number,
): TimedQuad | null {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return null;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  return { corners: [ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, ax - nx, ay - ny], t };
}

export function computeGroundMarks(vehicles: readonly MarkVehicle[]): GroundMarks {
  const frenado: TimedQuad[] = [];
  const derrape: TimedQuad[] = [];
  const charcos: GroundMarks["charcos"] = [];
  for (const v of vehicles) {
    const tr = v.track;
    const wheels = wheelOffsets(v);
    for (const [ox, oy] of wheels) {
      let prev: { x: number; y: number } | null = null;
      for (let i = 0; i < tr.t.length; i++) {
        const t = tr.t[i] ?? 0;
        const yaw = tr.rumbo[i] ?? 0;
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        const px = (tr.x[i] ?? 0) + ox * c - oy * s;
        const py = (tr.y[i] ?? 0) + ox * s + oy * c;
        const w = tr.vel_angular[i] ?? 0;
        // Velocidad del punto de contacto: v + ω × r (r en el mundo).
        const rx = ox * c - oy * s;
        const ry = ox * s + oy * c;
        const vcx = (tr.vx[i] ?? 0) - w * ry;
        const vcy = (tr.vy[i] ?? 0) + w * rx;
        const speed = Math.hypot(vcx, vcy);
        const lateral = Math.abs(-vcx * s + vcy * c);
        const braking = v.tFrenado !== undefined && !v.abs && t >= v.tFrenado && t < 0;
        const post = !v.volcado && t > 0 && (v.tReposo === undefined || t <= v.tReposo + 1e-9);
        const sliding = post && (v.bloqueadas ? speed > SLIDE_SPEED_MS : lateral > LATERAL_SLIP_MS);
        const marking = (braking && speed > SLIDE_SPEED_MS) || sliding;
        if (marking && prev) {
          const q = quad(prev.x, prev.y, px, py, MARK_WIDTH_M, t);
          if (q) (braking ? frenado : derrape).push(q);
        }
        prev = marking ? { x: px, y: py } : null;
      }
    }
    if (v.aplastamientoFrontal >= RADIATOR_CRUSH_M && v.tReposo !== undefined && !v.volcado) {
      const i = tr.t.length - 1;
      const yaw = tr.rumbo[i] ?? 0;
      const ahead = 0.3 * v.dims.length;
      charcos.push({
        x: (tr.x[i] ?? 0) + ahead * Math.cos(yaw),
        y: (tr.y[i] ?? 0) + ahead * Math.sin(yaw),
        t0: v.tReposo,
        radius: 0.6 + 0.6 * Math.min(1, v.aplastamientoFrontal),
      });
    }
  }
  frenado.sort((a, b) => a.t - b.t);
  derrape.sort((a, b) => a.t - b.t);
  return { frenado, derrape, charcos };
}

/** Número de cuadriláteros visibles en t (están ordenados por tiempo). */
export function visibleCount(quads: readonly TimedQuad[], t: number): number {
  let lo = 0;
  let hi = quads.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((quads[mid]?.t ?? Infinity) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Radio del charco en t: crece durante 3 s desde que el vehículo queda en reposo. */
export function puddleRadius(p: { t0: number; radius: number }, t: number): number {
  if (t <= p.t0) return 0;
  const k = Math.min(1, (t - p.t0) / 3);
  return p.radius * Math.sqrt(k);
}
