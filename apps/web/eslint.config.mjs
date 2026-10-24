import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worker del solver empaquetado por scripts/build-worker.mjs (ADR 0030).
    "public/workers/**",
    "public/maplibre/**",
    "public/pdfjs/**",
    // Decodificadores de three (Draco y Basis) y el script de Blender, copiados en cada build (R10, R11).
    "public/decodificadores/**",
    "public/blender/**",
  ]),
]);

export default eslintConfig;
