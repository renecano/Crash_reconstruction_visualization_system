/**
 * ¿Qué cambio movió la cifra del caso de ejemplo con poste? (hallado el 2026-11-15).
 *
 * El caso es el de la e2e de U6 (`apps/web/e2e/visor-unity-ayuda.ts`, `casoConPoste`): la narración
 * de ejemplo de la app, colocada con los mismos toques, con el Camaro contra un poste. El 12 de
 * noviembre la app daba «A · Jetta 60.62 km/h (55.29–65.95)»; el 15, «B · Camaro 102 km/h, rango
 * 72–99». Aquí se corre **la misma escena** (la que la app publicada le manda a su solver, guardada
 * en `eval/results/caso_poste_escena.json`) con el solver de varias fechas, para ver cuál la movió.
 * No llama a la API.
 *
 * Cada versión del solver es una carpeta: el repositorio, o un `git worktree` de un commit anterior
 * con `packages/solver-ts/node_modules` y `packages/scene-schema/node_modules` enlazados a los del
 * repositorio (las versiones viejas no se instalan):
 *
 *   git worktree add --detach D:\croquis-wt\972a7260 972a7260
 *   cd packages/cesvi
 *   pnpm exec tsx ../../eval/caso_poste_historia.mts "antes de W8=D:/croquis-wt/972a7260" "hoy=../.."
 *     → eval/results/caso_poste_historia.json
 *
 * Una etiqueta que termina en «(supuestos fijos)» corre con la restitución, la razón de impulso y el
 * arrastre en su nominal, como antes de la Tanda 3 (solo existe en el solver de hoy).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ESCENA = join(RAIZ, "eval/results/caso_poste_escena.json");
const SALIDA = join(RAIZ, "eval/results/caso_poste_historia.json");
const spec = JSON.parse(readFileSync(ESCENA, "utf8")) as Json;
const r2 = (x: unknown) => (typeof x === "number" ? Math.round(x * 100) / 100 : null);

const filas: Json[] = [];
for (const arg of process.argv.slice(2)) {
  const corte = arg.indexOf("=");
  const etiqueta = arg.slice(0, corte);
  const raiz = resolve(arg.slice(corte + 1));
  const mod = (ruta: string) => import(pathToFileURL(join(raiz, ruta)).href);
  const fr = await mod("packages/solver-ts/src/full-result.ts");
  const muestras = fr.PRODUCTION_SAMPLES ?? { samples: 32, mcSamples: 128 };
  const correr = () => fr.fullResult(structuredClone(spec), muestras) as Json;
  const r = etiqueta.endsWith("(supuestos fijos)")
    ? ((await mod("packages/solver-ts/src/impact-assumptions.ts")).conSupuestosFijos(
        correr,
      ) as Json)
    : correr();
  const inv = r.inversion as Json;
  const velocidades = (inv.parametros as Json[])
    .filter((p) => p.parametro === "velocidad_previa")
    .map((p) => {
      const e = (p.estimacion ?? {}) as Json;
      return {
        vehiculo: p.vehiculo,
        identificable: p.identificable,
        mejor_kmh: r2(e.mejor),
        p10_kmh: r2(e.p10),
        p90_kmh: r2(e.p90),
        rango_por: e.rango_por ?? "simulaciones",
      };
    });
  const modos = (((inv.multiarranque as Json | undefined)?.modos ?? []) as Json[]).map((m) => ({
    valores: (m.valores as Json[]).map((v) => `${String(v.nombre)}=${r2(v.valor)}`),
    costo: r2(m.costo),
    elegido: m.elegido,
  }));
  const residuos = (inv.residuos as { sigma: number }[]).map((x) => Math.abs(x.sigma));
  filas.push({
    solver: etiqueta,
    commit: execFileSync("git", ["-C", raiz, "rev-parse", "--short=8", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    muestras,
    velocidades,
    modos,
    residuo_mayor_sigmas: r2(Math.max(...residuos)),
  });
  console.log(etiqueta, JSON.stringify(velocidades));
}

writeFileSync(
  SALIDA,
  JSON.stringify(
    {
      descripcion:
        "La misma escena (el caso de ejemplo con poste de la e2e de U6, como la manda la app publicada el 2026-11-15) con el solver de varias fechas. Sin llamar a la API.",
      script: "eval/caso_poste_historia.mts",
      escena: "eval/results/caso_poste_escena.json",
      fecha: new Date().toISOString(),
      filas,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
