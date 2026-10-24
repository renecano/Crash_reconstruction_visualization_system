/**
 * Publica el script de Blender del video cinematográfico (R11, ADR 0085) en `public/blender/`, para
 * que el perito lo descargue junto a la escena de «Exportar a Blender». El original está en
 * `tools/blender/croquis_render.py`, con sus pruebas; la copia no se versiona (`.gitignore`). Corre
 * antes de `next build` y de `next dev`.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(WEB, "public", "blender");
mkdirSync(destino, { recursive: true });
copyFileSync(
  join(WEB, "..", "..", "tools", "blender", "croquis_render.py"),
  join(destino, "croquis_render.py"),
);
console.log("Script de Blender en public/blender/.");
