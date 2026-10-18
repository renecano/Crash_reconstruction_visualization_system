import { useSyncExternalStore } from "react";

/**
 * ¿Hay red? (`navigator.onLine` y sus eventos). Sin red, la demo sigue funcionando con lo
 * precargado por el service worker (ADR 0030); solo la extracción del relato con Claude la necesita.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const snapshot = () => navigator.onLine;
// En el prerender se supone que hay red (no se muestra el aviso antes de hidratar).
const serverSnapshot = () => true;

export function useEnLinea(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
