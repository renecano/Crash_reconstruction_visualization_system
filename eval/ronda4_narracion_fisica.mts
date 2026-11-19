/**
 * Ronda 4 (René, 2026-11-18): «lo que dice la narración no llega a la física». El antes y el después
 * de las cifras de AXA y de un caso guardado (.croquis), con el mismo solver de producción
 * (`PRODUCTION_SAMPLES`): la velocidad de cada vehículo, su rango, si la fija la evidencia o lo
 * declarado, y dónde queda el objeto del primer impacto.
 *
 * Se corre en cada árbol (main para el antes; la rama para el después) y se juntan los dos:
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/ronda4_narracion_fisica.mts <salida.json> <etiqueta> [caso.croquis…]
 *
 * Los .croquis de René no van a git; aquí solo queda su resultado.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fullResult, PRODUCTION_SAMPLES } from "../packages/solver-ts/src/full-result.ts";
import { expedienteAxaReconstruccion } from "../apps/web/src/lib/axa-reconstruccion.ts";
import * as rec from "../packages/cesvi/src/reconstruccion.ts";
const { especDeExpediente, interpretarResultado } = rec;
// En la rama, la típica de la vía donde la evidencia no fija nada (no existe en main: el antes).
const conTipicas = (rec as Record<string, unknown>).expedienteConTipicas as
  | ((e: Expediente, r: ReturnType<typeof interpretarResultado>) => Expediente | null)
  | undefined;
import type { Expediente } from "../packages/cesvi/src/corpus.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const [salida, etiqueta, ...casos] = process.argv.slice(2);
const r2 = (x: number) => Math.round(x * 100) / 100;

function medir(nombre: string, e: Expediente) {
  let base = especDeExpediente(e);
  const t0 = performance.now();
  let r = interpretarResultado(base, fullResult(base.spec, PRODUCTION_SAMPLES));
  const e2 = conTipicas?.(e, r) ?? null;
  if (e2) {
    base = especDeExpediente(e2);
    r = interpretarResultado(base, fullResult(base.spec, PRODUCTION_SAMPLES));
  }
  const inv = ((r.resultado as Json).inversion ?? {}) as { parametros?: Json[] };
  const objeto = ((base.spec.entorno as Json | undefined)?.objetos as Json[] | undefined)?.[0];
  return {
    caso: nombre,
    segundos: r2((performance.now() - t0) / 1000),
    velocidades: r.velocidades.map((v) => {
      const p = inv.parametros?.find(
        (x) => x.parametro === "velocidad_previa" && x.vehiculo === Object.entries(r.ids).find(([, id]) => id === v.vehiculo)?.[0],
      );
      return {
        vehiculo: v.vehiculo,
        previa: v.previa ? { mejor: r2(v.previa.mejor), p10: v.previa.p10 == null ? null : r2(v.previa.p10), p90: v.previa.p90 == null ? null : r2(v.previa.p90) } : null,
        impacto_kmh: v.impacto ? r2(v.impacto.mejor ?? (v.impacto as unknown as { p50: number }).p50) : null,
        identificable: p?.identificable ?? null,
        fijada_por: p?.fijada_por ?? (p?.identificable ? "evidencia" : null),
        en_limite: p?.en_limite ?? false,
      };
    }),
    resultado_v_impacto_kmh: ((r.resultado as Json).vehiculos as Json[]).map((v) => r2(Number(v.v_impacto_kmh))),
    objeto_primer_impacto: objeto ? { tipo: objeto.tipo, posicion: objeto.posicion } : null,
    limites: r.limites,
  };
}

const filas = [medir("AXA A2010930", expedienteAxaReconstruccion())];
for (const ruta of casos) {
  const d = JSON.parse(readFileSync(ruta, "utf8")) as { expediente: Expediente };
  filas.push(medir(basename(ruta), d.expediente));
}
writeFileSync(
  salida ?? join(RAIZ, "eval/results/ronda4_narracion_fisica.json"),
  JSON.stringify({ etiqueta: etiqueta ?? "", fecha: new Date().toISOString(), filas }, null, 2) + "\n",
);
for (const f of filas)
  console.log(f.caso, JSON.stringify(f.velocidades), f.resultado_v_impacto_kmh, JSON.stringify(f.objeto_primer_impacto));
