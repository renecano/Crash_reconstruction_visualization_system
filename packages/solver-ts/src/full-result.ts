/**
 * Resultado completo de una escena, como `croquis_solver.results_io.render`: la reconstrucción
 * con Monte Carlo (`incertidumbre`), la inversión y todas las banderas de consistencia. Es lo que
 * compara E7 contra la referencia Python y lo que el visor muestra.
 */
import { simulateDrivers } from "./agents";
import { checkConsistency, inconsistencyToDict } from "./consistency";
import { invert } from "./inversion";
import { monteCarlo } from "./montecarlo";
import { reconstruct, reconstructionToDict } from "./reconstruct";
import { withRelief } from "./terrain";

type Json = Record<string, unknown>;

export interface FullResultOptions {
  /** Reajustes de la inversión con la evidencia perturbada (12 por omisión, como la referencia). */
  samples?: number;
  /** Muestras del Monte Carlo de los campos inciertos (64 por omisión, como la referencia). */
  mcSamples?: number;
  /** La malla de relieve del paquete caso-3d que cita la escena (W5), si la hay. */
  relieve?: Json | null;
}

/**
 * Producción pide más muestras que la referencia (T3.1, ADR 0100): con el hipercubo latino el
 * rango ya casi no depende de la semilla, y con estas cifras el resultado completo sigue por
 * debajo de 10 s en la laptop (`eval/results/axa_tiempo_navegador.json`).
 */
export const PRODUCTION_SAMPLES: Required<Omit<FullResultOptions, "relieve">> = {
  samples: 32,
  mcSamples: 128,
};

export function fullResult(specIn: Json, opts: FullResultOptions = {}): Json {
  const spec = withRelief(specIn, opts.relieve ?? null);
  const rec = reconstruct(spec);
  const doc = reconstructionToDict(rec);
  doc.incertidumbre = monteCarlo(spec, { samples: opts.mcSamples }).toDict();
  const inv = invert(spec, { samples: opts.samples });
  doc.inversion = inv.toDict();
  const flags = checkConsistency(spec, { inversion: inv });
  doc.consistencia = flags.map(inconsistencyToDict);
  // Un reposo supuesto que no cabe con el daño medido: la otra hipótesis, para que el perito elija
  // (ADR 0091).
  if (flags.some((f) => f.codigo === "reposo_supuesto_vs_dano"))
    doc.inversion_reposo_supuesto = invert(spec, {
      assumedAsData: true,
      samples: opts.samples,
    }).toDict();
  // Los conductores como agentes (R12a), si algún vehículo trae `conductor`.
  const agentes = simulateDrivers(spec, rec);
  if (agentes !== null) doc.agentes = agentes.toDict();
  return doc;
}
