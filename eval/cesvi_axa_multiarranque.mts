/**
 * AXA A2010930 con el multiarranque determinista de la inversión (ADR 0091; René, 2026-10-25).
 *
 * La escena es la de la app (`apps/web/src/lib/axa-reconstruccion.ts`, el reposo de V2 marcado como
 * supuesto). Mide:
 *
 * - **antes:** lo que ya estaba medido sin multiarranque (`eval/results/axa_semillas.json`, con su
 *   commit): la velocidad de V2 que se veía con cada semilla y el tiempo;
 * - **después, con la semilla de la app:** los modos de cada inversión (costo, valores, arranques),
 *   la solución elegida, las hipótesis del paso 4 con sus números y su p10–p90, la comparación con
 *   el reporte de CESVI (valor y %) y el tiempo de cada etapa del resultado completo;
 * - **con 20 semillas de la escena:** si la solución elegida cambia (no debería: solo el muestreo
 *   del rango usa la semilla) y cuánto se mueve el p10–p90 por el muestreo;
 * - **con 5 semillas de la evidencia:** cuánto cambia la solución elegida si la distribución del ΔV
 *   por daño se estimara con otra semilla (2000 muestras).
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/cesvi_axa_multiarranque.mts
 *     → eval/results/axa_multiarranque.json
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkConsistency,
  fullResult,
  invert,
  monteCarlo,
  reconstruct,
} from "../packages/solver-ts/src/index.ts";
import { expedienteAxaReconstruccion } from "../apps/web/src/lib/axa-reconstruccion.ts";
import {
  conHipotesis,
  especDeExpediente,
  interpretarResultado,
  reconstruccionContraCesvi,
} from "../packages/cesvi/src/index.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = process.argv[2] ?? join(RAIZ, "eval/results/axa_multiarranque.json");
const r2 = (x: number) => Math.round(x * 100) / 100;
const ms = (f: () => unknown) => {
  const t0 = performance.now();
  const r = f();
  return [r, Math.round(performance.now() - t0)] as const;
};
const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const k = (s.length - 1) / 2;
  return r2((s[Math.floor(k)]! + s[Math.ceil(k)]!) / 2);
};

const e = expedienteAxaReconstruccion();
const base = especDeExpediente(e);
const semillaApp = Number((base.spec.meta as Json).semilla);
const ids = base.ids as Record<string, string>;
const sid = (id: string) => Object.keys(ids).find((k) => ids[k] === id)!;

// --- antes: lo medido sin multiarranque ---------------------------------------------------------
const previo = JSON.parse(readFileSync(join(RAIZ, "eval/results/axa_semillas.json"), "utf8")) as {
  git_commit: string;
  con_dos_hipotesis: number;
  con_una_hipotesis: number;
  V2: Json;
  V1: Json;
  filas: { semilla: number; principal: { V2: { mejor: number } | null }; ms: number }[];
};
const antes = {
  fuente: "eval/results/axa_semillas.json",
  git_commit: previo.git_commit,
  con_la_semilla_de_la_app: previo.filas[0]!.principal.V2,
  V2_entre_20_semillas: previo.V2,
  V1_entre_20_semillas: previo.V1,
  con_dos_hipotesis: previo.con_dos_hipotesis,
  con_una_hipotesis: previo.con_una_hipotesis,
  resultado_completo_ms_mediana: mediana(previo.filas.map((f) => f.ms)),
};

// --- después, con la semilla de la app ----------------------------------------------------------
const spec = base.spec as Json;
// La escena tal cual, para medir el tiempo en el navegador (`eval/axa_tiempo_navegador.mjs`).
writeFileSync(join(RAIZ, "eval/results/axa_spec_app.json"), `${JSON.stringify(spec)}\n`);
const [, tRec] = ms(() => reconstruct(spec));
const [, tMc] = ms(() => monteCarlo(spec));
const [invDano, tDano] = ms(() => invert(spec));
const [flags, tCons] = ms(() => checkConsistency(spec, { inversion: invDano }));
const conReposo = flags.some((f) => f.codigo === "reposo_supuesto_vs_dano");
const [invReposo, tReposo] = conReposo
  ? ms(() => invert(spec, { assumedAsData: true }))
  : ([null, 0] as const);
const [resultado, tTotal] = ms(() => fullResult(spec));
const r = interpretarResultado(base, resultado);

const modos = (inv: ReturnType<typeof invert> | null) =>
  inv
    ? ((inv.toDict().multiarranque as { modos: Json[] }).modos.map((m) => ({
        ...m,
        valores: Object.fromEntries(
          (m.valores as { nombre: string; valor: number }[]).map((v) => [
            v.nombre.replace(/veh-[a-z]+$/, (x) => ids[x] ?? x),
            v.valor,
          ]),
        ),
      })) as Json[])
    : null;

/** Lo que ve el perito con una hipótesis: sus velocidades con rango y el paso 6 contra CESVI. */
const vista = (clave: string | null) => {
  const rr = clave ? conHipotesis(r, clave) : r;
  const contra = reconstruccionContraCesvi(e, rr);
  return {
    velocidades: Object.fromEntries(
      rr.velocidades.map((v) => [
        v.vehiculo,
        v.previa
          ? {
              kmh: r2(v.previa.mejor),
              p10: v.previa.p10 ?? null,
              p90: v.previa.p90 ?? null,
            }
          : null,
      ]),
    ),
    contra_cesvi: contra.filas.map((f) => ({
      metodo: f.metodo,
      cesvi_kmh: f.cesviKmh,
      croquis_kmh: f.croquisKmh === null ? null : r2(f.croquisKmh),
      croquis_p10_p90: f.croquisRango,
      diferencia_kmh: f.diferenciaKmh === null ? null : r2(f.diferenciaKmh),
      diferencia_pct: f.diferenciaPct === null ? null : r2(f.diferenciaPct),
    })),
  };
};

