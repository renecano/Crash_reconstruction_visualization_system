/**
 * Qué hacer cuando se pierde el dispositivo gráfico o falla el ciclo de dibujo (René,
 * 2026-11-04): volver a crear el renderer y la escena; si se repite pronto, bajar un nivel de
 * calidad; si no se recupera, un aviso con «Reintentar» y «Usar calidad media». Nunca pantalla
 * blanca. Lógica pura, sin React, para probarla.
 */
import { QUALITY_LEVELS, type QualityLevel } from "./quality";

/** Pérdidas dentro de esta ventana cuentan como «se repite». */
export const RECOVERY_WINDOW_MS = 120_000;
/** A partir de esta pérdida dentro de la ventana se baja un nivel. */
export const LOWER_AFTER = 2;
/** A partir de esta pérdida dentro de la ventana se deja de intentar solo. */
export const GIVE_UP_AFTER = 4;

export interface RecoveryState {
  /** Instantes (ms) de las pérdidas recientes. */
  perdidas: number[];
  /** Tope de calidad tras bajar (el modo automático no vuelve a subir de aquí). */
  techo: QualityLevel | null;
}

export type RecoveryAction =
  | { tipo: "recrear"; techo: QualityLevel | null }
  | { tipo: "bajar"; calidad: QualityLevel; techo: QualityLevel }
  | { tipo: "rendirse" };

export const RECOVERY_INICIAL: RecoveryState = { perdidas: [], techo: null };

export function lowerLevel(q: QualityLevel): QualityLevel {
  const i = QUALITY_LEVELS.indexOf(q);
  return QUALITY_LEVELS[Math.max(0, i - 1)] ?? q;
}

/** Aplica el tope: el nivel pedido no pasa del techo. */
export function clampToCeiling(q: QualityLevel, techo: QualityLevel | null): QualityLevel {
  if (techo === null) return q;
  return QUALITY_LEVELS.indexOf(q) > QUALITY_LEVELS.indexOf(techo) ? techo : q;
}

/**
 * Registra una pérdida en `now` con la calidad en pantalla y decide: recrear igual, recrear un
 * nivel más abajo (y fijar ese techo), o rendirse y pedirle a la persona qué hacer.
 */
export function onLoss(
  state: RecoveryState,
  now: number,
  calidad: QualityLevel,
): { state: RecoveryState; action: RecoveryAction } {
  const recientes = [...state.perdidas.filter((t) => now - t <= RECOVERY_WINDOW_MS), now];
  const n = recientes.length;
  if (n >= GIVE_UP_AFTER)
    return { state: { ...state, perdidas: recientes }, action: { tipo: "rendirse" } };
  if (n >= LOWER_AFTER && calidad !== "baja") {
    const abajo = lowerLevel(calidad);
    const techo = clampToCeiling(abajo, state.techo);
    return {
      state: { perdidas: recientes, techo },
      action: { tipo: "bajar", calidad: techo, techo },
    };
  }
  return {
    state: { ...state, perdidas: recientes },
    action: { tipo: "recrear", techo: state.techo },
  };
}

/** «Reintentar» tras rendirse: se olvidan las pérdidas, se conserva el techo. */
export function retry(state: RecoveryState): RecoveryState {
  return { perdidas: [], techo: state.techo };
}
