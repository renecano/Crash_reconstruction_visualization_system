/**
 * Muestreo de las trayectorias del resultado del solver en cualquier instante t.
 *
 * El solver entrega muestras en una rejilla de paso dt; el visor interpola linealmente posición
 * y velocidad, y el rumbo por el camino angular más corto. Fuera del intervalo se mantiene el
 * extremo más cercano. No hay física aquí: solo se lee lo que el solver calculó.
 */
import { wrapAngle } from "./coords";
import { dmath } from "@croquis/solver-ts";

export interface VehiclePose {
  x: number;
  y: number;
  yaw: number;
  vx: number;
  vy: number;
  yawRate: number;
  speed: number;
}

export interface PersonPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface VehicleTrack {
  t: readonly number[];
  x: readonly number[];
  y: readonly number[];
  rumbo: readonly number[];
  vx: readonly number[];
  vy: readonly number[];
  vel_angular: readonly number[];
}

export interface PersonTrackData {
  t: readonly number[];
  x: readonly number[];
  y: readonly number[];
  z: readonly number[];
  rumbo: readonly number[];
}

/** Índice i y fracción f tales que t[i] ≤ time ≤ t[i+1]; fuera del intervalo, el extremo. */
export function bracket(t: readonly number[], time: number): { i: number; f: number } {
  const n = t.length;
  if (n === 0) throw new Error("Trayectoria vacía");
  if (n === 1 || time <= (t[0] ?? 0)) return { i: 0, f: 0 };
  if (time >= (t[n - 1] ?? 0)) return { i: n - 2, f: 1 };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((t[mid] ?? 0) <= time) lo = mid;
    else hi = mid;
  }
  const t0 = t[lo] ?? 0;
  const t1 = t[lo + 1] ?? t0;
  return { i: lo, f: t1 > t0 ? (time - t0) / (t1 - t0) : 0 };
}

function lerpAt(arr: readonly number[], i: number, f: number): number {
  const a = arr[i] ?? 0;
  const b = arr[i + 1] ?? a;
  if (f <= 0) return a;
  if (f >= 1) return b;
  return a + (b - a) * f;
}

function angleAt(arr: readonly number[], i: number, f: number): number {
  const a = arr[i] ?? 0;
  const b = arr[i + 1] ?? a;
  return wrapAngle(a + wrapAngle(b - a) * f);
}

export function sampleVehicle(tr: VehicleTrack, time: number): VehiclePose {
  const { i, f } = bracket(tr.t, time);
  const vx = lerpAt(tr.vx, i, f);
  const vy = lerpAt(tr.vy, i, f);
  return {
    x: lerpAt(tr.x, i, f),
    y: lerpAt(tr.y, i, f),
    yaw: angleAt(tr.rumbo, i, f),
    vx,
    vy,
    yawRate: lerpAt(tr.vel_angular, i, f),
    speed: dmath.hypot(vx, vy),
  };
}

export function samplePerson(tr: PersonTrackData, time: number): PersonPose | null {
  if (tr.t.length === 0) return null;
  const { i, f } = bracket(tr.t, time);
  return {
    x: lerpAt(tr.x, i, f),
    y: lerpAt(tr.y, i, f),
    z: lerpAt(tr.z, i, f),
    yaw: angleAt(tr.rumbo, i, f),
  };
}

/** Fase vigente en t (la última que empezó); la primera si t es anterior a todas. */
export function phaseAt<T extends { fase: string; t_inicio: number; t_fin: number }>(
  fases: readonly T[],
  time: number,
): T | null {
  let current: T | null = null;
  for (const f of fases) {
    if (f.t_inicio <= time + 1e-9) current = f;
  }
  return current ?? fases[0] ?? null;
}
