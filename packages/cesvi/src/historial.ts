/**
 * Deshacer y rehacer en los pasos 3 y 4 del recorrido (ADR 0055): una pila de estados anteriores y
 * otra de estados deshechos. Un cambio nuevo borra lo que se podía rehacer.
 */
export interface Historial<T> {
  pasado: T[];
  presente: T;
  futuro: T[];
}

/** Cuántos pasos atrás se guardan. */
export const LIMITE_HISTORIAL = 100;

export const historial = <T>(inicial: T): Historial<T> => ({
  pasado: [],
  presente: inicial,
  futuro: [],
});

/** Registra un estado nuevo (si es el mismo objeto que el presente, no cambia nada). */
export function registrar<T>(h: Historial<T>, nuevo: T): Historial<T> {
  if (Object.is(nuevo, h.presente)) return h;
  return {
    pasado: [...h.pasado, h.presente].slice(-LIMITE_HISTORIAL),
    presente: nuevo,
    futuro: [],
  };
}

export function deshacer<T>(h: Historial<T>): Historial<T> {
  if (!h.pasado.length) return h;
  return {
    pasado: h.pasado.slice(0, -1),
    presente: h.pasado.at(-1)!,
    futuro: [h.presente, ...h.futuro],
  };
}

export function rehacer<T>(h: Historial<T>): Historial<T> {
  if (!h.futuro.length) return h;
  return {
    pasado: [...h.pasado, h.presente],
    presente: h.futuro[0]!,
    futuro: h.futuro.slice(1),
  };
}
