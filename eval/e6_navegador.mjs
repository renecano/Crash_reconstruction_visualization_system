#!/usr/bin/env node
/**
 * E6 en la computadora de demo (PLAN §7.8): convierte el JSON que descarga `/medicion` en el
 * resultado versionado `eval/results/e6_demo.json`.
 *
 * No confía en el resumen de la página: valida cada medición y vuelve a elegir la repetición
 * mediana por fps promedio de cada configuración (ADR 0026), con la misma regla que
 * `e6_performance.mjs`. Luego evalúa la meta de la computadora de demo: ≥ 60 fps en alta o ultra
 * en todas las escenas canónicas. Las cifras topadas por la frecuencia de la pantalla (vsync) se
 * marcan: son un mínimo de lo que da el visor.
 *
 * Uso: `node eval/e6_navegador.mjs <e6-navegador-AAAA-MM-DD.json> [--out ruta]`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ESCENAS = [
  "alcance",
  "lateral_interseccion",
  "frontal_curva",
  "peaton_cruce",
  "motociclista",
  "objeto_fijo_arbol",
  "poste",
  "volcadura",
  "nocturno_lluvia",
  "glorieta",
  "interseccion_toluca",
];
const META_FPS = 60;

export function validar(doc) {
  const errores = [];
  if (doc?.version !== 1) errores.push("version distinta de 1");
  if (!Array.isArray(doc?.mediciones) || doc.mediciones.length === 0)
    errores.push("sin mediciones");
  for (const [i, m] of (doc?.mediciones ?? []).entries()) {
    for (const k of ["escena", "calidad", "renderer", "repeticion", "cuadros"]) {
      if (m[k] === undefined) errores.push(`medición ${i}: falta ${k}`);
    }
    if (!ESCENAS.includes(m.escena)) errores.push(`medición ${i}: escena desconocida ${m.escena}`);
    if (!["baja", "media", "alta", "ultra"].includes(m.calidad))
      errores.push(`medición ${i}: calidad ${m.calidad}`);
    if (m.cuadros > 0 && !(m.fps_promedio > 0))
      errores.push(`medición ${i}: fps_promedio inválido`);
  }
  return errores;
}

/** La repetición mediana por fps promedio (con número par, la menor de las dos centrales). */
export function repeticionMediana(lista) {
  const orden = [...lista].sort((a, b) => (a.fps_promedio ?? 0) - (b.fps_promedio ?? 0));
  return orden[Math.floor((orden.length - 1) / 2)];
}

export function resumir(doc) {
  const grupos = new Map();
  for (const m of doc.mediciones) {
    const k = `${m.renderer}|${m.calidad}|${m.escena}`;
    grupos.set(k, [...(grupos.get(k) ?? []), m]);
  }
  const porConfig = [...grupos.values()].map((g) => ({
    ...repeticionMediana(g),
    repeticiones: g.length,
    repeticiones_fps: g.map((x) => x.fps_promedio),
  }));
  // Meta: con alguna calidad (alta o ultra) y algún renderer, todas las escenas ≥ 60 fps.
  const meta = [];
  for (const calidad of ["alta", "ultra"]) {
    for (const renderer of ["webgpu", "webgl"]) {
      const filas = porConfig.filter((r) => r.calidad === calidad && r.renderer === renderer);
      if (filas.length === 0) continue;
      const faltan = ESCENAS.filter((e) => !filas.some((r) => r.escena === e));
      const debajo = filas.filter((r) => (r.fps_promedio ?? 0) < META_FPS).map((r) => r.escena);
      meta.push({
        calidad,
        renderer,
        escenas_medidas: filas.length,
        fps_min_entre_escenas: Math.min(...filas.map((r) => r.fps_promedio ?? 0)),
        escenas_debajo_de_la_meta: debajo,
        escenas_sin_medir: faltan,
        topadas_por_pantalla: filas.filter((r) => r.topado).map((r) => r.escena),
        cumple: faltan.length === 0 && debajo.length === 0,
      });
    }
  }
  return { porConfig, meta };
}

function main() {
  const entrada = process.argv[2];
  if (!entrada || entrada.startsWith("--")) {
    console.error("Uso: node eval/e6_navegador.mjs <archivo.json> [--out ruta]");
    process.exit(2);
  }
  const i = process.argv.indexOf("--out");
  const salida = i > 0 ? process.argv[i + 1] : join(ROOT, "eval", "results", "e6_demo.json");
  const doc = JSON.parse(readFileSync(entrada, "utf8"));
  const errores = validar(doc);
  if (errores.length) {
    console.error(`El archivo no es una medición válida de /medicion:\n- ${errores.join("\n- ")}`);
    process.exit(1);
  }
  const { porConfig, meta } = resumir(doc);
  const resultado = {
    evaluacion: "E6 en la computadora de demo (alta y ultra)",
    generado_por: "node eval/e6_navegador.mjs (desde el JSON de /medicion)",
    archivo_fuente: entrada.split(/[\\/]/).pop(),
    momento_medicion: doc.momento,
    metodo: doc.metodo,
    equipo: doc.equipo,
    config: doc.config,
    meta_fps: META_FPS,
    criterio:
      "Cumple si, con alguna calidad (alta o ultra) y un renderer, las 11 escenas canónicas dan ≥ 60 fps promedio en su repetición mediana (PLAN §7.8). Las cifras topadas por la pantalla son un mínimo.",
    cumple: meta.some((m) => m.cumple),
    meta,
    resumen: porConfig,
    mediciones: doc.mediciones,
  };
  writeFileSync(salida, `${JSON.stringify(resultado, null, 2)}\n`);
  console.log(
    `${salida}: ${resultado.cumple ? "cumple" : "no cumple"} la meta de ${META_FPS} fps.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
