/** Regla de adopción del ajuste de E5 en desarrollo (ADR 0033). */

/** Casos ordenados de CISS que hacen falta para que el error por punto cuente. */
export const MIN_ORDERED = 15;

/** Medianas de los errores de una regla en un grupo (cm; área en cm·m). */
export interface Resumen {
  n: number;
  n_punto: number;
  punto: number | null;
  maximo: number;
  ancho: number;
  area: number;
}

const METRICS = ["punto", "maximo", "ancho", "area"] as const;

/** Métricas que cuentan: el error por punto solo con ≥ 15 casos ordenados. */
function counted(r: Resumen) {
  return METRICS.filter((m) => r[m] !== null && (m !== "punto" || r.n_punto >= MIN_ORDERED));
}

/**
 * Ninguna métrica peor que la regla actual; entre los que cumplen, el menor error por punto (o, sin
 * él, la menor suma de las otras tres). null: se queda la regla actual.
 */
export function adopt(actual: Resumen, candidatos: Record<string, Resumen>): string | null {
  const ms = counted(actual);
  const ok = Object.entries(candidatos).filter(([, r]) => ms.every((m) => r[m]! <= actual[m]!));
  if (ok.length === 0) return null;
  const score = (r: Resumen) => (ms.includes("punto") ? r.punto! : r.maximo + r.ancho + r.area);
  return ok.reduce((a, b) => (score(b[1]) < score(a[1]) ? b : a))[0];
}
