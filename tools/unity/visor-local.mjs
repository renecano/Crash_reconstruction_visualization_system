#!/usr/bin/env node
/**
 * El visor Unity y los modelos desde la propia máquina, sin Vercel Blob (René, 2026-11-17). Lo usan
 * la demo local (`CORRER-DEMO-LOCAL.bat`), las pruebas y mediciones (`apps/web/e2e/sin-blob.ts`), el
 * paquete de la RTX y el plan B de producción.
 *
 * De dónde sale el build: de la copia en `.cache/visor-unity/<huella>/` (la del manifiesto del sitio,
 * `apps/web/public/visor-unity/manifest.json`). Si no está, del release de GitHub `visor-web-<huella>`
 * (público, sin llaves). Nunca de Blob: la única forma de bajarlo de ahí es a mano y una vez,
 * `node tools/unity/publicar-web.mjs --bajar <huella>`.
 *
 *   node tools/unity/visor-local.mjs copia                 asegura la copia en .cache (del release)
 *   node tools/unity/visor-local.mjs preparar [--modelos /modelos/vehiculos/]
 *        copia el build a apps/web/public/visor-unity/local/<huella>/ y escribe su manifiesto, con
 *        `base` = el sitio y los modelos del sitio (lo que lee la app con CROQUIS_VISOR=local)
 *   node tools/unity/visor-local.mjs empaquetar            el zip para el release (.cache/visor-web-<huella>.zip)
 *   node tools/unity/visor-local.mjs escritorio <carpeta VisorCroquis_Data> [--modelos <url>]
 *        cambia en un visor de escritorio ya compilado la dirección de los modelos (mismo largo, en
 *        `resources.assets`), para que los pida a `servir-modelos` y no a Blob
 *   node tools/unity/visor-local.mjs servir-modelos [--puerto 47823]
 *        sirve apps/web/public/modelos/vehiculos en http://127.0.0.1:<puerto>/modelos/vehiculos/
 *   node tools/unity/visor-local.mjs plan-b activar | desactivar
 *        el plan B de producción: cambia solo el manifiesto del sitio para que el build y los modelos
 *        vayan dentro del despliegue (activar) o salgan de Blob como siempre (desactivar). Después,
 *        commit y merge a main: el siguiente despliegue ya lo usa (`apps/web/scripts/recursos.mjs`).
 */
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = join(RAIZ, "apps/web");
const MANIFIESTO = join(WEB, "public/visor-unity/manifest.json");
const RECURSOS = JSON.parse(readFileSync(join(WEB, "recursos.json"), "utf8"));
/** La carpeta de los modelos en Blob, tal como la trae escrita el build de Unity. */
export const MODELOS_EN_BLOB = `${RECURSOS.base}/recursos/modelos/vehiculos/${RECURSOS.carpetas["modelos/vehiculos"]}/`;
export const PUERTO_MODELOS = 47823;
const REPO = "renecano/Crash_reconstruction_visualization_system";

export const manifiestoDelSitio = () => JSON.parse(readFileSync(MANIFIESTO, "utf8"));
export const carpetaDeCopia = (huella) => join(RAIZ, ".cache", "visor-unity", huella);
export const urlDelRelease = (huella) =>
  `https://github.com/${REPO}/releases/download/visor-web-${huella}/visor-web-${huella}.zip`;

/** Si la copia trae lo que pide el manifiesto. */
export function copiaCompleta(m, dir = carpetaDeCopia(m.huella)) {
  return [m.loader, m.data, m.framework, m.code].every((a) => existsSync(join(dir, "Build", a)));
}

/** Los archivos de un zip (lo escribe `empaquetar` o Compress-Archive), sin dependencias. */
export function leerZip(zip) {
  const fin = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fin < 0) throw new Error("No es un zip.");
  const archivos = [];
  let p = zip.readUInt32LE(fin + 16);
  for (let k = zip.readUInt16LE(fin + 10); k > 0; k--) {
    const metodo = zip.readUInt16LE(p + 10);
    const comprimido = zip.readUInt32LE(p + 20);
    const largoNombre = zip.readUInt16LE(p + 28);
    const largoExtra = zip.readUInt16LE(p + 30);
    const largoComentario = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nombre = zip
      .subarray(p + 46, p + 46 + largoNombre)
      .toString("utf8")
      .replaceAll("\\", "/");
    const datos = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    if (!nombre.endsWith("/")) {
      const cuerpo = zip.subarray(datos, datos + comprimido);
      archivos.push({ nombre, bytes: metodo === 0 ? cuerpo : inflateRawSync(cuerpo) });
    }
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return archivos;
}

