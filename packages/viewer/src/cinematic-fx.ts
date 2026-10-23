/**
 * Efectos de cine de alta y ultra (R10, ADR 0077): cuánto desenfoque de movimiento lleva cada
 * instante y dónde enfoca la cámara cinemática. Funciones puras; `PostEffects` las aplica en la GPU
 * cada cuadro mediante `FxState`.
 */
import type { CameraPose } from "./cameras";

/** Desenfoque pleno hasta 0.15 s del impacto; se apaga linealmente hasta 0.6 s. */
export const BLUR_FULL_S = 0.15;
export const BLUR_END_S = 0.6;

/**
 * Peso del desenfoque de movimiento en el instante `t` (0 a 1): solo alrededor del primer
 * impacto, donde el movimiento es más brusco. Sin impacto, 0.
 */
export function impactBlurWeight(t: number, tImpact: number | undefined): number {
  if (tImpact === undefined || !Number.isFinite(t)) return 0;
  const d = Math.abs(t - tImpact);
  if (d <= BLUR_FULL_S) return 1;
  if (d >= BLUR_END_S) return 0;
  return 1 - (d - BLUR_FULL_S) / (BLUR_END_S - BLUR_FULL_S);
}

/** El instante del primer impacto del resultado (s), si lo hay. */
export function firstImpactTime(resultado: {
  eventos?: readonly { tipo: string; t?: number }[];
}): number | undefined {
  const ts = (resultado.eventos ?? [])
    .filter((e) => e.tipo.startsWith("impacto") && typeof e.t === "number")
    .map((e) => e.t!);
  return ts.length ? Math.min(...ts) : undefined;
}

/**
 * Enfoque de la cámara cinemática: a la distancia de su objetivo (los vehículos), con una zona
 * nítida proporcional para que los dos vehículos queden enfocados y el fondo se suavice.
 */
export function cinematicFocus(pose: Pick<CameraPose, "position" | "target">): {
  distance: number;
  focalLength: number;
} {
  const [px, py, pz] = pose.position;
  const [tx, ty, tz] = pose.target;
  const distance = Math.hypot(px - tx, py - ty, pz - tz);
  return { distance, focalLength: Math.max(6, distance * 0.6) };
}

/** Lo que `SceneContent` escribe cada cuadro y `PostEffects` lee antes de dibujar. */
export interface FxState {
  /** Peso del desenfoque de movimiento (0 a 1). */
  blur: number;
  /** Enfoque de la cámara cinemática; null en las demás cámaras (sin profundidad de campo). */
  focus: { distance: number; focalLength: number } | null;
}

export const newFxState = (): FxState => ({ blur: 0, focus: null });
