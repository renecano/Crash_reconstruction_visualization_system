/**
 * Recursos pesados fuera de cada despliegue (ADR 0107): los modelos de vehículos y los HDRI del
 * cielo se sirven desde Vercel Blob, en una ruta con la huella de su carpeta, con caché de un año.
 *
 *   node scripts/recursos.mjs subir     sube las carpetas cuya huella no está en el almacén y
 *                                       actualiza `recursos.json` (pide RECURSOS_READ_WRITE_TOKEN)
 *   node scripts/recursos.mjs estado    versiones guardadas en el almacén y lo que pesan
 *   node scripts/recursos.mjs preparar  paso del build: en Vercel, si la huella local coincide con
 *                                       `recursos.json` y el almacén responde, quita la carpeta de
 *                                       `public/` y le dice al build de dónde servirla
 *
 * Si algo no cuadra (huella distinta o almacén que no responde), `preparar` deja la carpeta en el
 * despliegue: el sitio nunca se queda sin modelos, solo pesa más. En local y en CI no quita nada.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { archivosDe, CARPETAS_REMOTAS, huellaCarpeta, prefijoRemoto } from "./recursos-hash.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(WEB, "public");
const MANIFIESTO = join(WEB, "recursos.json");
/** Lo que `preparar` le deja a `next.config.ts`: carpeta → URL base remota. */
export const MARCA = join(WEB, ".recursos-remotos.json");
const UN_ANO_S = 365 * 24 * 3600;

const TIPOS = {
  glb: "model/gltf-binary",
  json: "application/json",
  hdr: "image/vnd.radiance",
  ktx2: "image/ktx2",
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
};
const tipoDe = (rel) => TIPOS[rel.split(".").pop().toLowerCase()] ?? "application/octet-stream";

const leerManifiesto = () =>
  existsSync(MANIFIESTO)
    ? JSON.parse(readFileSync(MANIFIESTO, "utf-8"))
    : { base: "", carpetas: {} };

function token() {
  const t = process.env.RECURSOS_READ_WRITE_TOKEN;
  if (!t) throw new Error("Falta RECURSOS_READ_WRITE_TOKEN (token de escritura del almacén).");
  return t;
}

async function subir() {
  const { list, put } = await import("@vercel/blob");
  const t = token();
  const m = leerManifiesto();
  for (const carpeta of CARPETAS_REMOTAS) {
    const dir = join(PUBLIC, carpeta);
    const huella = huellaCarpeta(dir);
    const prefijo = prefijoRemoto(carpeta, huella);
    const hay = new Set();
    let cursor;
    do {
      const r = await list({ prefix: prefijo, token: t, cursor, limit: 1000 });
      for (const b of r.blobs) hay.add(b.pathname);
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    let subidos = 0;
    for (const rel of archivosDe(dir)) {
      const pathname = prefijo + rel;
      if (hay.has(pathname)) continue;
      const r = await put(pathname, readFileSync(join(dir, rel)), {
        access: "public",
        token: t,
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: UN_ANO_S,
        contentType: tipoDe(rel),
      });
      m.base = new URL(r.url).origin;
      subidos += 1;
    }
    m.carpetas[carpeta] = huella;
    console.log(`${carpeta}: huella ${huella}, ${subidos} subidos, ${hay.size} ya estaban`);
  }
  if (!m.base)
    throw new Error("No se supo la URL del almacén: no se subió nada y el manifiesto no la trae.");
  writeFileSync(MANIFIESTO, `${JSON.stringify(m, null, 2)}\n`);
}

async function estado() {
  const { list } = await import("@vercel/blob");
  const t = token();
  const versiones = new Map();
  let cursor;
  do {
    const r = await list({ prefix: "recursos/", token: t, cursor, limit: 1000 });
    for (const b of r.blobs) {
      const v = b.pathname.split("/").slice(0, -1).join("/");
      const x = versiones.get(v) ?? { archivos: 0, bytes: 0 };
      x.archivos += 1;
      x.bytes += b.size;
      versiones.set(v, x);
    }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  const total = [...versiones.values()].reduce((s, x) => s + x.bytes, 0);
  console.log(
    JSON.stringify({ versiones: Object.fromEntries(versiones), bytes_total: total }, null, 2),
  );
}

async function preparar() {
  rmSync(MARCA, { force: true });
  const enVercel = process.env.VERCEL === "1";
  if (!enVercel && process.env.CROQUIS_RECURSOS !== "remotos") return;
  const m = leerManifiesto();
  const remotas = {};
  for (const carpeta of CARPETAS_REMOTAS) {
    const dir = join(PUBLIC, carpeta);
    const esperada = m.carpetas?.[carpeta];
    const local = existsSync(dir) ? huellaCarpeta(dir) : null;
    if (!m.base || !esperada || local !== esperada) {
      console.warn(
        `recursos: ${carpeta} se queda en el despliegue (huella local ${local}, en recursos.json ${esperada}). ` +
          "Corre `node scripts/recursos.mjs subir`.",
      );
      continue;
    }
    const url = `${m.base}/${prefijoRemoto(carpeta, esperada)}`;
    // El almacén debe responder con CORS para el índice y para un archivo pesado.
    const archivos = archivosDe(dir);
    const prueba = [
      archivos.find((a) => a.endsWith(".json")),
      archivos.find((a) => !a.endsWith(".json")),
    ];
    let bien = true;
    for (const rel of prueba.filter(Boolean)) {
      const r = await fetch(url + rel, {
        method: "HEAD",
        headers: { Origin: "https://croquis-sage.vercel.app" },
      }).catch(() => null);
      if (!r?.ok || !r.headers.get("access-control-allow-origin")) {
        console.warn(
          `recursos: ${url + rel} no responde bien (${r?.status ?? "sin red"}); ${carpeta} se queda.`,
        );
        bien = false;
        break;
      }
    }
    if (!bien) continue;
    remotas[carpeta] = url;
    if (enVercel) rmSync(dir, { recursive: true, force: true });
    console.log(`recursos: ${carpeta} desde ${url}${enVercel ? " (fuera del despliegue)" : ""}`);
  }
  writeFileSync(MARCA, `${JSON.stringify(remotas, null, 2)}\n`);
}

const orden = process.argv[2];
const accion = { subir, estado, preparar }[orden];
if (!accion) {
  console.error("Uso: node scripts/recursos.mjs subir | estado | preparar");
  process.exit(2);
}
await accion();
