/**
 * Muestreo estratificado por hipercubo latino (port de `croquis_solver/stratified.py`, T3.1, ADR
 * 0100): cada sorteo de una muestra (en orden) es una dimensión repartida en `samples` estratos;
 * la permutación de estratos sale de `shuffle` (el de CPython) y la posición dentro del estrato de
 * `random()`. `uniform` es lineal y `gauss` usa la inversa de la normal de Acklam sobre `dmath.log`,
 * las mismas operaciones y en el mismo orden que la referencia.
 */
import { log } from "./dmath";
import { PyRandom } from "./pyrandom";

/** Semilla del diseño (fija a propósito, ADR 0100): el hipercubo depende solo de su tamaño. */
export const DESIGN_SEED = 20261103;

export function designRng(samples: number, dims: number): PyRandom {
  return new PyRandom(DESIGN_SEED + samples * 1009 + dims);
}

/** Lo que `perturbed` y Monte Carlo piden de su fuente de sorteos. */
export interface Draws {
  uniform(a: number, b: number): number;
  gauss(mu: number, sigma: number): number;
}

/** Cuenta los sorteos de una pasada seca (devuelve el centro de cada uno). */
export class CountingDraws implements Draws {
  count = 0;
  uniform(a: number, b: number): number {
    this.count += 1;
    return (a + b) / 2.0;
  }
  gauss(mu: number): number {
    this.count += 1;
    return mu;
  }
}

const A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
  -3.066479806614716e1, 2.506628277459239,
] as const;
const B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
  -1.328068155288572e1,
] as const;
const C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
  4.374664141464968, 2.938163982698783,
] as const;
const D = [
  7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
] as const;
const P_LOW = 0.02425;
const P_MIN = 1e-12;

/** Inversa de la normal estándar (Acklam), con `p` recortado a [1e-12, 1 − 1e-12]. */
export function normPpf(pIn: number): number {
  const p = Math.min(1.0 - P_MIN, Math.max(P_MIN, pIn));
  if (p < P_LOW) {
    const q = Math.sqrt(-2.0 * log(p));
    return (
      (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0)
    );
  }
  if (p > 1.0 - P_LOW) {
    const q = Math.sqrt(-2.0 * log(1.0 - p));
    return (
      -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0)
    );
  }
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) /
    (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1.0)
  );
}

/** Una fila del hipercubo: devuelve sus `u` en el orden en que la muestra los pide. */
export class StratifiedDraws implements Draws {
  private k = 0;
  constructor(private readonly row: readonly number[]) {}
  private next(): number {
    if (this.k >= this.row.length) {
      throw new RangeError(
        `La muestra pidió más sorteos (${this.k + 1}) que dimensiones (${this.row.length})`,
      );
    }
    const u = this.row[this.k]!;
    this.k += 1;
    return u;
  }
  uniform(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  gauss(mu: number, sigma: number): number {
    return mu + sigma * normPpf(this.next());
  }
}

/** `samples` filas × `dims` columnas: en cada columna, un estrato distinto por fila. */
export class LatinHypercube {
  readonly u: number[][];
  constructor(
    readonly samples: number,
    readonly dims: number,
    rngIn?: PyRandom,
  ) {
    const rng = rngIn ?? designRng(samples, dims);
    this.u = Array.from({ length: samples }, () => new Array<number>(dims).fill(0));
    for (let d = 0; d < dims; d++) {
      const perm = Array.from({ length: samples }, (_, i) => i);
      rng.shuffle(perm);
      for (let i = 0; i < samples; i++) this.u[i]![d] = (perm[i]! + rng.random()) / samples;
    }
  }
  sample(i: number): StratifiedDraws {
    return new StratifiedDraws(this.u[i]!);
  }
}

/** Cuántos sorteos hace `draw` (pasada seca con `CountingDraws`). */
export function countDraws(draw: (d: Draws) => unknown): number {
  const c = new CountingDraws();
  draw(c);
  return c.count;
}
