/**
 * Ninguna prueba, medición ni ensayo baja nada de Vercel Blob (René, 2026-11-17: Blob Data Transfer
 * llegó a 8.8 de 10 GB). Cada contexto del navegador sirve lo que pediría a Blob desde esta máquina:
 *
 * - el build de Unity, de la copia en `.cache/visor-unity/<huella>/`
 *   (`node tools/unity/visor-local.mjs copia`, que la baja del release de GitHub, no de Blob);
 * - los modelos de los vehículos y los HDRI, de `apps/web/public/` (son los mismos archivos: su huella
 *   es la de `recursos.json`).
 *
 * Lo que no tenga copia local se corta y la prueba falla diciendo qué pidió. Solo
 * `CROQUIS_PERMITIR_BLOB=1` deja pasar a Blob (lo usa `blob-transferencia.spec.ts`, que mide justo
 * eso y se corre a mano).
 *
 * Todas las pruebas lo usan por `e2e/base.ts`; las que abren su propio perfil persistente lo llaman
 * con su contexto.
 */
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { BrowserContext } from "@playwright/test";

const RAIZ = resolve(__dirname, "../../..");
const WEB = join(RAIZ, "apps/web");
const RECURSOS = JSON.parse(readFileSync(join(WEB, "recursos.json"), "utf8")) as {
  base: string;
  carpetas: Record<string, string>;
};

const TIPOS: Record<string, string> = {
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".hdr": "image/vnd.radiance",
  ".ktx2": "image/ktx2",
  ".html": "text/html; charset=utf-8",
};

/** De una dirección de Blob, el archivo local que la sustituye, o `null` si no hay. */
export function archivoLocalDe(url: string): string | null {
  const u = new URL(url);
  if (`${u.protocol}//${u.host}` !== RECURSOS.base) return null;
  const partes = decodeURIComponent(u.pathname).split("/").filter(Boolean);
  if (partes[0] !== "recursos") return null;
  const local = (base: string, resto: string[]) => {
    const f = resolve(base, ...resto);
    return f.startsWith(base) && existsSync(f) ? f : null;
  };
  if (partes[1] === "visor-unity" && partes[2])
    return local(join(RAIZ, ".cache", "visor-unity", partes[2]), partes.slice(3));
  if (
    partes[1] === "modelos" &&
    partes[2] === "vehiculos" &&
    partes[3] === RECURSOS.carpetas["modelos/vehiculos"]
  )
    return local(join(WEB, "public/modelos/vehiculos"), partes.slice(4));
  if (partes[1] === "hdri" && partes[2] === RECURSOS.carpetas.hdri)
    return local(join(WEB, "public/hdri"), partes.slice(3));
  return null;
}

/** Lo que el contexto quiso bajar de Blob y no tenía copia local (para el mensaje de error). */
const cortadas = new WeakMap<BrowserContext, string[]>();
export const pedidasABlob = (ctx: BrowserContext) => cortadas.get(ctx) ?? [];

/** Sirve desde esta máquina todo lo que el contexto pida a Blob. */
export async function sinBlob(ctx: BrowserContext): Promise<void> {
  if (process.env.CROQUIS_PERMITIR_BLOB === "1") return;
  cortadas.set(ctx, []);
  await ctx.route(`${RECURSOS.base}/**`, async (ruta) => {
    const url = ruta.request().url();
    const archivo = archivoLocalDe(url);
    if (!archivo) {
      cortadas.get(ctx)!.push(url);
      process.stderr.write(
        `\n[sin-blob] Se cortó una petición a Vercel Blob sin copia local: ${url}\n` +
          "  Para el build de Unity: node tools/unity/visor-local.mjs copia\n",
      );
      await ruta.abort("blockedbyclient");
      return;
    }
    await ruta.fulfill({
      status: 200,
      body: readFileSync(archivo),
      headers: {
        "Content-Type": TIPOS[extname(archivo).toLowerCase()] ?? "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  });
}