/** La copia del build en .cache: si falta, del release de GitHub. Nunca de Blob. */
export async function asegurarCopia(m = manifiestoDelSitio()) {
  const dir = carpetaDeCopia(m.huella);
  if (copiaCompleta(m, dir)) return dir;
  const url = urlDelRelease(m.huella);
  process.stdout.write(`Bajando el build ${m.huella} del release de GitHub (no de Blob)...\n`);
  const r = await fetch(url);
  if (!r.ok)
    throw new Error(
      `No hay copia del build ${m.huella} en .cache ni en el release (${r.status} ${url}). ` +
        "Quien tenga el token de Blob: `node tools/unity/publicar-web.mjs --bajar " +
        `${m.huella}\` y \`node tools/unity/visor-local.mjs empaquetar\`, y subir el zip al release.`,
    );
  for (const a of leerZip(Buffer.from(await r.arrayBuffer()))) {
    const destino = join(dir, ...a.nombre.split("/"));
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, a.bytes);
  }
  if (!copiaCompleta(m, dir))
    throw new Error(`El zip del release no trae el build completo de ${m.huella}.`);
  return dir;
}

function copiarCarpeta(desde, hasta) {
  mkdirSync(hasta, { recursive: true });
  for (const n of readdirSync(desde)) {
    const a = join(desde, n);
    const b = join(hasta, n);
    if (statSync(a).isDirectory()) copiarCarpeta(a, b);
    else copyFileSync(a, b);
  }
}

/**
 * El build en `apps/web/public/visor-unity/local/<huella>/` y su manifiesto: la app lo lee con
 * `CROQUIS_VISOR=local` al compilar (o en producción, con el plan B).
 */
export async function preparar({ modelos = "/modelos/vehiculos/" } = {}) {
  const m = manifiestoDelSitio();
  const copia = await asegurarCopia(m);
  const local = join(WEB, "public/visor-unity/local");
  rmSync(local, { recursive: true, force: true });
  copiarCarpeta(copia, join(local, m.huella));
  const manifiesto = {
    ...m,
    base: "/",
    prefijo: `visor-unity/local/${m.huella}/`,
    modelos,
    modelosEnBlob: MODELOS_EN_BLOB,
  };
  writeFileSync(join(local, "manifest.json"), `${JSON.stringify(manifiesto, null, 2)}\n`);
  return { huella: m.huella, carpeta: local };
}

/** El zip de la copia, para el release `visor-web-<huella>` (lo usan la RTX y la demo local). */
export function empaquetar() {
  const m = manifiestoDelSitio();
  const dir = carpetaDeCopia(m.huella);
  if (!copiaCompleta(m, dir)) throw new Error(`No hay copia completa de ${m.huella} en .cache.`);
  const zip = join(RAIZ, ".cache", `visor-web-${m.huella}.zip`);
  rmSync(zip, { force: true });
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${join(dir, "*")}' -DestinationPath '${zip}' -CompressionLevel Optimal`,
    ],
    { stdio: "inherit" },
  );
  return zip;
}

/**
 * En un visor de escritorio ya compilado, la dirección de los modelos (`recursos_visor.json`, en
 * `resources.assets`) pasa a `modelos`. Se cambia el texto con el mismo largo (con espacios al final,
 * que el JSON admite): el archivo no cambia de tamaño ni de estructura. Si ya estaba cambiado, no hace
 * nada.
 */
export function cambiarModelosEnEscritorio(
  carpetaData,
  modelos = `http://127.0.0.1:${PUERTO_MODELOS}/modelos/vehiculos/`,
) {
  const archivo = join(carpetaData, "resources.assets");
  const b = readFileSync(archivo);
  const viejo = Buffer.from(`{\r\n  "vehiculos": "${MODELOS_EN_BLOB}"\r\n}`, "utf8");
  const sinRelleno = `{\r\n  "vehiculos": "${modelos}"`;
  const relleno = viejo.length - Buffer.byteLength(sinRelleno) - 3;
  if (relleno < 0) throw new Error("La dirección nueva es más larga que la de Blob.");
  const nuevo = Buffer.from(`${sinRelleno}${" ".repeat(relleno)}\r\n}`, "utf8");
  if (b.indexOf(nuevo) >= 0) return "ya estaba";
  const i = b.indexOf(viejo);
  if (i < 0 || b.indexOf(viejo, i + 1) >= 0)
    throw new Error("No encontré una sola vez la dirección de los modelos en resources.assets.");
  if (b.readUInt32LE(i - 4) !== viejo.length)
    throw new Error("El texto no tiene el largo esperado.");
  nuevo.copy(b, i);
  writeFileSync(archivo, b);
  return "cambiada";
}