const hipotesis = (r.hipotesis ?? []).map((h) => ({
  clave: h.clave,
  titulo: h.titulo,
  costo: h.costo,
  reposos: h.reposos,
  alcanza_dano: h.alcanzaDano,
  ...vista(h.clave),
}));
const elegida = vista(null);
console.log("modos daño", JSON.stringify(modos(invDano)));
console.log("modos reposo", JSON.stringify(modos(invReposo)));
console.log("elegida", JSON.stringify(elegida));

// --- 20 semillas de la escena: la solución elegida no cambia; el rango, por el muestreo ---------
const SEMILLAS = [semillaApp, ...Array.from({ length: 19 }, (_, k) => k + 1)];
const porSemilla = SEMILLAS.map((semilla) => {
  const s = structuredClone(spec);
  (s.meta as Json).semilla = semilla;
  const [res, t] = ms(() => fullResult(s));
  const rs = interpretarResultado({ ...base, spec: s }, res);
  const v = (id: string) => rs.velocidades.find((x) => x.vehiculo === id)?.previa ?? null;
  const fila = {
    semilla,
    hipotesis: rs.hipotesis?.map((h) => h.clave) ?? [],
    V2: v("V2"),
    V1: v("V1"),
    ms: t,
  };
  console.log(JSON.stringify({ semilla, h: fila.hipotesis, V2: fila.V2, V1: fila.V1, ms: t }));
  return fila;
});
const resumenSemillas = (id: "V2" | "V1") => {
  const xs = porSemilla.map((f) => f[id]).filter((x) => x !== null);
  const p10 = xs.map((x) => x.p10!);
  const p90 = xs.map((x) => x.p90!);
  return {
    mejor_distintos: [...new Set(xs.map((x) => x.mejor))],
    p10_min: Math.min(...p10),
    p10_max: Math.max(...p10),
    p90_min: Math.min(...p90),
    p90_max: Math.max(...p90),
  };
};

// --- 5 semillas de la evidencia: cuánto cambia la elegida ---------------------------------------
const porSemillaEvidencia = [0, 1, 2, 3, 4].map((evidenceSeed) => {
  const inv = invert(spec, { evidenceSeed });
  const best = (id: string) => {
    const p = inv.estimates.find((x) => x.param.name === `velocidad:${sid(id)}`);
    return p?.best === null || p?.best === undefined ? null : r2(p.best);
  };
  const fila = { semilla_evidencia: evidenceSeed, V2: best("V2"), V1: best("V1") };
  console.log(JSON.stringify(fila));
  return fila;
});
const v2Ev = porSemillaEvidencia.map((f) => f.V2).filter((x) => x !== null);

const doc = {
  name: "axa_multiarranque",
  generated_at: new Date().toISOString().slice(0, 19) + "Z",
  git_commit: execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim(),
  descripcion:
    "AXA A2010930 como la reconstruye la app (reposo de V2 supuesto), antes y después del multiarranque determinista de la inversión: modos con su costo, la solución elegida y su p10–p90, las hipótesis del paso 4, la comparación con CESVI y el tiempo.",
  semilla_app: semillaApp,
  antes,
  despues: {
    modos: { dano: modos(invDano), reposo: modos(invReposo) },
    elegida,
    hipotesis,
    tiempos_ms_node: {
      reconstruccion: tRec,
      monte_carlo: tMc,
      inversion_dano: tDano,
      consistencia: tCons,
      inversion_reposo: tReposo,
      resultado_completo: tTotal,
    },
  },
  semillas_de_la_escena: {
    semillas: SEMILLAS,
    V2: resumenSemillas("V2"),
    V1: resumenSemillas("V1"),
    hipotesis_distintas: [...new Set(porSemilla.map((f) => f.hipotesis.join(",")))],
    resultado_completo_ms_mediana: mediana(porSemilla.map((f) => f.ms)),
    filas: porSemilla,
  },
  semillas_de_la_evidencia: {
    filas: porSemillaEvidencia,
    V2_min: Math.min(...v2Ev),
    V2_max: Math.max(...v2Ev),
  },
};
writeFileSync(SALIDA, `${JSON.stringify(doc, null, 1)}\n`);
const { filas: _f, ...corto } = doc.semillas_de_la_escena;
console.log(JSON.stringify({ ...doc, semillas_de_la_escena: corto }, null, 1).slice(0, 6000));
