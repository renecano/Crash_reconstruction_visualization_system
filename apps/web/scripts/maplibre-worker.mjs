/**
 * Publica el worker de MapLibre GL en `public/maplibre/` con su versión en el nombre (ADR 0050).
 * MapLibre lo busca junto a su propio módulo y Turbopack no lo copia; la página lo indica con
 * `setWorkerUrl` (`components/cesvi/mapa.tsx`). Corre antes de `next build` y de `next dev`; la copia
 * no se versiona (`.gitignore`).
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(WEB, "package.json"));
const raiz = dirname(require.resolve("maplibre-gl/package.json"));
const { version } = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));
const destino = join(WEB, "public", "maplibre");
mkdirSync(destino, { recursive: true });
copyFileSync(join(raiz, "dist", "maplibre-gl-worker.mjs"), join(destino, `worker-${version}.mjs`));
console.log(`Worker de MapLibre ${version} en public/maplibre/.`);
