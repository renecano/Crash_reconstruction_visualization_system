/**
 * E-R2 (docs/cesvi/PLAN-CESVI.md, R2): la reconstrucción física de las escenas de R1 con el solver
 * de producción (port TS), y del caso de AXA como expediente del corpus.
 *
 * Para cada escena: si la escena del solver es válida, si el solver la reconstruye (trayectorias e
 * incertidumbre por Monte Carlo), qué fija la evidencia del perito y qué límites se declaran. Las
 * escenas de R1 no traen posiciones colocadas en el mapa (las pone el perito en la página), así que
 * aquí se mide la reconstrucción sin esa evidencia: lo honesto es que no fije velocidades.
 * La verificación CESVI sobre el corpus es E-C1 (`eval/results/cesvi_reproduccion.json`).
 *
 * Uso (desde packages/cesvi): pnpm exec tsx ../../eval/cesvi_r2_reconstruccion.mts
 *   → eval/results/cesvi_r2_reconstruccion.json
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { idDocumento, type Expediente, type SalidaCorpus } from "../packages/cesvi/src/corpus";
import { escenaDeNarracion } from "../packages/cesvi/src/escena-narracion";
import { reconstruirExpediente } from "../packages/cesvi/src/reconstruccion";
import { verificacionCesvi } from "../packages/cesvi/src/verificacion";
import { validateEscena } from "../packages/scene-schema/src/index";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GRABACIONES = join(RAIZ, "data/cesvi/grabaciones/escenas");

type Json = Record<string, unknown>;

function medir(id: string, origen: string, e: Expediente) {
  const t0 = performance.now();
  const r = reconstruirExpediente(e, id);
  const ms = Math.round(performance.now() - t0);
  const res = r.resultado as Json & {
    vehiculos?: { trayectoria?: { t?: unknown[] } }[];
    incertidumbre?: Json;
  };
  const vs = res.vehiculos ?? [];
  return {
    id,
    origen,
    escena_valida: validateEscena(r.spec).ok,
    vehiculos: e.vehiculos.length,
    reconstruida: vs.length > 0 && vs.every((v) => (v.trayectoria?.t ?? []).length > 1),
    con_incertidumbre: Boolean(res.incertidumbre),
    evidencia: r.evidencia,
    velocidades_fijadas: r.velocidades.filter((v) => v.previa !== null).length,
    limites: r.limites,
    verificacion_cesvi: verificacionCesvi(e).map((v) => ({
      vehiculo: v.vehiculo,
      metodos: v.pasos.length,
      falta: v.falta,
    })),
    ms,
  };
}

const escenas = readdirSync(GRABACIONES)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => {
    const g = JSON.parse(readFileSync(join(GRABACIONES, f), "utf8")) as {
      id: string;
      modalidad_c0: string;
      narracion: string;
      salida: SalidaCorpus;
    };
    return medir(
      g.id,
      `R1 · ${g.modalidad_c0}`,
      escenaDeNarracion(g.salida, g.narracion).expediente,
    );
  });

// El caso de AXA: su expediente del corpus de C0 (importado del dictamen, sin posiciones en el mapa).
const idAxa = idDocumento("AXA SINIESTRO A2010930.pdf");
const axa = readFileSync(join(RAIZ, "data/cesvi/corpus/expedientes.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as { id: string; expediente: Expediente })
  .find((r) => r.id === idAxa);
if (axa) escenas.push(medir(axa.id, "corpus · caso A2010930 (AXA)", axa.expediente));

const resultado = {
  fecha: new Date().toISOString(),
  descripcion:
    "E-R2: escenas de R1 (sin posiciones del perito) y el caso de AXA del corpus, reconstruidas con el solver TS de producción. Reconstruida = trayectoria de cada vehículo; velocidades fijadas = las que la evidencia identifica.",
  escenas: escenas.length,
  validas: escenas.filter((e) => e.escena_valida).length,
  reconstruidas: escenas.filter((e) => e.reconstruida).length,
  con_incertidumbre: escenas.filter((e) => e.con_incertidumbre).length,
  con_velocidad_fijada: escenas.filter((e) => e.velocidades_fijadas > 0).length,
  ms_mediana: [...escenas.map((e) => e.ms)].sort((a, b) => a - b)[Math.floor(escenas.length / 2)],
  detalle: escenas,
};
writeFileSync(
  join(RAIZ, "eval/results/cesvi_r2_reconstruccion.json"),
  `${JSON.stringify(resultado, null, 2)}\n`,
);
console.log(
  `${resultado.reconstruidas}/${resultado.escenas} reconstruidas (${resultado.validas} válidas); ${resultado.con_velocidad_fijada} con velocidad fijada; mediana ${resultado.ms_mediana} ms`,
);
