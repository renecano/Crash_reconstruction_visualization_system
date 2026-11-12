#!/usr/bin/env node
/**
 * Las cifras para elegir la escala de dibujo de media (U5, ADR 0115), a partir de lo que midió la
 * cadena `eval/u5_cadena.mjs` (`eval/results/u5_estado.json`). No mide nada: solo resume.
 *
 * Por escena: los fps de media a cada escala medida (mediana del promedio de las repeticiones), el
 * ajuste `ms = F + P·escala²` (F: lo que no depende de los pixeles; P: lo que sí) por mínimos
 * cuadrados y la escala más alta con que esa escena llegaría a la meta. Por escala: cuántas escenas
 * cumplen y cuál es la peor.
 *
 *   node eval/u5_opciones.mjs            # escribe eval/results/u5_opciones.json y una tabla
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { mediana } from "./lib/unity-e6.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const ESTADO = join(RAIZ, "eval/results/u5_estado.json");
const SALIDA = join(RAIZ, "eval/results/u5_opciones.json");
const META = { media: 60, baja: 30 };
const r = (v, d = 1) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

if (!existsSync(ESTADO)) throw new Error("Falta eval/results/u5_estado.json: corre la cadena.");
const estado = JSON.parse(readFileSync(ESTADO, "utf8"));
const buenas = estado.mediciones.filter((m) => !m.error);
const casos = [...new Set(buenas.map((m) => m.caso))].sort();
const configuraciones = [...new Set(buenas.map((m) => m.configuracion))];
const escalaDe = (c) => buenas.find((m) => m.configuracion === c).escala ?? 1;

/** fps (mediana del promedio) y repeticiones de una configuración en una escena. */
function celda(config, caso) {
  const rs = buenas.filter((m) => m.configuracion === config && m.caso === caso);
  return {
    fps: mediana(rs.map((m) => m.fps_promedio)),
    fps_1pct_bajo: mediana(rs.map((m) => m.fps_1pct_bajo)),
    repeticiones: rs.length,
    minimo: rs.length ? Math.min(...rs.map((m) => m.fps_promedio)) : null,
    maximo: rs.length ? Math.max(...rs.map((m) => m.fps_promedio)) : null,
  };
}

/** Mínimos cuadrados de ms = F + P·x con x = escala². */
function ajuste(puntos) {
  const n = puntos.length;
  if (n < 2) return null;
  const sx = puntos.reduce((s, p) => s + p.x, 0);
  const sy = puntos.reduce((s, p) => s + p.ms, 0);
  const sxx = puntos.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = puntos.reduce((s, p) => s + p.x * p.ms, 0);
  const P = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const F = (sy - P * sx) / n;
  const error = Math.max(...puntos.map((p) => Math.abs(F + P * p.x - p.ms)));
  return { F, P, error };
}

const media = configuraciones
  .filter((c) => c.startsWith("media"))
  .sort((a, b) => escalaDe(b) - escalaDe(a));
const porEscena = {};
for (const caso of casos) {
  const escalas = {};
  const puntos = [];
  for (const c of media) {
    const k = celda(c, caso);
    if (k.fps === null) continue;
    escalas[escalaDe(c)] = { ...k, cumple: k.fps >= META.media };
    puntos.push({ x: escalaDe(c) ** 2, ms: 1000 / k.fps });
  }
  const a = ajuste(puntos);
  const tope = 1000 / META.media;
  porEscena[caso] = {
    media: escalas,
    baja: configuraciones.includes("baja")
      ? { ...celda("baja", caso), cumple: (celda("baja", caso).fps ?? 0) >= META.baja }
      : null,
    ajuste: a && {
      ms_fijos: r(a.F, 2),
      ms_por_pixeles_a_escala_1: r(a.P, 2),
      error_maximo_ms: r(a.error, 2),
      // Con F por encima del tope, ninguna escala alcanza: el costo fijo ya se pasa.
      escala_para_la_meta: a.F >= tope ? null : r(Math.min(1, Math.sqrt((tope - a.F) / a.P)), 2),
      fps_tope_sin_pixeles: r(1000 / a.F),
    },
  };
}

const porEscala = {};
for (const c of media) {
  const e = escalaDe(c);
  const filas = casos.map((k) => ({ caso: k, fps: porEscena[k].media[e]?.fps ?? null }));
  const medidas = filas.filter((f) => f.fps !== null);
  if (!medidas.length) continue;
  const peor = medidas.reduce((a, b) => (b.fps < a.fps ? b : a));
  porEscala[e] = {
    escenas_medidas: medidas.length,
    cumplen: medidas.filter((f) => f.fps >= META.media).length,
    no_cumplen: medidas.filter((f) => f.fps < META.media).map((f) => f.caso),
    peor: peor.caso,
    fps_peor: peor.fps,
    resolucion_interna: `${Math.round(1920 * e)}×${Math.round(1080 * e)}`,
  };
}

const doc = {
  fecha: new Date().toISOString(),
  fuente: "eval/results/u5_estado.json (cadena eval/u5_cadena.mjs)",
  build: estado.build ?? null,
  cadena_terminada: estado.terminada === true,
  metodo:
    "fps: mediana del promedio de las repeticiones, 1920×1080, protocolo de E6 (ADR 0026). El ajuste " +
    "ms = F + P·escala² es de mínimos cuadrados sobre las escalas medidas; «escala_para_la_meta» es la " +
    "escala más alta con que el ajuste da 60 fps (una estimación entre puntos medidos, no una medición).",
  meta: META,
  por_escala: porEscala,
  por_escena: porEscena,
};
writeFileSync(SALIDA, `${JSON.stringify(doc, null, 2)}\n`);

const escalas = media.map(escalaDe);
const celdaTexto = (v) => (v === null || v === undefined ? "–" : String(r(v))).padStart(6);
console.log(
  `${"escena".padEnd(30)}${escalas.map((e) => `m×${e}`.padStart(7)).join("")}${"baja".padStart(7)}   F ms   P ms  escala para 60`,
);
for (const caso of casos) {
  const s = porEscena[caso];
  console.log(
    caso.padEnd(30) +
      escalas.map((e) => ` ${celdaTexto(s.media[e]?.fps)}`).join("") +
      ` ${celdaTexto(s.baja?.fps)}` +
      `  ${celdaTexto(s.ajuste?.ms_fijos)} ${celdaTexto(s.ajuste?.ms_por_pixeles_a_escala_1)}  ${s.ajuste?.escala_para_la_meta ?? "ninguna"}`,
  );
}
for (const [e, v] of Object.entries(porEscala)) {
  console.log(
    `media ×${e} (${v.resolucion_interna}): cumplen ${v.cumplen} de ${v.escenas_medidas}; peor ${v.peor} con ${r(v.fps_peor)} fps`,
  );
}
console.log(`Escrito ${SALIDA}`);
