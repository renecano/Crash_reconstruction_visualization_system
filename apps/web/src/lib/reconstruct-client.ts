/**
 * Reconstrucción en el navegador con el solver TS en un Web Worker (sin servidor). Un solo worker
 * por página; cada petición lleva un id para emparejar su respuesta.
 */
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";

interface Reply {
  id: number;
  resultado?: Resultado;
  error?: string;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: Resultado) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/reconstruct.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (ev: MessageEvent<Reply>) => {
    const p = pending.get(ev.data.id);
    if (!p) return;
    pending.delete(ev.data.id);
    if (ev.data.resultado) p.resolve(ev.data.resultado);
    else p.reject(new Error(ev.data.error ?? "El solver no devolvió resultado."));
  };
  worker.onerror = (ev) => {
    for (const p of pending.values()) p.reject(new Error(ev.message || "El solver falló."));
    pending.clear();
  };
  return worker;
}

export function reconstruirEnNavegador(spec: EscenaSpec): Promise<Resultado> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, spec });
  });
}
