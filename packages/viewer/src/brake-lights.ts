/**
 * Luces de freno (T1.4, ADR 0097): encienden cuando el solver frena al vehículo. No se inventa
 * nada: la señal sale de la trayectoria calculada.
 *
 * - Antes del primer impacto, el vehículo solo pierde velocidad si el conductor frena (el motor y
 *   el aire quitan menos de 0.5 m/s²): las luces encienden cuando la desaceleración de la
 *   trayectoria llega a `BRAKE_DECEL_MS2`. Con el evento `inicio_frenado` del solver coincide.
 * - Después del impacto, el arrastre y la fricción también frenan sin pedal: ahí las luces solo
 *   siguen encendidas si el relato dice que el conductor aplicó el freno (`frenado.aplico`),
 *   mientras el vehículo se mueve.
 * - Un vehículo detenido no lleva las luces de freno encendidas (el pie ya no cuenta la historia).
 */
import { bracket, type VehicleTrack } from "./sample";

/** Desaceleración desde la que el vehículo se considera frenando (m/s²). */
export const BRAKE_DECEL_MS2 = 1.0;
/** Por debajo de esta rapidez el vehículo está parado (m/s). */
export const STOPPED_MS = 0.15;

export interface BrakeInput {
  track: VehicleTrack;
  /** Instante del primer impacto del vehículo (s), o null si no chocó. */
  tFirstImpact: number | null;
  /** El conductor aplicó el freno (del relato); mantiene las luces después del impacto. */
  bloqueadas: boolean;
}

function speedAt(tr: VehicleTrack, i: number): number {
  return Math.hypot(tr.vx[i] ?? 0, tr.vy[i] ?? 0);
}

/** Desaceleración (m/s², positiva al frenar) del tramo que contiene t. */
export function decelerationAt(tr: VehicleTrack, t: number): number {
  const n = tr.t.length;
  if (n < 2) return 0;
  const { i } = bracket(tr.t, t);
  const j = Math.min(n - 1, i + 1);
  const dt = (tr.t[j] ?? 0) - (tr.t[i] ?? 0);
  if (dt <= 0) return 0;
  return (speedAt(tr, i) - speedAt(tr, j)) / dt;
}

/** ¿Van encendidas las luces de freno en t? */
export function brakingAt(input: BrakeInput, t: number): boolean {
  const { track, tFirstImpact, bloqueadas } = input;
  if (track.t.length === 0) return false;
  const { i, f } = bracket(track.t, t);
  const speed =
    speedAt(track, i) * (1 - f) + speedAt(track, i + 1 < track.t.length ? i + 1 : i) * f;
  if (speed <= STOPPED_MS) return false;
  if (tFirstImpact !== null && t >= tFirstImpact) return bloqueadas;
  return decelerationAt(track, t) >= BRAKE_DECEL_MS2;
}

/** Primer instante con las luces de freno encendidas, o null si nunca frena. */
export function brakeOnsetTime(input: BrakeInput): number | null {
  const tr = input.track;
  for (let i = 0; i + 1 < tr.t.length; i++) {
    const t = tr.t[i] ?? 0;
    if (brakingAt(input, t)) return t;
  }
  return null;
}
