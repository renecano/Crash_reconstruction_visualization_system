#!/usr/bin/env node
/**
 * Sube el build WebGL del visor a Vercel Blob, en una ruta con la huella de su carpeta (como los
 * modelos, ADR 0107), junto con el paquete de AXA, y escribe `apps/web/public/visor-unity/manifest.json`
 * con dónde quedó. Blob entrega el HTML como descarga, así que las páginas que lo usan viven en el sitio
 * (ADR 0111): la de medición es `/visor-unity/medir.html`.
 *
 * Usa RECURSOS_READ_WRITE_TOKEN, el mismo token de `apps/web/scripts/recursos.mjs`: de la terminal si
 * está definido y, si no, del `.env.local` de la raíz, que no se versiona (René, 2026-11-07). Solo se
 * lee en memoria: no se imprime ni se copia a ningún lado (plan v4 §3.2).
 *
 *   node tools/unity/publicar-web.mjs            # sube el build y escribe el manifiesto
 *   node tools/unity/publicar-web.mjs --podar    # además, dice qué builds viejos borraría
 *   node tools/unity/publicar-web.mjs --podar --si   # y los borra
 *
 * **Podar (U6):** en Blob se quedan solo dos builds: el que se acaba de subir y el que usa
 * producción (el del manifiesto de `origin/main`). Si son el mismo, también el anterior a él, para
 * poder regresar. Sin `--si` solo los lista: borrar no se deshace.
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import process from "node:process";
import { archivosDe, huellaCarpeta } from "../../apps/web/scripts/recursos-hash.mjs";

const RAIZ = resolve(import.meta.dirname, "../..");
const require = createRequire(join(RAIZ, "apps/web/package.json"));
const { del, head, list, put } = require("@vercel/blob");
const { execFileSync } = await import("node:child_process");

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

function leerToken() {
  if (process.env.RECURSOS_READ_WRITE_TOKEN) return process.env.RECURSOS_READ_WRITE_TOKEN;
  const archivo = join(RAIZ, ".env.local");
  if (!existsSync(archivo)) return undefined;
  const linea = readFileSync(archivo, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("RECURSOS_READ_WRITE_TOKEN="));
  return linea
    ?.slice("RECURSOS_READ_WRITE_TOKEN=".length)
    .trim()
    .replace(/^["']|["']$/g, "");
}

const token = leerToken();
if (!token) {
  console.error("Falta RECURSOS_READ_WRITE_TOKEN en la terminal o en el .env.local de la raíz.");
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

const subir = [
  ...archivosDe(BUILD).map((rel) => [rel, readFileSync(join(BUILD, rel))]),
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
const manifiesto = {
  huella,
  base: `${BASE}/`,
  prefijo,
  loader: de(".loader.js"),
  data: de(".data"),
  framework: de(".framework.js"),
  code: de(".wasm"),
  caso: "axa_alcance.json",
};
writeFileSync(
  join(RAIZ, "apps/web/public/visor-unity/manifest.json"),
  `${JSON.stringify(manifiesto, null, 2)}
`,
);
console.log(`Huella ${huella}`);
console.log("Medición: https://croquis-sage.vercel.app/visor-unity/medir.html");

if (process.argv.includes("--podar")) await podar(huella);

/** La huella del build que usa producción: la del manifiesto de `origin/main`. */
function huellaDeProduccion() {
  try {
    const texto = execFileSync(
      "git",
      ["show", "origin/main:apps/web/public/visor-unity/manifest.json"],
      { cwd: RAIZ, encoding: "utf8" },
    );
    return JSON.parse(texto).huella ?? null;
  } catch {
    return null;
  }
}

async function podar(actual) {
  const raiz = "recursos/visor-unity/";
  const porHuella = new Map();
  let cursor;
  do {
    const r = await list({ prefix: raiz, token, cursor, limit: 1000 });
    for (const b of r.blobs) {
      const h = b.pathname.slice(raiz.length).split("/")[0];
      const g = porHuella.get(h) ?? { urls: [], bytes: 0, fecha: 0 };
      g.urls.push(b.url);
      g.bytes += b.size;
      g.fecha = Math.max(g.fecha, new Date(b.uploadedAt).getTime());
      porHuella.set(h, g);
    }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  const produccion = huellaDeProduccion();
  if (!produccion) {
    console.log("Sin el manifiesto de origin/main no se poda nada (haz git fetch).");
    return;
  }
  const quedan = new Set([actual, produccion]);
  if (quedan.size === 1) {
    // El mismo build en los dos: se queda también el anterior, para poder regresar.
    const anterior = [...porHuella.entries()]
      .filter(([h]) => h !== actual)
      .sort((a, b) => b[1].fecha - a[1].fecha)[0];
    if (anterior) quedan.add(anterior[0]);
  }
  const sobran = [...porHuella.entries()].filter(([h]) => !quedan.has(h));
  console.log(`Se quedan: ${[...quedan].join(", ")}`);
  if (!sobran.length) {
    console.log("No hay builds viejos que borrar.");
    return;
  }
  for (const [h, g] of sobran) {
    console.log(
      `${process.argv.includes("--si") ? "Borro" : "Borraría"} ${h}: ${g.urls.length} archivos, ` +
        `${(g.bytes / 1048576).toFixed(1)} MB, subido el ${new Date(g.fecha).toISOString().slice(0, 10)}`,
    );
  }
  if (!process.argv.includes("--si")) {
    console.log("Para borrarlos: node tools/unity/publicar-web.mjs --podar --si");
    return;
  }
  for (const [, g] of sobran) {
    for (let i = 0; i < g.urls.length; i += 100) await del(g.urls.slice(i, i + 100), { token });
  }
  console.log("Listo.");
}
