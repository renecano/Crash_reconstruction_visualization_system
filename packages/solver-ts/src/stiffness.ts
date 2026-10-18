/**
 * Coeficientes de rigidez CRASH3 por clase de vehículo y zona (port de
 * `croquis_solver.stiffness`; tabla escrita por E2 desde pruebas de NHTSA). Sin datos para la clase
 * o la zona se usa el respaldo genérico marcado `supuesto`.
 *
 * El muestreo de rigidez (bootstrap) lo usa la inversión (F9).
 */
import { Stiffness } from "./crash3";
import type { PyRandom } from "./pyrandom";
import table from "./data/stiffness_classes.json";
import * as dmath from "./dmath";

export const FALLBACK = Stiffness.fromKgfCm(55.0, 36.0);
export const ZONAS = ["frontal", "trasera", "lateral"] as const;
export const FALLBACK_SLOPE_RANGE = [0.7, 1.4] as const;

export interface StiffnessEntry {
  stiffness: Stiffness;
  /** "nhtsa" | "supuesto" */
  origen: string;
  nTests: number;
  nota: string;
  /** Coeficientes (A, B) de cada prueba de la clase: se muestrean juntos (bootstrap). */
  samples: readonly Stiffness[];
}

interface RawEntry {
  a_n_m?: number;
  b_n_m2?: number;
  origen?: string;
  n_tests?: number;
  nota?: string;
  muestras_ab?: [number, number][];
}

const CLASES = (table as unknown as { clases?: Record<string, Record<string, RawEntry>> }).clases;

/** Rigidez para la clase y zona; respaldo `supuesto` si no hay datos. */
export function stiffnessFor(clase: string, zona = "frontal"): StiffnessEntry {
  if (!(ZONAS as readonly string[]).includes(zona)) throw new Error(`Zona desconocida: ${zona}`);
  const entry = CLASES?.[clase]?.[zona];
  if (entry?.a_n_m && entry.b_n_m2) {
    return {
      stiffness: new Stiffness(entry.a_n_m, entry.b_n_m2),
      origen: entry.origen ?? "nhtsa",
      nTests: entry.n_tests ?? 0,
      nota: entry.nota ?? "",
      samples: (entry.muestras_ab ?? []).map(([a, b]) => new Stiffness(a, b)),
    };
  }
  return {
    stiffness: FALLBACK,
    origen: "supuesto",
    nTests: 0,
    nota: `Sin coeficientes medidos para ${clase}/${zona}; se usa el respaldo genérico.`,
    samples: [],
  };
}

/**
 * `n` coeficientes plausibles para la clase (port de `sample_stiffness`): bootstrap de sus pruebas
 * o, sin pruebas, el respaldo con la pendiente escalada en `FALLBACK_SLOPE_RANGE`.
 */
export function sampleStiffness(entry: StiffnessEntry, rng: PyRandom, n: number): Stiffness[] {
  const out: Stiffness[] = [];
  if (entry.samples.length > 0) {
    for (let i = 0; i < n; i++) out.push(entry.samples[rng.randrange(entry.samples.length)]!);
    return out;
  }
  const lo = dmath.log(FALLBACK_SLOPE_RANGE[0]);
  const hi = dmath.log(FALLBACK_SLOPE_RANGE[1]);
  for (let i = 0; i < n; i++) {
    const s = dmath.exp(rng.uniform(lo, hi));
    out.push(new Stiffness(entry.stiffness.a * s, entry.stiffness.b * s * s));
  }
  return out;
}

export function zonaFromCdcSide(lado: string): string {
  return (
    ({ F: "frontal", B: "trasera", L: "lateral", R: "lateral" } as Record<string, string>)[lado] ??
    "frontal"
  );
}
