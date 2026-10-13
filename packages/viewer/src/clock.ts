/**
 * Reloj del visor: un almacén mutable con suscripción sobre el estado de la línea de tiempo.
 *
 * El lazo de render lee `clock.get().t` en cada cuadro sin pasar por React (60 actualizaciones
 * de estado por segundo bloquearían la interfaz); la interfaz se suscribe y recibe avisos a lo
 * más `uiHz` veces por segundo mientras reproduce, y de inmediato ante acciones del usuario.
 */
import { advance, type TimelineState } from "./timeline";

export interface ViewerClock {
  get(): TimelineState;
  /** Reemplaza el estado (acciones del usuario) y avisa de inmediato. */
  set(next: TimelineState | ((s: TimelineState) => TimelineState)): void;
  /** Avanza con el tiempo real transcurrido (lo llama el lazo de render). */
  tick(wallSeconds: number, nowMs: number): void;
  subscribe(fn: (s: TimelineState) => void): () => void;
}

export function createClock(initial: TimelineState, uiHz = 15): ViewerClock {
  let state = initial;
  let lastNotify = -Infinity;
  const subs = new Set<(s: TimelineState) => void>();
  const notify = (): void => {
    for (const fn of subs) fn(state);
  };
  return {
    get: () => state,
    set(next) {
      state = typeof next === "function" ? next(state) : next;
      notify();
    },
    tick(wallSeconds, nowMs) {
      if (!state.playing) return;
      const prevPlaying = state.playing;
      state = advance(state, wallSeconds);
      const stopped = prevPlaying && !state.playing;
      if (stopped || nowMs - lastNotify >= 1000 / uiHz) {
        lastNotify = nowMs;
        notify();
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
