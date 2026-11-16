/**
 * El paquete caso-3d, armado en un worker (`src/workers/paquete.worker.ts`, ADR 0119): validar el
 * esquema compilaba Ajv en el hilo principal (1.3 s por página nueva). Devuelve el texto que se le
 * manda a Unity. Sin workers (las pruebas unitarias) o si el worker falla al arrancar, se arma aquí.
 */
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { paqueteDelCaso, type RelieveCaso } from "./paquete";

let worker: Worker | null = null;
let siguiente = 0;
const pendientes = new Map<number, { ok: (json: string) => void; falla: (e: Error) => void }>();

function elWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null;
  try {
    worker = new Worker("/workers/paquete.js");
  } catch {
    return null;
  }
  worker.onmessage = (ev: MessageEvent<{ id: number; json?: string; error?: string }>) => {
    const p = pendientes.get(ev.data.id);
    if (!p) return;
    pendientes.delete(ev.data.id);
    if (ev.data.json !== undefined) p.ok(ev.data.json);
    else p.falla(new Error(ev.data.error ?? "El worker del paquete falló"));
  };
  worker.onerror = () => {
    // El worker no arrancó: lo pendiente se arma en el hilo principal.
    worker = null;
    for (const [, p] of pendientes) p.falla(new Error("sin_worker"));
    pendientes.clear();
  };
  return worker;
}

/** Arranca el worker de antemano (al pedir el 3D): baja su código y compila el esquema mientras tanto. */
export function prepararPaqueteEnWorker(): void {
  elWorker();
}

/** El paquete como texto JSON. Lanza si no cumple el esquema (igual que `paqueteDelCaso`). */
export async function paqueteEnWorker(
  escena: EscenaSpec,
  resultado: Resultado,
  relieve: RelieveCaso = null,
): Promise<string> {
  const w = elWorker();
  const enEsteHilo = () => JSON.stringify(paqueteDelCaso(escena, resultado, relieve));
  if (!w) return enEsteHilo();
  try {
    return await new Promise<string>((ok, falla) => {
      const id = ++siguiente;
      pendientes.set(id, { ok, falla });
      w.postMessage({ id, escena, resultado, relieve });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "sin_worker") return enEsteHilo();
    throw e;
  }
}
