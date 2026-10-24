/**
 * Publica los decodificadores de three.js que piden los vehículos de R10 (ADR 0086): Draco para la
 * geometría y Basis para las texturas KTX2. Van en `public/decodificadores/r<revisión de three>/`,
 * la misma ruta que arma el visor con `REVISION` (así no se mezclan archivos de dos versiones). Corre antes de
 * `next build` y de `next dev`; la copia no se versiona (`.gitignore`).
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
// three llega por @croquis/viewer: se resuelve desde ahí, que es la versión que usa el visor.
const require = createRequire(join(WEB, "..", "..", "packages", "viewer", "package.json"));
// three no exporta su package.json: desde su entrada (build/three.cjs) se sube a la carpeta.
const raiz = dirname(dirname(require.resolve("three")));
const { version } = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));
const libs = join(raiz, "examples", "jsm", "libs");
const revision = `r${version.split(".")[1]}`;
const destino = join(WEB, "public", "decodificadores", revision);
for (const [carpeta, archivos] of [
  ["draco", ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"]],
  ["basis", ["basis_transcoder.js", "basis_transcoder.wasm"]],
]) {
  mkdirSync(join(destino, carpeta), { recursive: true });
  const origen = carpeta === "draco" ? join(libs, "draco", "gltf") : join(libs, "basis");
  for (const a of archivos) copyFileSync(join(origen, a), join(destino, carpeta, a));
}
console.log(`Decodificadores de three ${version} en public/decodificadores/${revision}/.`);
