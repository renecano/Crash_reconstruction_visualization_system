/**
 * T3.3 (W8, ADR 0136): lo que Croquis supone de una reversa cuando el perito no lo dice, con su
 * fuente. La velocidad sale de las maniobras de reversa medidas en uso real por NHTSA
 * (`data/reversa-nhtsa.json`, registrada en `data/SOURCES.md`), no del valor por omisión de un
 * vehículo que avanza.
 */
import tabla from "./data/reversa-nhtsa.json";

const MPH_A_KMH = 1.609344;
const kmh = (mph: number) => Math.round(mph * MPH_A_KMH * 100) / 100;
const q = tabla.velocidad_maxima_mph;

/** La velocidad máxima de una maniobra de reversa en uso real, en km/h (NHTSA, tabla 10). */
export const REVERSA_KMH = {
  p10: kmh(q.p10),
  p50: kmh(q.p50),
  p90: kmh(q.p90),
  /** La más rápida de las maniobras medidas. */
  max: kmh(q.max),
} as const;

/** Cuántas maniobras tiene la tabla de cuantiles, como se escribe en los avisos. */
export const REVERSA_MANIOBRAS = "6 037";
export const REVERSA_FUENTE = "NHTSA, DOT HS 811 024";

/**
 * La velocidad previa de un vehículo en reversa que el perito no dio: la mediana, con el p10–p90
 * como rango. Es un supuesto declarado; el Monte Carlo sortea dentro del rango.
 */
export function velocidadSupuestaEnReversa(): Record<string, unknown> {
  return {
    valor: REVERSA_KMH.p50,
    unidad: "km/h",
    rango: [REVERSA_KMH.p10, REVERSA_KMH.p90],
    fuente: "supuesto",
    confianza: 0.5,
    nota: `Supuesto: mediana de la velocidad máxima en ${REVERSA_MANIOBRAS} maniobras de reversa en uso real (${REVERSA_FUENTE}); rango p10–p90.`,
  };
}

/** El límite que se le dice al perito cuando la velocidad en reversa es un supuesto. */
export function limiteVelocidadSupuesta(vehiculo: string): string {
  return `${vehiculo} va en reversa y la narración no dice a qué velocidad: se suponen ${REVERSA_KMH.p50} km/h (de ${REVERSA_KMH.p10} a ${REVERSA_KMH.p90}), lo que se mide en maniobras de reversa en uso real (${REVERSA_FUENTE}).`;
}

/**
 * El aviso cuando una reversa sale más rápida que cualquiera de las medidas: no dice que no fue una
 * reversa, dice qué conviene revisar.
 */
export function avisoReversaRapida(vehiculo: string, velocidadKmh: number): string | null {
  if (!(velocidadKmh > REVERSA_KMH.max)) return null;
  return `${vehiculo}: ${velocidadKmh.toFixed(1)} km/h en reversa es más que la maniobra más rápida de ${REVERSA_MANIOBRAS} medidas en uso real (${REVERSA_KMH.max} km/h; ${REVERSA_FUENTE}). Conviene revisar el sentido de marcha y las posiciones finales.`;
}
