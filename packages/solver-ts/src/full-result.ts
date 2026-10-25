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

type Json = Record<string, unknown>;

export function fullResult(spec: Json): Json {
  const rec = reconstruct(spec);
  const doc = reconstructionToDict(rec);
  doc.incertidumbre = monteCarlo(spec).toDict();
  const inv = invert(spec);
  doc.inversion = inv.toDict();
  const flags = checkConsistency(spec, { inversion: inv });
  doc.consistencia = flags.map(inconsistencyToDict);
  // Un reposo supuesto que no cabe con el daño medido: la otra hipótesis, para que el perito elija
  // (ADR 0091).
  if (flags.some((f) => f.codigo === "reposo_supuesto_vs_dano"))
    doc.inversion_reposo_supuesto = invert(spec, { assumedAsData: true }).toDict();
  // Los conductores como agentes (R12a), si algún vehículo trae `conductor`.
  const agentes = simulateDrivers(spec, rec);
  if (agentes !== null) doc.agentes = agentes.toDict();
  return doc;
}
