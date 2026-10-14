/**
 * Cinemática de ocupantes relativa al habitáculo (port de `croquis_solver.occupant`; PLAN §6.1.8).
 *
 * Pulso de media onda senoidal con ΔV y duración T = 2C/ΔV acotada; sin cinturón, vuelo libre
 * hasta el espacio de vuelo de Michie (0.6 m longitudinal, 0.3 m lateral); con cinturón, resorte
 * amortiguado después de la holgura; hacia atrás, el respaldo. No se estima ninguna lesión.
 */
import { G } from "./models";
import { pyRound, radians } from "./pymath";

export const T_MIN = 0.06;
export const T_MAX = 0.2;
export const FLAIL_LONGITUDINAL_M = 0.6;
export const FLAIL_LATERAL_M = 0.3;
export const HEADREST_GAP_M = 0.08;
export const BELT_SLACK_M = 0.05;
export const BELT_NATURAL_FREQ_HZ = 8.0;
export const BELT_DAMPING_RATIO = 0.3;
const SIM_DT = 0.0005;
const OUTPUT_DT = 0.005;
const OUTPUT_SPAN_S = 0.5;
/** m/s: debajo de esto no se modela movimiento del ocupante. */
export const MIN_DELTA_V = 0.3;

const SEATS_LEFT = new Set(["conductor", "trasero_izquierdo"]);
const SEATS_RIGHT = new Set(["copiloto", "trasero_derecho"]);
const SEATS_REAR = new Set([
  "trasero_izquierdo",
  "trasero_centro",
  "trasero_derecho",
  "tercera_fila",
]);

export class CrashPulse {
  constructor(
    readonly durationS: number,
    readonly deltaV: number,
    /** Hacia dónde se mueve el ocupante respecto al habitáculo (marco del vehículo). */
    readonly toward: readonly [number, number],
  ) {}

  get peakAccel(): number {
    return (Math.PI * this.deltaV) / (2.0 * this.durationS);
  }

  accel(t: number): number {
    if (t < 0 || t > this.durationS) return 0.0;
    return this.peakAccel * Math.sin((Math.PI * t) / this.durationS);
  }

  velocityChange(t: number): number {
    const tt = Math.min(Math.max(t, 0.0), this.durationS);
    return 0.5 * this.deltaV * (1.0 - Math.cos((Math.PI * tt) / this.durationS));
  }
}

/** Dirección del movimiento del ocupante para una PDOF en horas de reloj (12 = de frente). */
export function directionFromPdof(pdofHours: number): [number, number] {
  const phi = radians(30.0 * pdofHours);
  return [Math.cos(phi), -Math.sin(phi)];
}

/** Pulso con duración T = 2C/ΔV acotada; null si ΔV es mínimo. */
export function pulseFor(deltaV: number, crushMaxM: number, pdofHours: number): CrashPulse | null {
  if (deltaV < MIN_DELTA_V) return null;
  let t = (2.0 * Math.max(crushMaxM, 0.0)) / deltaV;
  t = Math.min(T_MAX, Math.max(T_MIN, t));
  return new CrashPulse(t, deltaV, directionFromPdof(pdofHours));
}

export interface Contact {
  zona: string;
  tS: number;
  relativeSpeed: number;
}

export interface OccupantMotion {
  belted: boolean;
  t: number[];
  dx: number[];
  dy: number[];
  contact: Contact | null;
}

export function maxDisplacement(m: OccupantMotion): number {
  let best = 0.0;
  for (let i = 0; i < m.dx.length; i++) best = Math.max(best, Math.hypot(m.dx[i]!, m.dy[i]!));
  return best;
}

