/**
 * Las dos hipótesis de AXA como las ve el perito (René, 2026-11-28, para el guion de la demo): la
 * reconstrucción de la app (semilla y muestras de producción) y, para cada hipótesis, la velocidad de
 * V2 y V1 tal como queda al elegirla (`conHipotesis`). Escribe `eval/results/axa_hipotesis.json`.
 *
 *   TSX_TSCONFIG_PATH=apps/web/tsconfig.json pnpm --filter @croquis/cesvi exec tsx ../../eval/axa_hipotesis.mts
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fullResult, PRODUCTION_SAMPLES } from "../packages/solver-ts/src/full-result.ts";
import { expedienteAxaReconstruccion } from "../apps/web/src/lib/axa-reconstruccion.ts";
import {
  conHipotesis,
  especDeExpediente,
  interpretarResultado,
} from "../packages/cesvi/src/reconstruccion.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const r2 = (x: number) => Math.round(x * 100) / 100;
const base = especDeExpediente(expedienteAxaReconstruccion());
const r = interpretarResultado(base, fullResult(base.spec, PRODUCTION_SAMPLES));
const velocidad = (x: typeof r, id: string) => {
  const p = x.velocidades.find((v) => v.vehiculo === id)?.previa ?? null;
  return p
    ? {
        mejor: r2(p.mejor),
        p10: p.p10 == null ? null : r2(p.p10),
        p90: p.p90 == null ? null : r2(p.p90),
      }
    : null;
};
const hipotesis = (r.hipotesis ?? []).map((h) => {
  const elegida = conHipotesis(r, h.clave);
  return {
    clave: h.clave,
    titulo: h.titulo,
    alcanza_dano: h.alcanzaDano,
    V2: velocidad(elegida, "V2"),
    V1: velocidad(elegida, "V1"),
  };
});
const git = (() => {
  try {
    return execSync("git rev-parse --short=8 HEAD", { cwd: RAIZ }).toString().trim();
  } catch {
    return null;
  }
})();
const salida = {
  name: "axa_hipotesis",
  generated_at: new Date().toISOString(),
  git_commit: git,
  descripcion:
    "AXA A2010930 con la semilla y las muestras de producción: cada hipótesis que muestra la reconstrucción y la velocidad de V2 y V1 al elegirla.",
  visible: { V2: velocidad(r, "V2"), V1: velocidad(r, "V1"), elegida: r.elegida ?? null },
  hipotesis,
};
writeFileSync(
  join(RAIZ, "eval/results/axa_hipotesis.json"),
  `${JSON.stringify(salida, null, 2)}\n`,
);
console.log(JSON.stringify(salida, null, 1));
