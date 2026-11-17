import { existsSync, readFileSync } from "node:fs";
import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

/**
 * De dónde salen los modelos de vehículos y los HDRI (ADR 0107): `scripts/recursos.mjs preparar`
 * deja aquí las URL de Vercel Blob cuando quitó esas carpetas del despliegue. Sin el archivo (local,
 * CI), se sirven de `public/` como siempre.
 */
const remotos: Record<string, string> = existsSync(".recursos-remotos.json")
  ? (JSON.parse(readFileSync(".recursos-remotos.json", "utf-8")) as Record<string, string>)
  : {};

/**
 * Lo que la app carga hoy: lo propio; el visor de Unity y los modelos, de Vercel Blob (con WebAssembly
 * y workers desde blob:); los mosaicos y las consultas del mapa, por https; y las imágenes y fuentes
 * que arma en memoria (data: y blob:).
 */
const POLITICA_DE_CONTENIDO = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://*.public.blob.vercel-storage.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: blob: data:",
  "worker-src 'self' blob:",
  "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  env: {
    CROQUIS_RECURSOS_VEHICULOS: remotos["modelos/vehiculos"] ?? "",
    CROQUIS_RECURSOS_HDRI: remotos.hdri ?? "",
  },
  // Las reglas para agentes viven en CLAUDE.md; no generar AGENTS.md.
  agentRules: false,
  // Los paquetes del monorepo se consumen como fuente TypeScript (sin paso de build).
  transpilePackages: [
    "@croquis/cesvi",
    "@croquis/scene-schema",
    "@croquis/solver-ts",
    "@croquis/viewer",
    "@croquis/croquis-2d",
    "@croquis/extraction",
  ],
  // Lo que no se sirve no entra a las funciones de Vercel (ADR 0078): datos crudos y del corpus,
  // evaluaciones, grabaciones, fixtures, el video de la demo y el solver de referencia. Lo que la
  // app usa de ahí se importa y queda dentro del código compilado, no como archivo.
  outputFileTracingExcludes: {
    "/**": [
      "../../data/**",
      "../../eval/**",
      "../../demo/**",
      "../../docs/**",
      "../../solver/**",
      "../../extraction/**",
      "../../packages/*/fixtures/**",
      "../../packages/*/grabaciones/**",
      "../../packages/scene-schema/fixtures/**",
      "../../**/*.test.*",
      // La copia local del build de Unity (demo local, plan B) se sirve como estático, no desde funciones.
      "./public/visor-unity/local/**",
    ],
  },
  // Encabezados de seguridad (auditoría del 2026-11-15, I6). La política de contenido va en modo de
  // solo reporte: el navegador avisa en la consola lo que la violaría y no bloquea nada. Se vuelve
  // obligatoria cuando el recorrido completo (mapa, 3D de Unity, PDF) pase sin avisos.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy-Report-Only", value: POLITICA_DE_CONTENIDO },
        ],
      },
    ];
  },
  // Demo local (René, 2026-11-17): con `CROQUIS_VISOR=local` al compilar, el visor Unity y los modelos
  // salen de la propia máquina (`tools/unity/visor-local.mjs preparar`), sin Vercel Blob.
  // Va antes que los archivos de public/: si no, se serviría el manifiesto de siempre.
  async rewrites() {
    return {
      beforeFiles:
        process.env.CROQUIS_VISOR === "local"
          ? [
              {
                source: "/visor-unity/manifest.json",
                destination: "/visor-unity/local/manifest.json",
              },
            ]
          : [],
      afterFiles: [],
      fallback: [],
    };
  },
  // /cesvi como una sola aplicación (ADR 0079): las rutas viejas llevan a su caso en el recorrido.
  async redirects() {
    // Las páginas del producto anterior (el público de octubre de 2026) llevan a la portada
    // (decisión de René del 2026-11-15, auditoría I7). Temporales: su código se conserva.
    const anteriores = ["demo", "relato", "visor", "croquis", "publico", "historia"].flatMap(
      (p) => [
        { source: `/${p}`, destination: "/", permanent: false },
        { source: `/en/${p}`, destination: "/en", permanent: false },
      ],
    );
    return [
      ...anteriores,
      { source: "/cesvi/caso", destination: "/cesvi/casos/nuevo", permanent: false },
      { source: "/cesvi/importar", destination: "/cesvi/casos/importar", permanent: false },
      {
        source: "/cesvi/reproduccion/:id",
        destination: "/cesvi/casos/reporte/:id",
        permanent: false,
      },
    ];
  },
  experimental: {
    // El CSS (unos 8 KB comprimidos) va dentro del HTML: el primer pintado no espera otra ida y
    // vuelta de red (PLAN §11.6, LCP en celular con 4G; ADR 0045).
    inlineCss: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Service worker de la demo sin red (ADR 0030): esbuild queda fuera del empaquetado del servidor.
export default withSerwist(nextConfig);
