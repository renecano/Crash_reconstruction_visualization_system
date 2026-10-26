/**
 * Web Worker del solver TS: reconstruye una escena fuera del hilo principal para que el visor no
 * se congele (PLAN §3: el solver de producción corre en Web Workers).
 *
 * Con `completo`, responde dos veces: primero la reconstrucción (trayectorias y daño, lo que el
 * visor necesita para dibujar, en décimas de segundo) y después el resultado completo con Monte
 * Carlo, inversión y consistencia (F9, `fullResult`), que tarda unos segundos.
 *
 * Con `agentes`, solo los conductores como agentes (R12a, ADR 0088): la reconstrucción y la
 * simulación de los conductores, sin Monte Carlo ni inversión (la escena ya trae sus velocidades).
 */
import { fullResult, reconstruct, reconstructionToDict, simulateDrivers } from "@croquis/solver-ts";

interface Request {
  id: number;
  spec: Record<string, unknown>;
  completo?: boolean;
  agentes?: boolean;
}

self.onmessage = (ev: MessageEvent<Request>) => {
  const { id, spec, completo, agentes } = ev.data;
  try {
    if (agentes) {
      const r = simulateDrivers(spec, reconstruct(spec));
      self.postMessage({ id, fase: "agentes", agentes: r === null ? null : r.toDict() });
      return;
    }
    const resultado = reconstructionToDict(reconstruct(spec));
    self.postMessage({ id, fase: "reconstruccion", resultado });
    if (completo) {
      self.postMessage({ id, fase: "completo", resultado: fullResult(spec) });
    }
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
