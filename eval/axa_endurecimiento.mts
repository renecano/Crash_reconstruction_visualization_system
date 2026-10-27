/**
 * AXA A2010930 como la ve la app (`apps/web/src/lib/axa-reconstruccion.ts`, su semilla) después de
 * cada punto del endurecimiento de la inversión (René, 2026-10-26): las velocidades con su p10–p90,
 * cómo sale el rango, las hipótesis, la comparación con lo que calculó CESVI (valor y %) y los
 * supuestos declarados. Cada corrida agrega su etiqueta al archivo; el punto de partida es
 * `eval/results/axa_multiarranque.json` (`despues.elegida`).
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/axa_endurecimiento.mts <etiqueta>
 *     → eval/results/axa_endurecimiento.json
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expedienteAxaReconstruccion } from "../apps/web/src/lib/axa-reconstruccion.ts";
import {
  reconstruccionContraCesvi,
  reconstruirExpediente,
  supuestosDeclarados,
} from "../packages/cesvi/src/index.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(RAIZ, "eval/results/axa_endurecimiento.json");
const etiqueta = process.argv[2] ?? "actual";
const r2 = (x: number) => Math.round(x * 100) / 100;

const e = expedienteAxaReconstruccion();
const t0 = performance.now();
const r = reconstruirExpediente(e);
const ms = Math.round(performance.now() - t0);
const inv = r.resultado.inversion as {
  parametros: {
    parametro: string;
    vehiculo: string;
    estimacion?: { mejor: number; p10: number; p90: number; rango_por?: string };
  }[];
};
const fila = {
  generated_at: new Date().toISOString().slice(0, 19) + "Z",
  git_commit: execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim(),
  velocidades: Object.fromEntries(
    r.velocidades.map((v) => {
      const sid = Object.keys(r.ids).find((k) => r.ids[k] === v.vehiculo)!;
      const p = inv.parametros.find(
        (x) => x.vehiculo === sid && x.parametro === "velocidad_previa",
      )?.estimacion;
      return [
        v.vehiculo,
        p
          ? {
              kmh: r2(p.mejor),
              p10: r2(p.p10),
              p90: r2(p.p90),
              rango_por: p.rango_por ?? "muestras",
            }
          : null,
      ];
    }),
  ),
  hipotesis: (r.hipotesis ?? []).map((h) => ({ clave: h.clave, costo: h.costo })),
  contra_cesvi: reconstruccionContraCesvi(e, r).filas.map((f) => ({
    metodo: f.metodo,
    cesvi_kmh: f.cesviKmh,
    croquis_kmh: f.croquisKmh === null ? null : r2(f.croquisKmh),
    croquis_p10_p90: f.croquisRango,
    diferencia_kmh: f.diferenciaKmh === null ? null : r2(f.diferenciaKmh),
    diferencia_pct: f.diferenciaPct === null ? null : r2(f.diferenciaPct),
  })),
  supuestos: supuestosDeclarados(e, r).map((s) => `${s.que}: ${s.valor}`),
  resultado_completo_ms_node: ms,
};
const previo = existsSync(SALIDA) ? (JSON.parse(readFileSync(SALIDA, "utf8")) as Json) : {};
const doc = {
  ...previo,
  name: "axa_endurecimiento",
  descripcion:
    "AXA A2010930 como la ve la app después de cada punto del endurecimiento de la inversión: velocidades con su p10–p90, hipótesis, comparación con CESVI y supuestos. El punto de partida es axa_multiarranque.json (despues.elegida).",
  [etiqueta]: fila,
};
writeFileSync(SALIDA, `${JSON.stringify(doc, null, 1)}\n`);
console.log(JSON.stringify({ etiqueta, ...fila }, null, 1));
