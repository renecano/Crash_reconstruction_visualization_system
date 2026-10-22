/**
 * Publica el worker de pdf.js en `public/pdfjs/` con su versión en el nombre, como el de MapLibre
 * (ADR 0050). La importación de dictámenes (R5, ADR 0068) saca el texto del PDF en el navegador y le
 * indica la ruta con `GlobalWorkerOptions.workerSrc` (`lib/texto-dictamen.ts`). Corre antes de
 * `next build` y de `next dev`; la copia no se versiona (`.gitignore`).
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(WEB, "package.json"));
const raiz = dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));
const destino = join(WEB, "public", "pdfjs");
mkdirSync(destino, { recursive: true });
copyFileSync(join(raiz, "build", "pdf.worker.min.mjs"), join(destino, `worker-${version}.mjs`));
console.log(`Worker de pdf.js ${version} en public/pdfjs/.`);
