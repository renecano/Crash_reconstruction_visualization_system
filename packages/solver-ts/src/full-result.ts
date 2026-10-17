/**
 * Resultado completo de una escena, como `croquis_solver.results_io.render`: la reconstrucción
 * con Monte Carlo (`incertidumbre`), la inversión y todas las banderas de consistencia. Es lo que
 * compara E7 contra la referencia Python y lo que el visor muestra.
 */
import { checkConsistency, inconsistencyToDict } from "./consistency";
import { invert } from "./inversion";
import { monteCarlo } from "./montecarlo";
import { reconstruct, reconstructionToDict } from "./reconstruct";

type Json = Record<string, unknown>;

export function fullResult(spec: Json): Json {
  const doc = reconstructionToDict(reconstruct(spec));
  doc.incertidumbre = monteCarlo(spec).toDict();
  const inv = invert(spec);
  doc.inversion = inv.toDict();
  doc.consistencia = checkConsistency(spec, { inversion: inv }).map(inconsistencyToDict);
  return doc;
}
