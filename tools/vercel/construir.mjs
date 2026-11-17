#!/usr/bin/env node
/**
 * El «Ignored Build Step» de Croquis (René, 2026-11-17): Vercel solo construye y guarda un
 * despliegue cuando cambió algo que va al sitio. Un cambio de documentos, evaluaciones, pruebas,
 * herramientas, el visor de Unity, el solver de Python o el tráiler no despliega.
 *
 * Lo corre Vercel antes de cada build (`ignoreCommand` de `apps/web/vercel.json`, desde `apps/web`, la
 * carpeta raíz del proyecto en Vercel; las rutas de git siempre son relativas a la raíz del repo). Según
 * su documentación: si sale con 0, el build se cancela (queda «Canceled», sin salida guardada); si
 * sale con 1, se construye como siempre.
 *
 * Compara contra `VERCEL_GIT_PREVIOUS_SHA` (el último despliegue que salió bien en esa rama). Ante
 * cualquier duda construye: sin despliegue anterior, si no encuentra ese commit en la copia, o si
 * git falla. Lo de `preview` siempre se construye.
 *
 *   node tools/vercel/construir.mjs                       (lo corre Vercel)
 *   node tools/vercel/construir.mjs --desde <sha> [--hasta <sha>]   (prueba a mano: dice qué haría)
 *
 * También lo usa `.github/workflows/produccion.yml`, para no esperar un despliegue que no va a llegar.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Lo que nunca llega al sitio. Todo lo demás despliega: ante una ruta nueva o desconocida, se
 * construye (es más barato un despliegue de más que un sitio desactualizado).
 *
 * Lo que el sitio sí lee fuera de `apps/web` y `packages` (y por eso no está aquí): `data/`,
 * `assets/brand/`, `tools/blender/croquis_render.py` y los resultados de `eval/results/` que nombra su
 * código (`resultadosQueLeeElSitio`); los demás resultados no despliegan.
 */
export const NUNCA_AL_SITIO = [
  /^docs\//,
  /^eval\/(?!results\/)/,
  /^demo\//,
  /^apps\/web\/e2e\//,
  /^apps\/web\/playwright[^/]*\.config\.ts$/,
  /^apps\/visor-unity\//,
  /^apps\/trailer\//,
  /^tools\/(?!blender\/|vercel\/construir\.mjs$)/,
  /^solver\//,
  /^extraction\//,
  /^resultados\//,
  /^\.github\//,
  /^\.githooks\//,
  /^trailer-salida\//,
  /(^|\/)[^/]+\.test\.[cm]?[jt]sx?$/,
  /(^|\/)[^/]+\.spec\.[cm]?[jt]sx?$/,
  /(^|\/)vitest[^/]*\.config\.[cm]?[jt]s$/,
  /\.md$/,
  /\.py$/,
  /^(pyproject\.toml|uv\.lock|\.python-version)$/,
  /^(\.gitignore|\.gitattributes|\.prettierignore|\.prettierrc[^/]*|eslint\.config\.[cm]?js)$/,
  /^(LICENSE|[A-Z-]+\.bat)$/,
];

/**
 * Lo de `tools/` que sí va al sitio: el script de Blender (se copia a `public/blender/`) y el que
 * prepara el visor de Unity desde el propio sitio (lo usa el build con el plan B).
 */
const EXCEPCIONES_AL_SITIO = [
  /^tools\/blender\/croquis_render\.py$/,
  /^tools\/unity\/visor-local\.mjs$/,
];

/**
 * Los archivos de `eval/results/` que nombra el código del sitio (la web, sus scripts y los paquetes),
 * como expresiones: `osm_instancias*.json` vale para todos los que empiezan así. Si no se puede leer
 * el código, `null`: entonces cualquier resultado despliega.
 */
