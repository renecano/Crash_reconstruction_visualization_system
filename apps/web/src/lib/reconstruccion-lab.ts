/**
 * El acto de la reconstrucción en el rediseño «Laboratorio» (prompt §8): la cifra protagonista, el
 * histograma de las simulaciones reales y lo que significa cada percentil. Sale de la inversión del
 * solver; si no fija una velocidad, se dice y no se muestra un número.
 */
import type { Reconstruccion, VelocidadReconstruida } from "@croquis/cesvi";

/**
 * El vehículo protagonista: el más rápido entre los que la evidencia fija (el que llega, en un
 * alcance). null si la evidencia no fija ninguno.
 *
 * Su velocidad es el mejor ajuste (`previa.mejor`): la misma en todas las pantallas y en el PDF. La
 * mediana de las simulaciones es otra cantidad y se muestra aparte, con su nombre.
 */
export function protagonista(r: Reconstruccion): VelocidadReconstruida | null {
  const fijados = r.velocidades.filter((v) => v.previa);
  if (!fijados.length) return null;
  return fijados.reduce((a, b) => (b.previa!.mejor > a.previa!.mejor ? b : a));
}

export interface RangoDeVelocidad {
  p10: number;
  p90: number;
  /** Las muestras no se apartaron de la solución: es la aproximación lineal del solver. */
  lineal: boolean;
}

/** Por debajo de esto (km/h), el p10–p90 de las simulaciones no dice nada: son la misma velocidad. */
const SIN_DISPERSION_KMH = 0.05;

/** ¿Las simulaciones dan todas la misma velocidad al impacto? */
export function sinDispersion(v: VelocidadReconstruida): boolean {
  const i = v.impacto;
  if (i?.p10 === undefined || i.p90 === undefined) return false;
  return i.p90 - i.p10 < SIN_DISPERSION_KMH;
}

/**
 * El rango del mejor ajuste. Si las muestras no se apartaron de la solución (el costo tiene un
 * quiebre ahí, ADR 0091), el solver lo da por aproximación lineal, y se dice. null si no hay uno.
 */
export function rangoDeVelocidad(v: VelocidadReconstruida): RangoDeVelocidad | null {
  const p = v.previa;
  if (p?.p10 === undefined || p.p90 === undefined || p.p90 - p.p10 < SIN_DISPERSION_KMH)
    return null;
  return { p10: p.p10, p90: p.p90, lineal: p.rango_por === "laplace" };
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
  /** Otro valor que el eje debe abarcar (el mejor ajuste). */
  abarca?: number,
): BarraHistograma[] {
  if (!valores.length) return [];
  const conMarca = abarca === undefined ? valores : [...valores, abarca];
  const min = Math.floor(Math.min(...conMarca));
  const max = Math.floor(Math.max(...conMarca));
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

/** Dónde cae un valor en el eje del histograma, en %; null si queda afuera. */
export function posEnHistograma(barras: readonly BarraHistograma[], x: number): number | null {
  if (!barras.length) return null;
  const ini = barras[0]!.desde;
  const pos = ((x - ini) / barras.length) * 100;
  return pos < 0 || pos > 100 ? null : pos;
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

const fmt = (x: number) => x.toFixed(2);

/** Qué significa cada percentil de las simulaciones, en una frase. */
export function frasePercentil(cual: "p10" | "p50" | "p90", valor: number): string {
  if (cual === "p10") return `9 de cada 10 simulaciones dan más de ${fmt(valor)} km/h.`;
  if (cual === "p50")
    return `La mitad queda abajo de ${fmt(valor)} km/h y la mitad arriba: es la mediana de las simulaciones, no el mejor ajuste.`;
  return `9 de cada 10 simulaciones dan menos de ${fmt(valor)} km/h.`;
}

/** El tooltip de un vehículo en la escena: modelo, masa con su origen, su velocidad y su daño. */
export function tipVehiculo(d: {
  nombre: string;
  masaKg: number | null;
  masaDe: string | null;
  kmh: number | null;
  dano: string | null;
}): string {
  const masa =
    d.masaKg === null
      ? "masa: sin dato"
      : `masa ${d.masaKg.toLocaleString("en-US", { maximumFractionDigits: 1 })} kg${d.masaDe ? ` (${d.masaDe})` : ""}`;
  const v =
    d.kmh === null ? "la evidencia no fija su velocidad" : `antes del impacto ${fmt(d.kmh)} km/h`;
  return [d.nombre, masa, v, d.dano].filter(Boolean).join(" · ");
}

/** El tooltip del impacto: su instante, quién hace contacto y quién lo colocó. */
export function tipImpacto(contacto: string, fuente: string | null): string {
  const quien =
    fuente === "perito"
      ? "lo colocó el perito"
      : fuente === "supuesto"
        ? "supuesto de Croquis"
        : null;
  return ["Impacto · t 0.00 s", contacto, quien].filter(Boolean).join(" · ");
}

/** La barra del histograma, en palabras (para su etiqueta). */
export function textoBarra(b: BarraHistograma): string {
  const sim = `${b.n} ${b.n === 1 ? "simulación" : "simulaciones"}`;
  return `${b.desde}–${b.desde + 1} km/h: ${sim}, ${b.enRango ? "dentro" : "fuera"} de p10–p90`;
}
