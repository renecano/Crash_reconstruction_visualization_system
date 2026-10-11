/**
 * Conversión de unidades. Internamente todo es SI (m, s, kg, rad);
 * la interfaz muestra km/h y metros. Debe coincidir bit a bit con
 * `croquis_solver.units` (paridad E7).
 */
export const KMH_PER_MS = 3.6;

export function kmhToMs(kmh: number): number {
  return kmh / KMH_PER_MS;
}

export function msToKmh(ms: number): number {
  return ms * KMH_PER_MS;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
