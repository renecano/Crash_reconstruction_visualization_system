/**
 * Proyección de personas (port de `croquis_solver.pedestrian`): modelo completo de Searle y
 * banda de distancias. Debe coincidir con Python dentro de la tolerancia de paridad (E7).
 */
export const G = 9.80665;

export interface ThrowKinematics {
  flightTime: number;
  flightDistance: number;
  landingSpeed: number;
  slideTime: number;
  slideDistance: number;
  totalDistance: number;
  totalTime: number;
}

/** Vuelo balístico, impulso de aterrizaje y deslizamiento (Searle, SAE 930659). */
export function throwKinematics(
  v: number,
  thetaDeg: number,
  cgHeight: number,
  mu: number,
): ThrowKinematics {
  if (v < 0) throw new Error("La velocidad no puede ser negativa");
  if (mu <= 0 || cgHeight < 0) throw new Error("μ debe ser positivo y la altura no negativa");
  const th = (thetaDeg * Math.PI) / 180;
  const vx = v * Math.cos(th);
  const vz = v * Math.sin(th);
  const tf = (vz + Math.sqrt(vz * vz + 2 * G * cgHeight)) / G;
  const vzLand = vz - G * tf;
  const u = Math.max(0, vx - mu * Math.abs(vzLand));
  const ts = u / (mu * G);
  const flightDistance = vx * tf;
  const slideDistance = (u * u) / (2 * mu * G);
  return {
    flightTime: tf,
    flightDistance,
    landingSpeed: u,
    slideTime: ts,
    slideDistance,
    totalDistance: flightDistance + slideDistance,
    totalTime: tf + ts,
  };
}

export function searleThrow(vLaunch: number, mu: number, thetaDeg: number, cgHeight = 0): number {
  return throwKinematics(vLaunch, thetaDeg, cgHeight, mu).totalDistance;
}

/** Límites de Searle: distancias posibles para una velocidad y μ ∈ [μ_lo, μ_hi] (forma cerrada). */
export function searleDistanceBand(
  vLaunch: number,
  muLow: number,
  muHigh: number,
  cgHeight: number,
): { dMin: number; dMax: number } {
  if (!(muLow > 0 && muLow <= muHigh && muHigh <= 1.5))
    throw new Error("Rango de fricción inválido");
  if (vLaunch < 0 || cgHeight < 0) throw new Error("Velocidad y altura deben ser no negativas");
  const v2 = vLaunch * vLaunch;
  const dMin = (mu: number) => v2 / (2 * mu * G) + mu * cgHeight;
  const dMax = (mu: number) => (v2 * (1 + mu * mu)) / (2 * mu * G) + mu * cgHeight;
  const muStar = cgHeight > 0 ? vLaunch / Math.sqrt(2 * G * cgHeight) : Infinity;
  return {
    dMin: dMin(Math.min(muHigh, Math.max(muLow, muStar))),
    dMax: Math.max(dMax(muLow), dMax(muHigh)),
  };
}
