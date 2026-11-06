/**
 * El acto de la reconstrucción en el rediseño «Laboratorio» (prompt §8): la cifra protagonista, el
 * histograma de las simulaciones reales y lo que significa cada percentil. Sale de la inversión del
 * solver; si no fija una velocidad, se dice y no se muestra un número.
 */
import type { Reconstruccion, VelocidadReconstruida } from "@croquis/cesvi";

/**
 * El vehículo protagonista: el más rápido al impacto entre los que la evidencia fija (el que llega,
 * en un alcance). null si la evidencia no fija ninguno.
 */
export function protagonista(r: Reconstruccion): VelocidadReconstruida | null {
  const fijados = r.velocidades.filter((v) => v.impacto?.p50 !== undefined);
  if (!fijados.length) return null;
  return fijados.reduce((a, b) => ((b.impacto!.p50 ?? 0) > (a.impacto!.p50 ?? 0) ? b : a));
}

export interface BarraHistograma {
  /** El km/h donde empieza la barra (cada una mide 1 km/h). */
  desde: number;
  n: number;
  /** ¿Cae dentro de p10–p90? */
  enRango: boolean;
}

/**
 * El histograma: una barra por km/h entre el mínimo y el máximo de las simulaciones. Las del rango
 * p10–p90 van marcadas. Vacío si no hay valores (reconstrucciones guardadas sin ellos).
 */
export function histograma(
  valores: readonly number[],
  p10: number | undefined,
  p90: number | undefined,
): BarraHistograma[] {
  if (!valores.length) return [];
  const min = Math.floor(Math.min(...valores));
  const max = Math.floor(Math.max(...valores));
  const barras: BarraHistograma[] = [];
  for (let k = min; k <= max; k++) {
    barras.push({
      desde: k,
      n: 0,
      enRango: p10 !== undefined && p90 !== undefined && k + 1 > p10 && k <= p90,
    });
  }
  for (const v of valores) barras[Math.floor(v) - min]!.n++;
  return barras;
}

/** Las marcas del eje del histograma: cada 5 km/h (cada 2 si el rango es angosto). */
export function marcasDelEje(barras: readonly BarraHistograma[]): number[] {
  if (!barras.length) return [];
  const ini = barras[0]!.desde;
  const fin = barras.at(-1)!.desde + 1;
  const paso = fin - ini <= 8 ? 2 : 5;
  const out: number[] = [];
  for (let k = Math.ceil(ini / paso) * paso; k <= fin; k += paso) out.push(k);
  return out;
}

const fmt = (x: number) => x.toFixed(1);

/** Qué significa cada percentil, en una frase. */
export function frasePercentil(cual: "p10" | "p50" | "p90", valor: number): string {
  if (cual === "p10") return `9 de cada 10 simulaciones dan más de ${fmt(valor)} km/h.`;
  if (cual === "p50") return `La mitad queda abajo de ${fmt(valor)} km/h y la mitad arriba.`;
  return `9 de cada 10 simulaciones dan menos de ${fmt(valor)} km/h.`;
}

/** La barra del histograma, en palabras (para su etiqueta). */
export function textoBarra(b: BarraHistograma): string {
  const sim = `${b.n} ${b.n === 1 ? "simulación" : "simulaciones"}`;
  return `${b.desde}–${b.desde + 1} km/h: ${sim}, ${b.enRango ? "dentro" : "fuera"} de p10–p90`;
}
