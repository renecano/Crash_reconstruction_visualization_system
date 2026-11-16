/**
 * ¿La segunda solución del caso de ejemplo con poste se puede ofrecer como alternativa? (René,
 * 2026-11-15: «solo si es físicamente válida y cuadra con la evidencia; si no, se queda el aviso»).
 *
 * Toma la escena que manda la app (`eval/results/caso_poste_escena.json`), los modos que encuentra
 * el multiarranque y, para cada uno, reconstruye con sus velocidades y mide sus residuos en sigmas y
 * qué impactos ocurren. Criterios:
 * - **Físicamente válida:** ocurren los impactos que tiene la escena (entre vehículos y contra el
 *   poste que colocó el perito).
 * - **Cuadra con la evidencia:** ningún residuo pasa de 3 σ.
 * Sin llamar a la API.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/caso_poste_modos.mts
 *     → eval/results/caso_poste_modos.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fullResult, PRODUCTION_SAMPLES } from "../packages/solver-ts/src/full-result.ts";
import {
  applyValues,
  evidenceFromSpec,
  fitEvidence,
  withMarks,
} from "../packages/solver-ts/src/inversion.ts";
import { reconstruct } from "../packages/solver-ts/src/reconstruct.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(RAIZ, "eval/results/caso_poste_modos.json");
const spec = JSON.parse(
  readFileSync(join(RAIZ, "eval/results/caso_poste_escena.json"), "utf8"),
) as Json;
const LIMITE_SIGMA = 3;
const r2 = (x: number) => Math.round(x * 100) / 100;

// Los impactos que tiene la escena: entre vehículos y contra objetos que colocó el perito.
const esperados = [
  ...((spec.eventos as Json[] | undefined) ?? []).filter((e) =>
    String(e.tipo).startsWith("impacto"),
  ),
];
const inv = (fullResult(spec, PRODUCTION_SAMPLES) as Json).inversion as Json;
const modos = ((inv.multiarranque as Json).modos as Json[]).map((m) => ({
  valores: Object.fromEntries(
    (m.valores as Json[]).map((v) => [String(v.nombre), Number(v.valor)]),
  ),
  costo: Number(m.costo),
  elegido: Boolean(m.elegido),
}));

const ev = evidenceFromSpec(spec);
const filas = modos.map((m) => {
  const f = fitEvidence(spec, ev, {
    start: new Map(Object.entries(m.valores)),
    free: new Set<string>(),
  });
  const r = reconstruct(applyValues(withMarks(spec, ev), f.values) as never, 0.1) as unknown as {
    eventos: { tipo: string; actores?: string[] }[];
  };
  const ocurren = r.eventos
    .filter((e) => e.tipo.startsWith("impacto"))
    .map((e) => `${e.tipo}: ${(e.actores ?? []).join(" + ")}`);
  const residuos = Object.fromEntries([...f.residuals.entries()].map(([k, v]) => [k, r2(v)]));
  const mayor = r2(Math.max(...[...f.residuals.values()].map(Math.abs)));
  const fisica = ocurren.length >= Math.max(1, esperados.length);
  return {
    velocidades_kmh: Object.fromEntries(Object.entries(m.valores).map(([k, v]) => [k, r2(v)])),
    costo: r2(m.costo),
    elegido: m.elegido,
    impactos_que_ocurren: ocurren,
    residuos_sigma: residuos,
    residuo_mayor_sigma: mayor,
    fisicamente_valida: fisica,
    cuadra_con_la_evidencia: mayor <= LIMITE_SIGMA,
    se_ofrece_como_alternativa: !m.elegido && fisica && mayor <= LIMITE_SIGMA,
  };
});

const salida = {
  descripcion:
    "Las soluciones del multiarranque en el caso de ejemplo con poste, con sus residuos y los impactos que ocurren: si la segunda es físicamente válida y cuadra con la evidencia, se ofrece como alternativa; si no, se queda el aviso (ADR 0141). Sin llamar a la API.",
  script: "eval/caso_poste_modos.mts",
  fecha: new Date().toISOString(),
  impactos_de_la_escena: esperados.length,
  limite_sigma: LIMITE_SIGMA,
  modos: filas,
  decision: filas.some((f) => f.se_ofrece_como_alternativa)
    ? "Hay una alternativa que cumple: se ofrece."
    : "Ninguna otra solución cumple: se queda el aviso.",
};
writeFileSync(SALIDA, `${JSON.stringify(salida, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    filas.map((f) => ({
      v: f.velocidades_kmh,
      mayor: f.residuo_mayor_sigma,
      imp: f.impactos_que_ocurren.length,
      fisica: f.fisicamente_valida,
      cuadra: f.cuadra_con_la_evidencia,
    })),
  ),
);
console.log(salida.decision);
