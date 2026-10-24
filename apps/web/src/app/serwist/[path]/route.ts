/**
 * Genera el service worker (`/serwist/sw.js`) en `next build` con su lista de precarga (ADR 0030).
 * Es estático: Turbopack aún no admite plugins, así que Serwist lo arma en un Route Handler.
 */
import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

/** Revisión del HTML de las páginas: el commit desplegado (cambia en cada despliegue). */
function revision(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel;
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
  return git.status === 0 && git.stdout.trim() ? git.stdout.trim() : "sin-revision";
}

const rev = revision();
/**
 * Páginas que se abren sin red: las de la demo, en los dos idiomas (F11a). `/relato` solo redirige
 * a `/cuenta`, pero sigue precargada para los enlaces viejos.
 */
const DEMO = ["/", "/cuenta", "/visor", "/croquis", "/historia", "/recorrido", "/demo"];
const PAGINAS = [...DEMO, "/relato", ...DEMO.map((u) => (u === "/" ? "/en" : `/en${u}`))];

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "src/sw.ts",
    // esbuild nativo también en Linux (Vercel, CI); si no, Serwist busca esbuild-wasm.
    useNativeEsbuild: true,
    additionalPrecacheEntries: PAGINAS.map((url) => ({ url, revision: rev })),
    globPatterns: [
      ".next/static/**/*.{js,css,woff2,ico,png,svg,webp,json}",
      "public/**/*.{glb,json,webp,png,jpg,svg,ico,js,woff2,webmanifest}",
    ],
    // Los vehículos de Sketchfab (R10, ~18 MB en tres versiones), sus decodificadores y el script
    // de Blender se piden solo cuando hacen falta: sin red, el visor usa los paramétricos.
    globIgnores: [
      "**/node_modules/**/*",
      "public/modelos/vehiculos/**",
      "public/decodificadores/**",
      "public/blender/**",
    ],
    // Rapier trae su WASM dentro de un trozo de JavaScript de más de 4 MB; el límite por omisión
    // (2 MiB) lo dejaría fuera y el horneado no funcionaría sin red.
    maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  },
);
