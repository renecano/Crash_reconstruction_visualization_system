/**
 * W8 · T3.2: las hipótesis de AXA como las ve el perito (resultado completo de producción, la escena
 * de la app). Con los arreglos del ADR 0135, el reposo supuesto de V2 y la deformación ya no caben
 * juntos y hay dos hipótesis.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/w8_axa_hipotesis.mts → eval/results/w8/axa_hipotesis.json
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fullResult, PRODUCTION_SAMPLES } from "../packages/solver-ts/src/full-result.ts";
import { expedienteAxaReconstruccion } from "../apps/web/src/lib/axa-reconstruccion.ts";
import { especDeExpediente, interpretarResultado } from "../packages/cesvi/src/reconstruccion.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = especDeExpediente(expedienteAxaReconstruccion());
const completo = fullResult(base.spec as Json, PRODUCTION_SAMPLES) as Json;
const r = interpretarResultado(base, completo as never);
const doc = {
  name: "w8_axa_hipotesis",
  generated_at: new Date().toISOString().slice(0, 19) + "Z",
  consistencia: completo.consistencia,
  encabezado: r.hipotesis ? r.hipotesis.length : 1,
  hipotesis: (r.hipotesis ?? []).map((h) => ({
    clave: h.clave,
    titulo: h.titulo,
    velocidades: h.velocidades,
    reposos: h.reposos,
  })),
  velocidades_sin_elegir: r.velocidades,
  limites: r.limites,
};
writeFileSync(
  join(RAIZ, "eval/results/w8/axa_hipotesis.json"),
  `${JSON.stringify(doc, null, 2)}\n`,
);
console.log(JSON.stringify(doc.hipotesis, null, 1));
console.log(JSON.stringify(doc.limites));
