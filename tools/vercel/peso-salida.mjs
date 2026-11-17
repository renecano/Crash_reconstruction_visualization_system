#!/usr/bin/env node
/**
 * Cuánto pesa de verdad un despliegue de Croquis (René, 2026-11-17: Vercel mostraba ~2 GB por
 * despliegue y Deployment Storage pasó de 10 GB). Mide la salida de `vercel build` (`.vercel/output`),
 * que es lo que Vercel guarda: los archivos estáticos, cada función con lo que lleva y las páginas
 * prerenderizadas.
 *
 *   node tools/vercel/peso-salida.mjs [.vercel/output] [--salida resultado.json] [--limite-total 200] [--limite-funcion 50]
 *
 * - `total_mb`: cada archivo una sola vez (los enlaces simbólicos no suman: así comparte Vercel las
 *   funciones idénticas).
 * - Cada función: lo que hay en su carpeta `.func` más los archivos del repo que nombra su
 *   `.vc-config.json` (`filePathMap`: `vercel build` no los copia, los sube al desplegar). Las funciones
 *   que son un enlace a otra (una por página prerenderizada) no suman otra vez.
 * - `total_mb`: la salida más los archivos de las funciones, cada uno una vez.
 * - Sale con 1 si el total pasa de `--limite-total` MB o una función de `--limite-funcion` MB.
 */
import {
  lstatSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const opcion = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const SALIDA = resolve(
  args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? ".vercel/output",
);
const LIMITE_TOTAL = Number(opcion("limite-total", 200));
const LIMITE_FUNCION = Number(opcion("limite-funcion", 50));
const MB = (b) => Math.round((b / 1e6) * 10) / 10;

/** Todos los archivos de una carpeta: sin seguir enlaces (para el total) o siguiéndolos (para una función). */
function archivos(dir, seguir, vistos = new Set(), fuera = []) {
  let entradas;
  try {
    entradas = readdirSync(dir);
  } catch {
    return fuera;
  }
  for (const n of entradas) {
    const p = join(dir, n);
    const l = lstatSync(p);
    if (l.isSymbolicLink()) {
      if (!seguir) continue;
      let real;
      try {
        real = realpathSync(p);
      } catch {
        continue;
      }
      if (vistos.has(real)) continue;
      vistos.add(real);
      const s = statSync(real);
      if (s.isDirectory()) archivos(real, seguir, vistos, fuera);
      else fuera.push({ ruta: p, real, bytes: s.size });
    } else if (l.isDirectory()) archivos(p, seguir, vistos, fuera);
    else fuera.push({ ruta: p, real: p, bytes: l.size });
  }
  return fuera;
}

const todos = archivos(SALIDA, false);
const total = todos.reduce((s, a) => s + a.bytes, 0);

// Por carpeta de primer y segundo nivel, y por tipo de archivo.
const porCarpeta = {};
const porTipo = {};
for (const a of todos) {
  const rel = relative(SALIDA, a.ruta).replaceAll("\\", "/");
  const partes = rel.split("/");
  const k = partes.slice(0, Math.min(2, partes.length - 1)).join("/") || rel;
  porCarpeta[k] = (porCarpeta[k] ?? 0) + a.bytes;
  const m = /(\.[a-z0-9]+)$/i.exec(rel);
  const t = rel.includes(".prerender-fallback") ? "prerender-fallback" : (m?.[1] ?? "(sin)");
  porTipo[t] = (porTipo[t] ?? 0) + a.bytes;
}

// Cada función, con lo que lleva (siguiendo enlaces), y qué la llena.
const RAIZ = resolve(SALIDA, "..", "..");
/** Los archivos del repo que llevan las funciones, una vez cada uno. */
const delRepo = new Map();
const funciones = [];
(function busca(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const l = lstatSync(p);
    if (n.endsWith(".func")) {
      const real = l.isSymbolicLink() ? realpathSync(p) : p;
      const enlace = l.isSymbolicLink()
        ? relative(SALIDA, resolve(dirname(p), readlinkSync(p)))
        : null;
      const contenido = archivos(real, true);
      // Los archivos del repo que `vercel build` solo nombra (`filePathMap`): se suben al desplegar.
      const config = join(real, ".vc-config.json");
      const mapa = existsSync(config)
        ? (JSON.parse(readFileSync(config, "utf8")).filePathMap ?? {})
        : {};
      for (const [dentroDeLaFuncion, enElRepo] of Object.entries(mapa)) {
        const f = resolve(RAIZ, enElRepo);
        if (!existsSync(f)) continue;
        const b = statSync(f).size;
        contenido.push({ ruta: join(real, dentroDeLaFuncion), real: f, bytes: b });
        if (!l.isSymbolicLink()) delRepo.set(f, b);
      }
      const bytes = contenido.reduce((s, a) => s + a.bytes, 0);
      const dentro = {};
      for (const a of contenido) {
        const rel = relative(real, a.ruta).replaceAll("\\", "/");
        const partes = rel.split("/");
        const i = partes.indexOf("node_modules");
        const k =
          i >= 0
            ? partes.slice(0, i + (partes[i + 1]?.startsWith("@") ? 3 : 2)).join("/")
            : partes.slice(0, Math.min(4, partes.length - 1)).join("/");
        dentro[k] = (dentro[k] ?? 0) + a.bytes;
      }
      funciones.push({
        funcion: relative(join(SALIDA, "functions"), p).replaceAll("\\", "/"),
        mb: MB(bytes),
        enlazada_a: enlace?.replaceAll("\\", "/") ?? null,
        archivos: contenido.length,
        lo_que_mas_pesa: Object.entries(dentro)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([k, v]) => ({ ruta: k, mb: MB(v) })),
      });
    } else if (l.isDirectory()) busca(p);
  }
})(join(SALIDA, "functions"));
funciones.sort((a, b) => b.mb - a.mb);

