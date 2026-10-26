/**
 * Cuánto se mueve con la semilla el ΔV que implica la deformación medida de AXA (ADR 0091): la
 * distribución del daño de V2 (un mínimo, porque V1 no tiene la suya medida) con 200 muestras (como
 * antes del multiarranque) y con 2000 (como ahora), cada una con 20 semillas. Si su p10 se mueve, se
 * mueve la cota inferior que el ajuste tiene que cumplir.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/axa_ruido_dano.mts
 *     → eval/results/axa_ruido_dano.json
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evidenceFromSpec } from "../packages/solver-ts/src/index.ts";
import { expedienteAxaReconstruccion } from "../apps/web/src/lib/axa-reconstruccion.ts";
import { especDeExpediente } from "../packages/cesvi/src/index.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(RAIZ, "eval/results/axa_ruido_dano.json");
const r2 = (x: number) => Math.round(x * 100) / 100;

const base = especDeExpediente(expedienteAxaReconstruccion());
const spec = base.spec as Record<string, unknown>;
const v2 = Object.keys(base.ids).find((k) => base.ids[k] === "V2")!;
const SEMILLAS = Array.from({ length: 20 }, (_, k) => k);

const porMuestras = [200, 2000].map((n) => {
  const d = SEMILLAS.map((s) => evidenceFromSpec(spec, s, n).damageMin.get(v2)!);
  const rango = (xs: number[]) => [r2(Math.min(...xs)), r2(Math.max(...xs))];
  return {
    muestras: n,
    p10: rango(d.map((x) => x.p10)),
    p50: rango(d.map((x) => x.p50)),
    p90: rango(d.map((x) => x.p90)),
  };
});

const doc = {
  name: "axa_ruido_dano",
  generated_at: new Date().toISOString().slice(0, 19) + "Z",
  git_commit: execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim(),
  descripcion:
    "ΔV mínimo de V2 por su deformación medida (AXA A2010930, escena de la app), con 200 y con 2000 muestras, en 20 semillas: el menor y el mayor de su p10, p50 y p90 (km/h).",
  semillas: SEMILLAS,
  por_muestras: porMuestras,
};
writeFileSync(SALIDA, `${JSON.stringify(doc, null, 1)}\n`);
console.log(JSON.stringify(porMuestras));
