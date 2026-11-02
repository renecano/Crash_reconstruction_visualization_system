#!/usr/bin/env node
/**
 * T4 — Prueba con personas (docs/cesvi/prueba-personas.md). Agrega las hojas de registro de
 * `data/prueba-personas/*.json` (una por persona y caso, con la forma de
 * `eval/prueba_personas/plantilla.json`) en `eval/results/prueba_personas.json`:
 *
 * - cuántas hojas, personas y casos; cuántos llegaron al PDF; cuántos encontraron el lugar;
 * - mediana del tiempo total y del tiempo por paso (en segundos, solo entre quienes pasaron por él);
 * - los problemas (preguntas, errores y pistas) por clave, ordenados por frecuencia, con en cuántas
 *   personas distintas aparecen. Los tres primeros son los que se corrigen antes de T7.
 *
 * Uso: `node eval/prueba_personas.mjs [--dir data/prueba-personas] [--out eval/results/prueba_personas.json]`.
 * Rechaza una hoja con campos que no son de la plantilla (no debe llevar nombres ni texto libre
 * fuera de `dijo` y `al_final`).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const DIR = resolve(ROOT, arg("dir", "data/prueba-personas"));
const OUT = resolve(ROOT, arg("out", "eval/results/prueba_personas.json"));

export const PASOS = ["caso", "hecho", "lugar", "reconstruccion", "danos", "numeros", "dictamen"];
const CAMPOS = new Set([
  "_nota",
  "persona",
  "caso",
  "orden",
  "fecha",
  "perito",
  "computadora",
  "navegador",
  "entrada_a_paso_s",
  "pdf_descargado_s",
  "llego_al_pdf",
  "encontro_el_lugar",
  "problemas",
  "al_final",
]);
const TIPOS = new Set(["pregunta", "error", "pista"]);

/** Valida una hoja contra la plantilla; devuelve la lista de fallas (vacía si está bien). */
export function validarHoja(h, nombre = "hoja") {
  const fallas = [];
  for (const k of Object.keys(h))
    if (!CAMPOS.has(k)) fallas.push(`${nombre}: campo desconocido «${k}»`);
  if (!/^P\d{2}$/.test(String(h.persona ?? "")))
    fallas.push(`${nombre}: persona debe ser P01, P02…`);
  if (h.caso !== "A" && h.caso !== "B") fallas.push(`${nombre}: caso debe ser A o B`);
  if (typeof h.entrada_a_paso_s !== "object" || h.entrada_a_paso_s === null)
    fallas.push(`${nombre}: falta entrada_a_paso_s`);
  else
    for (const k of Object.keys(h.entrada_a_paso_s))
      if (!PASOS.includes(k)) fallas.push(`${nombre}: paso desconocido «${k}»`);
  if (!Array.isArray(h.problemas)) fallas.push(`${nombre}: problemas debe ser una lista`);
  else
    h.problemas.forEach((p, i) => {
      if (!PASOS.includes(p.paso)) fallas.push(`${nombre}: problemas[${i}].paso desconocido`);
      if (!TIPOS.has(p.tipo))
        fallas.push(`${nombre}: problemas[${i}].tipo debe ser pregunta, error o pista`);
      if (!/^[a-z0-9-]{3,40}$/.test(String(p.clave ?? "")))
        fallas.push(`${nombre}: problemas[${i}].clave debe ser corta, en minúsculas y con guiones`);
    });
  return fallas;
}

export const mediana = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Duración de cada paso: de su entrada a la entrada del siguiente (o al PDF en el último). */
export function duracionesPorPaso(h) {
  const out = {};
  const e = h.entrada_a_paso_s ?? {};
  const presentes = PASOS.filter((p) => Number.isFinite(e[p]));
  for (let i = 0; i < presentes.length; i++) {
    const p = presentes[i];
    const fin = i + 1 < presentes.length ? e[presentes[i + 1]] : h.pdf_descargado_s;
    out[p] = Number.isFinite(fin) ? fin - e[p] : null;
  }
  return out;
}

export function agregar(hojas) {
  const personas = new Set(hojas.map((h) => h.persona));
  const porClave = new Map();
  for (const h of hojas) {
    for (const p of h.problemas ?? []) {
      const c = porClave.get(p.clave) ?? {
        clave: p.clave,
        veces: 0,
        personas: new Set(),
        pasos: new Set(),
        tipos: new Set(),
        dijeron: [],
      };
      c.veces += 1;
      c.personas.add(h.persona);
      c.pasos.add(p.paso);
      c.tipos.add(p.tipo);
      if (p.dijo) c.dijeron.push(p.dijo);
      porClave.set(p.clave, c);
    }
  }
  const problemas = [...porClave.values()]
    .map((c) => ({
      clave: c.clave,
      veces: c.veces,
      personas: c.personas.size,
      pasos: [...c.pasos].sort(),
      tipos: [...c.tipos].sort(),
      dijeron: c.dijeron,
    }))
    .sort((a, b) => b.personas - a.personas || b.veces - a.veces || a.clave.localeCompare(b.clave));
  const porPaso = {};
  for (const p of PASOS) {
    const ds = hojas.map((h) => duracionesPorPaso(h)[p]).filter((x) => Number.isFinite(x));
    porPaso[p] = { mediana_s: mediana(ds), personas: ds.length };
  }
  const porCaso = {};
  for (const caso of ["A", "B"]) {
    const sel = hojas.filter((h) => h.caso === caso);
    porCaso[caso] = {
      hojas: sel.length,
      llegaron_al_pdf: sel.filter((h) => h.llego_al_pdf === true).length,
      encontraron_el_lugar: sel.filter((h) => h.encontro_el_lugar === true).length,
      total_mediana_s: mediana(sel.map((h) => h.pdf_descargado_s)),
    };
  }
  return {
    hojas: hojas.length,
    personas: personas.size,
    minimo_de_tres_personas: personas.size >= 3,
    llegaron_al_pdf: hojas.filter((h) => h.llego_al_pdf === true).length,
    encontraron_el_lugar: hojas.filter((h) => h.encontro_el_lugar === true).length,
    total_mediana_s: mediana(hojas.map((h) => h.pdf_descargado_s)),
    por_caso: porCaso,
    por_paso: porPaso,
    problemas,
    tres_mas_frecuentes: problemas.slice(0, 3).map((p) => p.clave),
    seguridad_1_a_5_mediana: mediana(hojas.map((h) => h.al_final?.seguridad_1_a_5)),
  };
}

function main() {
  let nombres = [];
  try {
    nombres = readdirSync(DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    console.error(`No existe ${DIR}. Copia la plantilla ahí (ver docs/cesvi/prueba-personas.md).`);
    process.exit(1);
  }
  const hojas = [];
  const fallas = [];
  for (const f of nombres) {
    const h = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    fallas.push(...validarHoja(h, f));
    hojas.push(h);
  }
  if (fallas.length) {
    for (const x of fallas) console.error(x);
    process.exit(1);
  }
  const resumen = {
    generado: new Date().toISOString(),
    fuente: "data/prueba-personas/*.json (hojas de docs/cesvi/prueba-personas.md)",
    archivos: nombres,
    ...agregar(hojas),
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(resumen, null, 2)}\n`);
  console.log(
    `${resumen.hojas} hojas de ${resumen.personas} personas; ${resumen.llegaron_al_pdf} llegaron al PDF; mediana ${resumen.total_mediana_s} s. Tres más frecuentes: ${resumen.tres_mas_frecuentes.join(", ") || "(ninguno)"}.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
