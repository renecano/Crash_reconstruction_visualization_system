/**
 * El tema que eligió el perito en cada modo del recorrido de /cesvi (ADR 0057): claro por defecto
 * al trabajar y oscuro al presentar; la elección se recuerda en este navegador. Es una comodidad:
 * si el almacenamiento no está disponible, se usan los de por defecto.
 */
import { useSyncExternalStore } from "react";

export type Modo = "presentar" | "trabajar";
export type Tema = "claro" | "oscuro";

export const TEMA_POR_DEFECTO: Readonly<Record<Modo, Tema>> = {
  presentar: "oscuro",
  trabajar: "claro",
};

const clave = (m: Modo) => `croquis.cesvi.tema.${m}`;
const EVENTO = "croquis-cesvi-tema";

function leer(m: Modo): Tema {
  try {
    const v = window.localStorage.getItem(clave(m));
    return v === "claro" || v === "oscuro" ? v : TEMA_POR_DEFECTO[m];
  } catch {
    return TEMA_POR_DEFECTO[m];
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