const deFunciones = [...delRepo.values()].reduce((s, b) => s + b, 0);
const grandes = [...todos].sort((a, b) => b.bytes - a.bytes).slice(0, 25);
const r = {
  descripcion:
    "Peso de un despliegue de Croquis medido sobre la salida de `vercel build` (.vercel/output): lo que guarda Vercel.",
  script: "tools/vercel/peso-salida.mjs",
  fecha: new Date().toISOString(),
  total_mb: MB(total + deFunciones),
  salida_mb: MB(total),
  archivos_de_las_funciones_mb: MB(deFunciones),
  archivos: todos.length + delRepo.size,
  limite_total_mb: LIMITE_TOTAL,
  limite_funcion_mb: LIMITE_FUNCION,
  por_carpeta_mb: Object.fromEntries(
    Object.entries(porCarpeta)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([k, v]) => [k, MB(v)]),
  ),
  por_tipo_mb: Object.fromEntries(
    Object.entries(porTipo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => [k, MB(v)]),
  ),
  funciones_total: funciones.length,
  // Cuánto sumarían las funciones si cada entrada guardara su copia (cota de arriba).
  funciones_suma_por_entrada_mb: MB(funciones.reduce((s, f) => s + f.mb * 1e6, 0)),
  funciones_con_carpeta_propia: funciones.filter((f) => !f.enlazada_a).length,
  funciones,
  archivos_mas_grandes: grandes.map((a) => ({
    ruta: relative(SALIDA, a.ruta).replaceAll("\\", "/"),
    mb: MB(a.bytes),
  })),
};
const destino = opcion("salida", null);
if (destino) writeFileSync(destino, `${JSON.stringify(r, null, 2)}\n`);

process.stdout.write(
  `Despliegue: ${r.total_mb} MB en ${r.archivos} archivos (límite ${LIMITE_TOTAL} MB). ` +
    `Funciones: ${funciones.length} (${r.funciones_con_carpeta_propia} con carpeta propia; sus archivos, ${r.archivos_de_las_funciones_mb} MB).\n`,
);
for (const [k, v] of Object.entries(r.por_carpeta_mb).slice(0, 10))
  process.stdout.write(`  ${String(v).padStart(8)} MB  ${k}\n`);
for (const f of funciones.filter((x) => !x.enlazada_a).slice(0, 8))
  process.stdout.write(
    `  función ${String(f.mb).padStart(7)} MB  ${f.funcion}${f.enlazada_a ? " (enlace)" : ""}\n`,
  );

const malas = funciones.filter((f) => f.mb > LIMITE_FUNCION);
if (r.total_mb > LIMITE_TOTAL || malas.length) {
  process.stderr.write(
    `\nEl despliegue pesa demasiado: ${r.total_mb} MB (límite ${LIMITE_TOTAL})` +
      (malas.length
        ? `; funciones de más de ${LIMITE_FUNCION} MB: ${malas.map((f) => `${f.funcion} (${f.mb})`).join(", ")}`
        : "") +
      ".\n",
  );
  process.exit(1);
}
