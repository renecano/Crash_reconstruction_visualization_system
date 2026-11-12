#!/usr/bin/env node
/**
 * ¿El build más ligero se ve igual? (U6, René 2026-11-12: «Achica el build… sin cambiar el
 * aspecto»). Compara, imagen por imagen, dos carpetas de capturas PNG de `tools/unity/capturas.mjs`
 * tomadas con las mismas escenas, vistas e instante: la del build anterior y la del nuevo. Como
 * referencia de ruido compara también dos corridas del mismo build (la lluvia y el resplandor de los
 * faros no son idénticos cuadro a cuadro).
 *
 *   node eval/u6_comparar_capturas.mjs <antes> <despues> [<despues_otra_vez>]
 *     → eval/results/u6_comparar_capturas.json
 *
 * Por imagen: la diferencia media por canal (0–255) y el porcentaje de píxeles que cambian más de 8
 * niveles en algún canal.
 */
import { readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";

const RAIZ = resolve(import.meta.dirname, "..");
const deWeb = createRequire(join(RAIZ, "apps/web/package.json"));
const sharp = createRequire(deWeb.resolve("next/package.json"))("sharp");
const [a, b, c] = process.argv.slice(2).map((x) => resolve(RAIZ, x));
if (!a || !b) {
  console.error("Uso: node eval/u6_comparar_capturas.mjs <antes> <despues> [<despues_otra_vez>]");
  process.exit(1);
}
const UMBRAL = 8;

async function pixeles(f) {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, ancho: info.width, alto: info.height };
}

async function comparar(f1, f2) {
  const [p, q] = await Promise.all([pixeles(f1), pixeles(f2)]);
  if (p.ancho !== q.ancho || p.alto !== q.alto) return { error: "tamaños distintos" };
  let suma = 0;
  let cambian = 0;
  for (let i = 0; i < p.data.length; i += 3) {
    let max = 0;
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(p.data[i + k] - q.data[i + k]);
      suma += d;
      if (d > max) max = d;
    }
    if (max > UMBRAL) cambian++;
  }
  const n = p.data.length / 3;
  return {
    diferencia_media: Math.round((suma / p.data.length) * 1000) / 1000,
    pixeles_que_cambian_pct: Math.round((cambian / n) * 10000) / 100,
  };
}

const imagenes = readdirSync(b)
  .filter((f) => f.endsWith(".png"))
  .sort();
const filas = [];
for (const f of imagenes) {
  const fila = { imagen: f, antes_contra_despues: await comparar(join(a, f), join(b, f)) };
  if (c) fila.ruido_mismo_build = await comparar(join(b, f), join(c, f));
  console.log(JSON.stringify(fila));
  filas.push(fila);
}
const max = (k, campo) =>
  Math.max(...filas.map((f) => f[k]?.[campo]).filter((x) => typeof x === "number"));
const doc = {
  fecha: new Date().toISOString(),
  antes: a.replace(RAIZ, "").replaceAll("\\", "/"),
  despues: b.replace(RAIZ, "").replaceAll("\\", "/"),
  umbral_niveles: UMBRAL,
  peor: {
    antes_contra_despues: {
      diferencia_media: max("antes_contra_despues", "diferencia_media"),
      pixeles_que_cambian_pct: max("antes_contra_despues", "pixeles_que_cambian_pct"),
    },
    ...(c
      ? {
          ruido_mismo_build: {
            diferencia_media: max("ruido_mismo_build", "diferencia_media"),
            pixeles_que_cambian_pct: max("ruido_mismo_build", "pixeles_que_cambian_pct"),
          },
        }
      : {}),
  },
  imagenes: filas,
};
writeFileSync(
  join(RAIZ, "eval/results/u6_comparar_capturas.json"),
  `${JSON.stringify(doc, null, 2)}\n`,
);
console.log(JSON.stringify(doc.peor));
