/**
 * Arma el paquete caso-3d, con su escenario (ADR 0112), de las escenas canónicas que se pidan, de día,
 * con el resultado versionado. Para revisar en el visor Unity lo que no está en D1 (las personas de
 * U3, por ejemplo). Los deja en `apps/visor-unity/Build/<carpeta>/`, fuera de git.
 *
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-escenas.ts <carpeta> <escena...>
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escenarioDe } from "../../apps/web/src/components/visor-unity/escenario";
import { armarCaso3d, caso3dErrors, type Caso3D } from "../../packages/scene-schema/src/caso3d";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [carpeta, ...escenas] = process.argv.slice(2);
if (!carpeta || !escenas.length) {
  console.error("Uso: paquetes-escenas.ts <carpeta> <escena...>");
  process.exit(2);
}
const salida = join(RAIZ, "apps/visor-unity/Build", carpeta);
mkdirSync(salida, { recursive: true });
for (const f of readdirSync(salida)) rmSync(join(salida, f));
for (const nombre of escenas) {
  const c = JSON.parse(
    readFileSync(join(RAIZ, `packages/scene-schema/fixtures/caso3d/${nombre}.json`), "utf8"),
  ) as Caso3D;
  const p = armarCaso3d(c.escena, c.resultado, null, escenarioDe(c.escena, c.resultado));
  const errores = caso3dErrors(p);
  if (errores.length) throw new Error(`${nombre}:\n${errores.slice(0, 5).join("\n")}`);
  writeFileSync(join(salida, `${nombre}.json`), JSON.stringify(p));
  console.log(`${nombre}: ${Math.round(JSON.stringify(p).length / 1024)} KB`);
}
