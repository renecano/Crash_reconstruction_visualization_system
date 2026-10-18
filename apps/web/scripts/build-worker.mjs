/**
 * Empaqueta el Web Worker del solver (`src/workers/reconstruct.worker.ts`) en
 * `public/workers/reconstruct.js` antes de `next build` y `next dev` (ADR 0030).
 *
 * Turbopack arranca sus workers con un script que lee su configuración de la URL (`#params=…`), y
 * un script servido por el service worker desde la caché pierde esa parte: sin red el worker no
 * arrancaba. Un archivo propio, con URL fija y sin parámetros, se precarga como cualquier otro de
 * `public/`.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(WEB, "public", "workers", "reconstruct.js");
mkdirSync(dirname(out), { recursive: true });
await build({
  entryPoints: [join(WEB, "src", "workers", "reconstruct.worker.ts")],
  outfile: out,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "inline",
  logLevel: "warning",
});
console.log(`worker del solver → ${out}`);
