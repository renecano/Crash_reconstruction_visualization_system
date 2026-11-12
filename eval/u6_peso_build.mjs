#!/usr/bin/env node
/**
 * Cuánto baja el navegador en la primera visita al 3D, por archivo, para un build publicado en Blob
 * (U6, René 2026-11-12: «Mide el peso antes y después»). Pide cada archivo como lo pide Chrome
 * (`Accept-Encoding: br, gzip`) y cuenta los bytes que llegan por la red, sin descomprimir; anota
 * también el tamaño sin comprimir. Los cielos, si el build los trae aparte, se cuentan uno por uno:
 * cada caso baja solo el suyo.
 *
 *   node eval/u6_peso_build.mjs <huella> <etiqueta>   → eval/results/u6_peso_build.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import { join, resolve } from "node:path";
import process from "node:process";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

const RAIZ = resolve(import.meta.dirname, "..");
const SALIDA = join(RAIZ, "eval/results/u6_peso_build.json");
const [huella, etiqueta] = process.argv.slice(2);
if (!huella || !etiqueta) {
  console.error("Uso: node eval/u6_peso_build.mjs <huella> <etiqueta>");
  process.exit(1);
}
const man = JSON.parse(
  readFileSync(join(RAIZ, "apps/web/public/visor-unity/manifest.json"), "utf8"),
);
const base = `${man.base}recursos/visor-unity/${huella}/`;
const CIELOS = ["dia", "nublado", "crepusculo", "noche"];

function bajar(url) {
  return new Promise((ok, falla) => {
    request(url, { headers: { "Accept-Encoding": "br, gzip" } }, (res) => {
      const partes = [];
      res.on("data", (p) => partes.push(p));
      res.on("end", () => {
        const red = Buffer.concat(partes);
        const enc = res.headers["content-encoding"];
        const crudo =
          enc === "br" ? brotliDecompressSync(red) : enc === "gzip" ? gunzipSync(red) : red;
        ok({
          estado: res.statusCode,
          codificacion: enc ?? null,
          red: red.length,
          sin_comprimir: crudo.length,
        });
      });
      res.on("error", falla);
    })
      .on("error", falla)
      .end();
  });
}

const nombres =
  huella === man.huella
    ? { loader: man.loader, framework: man.framework, code: man.code, data: man.data }
    : JSON.parse(process.env.CROQUIS_ARCHIVOS ?? "null");
if (!nombres) {
  console.error(
    "Para una huella que no está en el manifiesto, pasa CROQUIS_ARCHIVOS con {loader, framework, code, data}.",
  );
  process.exit(1);
}
const archivos = {};
for (const [k, n] of Object.entries(nombres)) {
  const r = await bajar(`${base}Build/${n}`);
  if (r.estado !== 200) throw new Error(`${n}: HTTP ${r.estado}`);
  archivos[k] = { archivo: n, ...r };
}
const cielos = {};
for (const c of CIELOS) {
  const r = await bajar(`${base}StreamingAssets/cielos/${c}`);
  if (r.estado === 200) cielos[c] = r;
}
const mb = (b) => Math.round((b / 1048576) * 100) / 100;
const build = Object.values(archivos).reduce((s, a) => s + a.red, 0);
const cieloMayor = Object.values(cielos).reduce((m, c) => Math.max(m, c.red), 0);
const medicion = {
  fecha: new Date().toISOString(),
  huella,
  archivos,
  cielos,
  primera_visita_mb: mb(build + cieloMayor),
  nota: Object.keys(cielos).length
    ? "primera_visita_mb = build + el cielo más pesado (cada caso baja solo el suyo)"
    : "los cuatro cielos van dentro del .data",
};
const doc = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, "utf8")) : {};
doc[etiqueta] = medicion;
writeFileSync(SALIDA, `${JSON.stringify(doc, null, 2)}\n`);
for (const [k, a] of Object.entries(archivos))
  console.log(
    `${k.padEnd(9)} red ${mb(a.red)} MB · sin comprimir ${mb(a.sin_comprimir)} MB (${a.codificacion})`,
  );
for (const [k, a] of Object.entries(cielos))
  console.log(`cielo ${k.padEnd(10)} red ${mb(a.red)} MB`);
console.log(`Primera visita: ${medicion.primera_visita_mb} MB`);
