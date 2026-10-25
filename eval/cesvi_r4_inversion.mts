/**
 * E-R4 con la inversión del solver (ADR 0091, pedido de René del 2026-10-24): la regla «lo medido
 * pesa más que lo supuesto» cambia lo que reconstruye el solver, y E-R4 compara la verificación
 * CESVI de Croquis (EBS), no el solver. Esta medición toma la misma prueba congelada (205
 * narraciones sin conclusiones, lecturas v2 grabadas: sin API) y compara lo que reconstruye el
 * solver con lo que concluyó CESVI:
 *
 * - **Velocidades:** cada velocidad del dictamen con vehículo, contra la velocidad previa que fija la
 *   inversión para ese vehículo (km/h y %). Solo cuenta si la evidencia la fija.
 * - **Impactos:** cuántos ocurren en la reconstrucción contra los de la secuencia de CESVI, y si el
 *   primero es entre los mismos vehículos.
 * - **Banderas** de consistencia y evidencia usada.
 *
 * Solo usa funciones que ya estaban en `main` antes de la regla, para medir el antes con el mismo
 * script (`git switch --detach <commit>` y correrlo sin tocarlo):
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/cesvi_r4_inversion.mts <salida.json>
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SalidaCorpus } from "../packages/cesvi/src/corpus";
import { escenaDeNarracion } from "../packages/cesvi/src/escena-narracion";
import { reconstruirExpediente } from "../packages/cesvi/src/reconstruccion";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = process.argv[2] ?? join(RAIZ, "eval/results/cesvi_r4_inversion.json");
const CORPUS = join(RAIZ, "data/cesvi/corpus");
const LECTURAS = join(RAIZ, "data/cesvi/r4/lecturas-v2.jsonl");

interface Narracion {
  id: string;
  descripcion: string;
  fugas: string[];
  solo_conclusiones: boolean;
  conclusiones: {
    secuencia: { orden: number; participantes: string[]; objeto_fijo?: string }[];
    velocidades: { vehiculo: string | null; kmh: number; que: string }[];
  };
}
const jsonl = <T,>(p: string): T[] =>
  existsSync(p)
    ? readFileSync(p, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as T)
    : [];
const r2 = (x: number) => Math.round(x * 100) / 100;
const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return r2(s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2);
};

const prueba = new Set(
  (JSON.parse(readFileSync(join(CORPUS, "particion.json"), "utf8")) as { prueba: string[] }).prueba,
);
const lecturas = new Map(
  jsonl<{ id: string; salida: SalidaCorpus }>(LECTURAS).map((l) => [l.id, l]),
);
const casos = jsonl<Narracion>(join(CORPUS, "narraciones.jsonl")).filter(
  (n) => prueba.has(n.id) && !n.fugas.length && !n.solo_conclusiones && lecturas.has(n.id),
);

const filas = casos.map((n) => {
  const escena = escenaDeNarracion(lecturas.get(n.id)!.salida, n.descripcion);
  try {
    const r = reconstruirExpediente(escena.expediente, n.id);
    const previa = new Map(r.velocidades.map((v) => [v.vehiculo, v.previa?.mejor ?? null]));
    const velocidades = n.conclusiones.velocidades
      .filter((v) => v.vehiculo && v.vehiculo !== "ninguno" && Number.isFinite(v.kmh))
      .map((v) => {
        const k = previa.get(v.vehiculo as never) ?? null;
        return {
          vehiculo: v.vehiculo,
          que: v.que,
          cesvi_kmh: v.kmh,
          solver_kmh: k === null ? null : r2(k),
          error_kmh: k === null ? null : r2(k - v.kmh),
          error_pct: k === null ? null : r2(((k - v.kmh) / v.kmh) * 100),
        };
      });
    const sc = [...n.conclusiones.secuencia].sort((a, b) => a.orden - b.orden);
    const primeroCesvi = sc[0] ? [...sc[0].participantes].sort().join(",") : null;
    const primeroSolver = r.impactos[0] ? [...r.impactos[0].vehiculos].sort().join(",") : null;
    const consistencia = ((r.resultado.consistencia ?? []) as { codigo: string }[]).map(
      (b) => b.codigo,
    );
    return {
      id: n.id,
      reconstruida: true,
      evidencia: r.evidencia,
      velocidades_fijadas: r.velocidades.filter((v) => v.previa).length,
      velocidades,
      impactos: {
        cesvi: sc.length,
        solver: r.impactos.length,
        mismo_numero: sc.length ? sc.length === r.impactos.length : null,
        primero_coincide: primeroCesvi && primeroSolver ? primeroCesvi === primeroSolver : null,
      },
      consistencia,
    };
  } catch (e) {
    return { id: n.id, reconstruida: false, error: String(e).slice(0, 200) };
  }
});

type Fila = Extract<(typeof filas)[number], { reconstruida: true }>;
const ok = filas.filter((f): f is Fila => f.reconstruida);
const comparables = ok.flatMap((f) => f.velocidades.filter((v) => v.solver_kmh !== null));
const conImpactos = ok.filter((f) => f.impactos.mismo_numero !== null);
const conPrimero = ok.filter((f) => f.impactos.primero_coincide !== null);
const banderas: Record<string, number> = {};
for (const f of ok) for (const c of f.consistencia) banderas[c] = (banderas[c] ?? 0) + 1;
const pct = (k: number, n: number) => ({ k, n, pct: n ? r2((100 * k) / n) : null });

const doc = {
  name: "cesvi_r4_inversion",
  generated_at: new Date().toISOString().slice(0, 19) + "Z",
  git_commit: execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim(),
  descripcion:
    "E-R4 (prueba congelada, lecturas v2 grabadas) con lo que reconstruye el solver: velocidad previa de la inversión contra las velocidades del dictamen, impactos contra la secuencia de CESVI y banderas de consistencia.",
  narraciones: filas.length,
  reconstruidas: ok.length,
  con_evidencia: ok.filter((f) => f.evidencia.length).length,
  con_alguna_velocidad_fijada: ok.filter((f) => f.velocidades_fijadas > 0).length,
  velocidades: {
    del_dictamen_con_vehiculo: ok.reduce((a, f) => a + f.velocidades.length, 0),
    comparables: comparables.length,
    mediana_error_abs_kmh: mediana(comparables.map((v) => Math.abs(v.error_kmh!))),
    mediana_error_abs_pct: mediana(comparables.map((v) => Math.abs(v.error_pct!))),
  },
  impactos: {
    mismo_numero: pct(
      conImpactos.filter((f) => f.impactos.mismo_numero).length,
      conImpactos.length,
    ),
    primero_coincide: pct(
      conPrimero.filter((f) => f.impactos.primero_coincide).length,
      conPrimero.length,
    ),
  },
  banderas,
  detalle: filas,
};
writeFileSync(SALIDA, `${JSON.stringify(doc, null, 1)}\n`);
const { detalle: _d, ...resumen } = doc;
console.log(JSON.stringify(resumen, null, 1));
