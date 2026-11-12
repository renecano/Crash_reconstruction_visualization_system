#!/usr/bin/env node
/**
 * Diferencia por pixel entre capturas del visor Unity (U5, ADR 0115), para comprobar que una
 * optimización «no cambia el aspecto»: compara cada PNG de una carpeta contra el del mismo nombre de
 * la carpeta base, en gris, como `eval/lib/visual-diff.mjs`. La carpeta `base2` (otra toma de lo
 * mismo) da el piso de ruido: lluvia, parpadeo y compresión no cuentan como diferencia.
 *
 *   node eval/u5_diferencia.mjs <carpeta con una subcarpeta por variante> [--base base]
 *                               [--salida eval/results/u5_diferencia.json]
 *
 * `--base` también puede ser una ruta a otra carpeta (las capturas de la cadena de U5: la base es
 * `docs/cesvi/u5/media` y las variantes, `docs/cesvi/u5/escalas/*`). Lee PNG y WebP.
 *
 * Por variante y escena: la diferencia media (0 a 255) y el porcentaje de pixeles que cambian más de
 * 8 y de 24 niveles. Excluye la esquina del minimapa si se pide `--sin-minimapa`.
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const RAIZ = resolve(import.meta.dirname, "..");
const web = createRequire(join(RAIZ, "apps/web/package.json"));
const sharp = createRequire(web.resolve("next/package.json"))("sharp");
const carpeta = resolve(process.argv[2]);
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "base");
const SALIDA = arg("salida", null);
const SIN_MINIMAPA = process.argv.includes("--sin-minimapa");

async function gris(archivo) {
  const { data, info } = await sharp(archivo)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, ancho: info.width, alto: info.height };
}

async function comparar(a, b) {
  const [x, y] = await Promise.all([gris(a), gris(b)]);
  if (x.ancho !== y.ancho || x.alto !== y.alto) return null;
  let suma = 0;
  let mas8 = 0;
  let mas24 = 0;
  let n = 0;
  for (let j = 0; j < x.alto; j++) {
    for (let i = 0; i < x.ancho; i++) {
      // El minimapa: abajo a la derecha, un cuarto del alto.
      if (SIN_MINIMAPA && i > x.ancho - 0.2 * x.ancho && j > x.alto * 0.68) continue;
      const d = Math.abs(x.data[j * x.ancho + i] - y.data[j * x.ancho + i]);
      suma += d;
      if (d > 8) mas8++;
      if (d > 24) mas24++;
      n++;
    }
  }
  const r = (v) => Math.round(v * 100) / 100;
  return { media: r(suma / n), pct_mas_8: r((100 * mas8) / n), pct_mas_24: r((100 * mas24) / n) };
}

// La base: una subcarpeta de la carpeta de variantes o, si no existe ahí, una ruta aparte.
const carpetaBase = existsSync(join(carpeta, BASE)) ? join(carpeta, BASE) : resolve(BASE);
const variantes = readdirSync(carpeta).filter(
  (d) => statSync(join(carpeta, d)).isDirectory() && join(carpeta, d) !== carpetaBase,
);
const resultado = {};
for (const v of variantes) {
  resultado[v] = {};
  for (const f of readdirSync(carpetaBase).filter((x) => /\.(png|webp)$/.test(x))) {
    const otro = join(carpeta, v, f);
    if (!existsSync(otro)) continue;
    resultado[v][f.replace(/\.(png|webp)$/, "")] = await comparar(join(carpetaBase, f), otro);
  }
}
for (const [v, escenas] of Object.entries(resultado)) {
  console.log(v);
  for (const [e, d] of Object.entries(escenas)) {
    console.log(
      `  ${e.padEnd(44)} media ${String(d?.media).padStart(5)}  >8: ${String(d?.pct_mas_8).padStart(5)} %  >24: ${String(d?.pct_mas_24).padStart(5)} %`,
    );
  }
}
if (SALIDA) {
  writeFileSync(
    resolve(SALIDA),
    `${JSON.stringify(
      {
        fecha: new Date().toISOString(),
        base: carpetaBase.slice(RAIZ.length + 1).replaceAll("\\", "/"),
        metodo:
          "Capturas del build WebGL a 1920×1080 (tools/unity/capturas.mjs, nivel media, mismo instante y " +
          "cámara). Diferencia absoluta en gris contra la captura base: media (0 a 255) y porcentaje de " +
          "pixeles que cambian más de 8 y de 24 niveles. «base2» es otra toma de la base: el piso de ruido.",
        sin_minimapa: SIN_MINIMAPA,
        variantes: resultado,
      },
      null,
      2,
    )}\n`,
  );
}
