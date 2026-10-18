/**
 * Reconstrucción en el navegador con el solver TS en un Web Worker (sin servidor). Un solo worker
 * por página; cada petición lleva un id para emparejar sus respuestas.
 */
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";

interface Reply {
  id: number;
  fase?: "reconstruccion" | "completo";
  resultado?: Resultado;
  error?: string;
}

interface Pending {
  completo: boolean;
  onParcial?: (r: Resultado) => void;
  resolve: (r: Resultado) => void;
  reject: (e: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/reconstruct.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (ev: MessageEvent<Reply>) => {
    const p = pending.get(ev.data.id);
    if (!p) return;
    const { fase, resultado, error } = ev.data;
    if (!resultado) {
      pending.delete(ev.data.id);
      p.reject(new Error(error ?? "El solver no devolvió resultado."));
      return;
    }
    if (p.completo && fase === "reconstruccion") {
      p.onParcial?.(resultado);
      return;
    }
    pending.delete(ev.data.id);
    p.resolve(resultado);
  };
  worker.onerror = (ev) => {
    for (const p of pending.values()) p.reject(new Error(ev.message || "El solver falló."));
    pending.clear();
  };
  return worker;
}

/** Solo la reconstrucción (trayectorias, daño, personas): lo necesario para dibujar. */
export function reconstruirEnNavegador(spec: EscenaSpec): Promise<Resultado> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { completo: false, resolve, reject });
    getWorker().postMessage({ id, spec });
  });
}

/**
 * Resultado completo (con Monte Carlo, inversión y consistencia). `onParcial` recibe antes la
 * reconstrucción, para dibujar mientras se calcula lo demás.
 */
export function reconstruirCompletoEnNavegador(
  spec: EscenaSpec,
  onParcial?: (r: Resultado) => void,
): Promise<Resultado> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { completo: true, onParcial, resolve, reject });
    getWorker().postMessage({ id, spec, completo: true });
  });
}