function zone(seat: string, axis: string, sign: number): string {
  if (axis === "x" && sign > 0) {
    if (seat === "conductor") return "volante y tablero";
    if (seat === "copiloto") return "tablero";
    if (SEATS_REAR.has(seat)) return "respaldo del asiento de adelante";
    return "interior de adelante";
  }
  if (axis === "x") return "respaldo y cabecera";
  const left = sign > 0;
  if ((left && SEATS_LEFT.has(seat)) || (!left && SEATS_RIGHT.has(seat))) {
    return `puerta y ventana del lado ${left ? "izquierdo" : "derecho"}`;
  }
  if (SEATS_LEFT.has(seat) || SEATS_RIGHT.has(seat)) return "consola central o asiento contiguo";
  return `asiento contiguo del lado ${left ? "izquierdo" : "derecho"}`;
}

/** `math.copysign(a, b)`. */
function copysign(a: number, b: number): number {
  const neg = b < 0 || Object.is(b, -0);
  return neg ? -Math.abs(a) : Math.abs(a);
}

/** Integra el movimiento relativo del ocupante (paso fijo, determinista). */
export function simulateOccupant(
  pulse: CrashPulse,
  seat: string,
  belted: boolean,
  opts: { beltSlackM?: number; beltFreqHz?: number; beltDamping?: number } = {},
): OccupantMotion {
  const {
    beltSlackM = BELT_SLACK_M,
    beltFreqHz = BELT_NATURAL_FREQ_HZ,
    beltDamping = BELT_DAMPING_RATIO,
  } = opts;
  const out: OccupantMotion = { belted, t: [], dx: [], dy: [], contact: null };
  const [ux, uy] = pulse.toward;
  let x = 0.0;
  let y = 0.0;
  let vx = 0.0;
  let vy = 0.0;
  const omega = 2.0 * Math.PI * beltFreqHz;
  let t = 0.0;
  let contact: Contact | null = null;
  const seatBack = ux < 0;
  const nOut = pyRound(OUTPUT_SPAN_S / OUTPUT_DT);
  const stepsPerOut = pyRound(OUTPUT_DT / SIM_DT);
  for (let k = 0; k <= nOut * stepsPerOut; k++) {
    if (k % stepsPerOut === 0) {
      out.t.push(pyRound(t, 9));
      out.dx.push(x);
      out.dy.push(y);
    }
    if (contact === null) {
      const a = pulse.accel(t);
      let ax = a * ux;
      const ay = a * uy;
      if (belted && x > beltSlackM) {
        const stretch = x - beltSlackM;
        ax -= omega * omega * stretch + 2.0 * beltDamping * omega * vx;
      }
      vx += ax * SIM_DT;
      vy += ay * SIM_DT;
      x += vx * SIM_DT;
      y += vy * SIM_DT;
      let hit: [string, number, number] | null = null;
      if (seatBack && x <= -HEADREST_GAP_M) {
        x = -HEADREST_GAP_M;
        hit = ["x", -1.0, Math.abs(vx)];
      } else if (x >= FLAIL_LONGITUDINAL_M) {
        x = FLAIL_LONGITUDINAL_M;
        hit = ["x", 1.0, Math.abs(vx)];
      } else if (Math.abs(y) >= FLAIL_LATERAL_M) {
        y = copysign(FLAIL_LATERAL_M, y);
        hit = ["y", copysign(1.0, y), Math.abs(vy)];
      }
      if (hit !== null) {
        contact = { zona: zone(seat, hit[0], hit[1]), tS: t + SIM_DT, relativeSpeed: hit[2] };
        vx = 0.0;
        vy = 0.0;
      } else if (!seatBack && x < 0.0) {
        // De regreso (rebote del cinturón) el respaldo detiene al torso.
        x = 0.0;
        vx = Math.max(vx, 0.0);
      }
    }
    t += SIM_DT;
  }
  out.contact = contact;
  return out;
}

/** Movimiento con el cinturón declarado; si no se declaró, las dos variantes. */
export function occupantMotions(
  pulse: CrashPulse,
  seat: string,
  belted: boolean | null,
): OccupantMotion[] {
  if (belted === null) {
    return [simulateOccupant(pulse, seat, true), simulateOccupant(pulse, seat, false)];
  }
  return [simulateOccupant(pulse, seat, belted)];
}

export function peakG(pulse: CrashPulse): number {
  return pulse.peakAccel / G;
}
