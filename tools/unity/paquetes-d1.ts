/**
 * Arma el paquete caso-3d, con su escenario (ADR 0112), de las escenas de referencia de D1, cada una
 * de día y de noche, para revisarlas y capturarlas en el visor Unity. Los deja en
 * `apps/visor-unity/Build/casos/`, fuera de git, y dice cuánto pesa cada uno.
 *
 * La reconstrucción es la misma en las dos variantes: solo cambia con qué luz se dibuja.
 *
 *   pnpm --filter @croquis/scene-schema exec tsx ../../tools/unity/paquetes-d1.ts
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/** Las escenas de D1 (plan v4 §1). */
const ESCENAS: { nombre: string; escena: () => EscenaSpec; resultado?: () => Resultado }[] = [
  { nombre: "axa", escena: () => leer<EscenaSpec>("demo/escenas-r11/axa.json") },
  ...["lateral_interseccion", "nocturno_lluvia", "carambola"].map((n) => ({
    nombre: n,
    escena: () => leer<Caso3D>(`packages/scene-schema/fixtures/caso3d/${n}.json`).escena,
    resultado: () => leer<Caso3D>(`packages/scene-schema/fixtures/caso3d/${n}.json`).resultado,
  })),
  {
    // La quinta de D1: la escena de referencia de terreno (C3, W5; `eval/w5_fixtures.py`).
    nombre: "terraceria",
    escena: () =>
      leer<Caso3D>("packages/scene-schema/fixtures/caso3d/terraceria_topes.json").escena,
    resultado: () =>
      leer<Caso3D>("packages/scene-schema/fixtures/caso3d/terraceria_topes.json").resultado,
  },
];

/** La misma escena con otra luz: sin hora declarada, el cielo sale de la iluminación. */
function conLuz(escena: EscenaSpec, luz: "dia" | "noche"): EscenaSpec {
  const { fecha_hora: _hora, ...entorno } = escena.entorno;
  void _hora;
  const fuente = { fuente: "default" as const, confianza: 0.5 };
  return {
    ...escena,
    entorno: {
      ...entorno,
      iluminacion: { valor: luz === "dia" ? "dia" : "noche_con_alumbrado", ...fuente },
      alumbrado_publico: { valor: luz === "noche", ...fuente },
    },
  };
}

mkdirSync(SALIDA, { recursive: true });
for (const f of readdirSync(SALIDA)) rmSync(join(SALIDA, f));
for (const e of ESCENAS) {
  const escena = e.escena();
  const resultado = e.resultado
    ? e.resultado()
    : (fullResult(escena, PRODUCTION_SAMPLES) as unknown as Resultado);
  for (const luz of ["dia", "noche"] as const) {
    const p = armarCaso3d(escena, resultado, null, escenarioDe(conLuz(escena, luz), resultado));
    const errores = caso3dErrors(p);
    if (errores.length) throw new Error(`${e.nombre}:\n${errores.slice(0, 5).join("\n")}`);
    const texto = JSON.stringify(p);
    writeFileSync(join(SALIDA, `${e.nombre}-${luz}.json`), texto);
    const kb = Math.round(texto.length / 1024);
    const kbEsc = Math.round(JSON.stringify(p.escenario).length / 1024);
    console.log(`${e.nombre}-${luz}: ${kb} KB, de los que el escenario son ${kbEsc} KB`);
  }
}
