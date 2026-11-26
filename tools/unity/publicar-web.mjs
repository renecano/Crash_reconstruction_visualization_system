#!/usr/bin/env node
/**
 * Sube el build WebGL del visor a Vercel Blob, en una ruta con la huella de su carpeta (como los
 * modelos, ADR 0107), junto con el paquete de AXA, y escribe `apps/web/public/visor-unity/manifest.json`
 * con dónde quedó. Blob entrega el HTML como descarga, así que las páginas que lo usan viven en el sitio
 * (ADR 0111). La página de medición manual (`tools/unity/medir.html`) ya no se publica (auditoría del
 * 2026-11-15, §2.3): se abre en local; la de la computadora de demo es `/visor-unity/medir-e6.html`.
 *
 * Usa RECURSOS_READ_WRITE_TOKEN, el mismo token de `apps/web/scripts/recursos.mjs`: de la terminal si
 * está definido y, si no, del `.env.local` de la raíz, que no se versiona (René, 2026-11-07). Solo se
 * lee en memoria: no se imprime ni se copia a ningún lado (plan v4 §3.2).
 *
 *   node tools/unity/publicar-web.mjs            # sube el build y escribe el manifiesto
 *   node tools/unity/publicar-web.mjs --podar    # además, dice qué builds viejos borraría
 *   node tools/unity/publicar-web.mjs --podar --si   # y los borra
 *   node tools/unity/publicar-web.mjs --bajar <huella>  # copia ese build a .cache/visor-unity/<huella>
 *   node tools/unity/publicar-web.mjs --release <huella>  # sube el build del release visor-web-<huella>
 *
 * **Desde el release (René, 2026-11-26):** Alberto compila en su Mac desde `main` y sube el zip al
 * release de GitHub `visor-web-<huella>`; quien tiene el token lo sube a Blob desde ahí, sin compilar.
 * El zip se baja a `.cache/visor-unity/<huella>` y su huella tiene que ser la del nombre: si no, no se
 * sube nada.
 *
 * **Bajar (René, 2026-11-17):** una sola copia local del build que sirve producción, para que ninguna
 * prueba, medición ni la demo local vuelva a bajarlo de Blob (`tools/unity/visor-local.mjs`). Cuenta
 * lo que bajó: cada byte es transferencia de Blob. Si la copia ya está completa, no baja nada.
 *
 * **Podar (U6):** en Blob se quedan solo dos builds: el que se acaba de subir y el que usa
 * producción (el del manifiesto de `origin/main`). Si son el mismo, también el anterior a él, para
 * poder regresar. Sin `--si` solo los lista: borrar no se deshace.
 */
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import process from "node:process";
import { archivosDe, huellaCarpeta } from "../../apps/web/scripts/recursos-hash.mjs";
import { carpetaDeCopia, leerZip, urlDelRelease } from "./visor-local.mjs";

const RAIZ = resolve(import.meta.dirname, "../..");
const require = createRequire(join(RAIZ, "apps/web/package.json"));
const { del, head, list, put } = require("@vercel/blob");
const { execFileSync } = await import("node:child_process");

const BUILD_LOCAL = join(RAIZ, "apps/visor-unity/Build/web");
const CASO = join(RAIZ, "packages/scene-schema/fixtures/caso3d/axa_alcance.json");
/**
 * Las escenas de D1 con su escenario (`tools/unity/paquetes-d1.ts`): las usa `medir-e6.html` para
 * medir el build web en la computadora de demo (U6). Van junto al build, en `casos/`.
 */
const CASOS_D1 = join(RAIZ, "apps/visor-unity/Build/casos");
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

// `--borrar h1,h2 --conservar h3`: borra exactamente esos builds de Unity (lista explícita, René
// 2026-11-15). Se niega si alguno es el que sirve producción, el del manifiesto de `origin/main` o uno
// de los que se piden conservar (el anterior, para poder regresar).
const iBorrar = process.argv.indexOf("--borrar");
if (iBorrar > 0) {
  const lista = (process.argv[iBorrar + 1] ?? "").split(",").filter(Boolean);
  const iConservar = process.argv.indexOf("--conservar");
  const conservar =
    iConservar > 0 ? (process.argv[iConservar + 1] ?? "").split(",").filter(Boolean) : [];
  const r = await fetch("https://croquis-sage.vercel.app/visor-unity/manifest.json");
  const sitio = (await r.json()).huella;
  const protegidas = new Set([sitio, huellaDeProduccion(), ...conservar].filter(Boolean));
  if (
    !sitio ||
    !lista.length ||
    lista.some((h) => !/^[0-9a-f]{16}$/.test(h) || protegidas.has(h))
  ) {
    console.error(
      `No borro: lista inválida o protegida (protegidas: ${[...protegidas].join(", ")}).`,
    );
    process.exit(1);
  }
  for (const h of lista) {
    const urls = [];
    let cursor;
    do {
      const l = await list({ prefix: `recursos/visor-unity/${h}/`, token, cursor, limit: 1000 });
      urls.push(...l.blobs.map((b) => b.url));
      cursor = l.hasMore ? l.cursor : undefined;
    } while (cursor);
    for (let i = 0; i < urls.length; i += 100) await del(urls.slice(i, i + 100), { token });
    console.log(`Borré ${h}: ${urls.length} archivos.`);
  }
  await new Promise((ok) => setTimeout(ok, 300));
  process.exit(0);
}