const TIPOS = { ".json": "application/json", ".glb": "model/gltf-binary", ".ktx2": "image/ktx2" };

/** Sirve los modelos de `apps/web/public/modelos/vehiculos` en http://127.0.0.1:<puerto>/modelos/vehiculos/. */
export function servirModelos(puerto = PUERTO_MODELOS) {
  const raiz = join(WEB, "public/modelos/vehiculos");
  const servidor = createServer((req, res) => {
    const ruta = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const rel = ruta.replace(/^\/modelos\/vehiculos\//, "");
    const archivo = resolve(raiz, rel);
    if (
      !ruta.startsWith("/modelos/vehiculos/") ||
      relative(raiz, archivo).startsWith("..") ||
      !existsSync(archivo)
    ) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": TIPOS[extname(archivo)] ?? "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(readFileSync(archivo));
  });
  return new Promise((ok) => servidor.listen(puerto, "127.0.0.1", () => ok(servidor)));
}

/**
 * El plan B en el manifiesto del sitio: `activar` lo apunta al propio despliegue (con los modelos del
 * sitio); `desactivar` lo regresa a Blob. Solo toca ese archivo.
 */
export function planB(accion) {
  const m = manifiestoDelSitio();
  const blob = { base: `${RECURSOS.base}/`, prefijo: `recursos/visor-unity/${m.huella}/` };
  let nuevo;
  if (accion === "activar")
    nuevo = {
      ...m,
      base: "/",
      prefijo: `visor-unity/local/${m.huella}/`,
      modelos: "/modelos/vehiculos/",
      modelosEnBlob: MODELOS_EN_BLOB,
    };
  else if (accion === "desactivar") {
    const { modelos: _m, modelosEnBlob: _b, ...resto } = m;
    void _m;
    void _b;
    nuevo = { ...resto, ...blob };
  } else throw new Error("Uso: plan-b activar | desactivar");
  writeFileSync(MANIFIESTO, `${JSON.stringify(nuevo, null, 2)}\n`);
  return nuevo;
}

async function principal() {
  const orden = process.argv[2];
  const opcion = (n, d) => {
    const i = process.argv.indexOf(`--${n}`);
    return i > 0 ? process.argv[i + 1] : d;
  };
  if (orden === "copia") {
    process.stdout.write(`Copia lista en ${await asegurarCopia()}\n`);
  } else if (orden === "preparar") {
    const r = await preparar({ modelos: opcion("modelos", "/modelos/vehiculos/") });
    process.stdout.write(`Visor ${r.huella} servido desde el sitio: ${r.carpeta}\n`);
  } else if (orden === "empaquetar") {
    process.stdout.write(`${empaquetar()}\n`);
  } else if (orden === "escritorio") {
    const carpeta = process.argv[3];
    if (!carpeta || !existsSync(join(carpeta, "resources.assets")))
      throw new Error("Uso: escritorio <carpeta VisorCroquis_Data>");
    const r = cambiarModelosEnEscritorio(carpeta, opcion("modelos", undefined));
    process.stdout.write(`Modelos del visor de escritorio, desde la máquina: ${r}.\n`);
  } else if (orden === "plan-b") {
    const m = planB(process.argv[3]);
    process.stdout.write(
      m.base === "/"
        ? "Plan B activo en el manifiesto: commit y merge a main para desplegarlo.\n"
        : "Plan B desactivado: el visor y los modelos vuelven a salir de Blob.\n",
    );
  } else if (orden === "servir-modelos") {
    const puerto = Number(opcion("puerto", PUERTO_MODELOS));
    await servirModelos(puerto);
    process.stdout.write(
      `Modelos en http://127.0.0.1:${puerto}/modelos/vehiculos/ (Ctrl+C para parar)\n`,
    );
  } else {
    process.stdout.write(
      "Uso: node tools/unity/visor-local.mjs copia | preparar | empaquetar | escritorio <carpeta> | servir-modelos\n",
    );
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  principal().catch((e) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  });
