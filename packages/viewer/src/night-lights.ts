/**
 * Luces reales de noche (PLAN §7.1, F8b): faros con cono de luz y alumbrado público.
 *
 * - Faros: un foco por vehículo con luces, con la misma apertura que usa el solver para decidir
 *   qué se ve de noche (semiángulo de 30°, `visibility.py`). Sin `luces_encendidas` declarado,
 *   las luces van encendidas, como en el solver. Los estacionados van apagados.
 * - Alumbrado: un foco hacia abajo en cada poste de la escena, solo si la escena declara
 *   alumbrado público. Si no hay postes, el alumbrado sigue siendo la luz ambiental cálida: no se
 *   inventan postes que la escena no tiene.
 *
 * Cada luz cuesta en cada pixel que toca, así que hay un tope por nivel de calidad (E6): en baja
 * solo brillan los materiales; en media y alta, los vehículos involucrados y los postes más
 * cercanos a la acción. Intensidades (candelas de three.js) calibradas contra la luz ambiental de
 * la escena, que tampoco es fotométrica: un faro da a 20 m más o menos lo mismo que la ambiental
 * (E = I/d²) y una luminaria a 8 m de alto, un poco más bajo ella. Son ilustrativas.
 */
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { actionBounds } from "./cameras";
import type { QualityLevel } from "./quality";

/** Semiángulo del cono de los faros: el mismo de la visibilidad nocturna del solver. */
export const HEADLIGHT_HALF_ANGLE_DEG = 30;
/** Hasta dónde llega la luz de los faros en la escena (m). */
export const HEADLIGHT_RANGE_M = 70;
export const HEADLIGHT_INTENSITY = 600;
export const STREETLIGHT_HALF_ANGLE_DEG = 55;
export const STREETLIGHT_RANGE_M = 35;
export const STREETLIGHT_INTENSITY = 220;

export const NIGHT_LIGHT_BUDGET: Record<QualityLevel, { vehicles: number; poles: number }> = {
  baja: { vehicles: 0, poles: 0 },
  media: { vehicles: 2, poles: 2 },
  alta: { vehicles: 4, poles: 4 },
  // Ultra: todos los vehículos con faros encendidos y todos los postes.
  ultra: { vehicles: Number.POSITIVE_INFINITY, poles: Number.POSITIVE_INFINITY },
};

/** ¿El vehículo lleva las luces encendidas? Sin dato, sí (como el solver). */
export function headlightsOn(spec: EscenaSpec, vehicleId: string): boolean {
  const v = spec.vehiculos.find((x) => x.id === vehicleId);
  const f = v?.luces_encendidas;
  return f === undefined ? true : Boolean(f.valor);
}

export interface NightLightPlan {
  /** Vehículos que llevan foco, en orden. */
  vehicles: string[];
  /** Postes que llevan foco, del más cercano a la acción al más lejano. */
  poles: string[];
}

export function planNightLights(
  spec: EscenaSpec,
  resultado: Resultado,
  env: { night: boolean; streetLights: boolean },
  quality: QualityLevel,
): NightLightPlan {
  if (!env.night) return { vehicles: [], poles: [] };
  const budget = NIGHT_LIGHT_BUDGET[quality];
  const lit = resultado.vehiculos.filter((v) => headlightsOn(spec, v.id));
  // Primero los involucrados (son los que importan en la escena).
  const ordered = [...lit.filter((v) => v.involucrado), ...lit.filter((v) => !v.involucrado)];
  const vehicles = ordered.slice(0, budget.vehicles).map((v) => v.id);
  let poles: string[] = [];
  if (env.streetLights && budget.poles > 0) {
    const b = actionBounds(resultado);
    poles = (spec.entorno.objetos ?? [])
      .filter((o) => o.tipo === "poste")
      .map((o) => ({ id: o.id, d: Math.hypot(o.posicion.x - b.cx, o.posicion.y - b.cy) }))
      .sort((a, c) => a.d - c.d || a.id.localeCompare(c.id))
      .slice(0, budget.poles)
      .map((p) => p.id);
  }
  return { vehicles, poles };
}