const iBajar = process.argv.indexOf("--bajar");
if (iBajar > 0) {
  const h = process.argv[iBajar + 1] ?? "";
  if (!/^[0-9a-f]{16}$/.test(h)) {
    console.error("Uso: --bajar <huella de 16 caracteres>");
    process.exit(1);
  }
  const prefijo = `recursos/visor-unity/${h}/`;
  const destino = join(RAIZ, ".cache", "visor-unity", h);
  const blobs = [];
  let cursor;
  do {
    const l = await list({ prefix: prefijo, token, cursor, limit: 1000 });
    blobs.push(...l.blobs);
    cursor = l.hasMore ? l.cursor : undefined;
  } while (cursor);
  if (!blobs.length) {
    console.error(`No hay archivos en ${prefijo}.`);
    process.exit(1);
  }
  const { mkdirSync, statSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  let bajados = 0;
  let red = 0;
  for (const b of blobs) {
    const rel = b.pathname.slice(prefijo.length);
    const local = join(destino, ...rel.split("/"));
    if (existsSync(local) && statSync(local).size === b.size) continue;
    mkdirSync(dirname(local), { recursive: true });
    const r = await fetch(b.url);
    if (!r.ok) throw new Error(`${r.status} al bajar ${rel}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length !== b.size)
      throw new Error(`${rel}: ${bytes.length} bytes, se esperaban ${b.size}`);
    writeFileSync(local, bytes);
    bajados++;
    // Lo que cobró Blob: el cuerpo tal como viajó (comprimido, si lo comprimió).
    red += Number(r.headers.get("content-length") ?? bytes.length);
  }
  const total = blobs.reduce((t, b) => t + b.size, 0);
  console.log(
    `Copia de ${h} en ${destino}: ${blobs.length} archivos, ${(total / 2 ** 20).toFixed(1)} MiB. ` +
      `Bajados ahora: ${bajados} (unos ${(red / 2 ** 20).toFixed(1)} MiB de transferencia de Blob).`,
  );
  await new Promise((ok) => setTimeout(ok, 300));
  process.exit(0);
}

if (process.argv.includes("--inventario")) {
  await inventario();
  // Una pausa corta: en Windows, salir con la conexión del fetch cerrándose aborta Node.
  await new Promise((ok) => setTimeout(ok, 300));
  process.exit(0);
}

/**
 * Solo lee (René, 2026-11-15): qué hay en el Blob, por carpeta y por build, con su tamaño, y qué usa
 * producción (el manifiesto del sitio publicado, el de `origin/main` y `apps/web/recursos.json`).
 * No sube ni borra nada. Escribe `eval/results/blob_inventario.json` (rutas y tamaños, sin URLs).
 *
 *   node tools/unity/publicar-web.mjs --inventario
 */
async function inventario() {
  const grupos = new Map();
  let cursor;
  let llamadas = 0;
  do {
    const r = await list({ token, cursor, limit: 1000 });
    llamadas++;
    for (const b of r.blobs) {
      const partes = b.pathname.split("/");
      // recursos/visor-unity/<huella>, recursos/<carpeta>/<huella> o la primera carpeta.
      // recursos/modelos/vehiculos/<huella>: un nivel más.
      const niveles = partes[0] === "recursos" && partes[1] === "modelos" ? 4 : 3;
      const clave =
        partes[0] === "recursos" && partes.length > niveles
          ? partes.slice(0, niveles).join("/")
          : partes.slice(0, Math.min(2, partes.length - 1)).join("/") || b.pathname;
      const g = grupos.get(clave) ?? { archivos: 0, bytes: 0, subido: "" };
      g.archivos++;
      g.bytes += b.size;
      const fecha = new Date(b.uploadedAt).toISOString().slice(0, 10);
      if (fecha > g.subido) g.subido = fecha;
      grupos.set(clave, g);
    }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);

  let sitio = null;
  try {
    const r = await fetch("https://croquis-sage.vercel.app/visor-unity/manifest.json");
    sitio = (await r.json()).huella ?? null;
  } catch {
    // Sin red al sitio: se queda la del repositorio.
  }
  const enMain = huellaDeProduccion();
  const recursos = JSON.parse(readFileSync(join(RAIZ, "apps/web/recursos.json"), "utf8")).carpetas;
  const usa = new Map();
  if (sitio) usa.set(`recursos/visor-unity/${sitio}`, "visor que sirve croquis-sage.vercel.app");
  if (enMain && enMain !== sitio)
    usa.set(`recursos/visor-unity/${enMain}`, "visor del manifiesto de origin/main");
  for (const [carpeta, h] of Object.entries(recursos))
    usa.set(`recursos/${carpeta}/${h}`, `apps/web/recursos.json (${carpeta})`);

  const filas = [...grupos.entries()]
    .map(([clave, g]) => ({
      clave,
      ...g,
      mb: Math.round((g.bytes / 1048576) * 10) / 10,
      usa: usa.get(clave) ?? null,
    }))
    .sort((a, b) => b.bytes - a.bytes);
  const total = filas.reduce((a, f) => a + f.bytes, 0);
  for (const f of filas)
    console.log(
      `${String(f.mb).padStart(7)} MB  ${String(f.archivos).padStart(4)}  ${f.subido}  ${f.clave}${f.usa ? `  ← ${f.usa}` : ""}`,
    );
  console.log(`${(total / 1048576).toFixed(1)} MB en total; ${llamadas} llamada(s) de listado.`);
  writeFileSync(
    join(RAIZ, "eval/results/blob_inventario.json"),
    `${JSON.stringify(
      {
        descripcion:
          "Lo que hay en el Vercel Blob de Croquis, por carpeta y por build, con su tamaño (MiB) y qué usa producción. Solo lectura: no se subió ni se borró nada.",
        script: "tools/unity/publicar-web.mjs --inventario",
        fecha: new Date().toISOString(),
        visor_en_produccion: sitio,
        visor_en_origin_main: enMain,
        total_mb: Math.round((total / 1048576) * 10) / 10,
        grupos: filas.map(({ clave, archivos, mb, subido, usa: u }) => ({
          clave,
          archivos,
          mb,
          subido,
          usa: u,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

// El build que se sube: el local o el del release que se pide con `--release <huella>`.
const iRelease = process.argv.indexOf("--release");
const BUILD = iRelease > 0 ? await bajarRelease(process.argv[iRelease + 1] ?? "") : BUILD_LOCAL;
const huella = huellaCarpeta(BUILD);
if (iRelease > 0 && huella !== process.argv[iRelease + 1]) {
  console.error(
    `El release dice ${process.argv[iRelease + 1]} y su contenido tiene la huella ${huella}: no se sube.`,
  );
  process.exit(1);
}
const prefijo = `recursos/visor-unity/${huella}/`;
const enBuild = readdirSync(join(BUILD, "Build"));
const de = (sufijo) => {
  const f = enBuild.find((x) => x.endsWith(sufijo));
  if (!f) throw new Error(`El build no trae ningún *${sufijo}`);
  return f;
};

const casosD1 = existsSync(CASOS_D1)
  ? readdirSync(CASOS_D1)
      .filter((f) => f.endsWith(".json"))
      .sort()
  : [];
if (casosD1.length < 10) {
  console.error(
    "Faltan las escenas de D1: pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-d1.ts",
  );
  process.exit(1);
}
const subir = [
  ...archivosDe(BUILD).map((rel) => [rel, readFileSync(join(BUILD, rel))]),
  ["axa_alcance.json", readFileSync(CASO)],
  ...casosD1.map((f) => [`casos/${f}`, readFileSync(join(CASOS_D1, f))]),
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
  casos: casosD1.map((f) => f.replace(/\.json$/, "")),
};
writeFileSync(
  join(RAIZ, "apps/web/public/visor-unity/manifest.json"),
  `${JSON.stringify(manifiesto, null, 2)}
`,
);
console.log(`Huella ${huella}`);
console.log(
  "Medición (computadora de demo): https://croquis-sage.vercel.app/visor-unity/medir-e6.html",
);

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

/** Baja el zip del release `visor-web-<huella>` a `.cache/visor-unity/<huella>` (si no está ya). */
async function bajarRelease(h) {
  if (!/^[0-9a-f]{16}$/.test(h)) {
    console.error("Uso: --release <huella de 16 caracteres>");
    process.exit(1);
  }
  const dir = carpetaDeCopia(h);
  if (
    existsSync(join(dir, "Build")) &&
    readdirSync(join(dir, "Build")).some((f) => f.endsWith(".wasm"))
  )
    return dir;
  const url = urlDelRelease(h);
  console.log(`Bajando el release ${url}`);
  const r = await fetch(url);
  if (!r.ok) {
    console.error(`No se pudo bajar el release (${r.status} ${url}).`);
    process.exit(1);
  }
  const archivos = leerZip(Buffer.from(await r.arrayBuffer()));
  // Un zip hecho en la Mac puede traer basura del Finder (René, 2026-11-26): no se sube nada.
  const basura = archivos.filter((a) =>
    /(^|\/)(\.DS_Store|__MACOSX)(\/|$)|(^|\/)\._/.test(a.nombre),
  );
  if (basura.length) {
    console.error(
      `El zip del release trae archivos de la Mac (${basura
        .slice(0, 5)
        .map((a) => a.nombre)
        .join(
          ", ",
        )}${basura.length > 5 ? ", …" : ""}): hay que volver a empaquetarlo sin ellos. No se sube nada.`,
    );
    process.exit(1);
  }
  for (const a of archivos) {
    const destino = join(dir, ...a.nombre.split("/"));
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, a.bytes);
  }
  return dir;
}
