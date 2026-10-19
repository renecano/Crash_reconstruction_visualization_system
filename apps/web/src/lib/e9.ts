/**
 * E9 (PLAN §8, F11): usabilidad con personas reales. Una sesión la abre quien facilita en `/e9`
 * con un código de participante; mientras está activa, la app anota **solo** el momento de ciertos
 * eventos (nunca el texto del relato ni datos personales) en `localStorage` de este dispositivo.
 * Al terminar se llena el SUS y se descarga un JSON que agrega `uv run croquis-eval e9`.
 */

export const E9_KEY = "croquis:e9";

export type EventoE9 =
  | "relato_enviado"
  | "preguntas_respondidas"
  | "croquis_abierto"
  | "correccion_croquis"
  | "reconstruccion_visible";

export interface SesionE9 {
  version: 1;
  participante: string;
  /** Milisegundos desde 1970 (reloj del dispositivo). */
  inicio: number;
  eventos: { tipo: EventoE9; t: number }[];
  /** Respuestas del SUS, 1–5, en el orden de `SUS_ITEMS`. */
  sus?: number[];
  terminada?: number;
}

/**
 * System Usability Scale (Brooke, 1996), traducción propia al español de México. No es una versión
 * validada; se reporta así.
 */
export const SUS_ITEMS = [
  "Creo que me gustaría usar esta herramienta con frecuencia.",
  "La herramienta me pareció más complicada de lo necesario.",
  "La herramienta me pareció fácil de usar.",
  "Creo que necesitaría ayuda de una persona con conocimientos técnicos para usarla.",
  "Las distintas partes de la herramienta están bien integradas.",
  "Hay demasiadas inconsistencias en la herramienta.",
  "Imagino que la mayoría de las personas aprendería a usarla muy rápido.",
  "La herramienta me pareció muy difícil de manejar.",
  "Me sentí con confianza al usar la herramienta.",
  "Tuve que aprender muchas cosas antes de poder usarla.",
] as const;

export const PARTICIPANTE = /^P\d{2,3}$/;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
let cacheRaw: string | null | undefined;
let cacheSesion: SesionE9 | null = null;

/** Para `useSyncExternalStore`: avisa cuando la sesión cambia en esta pestaña. */
export function subscribeE9(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** La sesión guardada (el mismo objeto mientras no cambie), o null. */
export function leerE9(): SesionE9 | null {
  let raw: string | null;
  try {
    raw = storage()?.getItem(E9_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw === cacheRaw) return cacheSesion;
  cacheRaw = raw;
  cacheSesion = null;
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SesionE9;
    cacheSesion = s.version === 1 && PARTICIPANTE.test(s.participante) ? s : null;
  } catch {
    cacheSesion = null;
  }
  return cacheSesion;
}

function guardar(s: SesionE9): void {
  try {
    storage()?.setItem(E9_KEY, JSON.stringify(s));
  } catch {
    // Sin almacenamiento no hay sesión de E9; la app sigue funcionando igual.
  }
  for (const cb of listeners) cb();
}

export function iniciarE9(participante: string, now = Date.now()): SesionE9 {
  if (!PARTICIPANTE.test(participante)) throw new Error("Código de participante inválido (P01…)");
  const s: SesionE9 = { version: 1, participante, inicio: now, eventos: [] };
  guardar(s);
  return s;
}

/** Anota un evento si hay una sesión activa; si no, no hace nada. */
export function registrarE9(tipo: EventoE9, now = Date.now()): void {
  const s = leerE9();
  if (!s || s.terminada !== undefined) return;
  guardar({ ...s, eventos: [...s.eventos, { tipo, t: now }] });
}

export function terminarE9(sus: number[], now = Date.now()): SesionE9 {
  const s = leerE9();
  if (!s) throw new Error("No hay una sesión de E9 activa");
  if (sus.length !== SUS_ITEMS.length || sus.some((x) => !Number.isInteger(x) || x < 1 || x > 5)) {
    throw new Error("El SUS necesita diez respuestas del 1 al 5");
  }
  const done: SesionE9 = { ...s, sus, terminada: now };
  guardar(done);
  return done;
}

export function borrarE9(): void {
  try {
    storage()?.removeItem(E9_KEY);
  } catch {
    // nada que borrar
  }
  for (const cb of listeners) cb();
}

/** Puntaje SUS (0–100): impares r − 1, pares 5 − r, suma × 2.5. */
export function susPuntaje(r: readonly number[]): number {
  return r.reduce((acc, x, i) => acc + (i % 2 === 0 ? x - 1 : 5 - x), 0) * 2.5;
}

export interface ResumenE9 {
  segundos_hasta_primera_reconstruccion: number | null;
  correcciones_croquis: number;
  rondas_de_preguntas: number;
  sus: number | null;
}

export function resumenE9(s: SesionE9): ResumenE9 {
  const first = s.eventos.find((e) => e.tipo === "reconstruccion_visible");
  return {
    segundos_hasta_primera_reconstruccion: first
      ? Math.round((first.t - s.inicio) / 100) / 10
      : null,
    correcciones_croquis: s.eventos.filter((e) => e.tipo === "correccion_croquis").length,
    rondas_de_preguntas: s.eventos.filter((e) => e.tipo === "preguntas_respondidas").length,
    sus: s.sus ? susPuntaje(s.sus) : null,
  };
}
