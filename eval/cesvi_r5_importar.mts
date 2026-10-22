/**
 * E-R5 (docs/cesvi/PLAN-CESVI.md, R5): cargar un reporte de CESVI, sobre la prueba congelada.
 *
 * La importación de la página (`/cesvi/importar`) es la misma lectura que armó el corpus de C0: el
 * prompt `corpus-cesvi-v3` sobre el texto del reporte y `expedienteDeSalida`, que revisa cada cita y
 * cada número contra el texto. Así que E-R5 mide la importación con las lecturas ya hechas
 * (`data/cesvi/corpus/expedientes.jsonl`, redactadas), sin API:
 * - lista para reconstruir: el expediente es válido, la escena del solver es válida y el solver
 *   reconstruye a todos sus vehículos;
 * - cobertura por campo: qué tanto de cada dato trae el expediente;
 * - verificable: citas y números que están en el texto;
 * - exactitud de los campos de cálculo: con ellos, cuántos cálculos impresos reproduce el motor de
 *   Croquis (E-C1, `eval/results/cesvi_reproduccion.json`, prueba).
 * La exactitud contra los PDF originales (texto sacado de imágenes y fórmulas) espera a esos PDF.
 *
 * Uso (desde packages/cesvi): pnpm exec tsx ../../eval/cesvi_r5_importar.mts
 *   → eval/results/cesvi_r5_importar.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Conteos, Expediente } from "../packages/cesvi/src/corpus";
import { reconstruirExpediente } from "../packages/cesvi/src/reconstruccion";
import { validateEscena } from "../packages/scene-schema/src/index";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = join(RAIZ, "data/cesvi/corpus");

interface Fila {
  id: string;
  version_prompt: string;
  expediente: Expediente;
  problemas: string[];
  conteos: Conteos;
}

const prueba = new Set(
  (JSON.parse(readFileSync(join(CORPUS, "particion.json"), "utf8")) as { prueba: string[] }).prueba,
);
const filas = readFileSync(join(CORPUS, "expedientes.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as Fila)
  .filter((f) => prueba.has(f.id));

const detalle = filas.map((f) => {
  const e = f.expediente;
  const t0 = performance.now();
  let lista = false;
  let escenaValida = false;
  let error: string | null = null;
  try {
    const r = reconstruirExpediente(e, f.id);
    escenaValida = validateEscena(r.spec).ok;
    const vs = (r.resultado.vehiculos ?? []) as { trayectoria?: { t?: unknown[] } }[];
    lista =
      f.problemas.length === 0 &&
      escenaValida &&
      vs.length === e.vehiculos.length &&
      vs.every((v) => (v.trayectoria?.t ?? []).length > 1);
  } catch (err) {
    error = (err as Error).message.slice(0, 200);
  }
  const danos = e.danos ?? [];
  return {
    id: f.id,
    expediente_valido: f.problemas.length === 0,
    escena_valida: escenaValida,
    lista_para_reconstruir: lista,
    error,
    ms: Math.round(performance.now() - t0),
    campos: {
      vehiculos: e.vehiculos.length,
      clase: e.vehiculos.filter((v) => v.clase).length,
      masa: e.vehiculos.filter((v) => v.masa).length,
      rigidez: e.vehiculos.filter((v) => v.rigidez).length,
      danos: danos.length,
      medidas_c_y_l: danos.filter((d) => d.magnitud?.c_m?.length && d.magnitud.l_m !== undefined)
        .length,
      impactos: (e.impactos ?? []).length,
      modalidad: (e.caso?.modalidades ?? []).length > 0,
      restos: Boolean(e.evidencias?.restos),
      huellas: (e.evidencias?.huellas ?? []).length,
      calculos: (e.calculos ?? []).length,
    },
    conteos: f.conteos,
  };
});

const n = detalle.length;
const cuenta = (p: (d: (typeof detalle)[number]) => boolean) => detalle.filter(p).length;
const suma = (p: (d: (typeof detalle)[number]) => number) => detalle.reduce((a, d) => a + p(d), 0);
const pct = (k: number, m: number) => (m ? Math.round((1000 * k) / m) / 10 : null);
const ms = detalle.map((d) => d.ms).sort((a, b) => a - b);
const vehiculos = suma((d) => d.campos.vehiculos);
const danos = suma((d) => d.campos.danos);
const citas = suma((d) => d.conteos.citas);
const citasFuera = suma((d) => d.conteos.citas_fuera);
const numeros = suma((d) => d.conteos.numeros);
const numerosFuera = suma((d) => d.conteos.numeros_fuera);
const c1 = (
  JSON.parse(readFileSync(join(RAIZ, "eval/results/cesvi_reproduccion.json"), "utf8")) as {
    metodos_prueba: { recalculadas: number; reproduce: number; fichas: number };
  }
).metodos_prueba;

const out = {
  fecha: new Date().toISOString(),
  descripcion:
    "E-R5: la importación de un reporte de CESVI (lectura corpus-cesvi-v3 y revisión de citas) sobre los 205 de la prueba congelada, con las lecturas de C0 (sin API). La exactitud contra los PDF originales espera a esos PDF.",
  reportes: n,
  expedientes_validos: cuenta((d) => d.expediente_valido),
  escenas_validas: cuenta((d) => d.escena_valida),
  listos_para_reconstruir: cuenta((d) => d.lista_para_reconstruir),
  con_error: cuenta((d) => d.error !== null),
  ms_mediana: ms[Math.floor(n / 2)],
  cobertura: {
    vehiculos_con_clase_pct: pct(
      suma((d) => d.campos.clase),
      vehiculos,
    ),
    vehiculos_con_masa_pct: pct(
      suma((d) => d.campos.masa),
      vehiculos,
    ),
    vehiculos_con_rigidez_pct: pct(
      suma((d) => d.campos.rigidez),
      vehiculos,
    ),
    reportes_con_danos_pct: pct(
      cuenta((d) => d.campos.danos > 0),
      n,
    ),
    danos_con_medidas_c_y_l_pct: pct(
      suma((d) => d.campos.medidas_c_y_l),
      danos,
    ),
    reportes_con_impactos_pct: pct(
      cuenta((d) => d.campos.impactos > 0),
      n,
    ),
    reportes_con_modalidad_pct: pct(
      cuenta((d) => d.campos.modalidad),
      n,
    ),
    reportes_con_restos_pct: pct(
      cuenta((d) => d.campos.restos),
      n,
    ),
    reportes_con_huellas_pct: pct(
      cuenta((d) => d.campos.huellas > 0),
      n,
    ),
    reportes_con_calculos_pct: pct(
      cuenta((d) => d.campos.calculos > 0),
      n,
    ),
  },
  verificable: {
    citas,
    citas_fuera_del_texto: citasFuera,
    citas_en_el_texto_pct: pct(citas - citasFuera, citas),
    numeros,
    numeros_fuera_de_su_cita: numerosFuera,
    numeros_en_su_cita_pct: pct(numeros - numerosFuera, numeros),
  },
  campos_de_calculo_e_c1_prueba: {
    fichas: c1.fichas,
    recalculadas: c1.recalculadas,
    reproducen_a_0_5_pct: c1.reproduce,
    proporcion: pct(c1.reproduce, c1.recalculadas),
  },
  detalle,
};
writeFileSync(
  join(RAIZ, "eval/results/cesvi_r5_importar.json"),
  `${JSON.stringify(out, null, 1)}\n`,
);
const { detalle: _d, ...resumen } = out;
console.log(JSON.stringify(resumen, null, 1));
