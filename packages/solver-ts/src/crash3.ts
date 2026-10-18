/**
 * Energía de deformación con el modelo CRASH3 (port de `croquis_solver.crash3`): fuerza lineal por
 * unidad de ancho F/w = A + B·C sobre un perfil de N puntos.
 *
 *   E = w_seg · Σ [ A (C_i + C_{i+1}) / 2 + B (C_i² + C_i C_{i+1} + C_{i+1}²) / 6 + G ] · (1 + tan²θ)
 *
 * con G = A²/(2B) y w_seg = ancho / (N − 1). Unidades SI.
 */
import { G as GRAVITY } from "./models";
import * as dmath from "./dmath";

export const KGF_PER_CM_TO_N_PER_M = GRAVITY * 100.0;
export const KGF_PER_CM2_TO_N_PER_M2 = GRAVITY * 10_000.0;

/** Coeficientes A (N/m) y B (N/m²); G = A²/(2B) en N. */
export class Stiffness {
  constructor(
    readonly a: number,
    readonly b: number,
  ) {
    if (a < 0 || b <= 0) throw new Error("A debe ser ≥ 0 y B > 0");
  }

  get g(): number {
    return (this.a * this.a) / (2.0 * this.b);
  }

  static fromKgfCm(aKgfCm: number, bKgfCm2: number): Stiffness {
    return new Stiffness(aKgfCm * KGF_PER_CM_TO_N_PER_M, bKgfCm2 * KGF_PER_CM2_TO_N_PER_M2);
  }

  static fromB0B1(massKg: number, widthM: number, b0Ms: number, b1PerS: number): Stiffness {
    return new Stiffness((massKg * b0Ms * b1PerS) / widthM, (massKg * b1PerS * b1PerS) / widthM);
  }
}

/** Corrección (1 + tan²θ) acotada a `capDeg`. */
export function angleFactor(pdofOffsetDeg: number, capDeg = 45.0): number {
  const th = (Math.min(Math.abs(pdofOffsetDeg), capDeg) * Math.PI) / 180;
  return 1.0 + dmath.tan(th) ** 2;
}

/** Energía absorbida (J) por un perfil de aplastamiento de N ≥ 2 puntos equiespaciados. */
export function crushEnergy(
  profileM: readonly number[],
  widthM: number,
  k: Stiffness,
  pdofOffsetDeg = 0.0,
): number {
  const n = profileM.length;
  if (n < 2) throw new Error("El perfil necesita al menos dos puntos");
  if (widthM <= 0) throw new Error("El ancho dañado debe ser positivo");
  if (profileM.some((c) => c < 0)) throw new Error("Las profundidades no pueden ser negativas");
  const w = widthM / (n - 1);
  let total = 0.0;
  for (let i = 0; i < n - 1; i++) {
    const c1 = profileM[i]!;
    const c2 = profileM[i + 1]!;
    total += (k.a * (c1 + c2)) / 2.0 + (k.b * (c1 * c1 + c1 * c2 + c2 * c2)) / 6.0 + k.g;
  }
  return total * w * angleFactor(pdofOffsetDeg);
}

/** Caso cerrado: perfil uniforme ⇒ E = w (A C + B C²/2 + G). */
export function uniformCrushEnergy(depthM: number, widthM: number, k: Stiffness): number {
  return widthM * (k.a * depthM + 0.5 * k.b * depthM * depthM + k.g);
}

/** Profundidad uniforme que absorbe `energyJ`; 0 si la energía no supera el umbral G·w. */
export function uniformCrushForEnergy(energyJ: number, widthM: number, k: Stiffness): number {
  const eW = energyJ / widthM;
  if (eW <= k.g) return 0.0;
  return (-k.a + Math.sqrt(k.a * k.a + 2.0 * k.b * (eW - k.g))) / k.b;
}

/** Perfil con la forma `shape` (6 puntos uniformes por defecto) escalado para absorber `energyJ`. */
export function profileForEnergy(
  energyJ: number,
  widthM: number,
  k: Stiffness,
  shape: readonly number[] | null = null,
  pdofOffsetDeg = 0.0,
  tol = 1e-9,
): number[] {
  let weights = shape !== null ? [...shape] : [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  const top = Math.max(...weights);
  if (top <= 0) throw new Error("La forma necesita al menos un peso positivo");
  weights = weights.map((w) => w / top);
  if (
    energyJ <=
    crushEnergy(
      weights.map(() => 0.0),
      widthM,
      k,
      pdofOffsetDeg,
    )
  ) {
    return weights.map(() => 0.0);
  }
  let lo = 0.0;
  let hi = 1.0;
  while (
    crushEnergy(
      weights.map((w) => hi * w),
      widthM,
      k,
      pdofOffsetDeg,
    ) < energyJ
  ) {
    hi *= 2.0;
    if (hi > 1e3) throw new Error("No converge: energía fuera de rango");
  }
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (
      crushEnergy(
        weights.map((w) => mid * w),
        widthM,
        k,
        pdofOffsetDeg,
      ) < energyJ
    )
      lo = mid;
    else hi = mid;
    if (hi - lo < tol) break;
  }
  const cMax = 0.5 * (lo + hi);
  return weights.map((w) => cMax * w);
}

/** Velocidad equivalente contra barrera (m/s): ½ m v² = E. */
export function ebs(energyJ: number, massKg: number): number {
  return Math.sqrt((2.0 * energyJ) / massKg);
}

/** ΔV de cada vehículo a partir de la energía total absorbida (m1·ΔV1 = m2·ΔV2). */
export function deltaVPair(energyTotalJ: number, m1: number, m2: number): [number, number] {
  const dv1 = Math.sqrt((2.0 * energyTotalJ * m2) / (m1 * (m1 + m2)));
  return [dv1, (dv1 * m1) / m2];
}

/** ΔV contra barrera fija a partir de la energía absorbida (EBS) y la restitución. */
export function deltaVBarrier(energyJ: number, massKg: number, restitution = 0.0): number {
  return restitution < 1
    ? (ebs(energyJ, massKg) * (1.0 + restitution)) / Math.sqrt(1.0 - restitution * restitution)
    : Infinity;
}

export const TRIANGULAR_SHAPES: Readonly<Record<string, readonly number[]>> = {
  uniforme: [1, 1, 1, 1, 1, 1],
  izquierda: [1.0, 0.8, 0.6, 0.4, 0.2, 0.05],
  derecha: [0.05, 0.2, 0.4, 0.6, 0.8, 1.0],
  centro: [0.2, 0.6, 1.0, 1.0, 0.6, 0.2],
  poste: [0.05, 0.3, 1.0, 1.0, 0.3, 0.05],
};
