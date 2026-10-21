/**
 * Cesión del hilo principal en los horneados largos (restos, ragdolls y volcaduras con Rapier,
 * ADR 0046). Un horneado de varios segundos en un celular congela la página; cediendo cada
 * PRESUPUESTO_MS el navegador sigue respondiendo. Solo cambia cuándo corre cada paso, no qué
 * calcula: el resultado es idéntico (E8).
 */

const PRESUPUESTO_MS = 8;

type ConYield = { scheduler?: { yield?: () => Promise<void> } };

function cederAhora(): Promise<void> {
  const s = (globalThis as ConYield).scheduler;
  if (typeof s?.yield === "function") return s.yield();
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * Devuelve una función para llamar en cada paso del bucle: regresa una promesa (que hay que
 * esperar) cuando ya pasó el presupuesto desde la última cesión, y `null` mientras no.
 */
export function cedente(presupuestoMs = PRESUPUESTO_MS): () => Promise<void> | null {
  let desde = performance.now();
  return () => {
    if (performance.now() - desde < presupuestoMs) return null;
    return cederAhora().then(() => {
      desde = performance.now();
    });
  };
}
