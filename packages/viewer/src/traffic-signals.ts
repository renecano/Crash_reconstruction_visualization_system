/**
 * Semáforos con su fase en el tiempo (PLAN §7.1, F8c).
 *
 * El contrato describe cada fase como el color que tenía el semáforo para un movimiento en el
 * instante del impacto (t = 0) y, opcionalmente, cuánto llevaba en ese color (`tiempo_en_fase`).
 * Regla: sin `tiempo_en_fase` no se inventan cambios y el color declarado se mantiene toda la
 * escena. Con él, se reconstruye la secuencia verde → ámbar → rojo alrededor del impacto:
 *
 * - ámbar con τ: verde antes de −τ, ámbar hasta 3 − τ, rojo después;
 * - rojo con τ: verde antes de −τ − 3, ámbar hasta −τ, rojo después;
 * - verde con τ: verde desde −τ (antes no se sabe: también verde) y verde después (no se sabe
 *   cuándo cambió).
 *
 * Duración del ámbar: 3 s, el valor con que el Manual de Señalización y Dispositivos para el
 * Control del Tránsito (SEDATU/SCT, 2023, p. 783) ejemplifica el intervalo de despeje; el manual
 * no fija un valor único (supuesto con fuente). Destello: 50 a 60 veces por minuto (mismo
 * manual, p. 720); se usan 55, con la mitad del ciclo encendido.
 */

export type SignalColor = "verde" | "amarillo" | "rojo" | "intermitente" | "apagado";
export type Lamp = "rojo" | "amarillo" | "verde";

export const AMBER_S = 3;
export const FLASHES_PER_MIN = 55;

export interface SignalPhase {
  color: SignalColor;
  /** Cuánto llevaba en ese color al impacto (s), si el relato lo dice. */
  tiempoEnFaseS?: number;
}

/** Qué lámpara está encendida en el instante t (null: ninguna). */
export function lampAt(phase: SignalPhase, t: number): Lamp | null {
  const tau = phase.tiempoEnFaseS;
  switch (phase.color) {
    case "apagado":
      return null;
    case "intermitente": {
      // Ámbar en destello; el ciclo arranca encendido en t = 0.
      const cycles = (t * FLASHES_PER_MIN) / 60;
      return cycles - Math.floor(cycles) < 0.5 ? "amarillo" : null;
    }
    case "verde":
      return "verde";
    case "amarillo":
      if (tau === undefined) return "amarillo";
      if (t < -tau) return "verde";
      return t < AMBER_S - tau ? "amarillo" : "rojo";
    case "rojo":
      if (tau === undefined) return "rojo";
      if (t < -tau - AMBER_S) return "verde";
      return t < -tau ? "amarillo" : "rojo";
  }
}

/** Instantes en que cambia la lámpara dentro de [t0, t1] (sin contar el destello). */
export function phaseChanges(phase: SignalPhase, t0: number, t1: number): number[] {
  const tau = phase.tiempoEnFaseS;
  if (tau === undefined) return [];
  const cands =
    phase.color === "amarillo"
      ? [-tau, AMBER_S - tau]
      : phase.color === "rojo"
        ? [-tau - AMBER_S, -tau]
        : [];
  return cands.filter((x) => x >= t0 && x <= t1);
}
