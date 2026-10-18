import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las reglas para agentes viven en CLAUDE.md; no generar AGENTS.md.
  agentRules: false,
  // Los paquetes del monorepo se consumen como fuente TypeScript (sin paso de build).
  transpilePackages: [
    "@croquis/scene-schema",
    "@croquis/solver-ts",
    "@croquis/viewer",
    "@croquis/croquis-2d",
    "@croquis/extraction",
  ],
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
