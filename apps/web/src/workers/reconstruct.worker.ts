/**
 * Web Worker del solver TS: reconstruye una escena fuera del hilo principal para que el visor no
 * se congele (PLAN §3: el solver de producción corre en Web Workers).
 *
 * Con `completo`, responde dos veces: primero la reconstrucción (trayectorias y daño, lo que el
 * visor necesita para dibujar, en décimas de segundo) y después el resultado completo con Monte
 * Carlo, inversión y consistencia (F9, `fullResult`), que tarda unos segundos.
 *
 * Con `paralelo`, el Monte Carlo y la hipótesis «cuadra con el reposo supuesto» (ADR 0091): el
 * cliente los pide a otro worker al mismo tiempo que el resultado completo, que entonces no los
 * calcula (`enOtroWorker`); los números son los mismos y el resultado llega antes (W8, ADR 0135).
 *
 * Con `agentes`, solo los conductores como agentes (R12a, ADR 0088): la reconstrucción y la
 * simulación de los conductores, sin Monte Carlo ni inversión (la escena ya trae sus velocidades).
 */
import {
  fullResult,
  PRODUCTION_SAMPLES,
  reconstruct,
  enParalelo,
  reconstructionToDict,
  simulateDrivers,
  withRelief,
} from "@croquis/solver-ts";

interface Request {
  id: number;
  spec: Record<string, unknown>;
  completo?: boolean;
  agentes?: boolean;
  paralelo?: boolean;
  /** Que `completo` no calcule el Monte Carlo ni la hipótesis del reposo supuesto: van en otro worker. */
  enOtroWorker?: boolean;
  /** La malla de relieve que cita la escena (C3, W5): no viaja en la escena, se adjunta aquí. */
  relieve?: Record<string, unknown> | null;
}

self.onmessage = (ev: MessageEvent<Request>) => {
  const { id, completo, agentes, paralelo, enOtroWorker } = ev.data;
  try {
    if (paralelo) {
      const r = enParalelo(ev.data.spec, {
        ...PRODUCTION_SAMPLES,
        relieve: ev.data.relieve ?? null,
      });
      self.postMessage({ id, fase: "paralelo", ...r });
      return;
    }
    const spec = withRelief(ev.data.spec, ev.data.relieve ?? null);
    if (agentes) {
      const r = simulateDrivers(spec, reconstruct(spec));
      self.postMessage({ id, fase: "agentes", agentes: r === null ? null : r.toDict() });
      return;
    }
    const resultado = reconstructionToDict(reconstruct(spec));
    self.postMessage({ id, fase: "reconstruccion", resultado });
    if (completo) {
      // Más muestras que la referencia (T3.1, ADR 0100).
      self.postMessage({
        id,
        fase: "completo",
        resultado: fullResult(spec, { ...PRODUCTION_SAMPLES, enOtroWorker }),
      });
    }
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
