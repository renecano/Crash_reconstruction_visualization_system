/**
 * El tema que eligió el perito en cada modo del recorrido de /cesvi (ADR 0057): la primera vez,
 * al trabajar sigue al sistema (`prefers-color-scheme`, rediseño Laboratorio §3) y al presentar abre
 * en noche; la elección se recuerda en este navegador. Es una comodidad: si el almacenamiento no está
 * disponible, se usan los de por defecto.
 */
import { useSyncExternalStore } from "react";

export type Modo = "presentar" | "trabajar";
export type Tema = "claro" | "oscuro";

export const TEMA_POR_DEFECTO: Readonly<Record<Modo, Tema>> = {
  presentar: "oscuro",
  trabajar: "claro",
};

/** El tema de la primera vez: Presentar abre en noche; Trabajar, como el sistema. */
export function temaPorDefecto(m: Modo, sistemaOscuro: boolean): Tema {
  if (m === "presentar") return "oscuro";
  return sistemaOscuro ? "oscuro" : TEMA_POR_DEFECTO[m];
}

function sistemaOscuro(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

const clave = (m: Modo) => `croquis.cesvi.tema.${m}`;
const EVENTO = "croquis-cesvi-tema";

function leer(m: Modo): Tema {
  try {
    const v = window.localStorage.getItem(clave(m));
    return v === "claro" || v === "oscuro" ? v : temaPorDefecto(m, sistemaOscuro());
  } catch {
    return temaPorDefecto(m, sistemaOscuro());
  }
}

export function guardarTema(m: Modo, t: Tema): void {
  try {
    window.localStorage.setItem(clave(m), t);
  } catch {
    // Sin almacenamiento, el tema vale solo mientras dura la página.
    memoria[m] = t;
  }
  window.dispatchEvent(new Event(EVENTO));
}
const memoria: Partial<Record<Modo, Tema>> = {};

function suscribir(cb: () => void): () => void {
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener("storage", cb);
  };
}

/** El tema del modo, recordado (en el servidor, el de por defecto). */
export function useTema(m: Modo): Tema {
  return useSyncExternalStore(
    suscribir,
    () => memoria[m] ?? leer(m),
    () => TEMA_POR_DEFECTO[m],
  );
}

// --- «Transiciones» (Laboratorio §5): el perito puede apagar la transición entre actos ------------

const CLAVE_TRANSICIONES = "croquis.cesvi.transiciones";
const memoriaTransiciones: { v?: boolean } = {};

/**
 * Si las transiciones están activas, leído en el momento (para efectos: en la hidratación el hook
 * todavía da el valor del servidor).
 */
export function leerTransiciones(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_TRANSICIONES) !== "no";
  } catch {
    return memoriaTransiciones.v ?? true;
  }
}

export function guardarTransiciones(activas: boolean): void {
  try {
    window.localStorage.setItem(CLAVE_TRANSICIONES, activas ? "si" : "no");
  } catch {
    memoriaTransiciones.v = activas;
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** Si las transiciones entre actos están activas (por omisión, sí). */
export function useTransiciones(): boolean {
  return useSyncExternalStore(suscribir, leerTransiciones, () => true);
}
