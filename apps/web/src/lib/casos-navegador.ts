"use client";
/**
 * Los casos guardados de este navegador como estado de React (ADR 0079), con
 * `useSyncExternalStore` como `preferencias-cesvi`: el servidor no los ve (null) y la lista se
 * actualiza al guardar o borrar, aquí o en otra pestaña.
 */
import { useMemo, useSyncExternalStore } from "react";
import {
  abrirGuardado,
  borrarGuardado,
  casosGuardados,
  claveCaso,
  CLAVE_INDICE,
  type Almacen,
  type CasoExpediente,
  type ResumenGuardado,
} from "./casos";

const EVENTO = "croquis:casos";

function almacen(): Almacen | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function suscribir(avisar: () => void) {
  window.addEventListener("storage", avisar);
  window.addEventListener(EVENTO, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(EVENTO, avisar);
  };
}

const leer = (clave: string) => () => almacen()?.getItem(clave) ?? "";
const enServidor = () => null;

/** Avisa a las listas abiertas que cambiaron los casos guardados. */
export const avisarCambio = () => window.dispatchEvent(new Event(EVENTO));

/** Los casos guardados, del más reciente; null mientras no se lee el navegador. */
export function useCasosGuardados(): ResumenGuardado[] | null {
  const crudo = useSyncExternalStore(suscribir, leer(CLAVE_INDICE), enServidor);
  return useMemo(
    () =>
      crudo === null
        ? null
        : casosGuardados({ getItem: () => crudo, setItem: () => {}, removeItem: () => {} }),
    [crudo],
  );
}

/** Un caso guardado; undefined mientras no se lee el navegador, null si no está. */
export function useCasoGuardado(id: string): CasoExpediente | null | undefined {
  const crudo = useSyncExternalStore(suscribir, leer(claveCaso(id)), enServidor);
  return useMemo(() => {
    if (crudo === null) return undefined;
    return abrirGuardado(
      {
        getItem: (k) => (k === claveCaso(id) ? crudo : null),
        setItem: () => {},
        removeItem: () => {},
      },
      id,
    );
  }, [crudo, id]);
}

export function borrarDeEsteEquipo(id: string): void {
  const a = almacen();
  if (!a) return;
  borrarGuardado(a, id);
  avisarCambio();
}
