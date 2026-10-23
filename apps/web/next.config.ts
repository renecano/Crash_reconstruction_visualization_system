import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ],
  },
  // /cesvi como una sola aplicación (ADR 0079): las rutas viejas llevan a su caso en el recorrido.
  async redirects() {
    return [
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
