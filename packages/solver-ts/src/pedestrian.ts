/**
 * Proyección de peatones y ciclistas (port de `croquis_solver.pedestrian`): distancia de
 * lanzamiento ↔ velocidad con el modelo de Searle (SAE 831622, 930659), la corrección de masas de
 * Wood y los contactos probables con el frente del vehículo.
 */
import { G } from "./models";
import { degrees, radians } from "./pymath";
import * as dmath from "./dmath";

export { G };

export interface ThrowSpeedRange {
  /** m/s */
  vMin: number;
  vMax: number;
  /** Ángulo que da la velocidad mínima. */
  thetaMinDeg: number;
}

export function rangeContains(r: ThrowSpeedRange, v: number, tol = 1e-9): boolean {
  return r.vMin - tol <= v && v <= r.vMax + tol;
}

function check(throwM: number, mu: number): void {
  if (throwM < 0) throw new Error("La distancia de lanzamiento no puede ser negativa");
  if (!(mu > 0 && mu <= 1.5)) throw new Error("Fricción cuerpo–suelo fuera de rango");
}

/** Velocidad de lanzamiento para un ángulo dado (ecuación de Searle). */
export function searleSpeed(
  throwM: number,
  mu: number,
  launchAngleDeg: number,
  cgHeightM = 0.0,
): number {
  check(throwM, mu);
  const th = radians(launchAngleDeg);
  const denom = dmath.cos(th) + mu * dmath.sin(th);
  if (denom <= 0) throw new Error("Ángulo de lanzamiento fuera del dominio");
  return Math.sqrt(2.0 * mu * G * Math.max(throwM - mu * cgHeightM, 0.0)) / denom;
}

/** Cotas mínima y máxima de la velocidad de lanzamiento (Searle). */
export function searleRange(throwM: number, mu: number, cgHeightM = 0.0): ThrowSpeedRange {
  check(throwM, mu);
  const base = 2.0 * mu * G * Math.max(throwM - mu * cgHeightM, 0.0);
  return {
    vMin: Math.sqrt(base / (1.0 + mu * mu)),
    vMax: Math.sqrt(base),
    thetaMinDeg: degrees(dmath.atan(mu)),
  };
}

/** Límite superior del dominio de ángulos en el que v_max = v(0): 2·atan μ. */
export function searleMaxAngleDeg(mu: number): number {
  return degrees(2.0 * dmath.atan(mu));
}

export interface ThrowKinematics {
  flightTime: number;
  flightDistance: number;
  landingSpeed: number;
  slideTime: number;
  slideDistance: number;
  totalDistance: number;
  totalTime: number;
}

/** Modelo de Searle completo: vuelo balístico, impulso de aterrizaje y deslizamiento. */
export function throwKinematics(
  v: number,
  thetaDeg: number,
  cgHeight: number,
  mu: number,
): ThrowKinematics {
  if (v < 0) throw new Error("La velocidad no puede ser negativa");
  if (mu <= 0 || cgHeight < 0) throw new Error("μ debe ser positivo y la altura no negativa");
  const th = radians(thetaDeg);
  const vx = v * dmath.cos(th);
  const vz = v * dmath.sin(th);
  const tf = (vz + Math.sqrt(vz * vz + 2.0 * G * cgHeight)) / G;
  const vzLand = vz - G * tf;
  const u = Math.max(0.0, vx - mu * Math.abs(vzLand));
  const ts = u / (mu * G);
  const flightDistance = vx * tf;
  const slideDistance = (u * u) / (2.0 * mu * G);
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

/** Inversa: distancia de lanzamiento para una velocidad y ángulo dados (modelo completo). */
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
  if (!(muLow > 0 && muLow <= muHigh && muHigh <= 1.5)) {
    throw new Error("Rango de fricción cuerpo–suelo inválido");
  }
  if (vLaunch < 0 || cgHeight < 0) throw new Error("Velocidad y altura deben ser no negativas");
  const v2 = vLaunch * vLaunch;
  const dMin = (mu: number) => v2 / (2.0 * mu * G) + mu * cgHeight;
  const dMax = (mu: number) => (v2 * (1.0 + mu * mu)) / (2.0 * mu * G) + mu * cgHeight;
  const muStar = cgHeight > 0 ? vLaunch / Math.sqrt(2.0 * G * cgHeight) : Infinity;
  return {
    dMin: dMin(Math.min(muHigh, Math.max(muLow, muStar))),
    dMax: Math.max(dMax(muLow), dMax(muHigh)),
  };
}

/** Velocidad del vehículo según Wood (1988) con corrección de masas. */
export function woodSpeed(
  throwM: number,
  mu: number,
  cgHeightM: number,
  vehicleMassKg: number,
  pedestrianMassKg: number,
): number {
  check(throwM, mu);
  const inner = throwM - mu * cgHeightM;
  if (inner <= 0) return 0.0;
  return (Math.sqrt(2.0 * mu * G * inner) * (vehicleMassKg + pedestrianMassKg)) / vehicleMassKg;
}

/** Rango de velocidad del vehículo: cotas de Searle divididas por el factor de proyección. */
export function vehicleSpeedRangeFromThrow(
  throwM: number,
  mu: number,
  cgHeightM = 1.0,
  projectionFactor: readonly [number, number] = [0.8, 1.0],
): ThrowSpeedRange {
  const r = searleRange(throwM, mu, cgHeightM);
  const [loF, hiF] = projectionFactor;
  if (!(loF > 0 && loF <= hiF && hiF <= 1.5)) throw new Error("Factor de proyección inválido");
  return { vMin: r.vMin / hiF, vMax: r.vMax / loF, thetaMinDeg: r.thetaMinDeg };
}

/** Puntos de contacto probables entre el frente del vehículo y un peatón de pie. */
export interface ContactZones {
  /** "pierna" | "rodilla" | "muslo" | "cadera" */
  bumperOnBody: string;
  hoodEdgeOnBody: string | null;
  /** "cofre" | "parabrisas" | "techo" | "ninguno" */
  headContact: string;
  wrapAroundDistanceM: number;
}

/** Contactos por altura (defensa, borde de cofre) y por envolvimiento (cabeza). */
export function contactZones(
  statureM: number,
  bumperHeightM: number,
  hoodEdgeHeightM: number,
  hoodLengthM: number,
  wadFactor = 1.08,
): ContactZones {
  if (statureM <= 0) throw new Error("La estatura debe ser positiva");
  const knee = 0.28 * statureM;
  const hip = 0.53 * statureM;
  let bumper: string;
  if (bumperHeightM < knee * 0.85) bumper = "pierna";
  else if (bumperHeightM < knee * 1.25) bumper = "rodilla";
  else if (bumperHeightM < hip) bumper = "muslo";
  else bumper = "cadera";
  let hoodEdge: string | null = null;
  if (hoodEdgeHeightM > bumperHeightM) {
    hoodEdge = hoodEdgeHeightM < 0.6 * statureM ? "cadera" : "abdomen";
  }
  const wad = wadFactor * statureM;
  const along = hoodEdgeHeightM - bumperHeightM + bumperHeightM;
  let head: string;
  if (wad <= along) head = "ninguno";
  else if (wad - along <= hoodLengthM) head = "cofre";
  else if (wad - along <= hoodLengthM + 1.2) head = "parabrisas";
  else head = "techo";
  return {
    bumperOnBody: bumper,
    hoodEdgeOnBody: hoodEdge,
    headContact: head,
    wrapAroundDistanceM: wad,
  };
}
