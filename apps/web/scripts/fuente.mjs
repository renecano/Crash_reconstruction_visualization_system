/**
 * Comprueba que `public/fuente/anybody-latin-croquis.woff2` (Anybody con la «í» legible, generada
 * por `scripts/fuente.py`) siga hecha a partir de la versión instalada de
 * `@fontsource-variable/anybody`. Uso: `node scripts/fuente.mjs --check` (en `generate:check`).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEN = join(
  WEB,
  "node_modules/@fontsource-variable/anybody/files/anybody-latin-standard-normal.woff2",
);
const SALIDA = join(WEB, "public/fuente/anybody-latin-croquis.woff2");
const HUELLA = join(WEB, "public/fuente/fuente.json");

const errores = [];
if (!existsSync(SALIDA)) errores.push("falta public/fuente/anybody-latin-croquis.woff2");
let guardada = {};
try {
  guardada = JSON.parse(readFileSync(HUELLA, "utf8"));
} catch {
  errores.push("falta public/fuente/fuente.json");
}
const sha = createHash("sha256").update(readFileSync(ORIGEN)).digest("hex");
if (guardada.sha256_origen !== sha) {
  errores.push("@fontsource-variable/anybody cambió desde que se generó la copia");
}
if (errores.length) {
  console.error(
    `Fuente desactualizada (corre \`uv run --with fonttools --with brotli python -I scripts/fuente.py\`): ${errores.join("; ")}`,
  );
  process.exit(1);
}
console.log("Fuente al día: Anybody con la «í» legible.");
