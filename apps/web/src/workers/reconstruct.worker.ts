/**
 * Web Worker del solver TS: reconstruye una escena fuera del hilo principal para que el visor no
 * se congele (PLAN §3: el solver de producción corre en Web Workers).
 */
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";

interface Request {
  id: number;
  spec: Record<string, unknown>;
}

self.onmessage = (ev: MessageEvent<Request>) => {
  const { id, spec } = ev.data;
  try {
    const resultado = reconstructionToDict(reconstruct(spec));
    self.postMessage({ id, resultado });
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
