/**
 * T3.2 (W8): por qué «el rumbo que colocó el perito» daba 64.57 km/h en el experimento del
 * 2026-11-12 y con la regla aplicada sale 56.87 (René, 2026-11-12). Corre con el solver de la copia
 * de trabajo: se corre una vez con el de `main` (sin los arreglos 1 y 2) y otra con el nuevo.
 *
 * Con el rumbo de V2 fijo en el del perito (como en el experimento), anota la velocidad de V2 y V1,
 * el rumbo de V1 que ajustó la inversión y dónde quedó el choque: su distancia al punto de impacto
 * del evento (0, 0), donde lo colocó el perito.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/t3_2_discrepancia_axa.mts <etiqueta>
 *     → eval/results/w8/discrepancia_axa_<etiqueta>.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fullResult, PRODUCTION_SAMPLES } from "../packages/solver-ts/src/full-result.ts";
import { expedienteAxaReconstruccion } from "../apps/web/src/lib/axa-reconstruccion.ts";
import { especDeExpediente, interpretarResultado } from "../packages/cesvi/src/reconstruccion.ts";
import { applyValues } from "../packages/solver-ts/src/inversion.ts";
import { reconstruct } from "../packages/solver-ts/src/reconstruct.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const etiqueta = process.argv[2] ?? "actual";
const r2 = (x: number) => Math.round(x * 100) / 100;

function medir(rumboDelPerito: boolean) {
  const base = especDeExpediente(expedienteAxaReconstruccion());
  const v2 = Object.entries(base.ids).find(([, e]) => e === "V2")![0];
  const v1 = Object.entries(base.ids).find(([, e]) => e === "V1")![0];
  if (rumboDelPerito) {
    for (const v of (base.spec as Json).vehiculos as Json[]) {
      if (v.id !== v2) continue;
      (v.posicion_inicial as Json).procedencia = {
        fuente: "usuario",
        confianza: 0.9,
        nota: "T3.2: rumbo del perito, sin ajustar",
      };
    }
  }
  const completo = fullResult(base.spec as Json, PRODUCTION_SAMPLES) as Json;
  const r = interpretarResultado(base, completo as never);
  const previa = (id: string) => r.velocidades.find((v) => v.vehiculo === id)?.previa ?? null;
  const rumbo = (vid: string) => {
    const p = (((completo.inversion as Json)?.parametros ?? []) as Json[]).find(
      (q) => q.parametro === "rumbo_inicial" && q.vehiculo === vid,
    );
    if (!p) return null;
    const e = p.estimacion as Json | undefined;
    return { identificable: p.identificable, mejor: e?.mejor ?? null, inicial: p.inicial };
  };
  // Dónde chocan en el mejor ajuste de la inversión (no en la escena declarada).
  const valores = new Map<string, number>();
  for (const p of ((completo.inversion as Json)?.parametros ?? []) as Json[]) {
    const e = p.estimacion as Json | undefined;
    if (!p.identificable || !e) continue;
    const k = p.parametro === "velocidad_previa" ? "velocidad" : "rumbo";
    valores.set(`${k}:${String(p.vehiculo)}`, Number(e.mejor));
  }
  const ajuste = reconstruct(applyValues(base.spec as Json, valores), { dt: 0.1 });
  const pi = ajuste.puntoImpacto
    ? { x: ajuste.puntoImpacto[0], y: ajuste.puntoImpacto[1] }
    : undefined;
  return {
    rumbo_de_v2: rumboDelPerito ? "fijo en el del perito (75.72°)" : "como lo decide la inversión",
    V2: previa("V2"),
    V1: previa("V1"),
    rumbo_inicial: { V2: rumbo(v2), V1: rumbo(v1) },
    choque_en_el_mejor_ajuste: pi ? [r2(pi.x), r2(pi.y)] : null,
    distancia_al_punto_del_perito_m: pi ? r2(Math.hypot(pi.x, pi.y)) : null,
  };
}

const doc = {
  name: "t3_2_discrepancia_axa",
  etiqueta,
  generated_at: new Date().toISOString().slice(0, 19) + "Z",
  con_el_rumbo_del_perito: medir(true),
  como_la_app: medir(false),
};
mkdirSync(join(RAIZ, "eval/results/w8"), { recursive: true });
writeFileSync(
  join(RAIZ, `eval/results/w8/discrepancia_axa_${etiqueta}.json`),
  `${JSON.stringify(doc, null, 2)}\n`,
);
console.log(JSON.stringify(doc, null, 1));
