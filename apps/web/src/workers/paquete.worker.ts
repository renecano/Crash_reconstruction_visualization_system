/**
 * Arma, valida y serializa el paquete caso-3d fuera del hilo principal (René, 2026-11-16: el 3D no
 * puede trabar la página; ADR 0119). Validarlo compila el esquema con Ajv la primera vez, y eso
 * tomaba 1.3 s en cada página nueva. Lo empaqueta `scripts/build-worker.mjs` en
 * `public/workers/paquete.js`.
 */
import { caso3dErrors, type EscenaSpec, type Resultado } from "@croquis/scene-schema";
import { paqueteDelCaso, type RelieveCaso } from "../lib/visor-unity/paquete";

interface Pedido {
  id: number;
  escena: EscenaSpec;
  resultado: Resultado;
  relieve: RelieveCaso;
}

// Al arrancar se compila el esquema (mientras Unity se descarga), para que el primer paquete no espere.
caso3dErrors({});

self.onmessage = (ev: MessageEvent<Pedido>) => {
  const { id, escena, resultado, relieve } = ev.data;
  try {
    self.postMessage({ id, json: JSON.stringify(paqueteDelCaso(escena, resultado, relieve)) });
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
