/**
 * AXA A2010930 con 20 semillas (René, 2026-10-25): ¿cuánto cambia la reconstrucción con la semilla?
 *
 * La escena es la de la app (`apps/web/src/lib/axa-reconstruccion.ts`, el reposo de V2 marcado como
 * supuesto). Se reconstruye con el resultado completo de producción (`fullResult`, el mismo del
 * paso 6) con la semilla de la app y con otras 19 explícitas (1 a 19). Por semilla: cuántas
 * hipótesis salen y la velocidad previa de V2 y V1 en cada una, con su p10–p90 cuando la evidencia la
 * fija. Al final, la dispersión entre semillas de «cuadra con el daño medido» (la que se ve mientras
 * el perito no elige) y si el p10–p90 de la semilla de la app la cubre.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/cesvi_axa_semillas.mts [salida.json]
 *     → eval/results/axa_semillas.json
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fullResult } from "../packages/solver-ts/src/full-result.ts";
import {
  expedienteAxaReconstruccion,
  SPEC_ID_APP,
} from "../apps/web/src/lib/axa-reconstruccion.ts";
import {
  especDeExpediente,
  interpretarResultado,
  type HipotesisReconstruccion,
} from "../packages/cesvi/src/index.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = process.argv[2] ?? join(RAIZ, "eval/results/axa_semillas.json");
const r2 = (x: number) => Math.round(x * 100) / 100;

const base = especDeExpediente(expedienteAxaReconstruccion());
const semillaApp = Number((base.spec.meta as Json).semilla);
const SEMILLAS = [semillaApp, ...Array.from({ length: 19 }, (_, k) => k + 1)];

const velocidad = (h: HipotesisReconstruccion | undefined, id: string) => {
  const v = h?.velocidades.find((x) => x.vehiculo === id);
  return v ? { kmh: v.kmh === null ? null : r2(v.kmh), fijada: v.fijada } : null;
};

const filas = SEMILLAS.map((semilla) => {
  const spec = structuredClone(base.spec) as Json;
  (spec.meta as Json).semilla = semilla;
  const t0 = performance.now();
  const r = interpretarResultado({ ...base, spec }, fullResult(spec));
  const previa = (id: string) => r.velocidades.find((v) => v.vehiculo === id)?.previa ?? null;
  const conRango = (id: string) => {
    const p = previa(id);
    return p ? { mejor: r2(p.mejor), p10: p.p10 ?? null, p90: p.p90 ?? null } : null;
  };
  const dano = r.hipotesis?.find((h) => h.clave === "dano");
  const reposo = r.hipotesis?.find((h) => h.clave === "reposo");
  const fila = {
    semilla,
    es_la_de_la_app: semilla === semillaApp,
    hipotesis: r.hipotesis?.length ?? 1,
    // La reconstrucción que se ve sin elegir: «cuadra con el daño medido» (o la única).
    principal: { V2: conRango("V2"), V1: conRango("V1") },
    dano: dano ? { V2: velocidad(dano, "V2"), V1: velocidad(dano, "V1") } : null,
    reposo: reposo ? { V2: velocidad(reposo, "V2"), V1: velocidad(reposo, "V1") } : null,
    ms: Math.round(performance.now() - t0),
  };
  console.log(
    JSON.stringify({ semilla, h: fila.hipotesis, V2: fila.principal.V2, V1: fila.principal.V1 }),
  );
  return fila;
});

/** La velocidad de la reconstrucción principal: la estimada, o el mejor ajuste de «daño medido». */
const principal = (f: (typeof filas)[number], id: "V2" | "V1") =>
  f.principal[id]?.mejor ?? f.dano?.[id]?.kmh ?? null;
const resumen = (id: "V2" | "V1") => {
  const xs = filas.map((f) => principal(f, id)).filter((x): x is number => x !== null);
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => {
    const k = (s.length - 1) * p;
    const lo = Math.floor(k);
    return r2(s[lo]! + (s[Math.ceil(k)]! - s[lo]!) * (k - lo));
  };
  const app = filas[0]!.principal[id];
  const dentro =
    app?.p10 != null && app.p90 != null
      ? xs.filter((x) => x >= app.p10! && x <= app.p90!).length
      : null;
  return {
    semillas_con_valor: xs.length,
    min: r2(s[0]!),
    max: r2(s.at(-1)!),
    p10: q(0.1),
    p50: q(0.5),
    p90: q(0.9),
    rango_kmh: r2(s.at(-1)! - s[0]!),
    p10_p90_kmh: r2(q(0.9) - q(0.1)),
    app: app?.mejor ?? null,
    app_p10_p90: app?.p10 != null && app.p90 != null ? [r2(app.p10), r2(app.p90)] : null,
    semillas_dentro_del_p10_p90_de_la_app: dentro,
  };
};

const doc = {
  name: "axa_semillas",
  generated_at: new Date().toISOString().slice(0, 19) + "Z",
  git_commit: execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim(),
  descripcion:
    "AXA A2010930 como la reconstruye la app (reposo de V2 marcado como supuesto), con la semilla de la app y 19 más: hipótesis por semilla y dispersión de la velocidad previa de V2 y V1 en la reconstrucción que se ve sin elegir («cuadra con el daño medido»).",
  spec_id_app: SPEC_ID_APP,
  semilla_app: semillaApp,
  semillas: SEMILLAS,
  con_dos_hipotesis: filas.filter((f) => f.hipotesis >= 2).length,
  con_una_hipotesis: filas.filter((f) => f.hipotesis === 1).length,
  V2: resumen("V2"),
  V1: resumen("V1"),
  filas,
};
writeFileSync(SALIDA, `${JSON.stringify(doc, null, 1)}\n`);
const { filas: _f, ...corto } = doc;
console.log(JSON.stringify(corto, null, 1));
