/**
 * Textos del caso que dependen de un número o de un método (René, 2026-11-04, prompt del rediseño
 * §0): pluralización, «sin dato» en vez de 0 y el método junto a cada velocidad.
 */

/** «1 mensaje», «2 mensajes»; `plural` por omisión agrega «s». */
export function plural(n: number, singular: string, pluralForma = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

/**
 * Posiciones finales contra el reporte: si el reporte no trae ninguna, no hay comparación
 * («Croquis tiene 0 de 0» parecía un resultado).
 */
export function textoPosicionesFinales(p: { cesvi: number; croquis_las_tiene: number }): string {
  if (p.cesvi === 0) return "Sin dato en el reporte · no comparable";
  return `Croquis tiene ${p.croquis_las_tiene} de ${p.cesvi}`;
}

/**
 * Los métodos de las velocidades, para ponerlos junto a cada cifra: una velocidad de la
 * reconstrucción física de Croquis y una del método de CESVI no miden lo mismo (V2 de AXA: la
 * reconstrucción y 63.90 km/h por McHenry).
 */
export const METODO = {
  reconstruccion: "Reconstrucción física de Croquis",
  reconstruccionDetalle:
    "inversión con las trayectorias, el impulso del choque y la evidencia del perito",
  cesvi: "Método de CESVI",
  cesviDetalle: "energía de deformación (McHenry) y velocidad equivalente de barrera (EBS)",
} as const;

/** Qué es cada velocidad de la reconstrucción. */
export const DEFINICION = {
  previa: "velocidad previa: la que traía antes de frenar o del primer contacto",
  impacto: "al contacto: la que traía en el instante del impacto",
} as const;