export function resultadosQueLeeElSitio(raiz = RAIZ) {
  try {
    const textos = [];
    const recorre = (d) => {
      if (!existsSync(d)) return;
      for (const n of readdirSync(d)) {
        if (n === "node_modules" || n.startsWith(".")) continue;
        const ruta = join(d, n);
        if (statSync(ruta).isDirectory()) recorre(ruta);
        else if (/\.(tsx?|[cm]?js)$/.test(n) && !/\.test\./.test(n))
          textos.push(readFileSync(ruta, "utf8"));
      }
    };
    recorre(join(raiz, "apps/web/src"));
    recorre(join(raiz, "apps/web/scripts"));
    for (const pk of readdirSync(join(raiz, "packages")))
      recorre(join(raiz, "packages", pk, "src"));
    textos.push(readFileSync(join(raiz, "apps/web/next.config.ts"), "utf8"));
    const patrones = new Set();
    for (const t of textos)
      for (const m of t.matchAll(/eval\/results\/([A-Za-z0-9_.*/-]+)/g))
        patrones.add(m[1].replace(/[.)]+$/, ""));
    return [...patrones].map(
      (pt) =>
        new RegExp(
          `^eval/results/${pt.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*")}`,
        ),
    );
  } catch {
    return null;
  }
}

let leidos;

/** Si un cambio en esa ruta puede cambiar lo que sirve el sitio. */
export function vaAlSitio(ruta, resultados = (leidos ??= resultadosQueLeeElSitio())) {
  const r = ruta.replaceAll("\\", "/").replace(/^\.\//, "");
  if (EXCEPCIONES_AL_SITIO.some((e) => e.test(r))) return true;
  if (r.startsWith("eval/results/"))
    return resultados === null || resultados.some((e) => e.test(r));
  return !NUNCA_AL_SITIO.some((e) => e.test(r));
}

/** De la lista de archivos cambiados, si hay que desplegar y por cuáles. */
export function decidir(cambiados) {
  const alSitio = cambiados.filter((r) => vaAlSitio(r));
  return { construir: alSitio.length > 0, alSitio };
}

const git = (args) =>
  execFileSync("git", args, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const existe = (sha) => {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
};

/** Los archivos que cambiaron entre dos commits, o `null` si no se puede saber. */
export function cambiosEntre(desde, hasta) {
  if (!existe(desde)) {
    // Vercel clona con poca historia: se pide ese commit (el repositorio es público).
    try {
      git(["fetch", "--quiet", "--depth=200", "origin", desde]);
    } catch {
      return null;
    }
    if (!existe(desde)) return null;
  }
  try {
    return git(["diff", "--name-only", desde, hasta]).split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

function principal() {
  const arg = (n) => {
    const i = process.argv.indexOf(`--${n}`);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const aMano = arg("desde") !== undefined;
  const desde = arg("desde") ?? process.env.VERCEL_GIT_PREVIOUS_SHA ?? "";
  const hasta = arg("hasta") ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "HEAD";
  const CONSTRUIR = 1;
  const CANCELAR = 0;
  const sale = (codigo, motivo) => {
    process.stdout.write(
      `${codigo === CONSTRUIR ? "Se construye" : "No se construye"}: ${motivo}\n`,
    );
    process.exit(codigo);
  };

  if (!aMano && process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")
    sale(CONSTRUIR, `entorno ${process.env.VERCEL_ENV}.`);
  if (!desde) sale(CONSTRUIR, "no hay despliegue anterior con qué comparar.");
  const cambiados = cambiosEntre(desde, hasta);
  if (cambiados === null)
    sale(CONSTRUIR, `no se pudo comparar con ${desde.slice(0, 8)} (ante la duda, se despliega).`);
  const { construir, alSitio } = decidir(cambiados);
  if (construir)
    sale(
      CONSTRUIR,
      `${alSitio.length} de ${cambiados.length} archivos van al sitio (${alSitio.slice(0, 8).join(", ")}${alSitio.length > 8 ? ", …" : ""}).`,
    );
  sale(
    CANCELAR,
    `ninguno de los ${cambiados.length} archivos que cambiaron desde ${desde.slice(0, 8)} va al sitio.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
