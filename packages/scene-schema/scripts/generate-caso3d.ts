/**
 * Genera el paquete caso-3d de cada caso versionado en `fixtures/caso3d/`. Son los casos de prueba
 * del visor Unity y de la fidelidad (D2).
 *
 * - **Las escenas canónicas** traen su `Resultado` versionado (`fixtures/resultados/`).
 * - **Las de inversión y agentes** (entre ellas, AXA) solo guardan su parte del resultado: el completo
 *   se calcula aquí con el solver TS y las muestras de producción, como la app.
 *
 * `--check` no corre el solver, para no gastar tiempo de CI: en esas escenas revisa que la escena y
 * la versión del resultado sigan al día.
 *
 * Uso: `pnpm --filter @croquis/scene-schema generate` · `--check` falla si no están al día.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { armarCaso3d, caso3dErrors, type Caso3D } from "../src/caso3d";
import type { EscenaSpec } from "../src/generated/escena.zod";
import { RESULT_VERSION, type Resultado } from "../src/generated/resultado.zod";

const FIX = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const SALIDA = join(FIX, "caso3d");
const leer = <T>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;
const jsons = (dir: string) => readdirSync(dir).filter((x) => x.endsWith(".json"));

/** Las escenas que no traen su `Resultado` completo. */
const SIN_RESULTADO = [join(FIX, "inversion"), join(FIX, "agentes")];

function escribible(p: Caso3D, f: string): string {
  const errores = caso3dErrors(p);
  if (errores.length) throw new Error(`${f}:\n${errores.slice(0, 5).join("\n")}`);
  return `${JSON.stringify(p)}\n`;
}

export async function generarCaso3d(check: boolean): Promise<boolean> {
  let alDia = true;
  const falla = (m: string) => {
    console.error(m);
    alDia = false;
  };
  mkdirSync(SALIDA, { recursive: true });
  const vistos = new Set<string>();

  for (const f of jsons(join(FIX, "resultados"))) {
    vistos.add(f);
    const texto = escribible(
      armarCaso3d(leer<EscenaSpec>(join(FIX, f)), leer<Resultado>(join(FIX, "resultados", f))),
      f,
    );
    const destino = join(SALIDA, f);
    if (!check) writeFileSync(destino, texto, "utf8");
    else if (!existsSync(destino) || readFileSync(destino, "utf8") !== texto)
      falla(`Desactualizado: fixtures/caso3d/${f}`);
  }

  const full = check ? null : await import("../../solver-ts/src/full-result");
  for (const dir of SIN_RESULTADO) {
    for (const f of jsons(dir)) {
      if (vistos.has(f)) throw new Error(`Dos casos con el mismo nombre: ${f}`);
      vistos.add(f);
      const escena = leer<EscenaSpec>(join(dir, f));
      const destino = join(SALIDA, f);
      if (full) {
        const r = full.fullResult(escena, full.PRODUCTION_SAMPLES) as unknown as Resultado;
        writeFileSync(destino, escribible(armarCaso3d(escena, r), f), "utf8");
      } else if (!existsSync(destino)) {
        falla(`Falta: fixtures/caso3d/${f}`);
      } else {
        const p = leer<Caso3D>(destino);
        if (JSON.stringify(p.escena) !== JSON.stringify(escena))
          falla(`La escena cambió: fixtures/caso3d/${f}`);
        if (p.resultado.version_resultado !== RESULT_VERSION)
          falla(`El resultado es de otra versión: fixtures/caso3d/${f}`);
      }
    }
  }

  for (const f of jsons(SALIDA)) if (!vistos.has(f)) falla(`Sobra: fixtures/caso3d/${f}`);
  console.log(
    `${vistos.size} paquetes caso-3d ${check ? (alDia ? "al día" : "desactualizados") : "escritos"}.`,
  );
  return alDia;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generarCaso3d(process.argv.includes("--check"))
    .then((ok) => {
      if (!ok) process.exitCode = 1;
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    });
}
