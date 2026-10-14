/**
 * Criterio de inicio de volcadura por tropiezo (port de `croquis_solver.rollover`; PLAN §6.1.6):
 * velocidad crítica de deslizamiento por momento angular y energía alrededor de la línea de
 * contacto, con h = 0.37 × alto y la inercia de una caja homogénea (supuestos documentados).
 */
import { G } from "./models";
import { pyRound } from "./pymath";

/** Supuesto: h ≈ 0.37 × alto (SSF típico 1.0–1.5 según la clase). */
export const CG_HEIGHT_FRACTION = 0.37;

export interface RolloverCheck {
  ssf: number;
  cgHeightM: number;
  trackM: number;
  criticalSpeed: number;
  lateralSpeed: number;
  rollRate: number;
  starts: boolean;
  /** "derecho" | "izquierdo" */
  side: string;
}

export function rolloverToDict(r: RolloverCheck): Record<string, unknown> {
  return {
    inicia: r.starts,
    lado_tropiezo: r.side,
    velocidad_lateral_kmh: pyRound(r.lateralSpeed * 3.6, 6),
    velocidad_critica_kmh: pyRound(r.criticalSpeed * 3.6, 6),
    ssf: pyRound(r.ssf, 6),
    altura_cg_m: pyRound(r.cgHeightM, 6),
    via_m: pyRound(r.trackM, 6),
    velocidad_alabeo_rad_s: pyRound(r.rollRate, 6),
  };
}

/** I_cg / m de una caja homogénea de ancho × alto (radio de giro al cuadrado). */
export function rollInertiaRatio(width: number, height: number): number {
  return (width * width + height * height) / 12.0;
}

/** Velocidad lateral mínima para que el tropiezo voltee al vehículo (m/s). */
export function criticalSlidingVelocity(track: number, cgHeight: number, k2: number): number {
  if (track <= 0 || cgHeight <= 0 || k2 < 0) {
    throw new Error("Vía, altura del CG e inercia deben ser positivas");
  }
  const half = 0.5 * track;
  const dz = Math.hypot(cgHeight, half) - cgHeight;
  const ip = k2 + cgHeight * cgHeight + half * half;
  return Math.sqrt((2.0 * G * dz * ip) / (cgHeight * cgHeight));
}

export function tripCheck(
  track: number,
  width: number,
  height: number,
  lateralSpeed: number,
  side: string,
): RolloverCheck {
  const h = CG_HEIGHT_FRACTION * height;
  const k2 = rollInertiaRatio(width, height);
  const vC = criticalSlidingVelocity(track, h, k2);
  const ip = k2 + h * h + 0.25 * track * track;
  return {
    ssf: track / (2.0 * h),
    cgHeightM: h,
    trackM: track,
    criticalSpeed: vC,
    lateralSpeed: Math.max(lateralSpeed, 0.0),
    rollRate: (Math.max(lateralSpeed, 0.0) * h) / ip,
    starts: lateralSpeed >= vC,
    side,
  };
}
