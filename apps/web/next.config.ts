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
