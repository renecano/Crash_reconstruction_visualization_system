/**
 * Resultado completo de una escena, como `croquis_solver.results_io.render`: la reconstrucción
 * con Monte Carlo (`incertidumbre`), la inversión y todas las banderas de consistencia. Es lo que
 * compara E7 contra la referencia Python y lo que el visor muestra.
 */
import { simulateDrivers } from "./agents";
import { checkConsistency, inconsistencyToDict } from "./consistency";
import { evidenceFromSpec, invert } from "./inversion";
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
  /**
   * Sin el Monte Carlo ni la hipótesis «cuadra con el reposo supuesto»: el navegador los calcula en
   * otro worker al mismo tiempo (`enParalelo`) y los agrega. Los números son los mismos.
   */
  enOtroWorker?: boolean;
}

/**
 * Lo que el navegador calcula en otro worker mientras corre la inversión (W8): el Monte Carlo
 * (`incertidumbre`) y la hipótesis «cuadra con el reposo supuesto» (ADR 0091), la misma que agrega
 * `fullResult` cuando la consistencia la pide (null si la escena no trae un reposo supuesto).
 */
export function enParalelo(
  specIn: Json,
  opts: FullResultOptions = {},
): { incertidumbre: Json; reposoSupuesto: Json | null } {
  const spec = withRelief(specIn, opts.relieve ?? null);
  const incertidumbre = monteCarlo(spec, { samples: opts.mcSamples }).toDict();
  const reposoSupuesto = evidenceFromSpec(spec).restAssumed.size
    ? invert(spec, { assumedAsData: true, samples: opts.samples }).toDict()
    : null;
  return { incertidumbre, reposoSupuesto };
}

/**
 * Producción pide más muestras que la referencia (T3.1, ADR 0100): con el hipercubo latino el
 * rango ya casi no depende de la semilla, y con estas cifras el resultado completo sigue por
 * debajo de 10 s en la laptop (`eval/results/axa_tiempo_navegador.json`).
 */
export const PRODUCTION_SAMPLES: Required<Omit<FullResultOptions, "relieve" | "enOtroWorker">> = {
  samples: 32,
  mcSamples: 128,
};

export function fullResult(specIn: Json, opts: FullResultOptions = {}): Json {
  const spec = withRelief(specIn, opts.relieve ?? null);
  const rec = reconstruct(spec);
  const doc = reconstructionToDict(rec);
  if (!opts.enOtroWorker)
    doc.incertidumbre = monteCarlo(spec, { samples: opts.mcSamples }).toDict();
  const inv = invert(spec, { samples: opts.samples });
  doc.inversion = inv.toDict();
  const flags = checkConsistency(spec, { inversion: inv });
  doc.consistencia = flags.map(inconsistencyToDict);
  // Un reposo supuesto que no cabe con el daño medido: la otra hipótesis, para que el perito elija
  // (ADR 0091).
  if (!opts.enOtroWorker && flags.some((f) => f.codigo === "reposo_supuesto_vs_dano"))
    doc.inversion_reposo_supuesto = invert(spec, {
      assumedAsData: true,
      samples: opts.samples,
    }).toDict();
  // Los conductores como agentes (R12a), si algún vehículo trae `conductor`.
  const agentes = simulateDrivers(spec, rec);
  if (agentes !== null) doc.agentes = agentes.toDict();
  return doc;
}
