/**
 * T3.2 (W8): cuánto movería a AXA cada arreglo posible, **como experimento, sin cambiar el solver**.
 * Los dos arreglos están en `eval/t3_2_opciones.patch` (solo el port TS, detrás de la variable
 * `CROQUIS_T32`); el solver de `main` no los trae. Para repetir la medición:
 *
 *   git apply eval/t3_2_opciones.patch
 *   cd packages/cesvi && pnpm exec tsx ../../eval/t3_2_opciones_axa.mts → eval/results/t3_2_opciones_axa.json
 *   git checkout -- packages/solver-ts/src
 *
 * - `hoy`: el solver tal cual.
 * - `contacto`: `refinePair` se queda cerca del punto de impacto declarado (un término μ·|punto medio −
 *   declarado|², μ = 1e-4), para que el contacto de dos trayectorias casi paralelas no salte.
 * - `pivote`: el rumbo inicial no declarado gira la llegada alrededor del punto de impacto declarado,
 *   no del arranque: cambia de dónde venía el vehículo, no dónde chocó.
 * - `ambos`.
 * - `rumbo_del_perito`: sin parche; el rumbo inicial de V2 se deja como lo colocó el perito (sobre la
 *   vía), sin ajustarlo.
 *
 * Con el resultado completo de producción (`fullResult`, `PRODUCTION_SAMPLES`), como la app.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fullResult, PRODUCTION_SAMPLES } from "../packages/solver-ts/src/full-result.ts";
import { expedienteAxaReconstruccion } from "../apps/web/src/lib/axa-reconstruccion.ts";
import { especDeExpediente, interpretarResultado } from "../packages/cesvi/src/reconstruccion.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPCIONES = ["hoy", "contacto", "pivote", "ambos", "rumbo_del_perito"];

// Cada opción en su propio proceso: la variable se lee al llamar al solver.
if (process.env.CROQUIS_T32_UNA) {
  const base = especDeExpediente(expedienteAxaReconstruccion());
  if (process.env.CROQUIS_T32 === "rumbo_del_perito") {
    const v2 = Object.entries(base.ids).find(([, e]) => e === "V2")![0];
    for (const v of (base.spec as Json).vehiculos as Json[]) {
      if (v.id !== v2) continue;
      const pose = v.posicion_inicial as Json;
      pose.procedencia = {
        fuente: "usuario",
        confianza: 0.9,
        nota: "T3.2: rumbo del perito, sin ajustar",
      };
    }
  }
  const completo = fullResult(base.spec as Json, PRODUCTION_SAMPLES) as Json;
  const r = interpretarResultado(base, completo as never);
  const previa = (id: string) => r.velocidades.find((v) => v.vehiculo === id)?.previa ?? null;
  const id = (x: string) => Object.entries(base.ids).find(([, e]) => e === x)![0];
  const rumbo = (v: string) => {
    const p = (((completo.inversion as Json)?.parametros ?? []) as Json[]).find(
      (q) => q.parametro === "rumbo_inicial" && q.vehiculo === v,
    );
    if (!p) return null;
    const e = p.estimacion as Json | undefined;
    return { identificable: p.identificable, en_limite: p.en_limite, mejor: e?.mejor ?? null };
  };
  console.log(
    JSON.stringify({
      opcion: process.env.CROQUIS_T32,
      V2: previa("V2"),
      V1: previa("V1"),
      rumbo_inicial: { V2: rumbo(id("V2")), V1: rumbo(id("V1")) },
    }),
  );
  process.exit(0);
}

const filas = OPCIONES.map((o) => {
  const r = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url)], {
    env: { ...process.env, CROQUIS_T32: o, CROQUIS_T32_UNA: "1" },
    encoding: "utf8",
  });
  const linea = r.stdout.trim().split("\n").at(-1)!;
  console.log(linea);
  return JSON.parse(linea) as Json;
});
writeFileSync(
  join(RAIZ, "eval/results/t3_2_opciones_axa.json"),
  `${JSON.stringify(
    {
      name: "t3_2_opciones_axa",
      generated_at: new Date().toISOString().slice(0, 19) + "Z",
      nota: "Experimento con eval/t3_2_opciones.patch aplicado; el solver de main no cambia.",
      cesvi_v2_kmh: 63.15,
      filas,
    },
    null,
    2,
  )}\n`,
);
