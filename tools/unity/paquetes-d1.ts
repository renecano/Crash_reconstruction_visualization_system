/**
 * Arma el paquete caso-3d, con su escenario (ADR 0112), de las escenas de referencia de D1, para
 * revisarlas y capturarlas en el visor Unity. Los deja en `apps/visor-unity/Build/casos/`, fuera de
 * git, y dice cuánto pesa cada uno.
 *
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-d1.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escenarioDe } from "../../apps/web/src/components/visor-unity/escenario";
import { armarCaso3d, caso3dErrors, type Caso3D } from "../../packages/scene-schema/src/caso3d";
import type { EscenaSpec } from "../../packages/scene-schema/src/generated/escena.zod";
import type { Resultado } from "../../packages/scene-schema/src/generated/resultado.zod";
import { fullResult, PRODUCTION_SAMPLES } from "../../packages/solver-ts/src/full-result";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SALIDA = join(RAIZ, "apps/visor-unity/Build/casos");
const leer = <T>(p: string) => JSON.parse(readFileSync(join(RAIZ, p), "utf8")) as T;

/** Las escenas de D1 (plan v4 §1). La de terreno llega con C3. */
const ESCENAS: { nombre: string; escena: () => EscenaSpec; resultado?: () => Resultado }[] = [
  { nombre: "axa", escena: () => leer<EscenaSpec>("demo/escenas-r11/axa.json") },
  ...["lateral_interseccion", "nocturno_lluvia", "carambola"].map((n) => ({
    nombre: n,
    escena: () => leer<Caso3D>(`packages/scene-schema/fixtures/caso3d/${n}.json`).escena,
    resultado: () => leer<Caso3D>(`packages/scene-schema/fixtures/caso3d/${n}.json`).resultado,
  })),
];

mkdirSync(SALIDA, { recursive: true });
for (const e of ESCENAS) {
  const escena = e.escena();
  const resultado = e.resultado
    ? e.resultado()
    : (fullResult(escena, PRODUCTION_SAMPLES) as unknown as Resultado);
  const p = armarCaso3d(escena, resultado, null, escenarioDe(escena, resultado));
  const errores = caso3dErrors(p);
  if (errores.length) throw new Error(`${e.nombre}:\n${errores.slice(0, 5).join("\n")}`);
  const texto = JSON.stringify(p);
  writeFileSync(join(SALIDA, `${e.nombre}.json`), texto);
  const kb = Math.round(texto.length / 1024);
  const kbEsc = Math.round(JSON.stringify(p.escenario).length / 1024);
  console.log(`${e.nombre}: ${kb} KB, de los que el escenario son ${kbEsc} KB`);
}
