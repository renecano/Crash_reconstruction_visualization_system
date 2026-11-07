#!/usr/bin/env node
/**
 * Sube el build WebGL del visor a Vercel Blob, en una ruta con la huella de su carpeta (como los
 * modelos, ADR 0107), junto con la página de medición y el paquete de AXA.
 *
 * Pide RECURSOS_READ_WRITE_TOKEN, el mismo token de `apps/web/scripts/recursos.mjs`. Se define solo
 * en la terminal de quien publica: nunca en un archivo ni en el chat (plan v4 §3.2).
 *
 *   $env:RECURSOS_READ_WRITE_TOKEN = "<token>"   # PowerShell, en tu propia terminal
 *   node tools/unity/publicar-web.mjs
 *
 * El manifiesto de `apps/web/public/visor-unity/` y la limpieza de builds viejos llegan en U6.
 */
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import process from "node:process";
import { archivosDe, huellaCarpeta } from "../../apps/web/scripts/recursos-hash.mjs";

const RAIZ = resolve(import.meta.dirname, "../..");
const require = createRequire(join(RAIZ, "apps/web/package.json"));
const { head, put } = require("@vercel/blob");

const BUILD = join(RAIZ, "apps/visor-unity/Build/web");
const CASO = join(RAIZ, "packages/scene-schema/fixtures/caso3d/axa_alcance.json");
const BASE = JSON.parse(readFileSync(join(RAIZ, "apps/web/recursos.json"), "utf8")).base;
const UN_ANO_S = 365 * 24 * 3600;
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".json": "application/json",
};

const token = process.env.RECURSOS_READ_WRITE_TOKEN;
if (!token) {
  console.error("Falta RECURSOS_READ_WRITE_TOKEN. Defínelo en tu terminal (ver el encabezado).");
  process.exit(1);
}

const huella = huellaCarpeta(BUILD);
const prefijo = `recursos/visor-unity/${huella}/`;
const enBuild = readdirSync(join(BUILD, "Build"));
const de = (sufijo) => {
  const f = enBuild.find((x) => x.endsWith(sufijo));
  if (!f) throw new Error(`El build no trae ningún *${sufijo}`);
  return f;
};

const medir = readFileSync(join(RAIZ, "tools/unity/medir.html"), "utf8")
  .replace("__BUILD__", huella)
  .replace("__CASO__", "axa_alcance.json")
  .replace("__LOADER__", de(".loader.js"))
  .replace("__DATA__", de(".data"))
  .replace("__FRAMEWORK__", de(".framework.js"))
  .replace("__CODE__", de(".wasm"));

const subir = [
  ...archivosDe(BUILD).map((rel) => [rel, readFileSync(join(BUILD, rel))]),
  ["medir.html", Buffer.from(medir)],
  ["axa_alcance.json", readFileSync(CASO)],
];
for (const [rel, cuerpo] of subir) {
  const pathname = prefijo + rel;
  const ya = await head(`${BASE}/${pathname}`, { token }).catch(() => null);
  if (ya) {
    console.log(`Ya estaba ${pathname}`);
    continue;
  }
  await put(pathname, cuerpo, {
    access: "public",
    token,
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: UN_ANO_S,
    contentType: TIPOS[extname(rel)] ?? "application/octet-stream",
    multipart: cuerpo.length > 8 * 1024 * 1024,
  });
  console.log(`Subido ${pathname} (${(cuerpo.length / 1048576).toFixed(1)} MB)`);
}
console.log(`Huella ${huella}`);
console.log(`Medición: ${BASE}/${prefijo}medir.html`);
