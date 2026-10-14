/**
 * Trayectorias de personas para el visor (port de `croquis_solver.person_motion`): de pie o
 * caminando antes del impacto, montado en su vehículo, proyección de Searle (vuelo y
 * deslizamiento) y reposo.
 */
import { G, type Trajectory, type Vec } from "./models";
import { type ThrowKinematics, throwKinematics } from "./pedestrian";
import { pyRound, radians } from "./pymath";

/** Altura del centro de masa de un cuerpo tendido (visual). */
export const LYING_CG_HEIGHT_M = 0.15;

export interface PhaseSpan {
  /** "de_pie" | "caminando" | "montado" | "vuelo" | "deslizamiento" | "reposo" */
  fase: string;
  tInicio: number;
  tFin: number;
}

export class PersonTrack {
  t: number[] = [];
  x: number[] = [];
  y: number[] = [];
  z: number[] = [];
  yaw: number[] = [];
  fases: PhaseSpan[] = [];

  append(t: number, x: number, y: number, z: number, yaw: number): void {
    if (this.t.length > 0 && t <= this.t[this.t.length - 1]! + 1e-12) return;
    this.t.push(t);
    this.x.push(x);
    this.y.push(y);
    this.z.push(z);
    this.yaw.push(yaw);
  }

  addPhase(fase: string, t0: number, t1: number): void {
    if (t1 > t0 + 1e-12) this.fases.push({ fase, tInicio: t0, tFin: t1 });
  }

  get length(): number {
    return this.t.length;
  }
}

/** Tiempos k·dt (alineados a t = 0) dentro de [t0, t1], con t1 incluido. */
export function grid(t0: number, t1: number, dt: number): number[] {
  const k0 = Math.ceil(t0 / dt - 1e-9);
  const k1 = Math.floor(t1 / dt + 1e-9);
  const ts: number[] = [];
  for (let k = k0; k <= k1; k++) ts.push(pyRound(k * dt, 9));
  if (ts.length === 0 || Math.abs(ts[ts.length - 1]! - t1) > 1e-9) ts.push(t1);
  if (Math.abs(ts[0]! - t0) > 1e-9) ts.unshift(t0);
  return ts;
}

/**
 * De pie en `start` y luego caminando a `speed` para llegar a `target` justo en `tArrive`. Si no
 * alcanza a recorrer la distancia en [tBegin, tArrive], arranca ya en camino.
 */
export function approachTrack(
  track: PersonTrack,
  start: Vec,
  target: Vec,
  speed: number,
  cgHeight: number,
  tBegin: number,
  tArrive: number,
  dt: number,
): void {
  const dx = target[0] - start[0];
  const dy = target[1] - start[1];
  const dist = Math.hypot(dx, dy);
  const yaw = dist > 1e-9 ? Math.atan2(dy, dx) : 0.0;
  if (dist <= 1e-9 || speed <= 0) {
    for (const t of grid(tBegin, tArrive, dt)) track.append(t, target[0], target[1], cgHeight, yaw);
    track.addPhase("de_pie", tBegin, tArrive);
    return;
  }
  const walkTime = dist / speed;
  const tWalk = tArrive - walkTime;
  for (const t of grid(tBegin, tArrive, dt)) {
    const remaining = Math.max(0.0, Math.min(dist, speed * (tArrive - t)));
    const f = 1.0 - remaining / dist;
    track.append(t, start[0] + f * dx, start[1] + f * dy, cgHeight, yaw);
  }
  if (tWalk > tBegin) track.addPhase("de_pie", tBegin, tWalk);
  track.addPhase("caminando", Math.max(tBegin, tWalk), tArrive);
}

/** Camina (o permanece de pie si speed = 0) en línea recta durante toda la escena. */
export function straightWalkTrack(
  track: PersonTrack,
  start: Vec,
  heading: number,
  speed: number,
  cgHeight: number,
  tBegin: number,
  tEnd: number,
  dt: number,
): void {
  for (const t of grid(tBegin, tEnd, dt)) {
    const d = speed * (t - tBegin);
    track.append(
      t,
      start[0] + d * Math.cos(heading),
      start[1] + d * Math.sin(heading),
      cgHeight,
      heading,
    );
  }
  track.addPhase(speed > 0 ? "caminando" : "de_pie", tBegin, tEnd);
}

/** Va montado en su vehículo: sigue su trayectoria previa al impacto (hasta t = 0). */
export function rideTrack(track: PersonTrack, vehicle: Trajectory, cgHeight: number): void {
  if (vehicle.length === 0) return;
  for (let i = 0; i < vehicle.length; i++) {
    track.append(vehicle.t[i]!, vehicle.x[i]!, vehicle.y[i]!, cgHeight, vehicle.yaw[i]!);
  }
  track.addPhase("montado", vehicle.t[0]!, vehicle.t[vehicle.length - 1]!);
}

/** Agrega vuelo y deslizamiento desde `origin` en t0 a lo largo de `heading`. */
export function throwTrack(
  track: PersonTrack,
  origin: Vec,
  heading: number,
  v: number,
  thetaDeg: number,
  cgHeight: number,
  mu: number,
  t0: number,
  dt: number,
): ThrowKinematics {
  const k = throwKinematics(v, thetaDeg, cgHeight, mu);
  const th = radians(thetaDeg);
  const vx = v * Math.cos(th);
  const vz = v * Math.sin(th);
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const tLand = t0 + k.flightTime;
  const tRest = tLand + k.slideTime;
  for (const t of grid(t0, tRest, dt)) {
    let d: number;
    let z: number;
    if (t <= tLand) {
      const tau = t - t0;
      d = vx * tau;
      z = cgHeight + vz * tau - 0.5 * G * tau * tau;
      // El centro de masa baja hacia la postura tendida al final del vuelo.
      z = Math.max(z, 0.0) + LYING_CG_HEIGHT_M * (k.flightTime ? tau / k.flightTime : 1.0);
    } else {
      const tau = t - tLand;
      d = k.flightDistance + k.landingSpeed * tau - 0.5 * mu * G * tau * tau;
      z = LYING_CG_HEIGHT_M;
    }
    track.append(t, origin[0] + d * c, origin[1] + d * s, z, heading);
  }
  track.addPhase("vuelo", t0, tLand);
  track.addPhase("deslizamiento", tLand, tRest);
  return k;
}

/** Permanece en la última posición hasta `tEnd`. */
export function restTrack(track: PersonTrack, tEnd: number, dt: number, lying: boolean): void {
  if (track.t.length === 0) return;
  const tLast = track.t[track.t.length - 1]!;
  const i = track.t.length - 1;
  const [x, y, z, yaw] = [track.x[i]!, track.y[i]!, track.z[i]!, track.yaw[i]!];
  for (const t of grid(tLast, tEnd, dt).slice(1)) track.append(t, x, y, z, yaw);
  track.addPhase(lying ? "reposo" : "de_pie", tLast, tEnd);
}
