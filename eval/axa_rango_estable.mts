/**
 * ¿El rango de V2 en AXA depende de la semilla? (T3.1, ADR 0100; PLAN-CESVI v3 §T3.1).
 *
 * La escena es la de la app (`axa-reconstruccion.ts`). Se reconstruye con el resultado completo de
 * producción (`fullResult`) con la semilla de la app y 19 más (1 a 19), y por semilla se toma el
 * p10 y el p90 de la velocidad previa de V2 en la reconstrucción principal («cuadra con el daño
 * medido», la que se ve sin elegir). Lo que se mide es cuánto se mueven el p10 y el p90 entre
 * semillas (máximo menos mínimo): la meta de T3.1 es que no se muevan más de 1 km/h.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/axa_rango_estable.mts [salida.json] [etiqueta]
 *     → eval/results/axa_rango_estable.json (o la salida dada), con `etiqueta` («antes»/«despues»)
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fullResult, PRODUCTION_SAMPLES } from "../packages/solver-ts/src/full-result.ts";
import {
  expedienteAxaReconstruccion,
  SPEC_ID_APP,
} from "../apps/web/src/lib/axa-reconstruccion.ts";
import { especDeExpediente, interpretarResultado } from "../packages/cesvi/src/reconstruccion.ts";

type Json = Record<string, unknown>;

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = process.argv[2] ?? join(RAIZ, "eval/results/axa_rango_estable.json");
const ETIQUETA = process.argv[3] ?? "";
const r2 = (x: number) => Math.round(x * 100) / 100;

const base = especDeExpediente(expedienteAxaReconstruccion());
const semillaApp = Number((base.spec.meta as Json).semilla);
const SEMILLAS = [semillaApp, ...Array.from({ length: 19 }, (_, k) => k + 1)];

const filas = SEMILLAS.map((semilla) => {
  const spec = structuredClone(base.spec) as Json;
  (spec.meta as Json).semilla = semilla;
  const t0 = performance.now();
  // Las muestras de producción (el worker): con la etiqueta «antes» eran las de la referencia.
  const r = interpretarResultado(
    { ...base, spec },
    fullResult(spec, ETIQUETA === "antes" ? {} : PRODUCTION_SAMPLES),
  );
  const previa = (id: string) => r.velocidades.find((v) => v.vehiculo === id)?.previa ?? null;
  const rango = (id: string) => {
    const p = previa(id);
    return p
      ? {
          mejor: r2(p.mejor),
          p10: p.p10 == null ? null : r2(p.p10),
          p90: p.p90 == null ? null : r2(p.p90),
        }
      : null;
  };
  const fila = {
    semilla,
    es_la_de_la_app: semilla === semillaApp,
    hipotesis: r.hipotesis?.length ?? 1,
    V2: rango("V2"),
    V1: rango("V1"),
    ms: Math.round(performance.now() - t0),
  };
  console.log(JSON.stringify({ semilla, V2: fila.V2, V1: fila.V1, ms: fila.ms }));
  return fila;
});

/** Cuánto se mueve un percentil entre semillas: máximo menos mínimo, y cuántas semillas lo dan. */
const movimiento = (id: "V2" | "V1", clave: "p10" | "p90" | "mejor") => {
  const xs = filas.map((f) => f[id]?.[clave]).filter((x): x is number => typeof x === "number");
  if (xs.length === 0) return { semillas: 0, min: null, max: null, movimiento_kmh: null };
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  return { semillas: xs.length, min: r2(min), max: r2(max), movimiento_kmh: r2(max - min) };
};

const V2 = {
  mejor: movimiento("V2", "mejor"),
  p10: movimiento("V2", "p10"),
  p90: movimiento("V2", "p90"),
};
const cumple =
  V2.p10.movimiento_kmh !== null &&
  V2.p90.movimiento_kmh !== null &&
  V2.p10.movimiento_kmh <= 1 &&
  V2.p90.movimiento_kmh <= 1;

const doc = {
  name: "axa_rango_estable",
  etiqueta: ETIQUETA,
  generated_at: new Date().toISOString().slice(0, 19) + "Z",
  git_commit: execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim(),
  descripcion:
    "AXA A2010930 como la reconstruye la app, con la semilla de la app y 19 más: cuánto se mueven el p10 y el p90 de la velocidad previa de V2 entre semillas (meta de T3.1: ≤ 1 km/h).",
  spec_id_app: SPEC_ID_APP,
  semilla_app: semillaApp,
  semillas: SEMILLAS,
  meta_kmh: 1,
  cumple,
  V2,
  V1: {
    mejor: movimiento("V1", "mejor"),
    p10: movimiento("V1", "p10"),
    p90: movimiento("V1", "p90"),
  },
  mediana_ms: [...filas.map((f) => f.ms)].sort((a, b) => a - b)[Math.floor(filas.length / 2)],
  filas,
};
writeFileSync(SALIDA, `${JSON.stringify(doc, null, 1)}\n`);
const { filas: _f, ...corto } = doc;
console.log(JSON.stringify(corto, null, 1));
