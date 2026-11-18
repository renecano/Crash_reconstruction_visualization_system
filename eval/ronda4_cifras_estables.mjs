#!/usr/bin/env node
/**
 * Ronda 4 (René, 2026-11-18): ¿el bloque A (las condiciones de la narración y las personas) cambia
 * las cifras que CESVI ya vio? Compara lo publicado con las mismas mediciones repetidas en la rama:
 *
 *   cd packages/cesvi
 *   pnpm exec tsx ../../eval/axa_rango_estable.mts <dir>/axa.json despues
 *   pnpm exec tsx ../../eval/cesvi_r4_reproduccion.mts medir prueba <dir>/r4v4.json
 *   pnpm exec tsx ../../eval/cesvi_r6_carambolas.mts medir prueba   (reescribe su resultado: se
 *       copia a <dir>/carambolas.json y el del repositorio se restaura con git)
 *   node ../../eval/ronda4_cifras_estables.mjs <dir>  → eval/results/ronda4_cifras_estables.json
 *
 * Se ignoran los tiempos de cómputo (`ms`) y los sellos de fecha y commit. La cobertura del rango
 * (`t3_cobertura`) no se repite: solo usa `packages/solver-ts` y las escenas de
 * `packages/scene-schema/fixtures`, y este script comprueba con git que la rama no los toca.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(process.argv[2] ?? ".");
const BASE = process.argv[3] ?? "origin/main";
const leer = (p) => JSON.parse(readFileSync(p, "utf8"));
const publicado = (r) =>
  JSON.parse(execSync(`git show ${BASE}:${r}`, { cwd: RAIZ, maxBuffer: 2e8, encoding: "utf8" }));
/** Sin tiempos de cómputo ni sellos: lo demás tiene que ser idéntico. */
const sinTiempos = (o) =>
  JSON.stringify(o, (k, v) =>
    /^(ms|mediana_ms|ms_mediana|ms_maximo|generated_at|git_commit|fecha|etiqueta)$/.test(k)
      ? undefined
      : v,
  );
const cifras = publicado("eval/results/cifras.json").cifras;

const axa0 = publicado("eval/results/axa_rango_estable.json");
const axa1 = leer(join(DIR, "axa.json"));
const r40 = publicado("eval/results/cesvi_r4_v4_reproduccion_prueba.json");
const r41 = leer(join(DIR, "r4v4.json"));
const car0 = publicado("eval/results/cesvi_r4b_carambolas_prueba.json");
const car1 = leer(join(DIR, "carambolas.json"));
const tocados = execSync(
  `git diff --name-only ${BASE}...HEAD -- packages/solver-ts solver packages/scene-schema/fixtures`,
  { cwd: RAIZ, encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

const distintos = (a, b) =>
  a.detalle.filter((x) => sinTiempos(x) !== sinTiempos(b.detalle.find((y) => y.id === x.id)))
    .length;
const out = {
  descripcion:
    "Ronda 4, bloque A: las cifras que CESVI ya vio, repetidas en la rama y comparadas con lo publicado (sin contar tiempos de cómputo ni sellos de fecha).",
  script: "eval/ronda4_cifras_estables.mjs",
  fecha: new Date().toISOString(),
  base: BASE,
  rama: execSync("git rev-parse --short HEAD", { cwd: RAIZ, encoding: "utf8" }).trim(),
  axa: {
    cifra: cifras["axa.v2"].texto,
    antes: axa0.filas[0].V2,
    despues: axa1.filas[0].V2,
    semillas: axa0.filas.length,
    igual_en_todas_las_semillas: sinTiempos(axa0.filas) === sinTiempos(axa1.filas),
  },
  modalidad_contra_el_titulo: {
    cifra: cifras["er4.modalidad_titulo"].texto,
    reportes: r40.detalle.length,
    // La bitácora ganó un campo después de la medición publicada: se comparan la comparación con
    // el reporte (de ahí sale la modalidad), la reconstrucción y si la escena es válida.
    reportes_con_algo_distinto: r40.detalle.filter((x) => {
      const y = r41.detalle.find((q) => q.id === x.id);
      const de = (d) => sinTiempos([d?.escena_valida, d?.comparacion, d?.reconstruccion]);
      return de(x) !== de(y);
    }).length,
    resumen_igual: sinTiempos(r40.resumen) === sinTiempos(r41.resumen),
  },
  carambolas: {
    cifra: cifras["carambolas.prueba"].texto,
    antes: [car0.impactos_posteriores_ocurridos, car0.impactos_posteriores_en_escena],
    despues: [car1.impactos_posteriores_ocurridos, car1.impactos_posteriores_en_escena],
    expedientes: car0.detalle.length,
    expedientes_con_algo_distinto: distintos(car0, car1),
  },
  cobertura: {
    cifra: cifras["cobertura.rango"].texto,
    repetida: false,
    por_que:
      "t3_cobertura solo usa packages/solver-ts y las escenas de packages/scene-schema/fixtures; la rama no toca ninguno.",
    archivos_del_solver_o_de_sus_escenas_tocados: tocados,
  },
};
out.ninguna_cambia =
  out.axa.igual_en_todas_las_semillas &&
  out.modalidad_contra_el_titulo.reportes_con_algo_distinto === 0 &&
  out.modalidad_contra_el_titulo.resumen_igual &&
  out.carambolas.expedientes_con_algo_distinto === 0 &&
  tocados.length === 0;
writeFileSync(
  join(RAIZ, "eval/results/ronda4_cifras_estables.json"),
  `${JSON.stringify(out, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
process.exit(out.ninguna_cambia ? 0 : 1);
