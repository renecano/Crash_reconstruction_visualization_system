/**
 * Los tres supuestos del impacto, con su rango (auditoría del 2026-11-15, C5; ADR 0139). Port de
 * `solver/croquis_solver/impact_assumptions.py`, con los mismos números.
 *
 * El solver fijaba la restitución, la razón de impulso y el arrastre después del impacto en un solo
 * valor. Aquí están con su valor nominal (el de siempre: el mejor ajuste no cambia) y el rango en el
 * que el Monte Carlo y la inversión los sortean, cada uno con su fuente:
 *
 * - **Restitución** entre vehículos: nominal 0.1; rango 0 a 0.3 (Brach, Brach y Pongetti 2014, SAE
 *   2014-01-0469: 0 a 0.3 en 40 pruebas contra barrera, media 0.13; 0 a 0.2 en 9 entre vehículos,
 *   media 0.06).
 * - **Razón de impulso:** nominal 0.4; rango 0.29 a 0.49. La literatura no tabula un rango absoluto:
 *   se arma con la razón crítica medida en cuatro pruebas oblicuas (0.40 a 0.51; SAE 2021-01-0896)
 *   por la fracción de la crítica en los choques que deslizan (72 % a 96 %; SAE 2014-01-0469). Es un
 *   supuesto declarado, con esa justificación.
 * - **Arrastre después del impacto,** como fracción de la fricción llanta–pavimento: nominal 0.35;
 *   rango 0.3 a 0.5 (Fricke 2010).
 *
 * Se sortean con un hipercubo latino aparte y de diseño fijo, como los supuestos del tope
 * (`bumpSampler`): los sorteos de los demás campos son los de siempre y el rango no depende de la
 * semilla de la escena (T3.1, ADR 0100). Los valores sorteados viajan en memoria en
 * `lugar._supuestos_impacto`, que no es del contrato y nunca se guarda.
 */
import { PyRandom } from "./pyrandom";
import { type Draws, LatinHypercube } from "./stratified";

type Json = Record<string, unknown>;

// [nominal, mínimo, máximo]
export const RESTITUTION = [0.1, 0.0, 0.3] as const;
export const IMPULSE_RATIO_RANGE = [0.4, 0.29, 0.49] as const;
export const POST_IMPACT_DRAG = [0.35, 0.3, 0.5] as const;

export const RESTITUTION_SOURCE =
  "Brach, Brach y Pongetti 2014 (SAE 2014-01-0469): 0 a 0.3 en 40 pruebas contra barrera, " +
  "0 a 0.2 en 9 entre vehículos";
export const IMPULSE_RATIO_SOURCE =
  "supuesto declarado: razón crítica de 0.40 a 0.51 en pruebas oblicuas (SAE 2021-01-0896) por " +
  "72 % a 96 % de la crítica en choques que deslizan (SAE 2014-01-0469)";
export const POST_IMPACT_DRAG_SOURCE = "Fricke 2010: de 0.3 a 0.5 de la fricción llanta–pavimento";

/** Llave en memoria de `lugar` con los tres valores sorteados; no es del contrato. */
export const IMPACT_SAMPLED = "_supuestos_impacto";
/** Semilla del diseño del hipercubo de los tres supuestos: fija, no la de la escena. */
export const IMPACT_DESIGN_SEED = 20_261_115;
export const IMPACT_NOTE = "supuesto con rango de la literatura; hipercubo aparte de diseño fijo";

/** Los tres supuestos con los que se integra un impacto y lo que sigue. */
export interface ImpactAssumptions {
  restitution: number;
  impulseRatio: number;
  dragFraction: number;
}

/** Los supuestos de esta reconstrucción: los sorteados si los hay; si no, los nominales. */
export function impactAssumptions(lugar: Json): ImpactAssumptions {
  const sampled = (lugar[IMPACT_SAMPLED] ?? {}) as Json;
  return {
    restitution: Number(sampled.restitucion ?? RESTITUTION[0]),
    impulseRatio: Number(sampled.razon_impulso ?? IMPULSE_RATIO_RANGE[0]),
    dragFraction: Number(sampled.arrastre ?? POST_IMPACT_DRAG[0]),
  };
}

/** El hipercubo aparte de los tres supuestos (3 dimensiones); null sin muestras. */
export function impactSampler(samples: number): LatinHypercube | null {
  if (samples <= 0) return null;
  return new LatinHypercube(samples, 3, new PyRandom(IMPACT_DESIGN_SEED));
}

/** Sortea los tres en su rango y los adjunta a `lugar` de `spec` (en sitio). */
export function sampleImpactAssumptions(spec: Json, draws: Draws): void {
  const restitucion = draws.uniform(RESTITUTION[1], RESTITUTION[2]);
  const razon = draws.uniform(IMPULSE_RATIO_RANGE[1], IMPULSE_RATIO_RANGE[2]);
  const arrastre = draws.uniform(POST_IMPACT_DRAG[1], POST_IMPACT_DRAG[2]);
  (spec.lugar as Json)[IMPACT_SAMPLED] = { restitucion, razon_impulso: razon, arrastre };
}
