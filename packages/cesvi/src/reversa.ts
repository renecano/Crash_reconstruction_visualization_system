/**
 * T3.3 (W8, ADR 0136): lo que Croquis supone de una reversa cuando el perito no lo dice, con su
 * fuente. La velocidad sale de las maniobras de reversa medidas en uso real por NHTSA
 * (`data/reversa-nhtsa.json`, registrada en `data/SOURCES.md`), no del valor por omisión de un
 * vehículo que avanza.
 */
import tabla from "./data/reversa-nhtsa.json";
import type { Expediente } from "./corpus";
import { kmhConUnidad } from "./formato";

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
    nota: `Supuesto: mediana de la velocidad máxima en ${REVERSA_MANIOBRAS} maniobras de reversa en uso real (${REVERSA_FUENTE}); el rango es donde cae el 80 % de las maniobras.`,
    // Pesa como supuesto con su rango, como la velocidad narrada: si la evidencia no la saca de ahí,
    // la reversa queda en lo medido por NHTSA (René, 2026-11-26: el CR-V daba de 0 a 17 km/h sin
    // evidencia de más de 9). Si la evidencia la saca, lo dice `avisoReversaRapida`.
    a_priori: true,
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
  return `${vehiculo}: ${kmhConUnidad(velocidadKmh, "reconstruccion")} en reversa es más que la maniobra más rápida de ${REVERSA_MANIOBRAS} medidas en uso real (${REVERSA_KMH.max} km/h; ${REVERSA_FUENTE}). Conviene revisar el sentido de marcha y las posiciones finales.`;
}

/**
 * ¿La narración dice que el vehículo iba en reversa? (Como la lectura de `especDeExpediente`: una
 * maniobra de reversa o un sentido de marcha en reversa.)
 */
export function vaEnReversa(e: Expediente, vehiculo: string): boolean {
  const narradas = (e.versiones ?? []).find((v) => v.tipo === "evidencia")?.maniobras ?? [];
  return narradas.some(
    (m) => m.vehiculo === vehiculo && (m.tipo === "reversa" || m.sentido_marcha === "reversa"),
  );
}

/**
 * La pose guarda hacia dónde mira el frente; «Por dónde venía», hacia dónde avanzaba. En reversa son
 * contrarios (René, 2026-11-24: la reversa de ejemplo dejaba al CR-V mirando hacia donde retrocedía,
 * del lado equivocado del Versa, y el 3D lo metía dentro de él). La conversión va y vuelve igual.
 */
export function rumboDeMarcha(e: Expediente, vehiculo: string, rumbo: number): number {
  return vaEnReversa(e, vehiculo) ? (((rumbo + 180) % 360) + 360) % 360 : rumbo;
}

/** Cuánto gira el frente entre la llegada y el choque, por la maniobra narrada (0° = norte, horario). */
function giroNarrado(e: Expediente, vehiculo: string): number {
  if (vaEnReversa(e, vehiculo)) return 0;
  const narradas = (e.versiones ?? []).find((v) => v.tipo === "evidencia")?.maniobras ?? [];
  const m = narradas.find((x) => x.vehiculo === vehiculo && /^vira_/.test(x.tipo));
  return m?.tipo === "vira_derecha" ? 90 : m?.tipo === "vira_izquierda" ? -90 : 0;
}

const norm360 = (r: number) => ((r % 360) + 360) % 360;

/**
 * «Por dónde venía» (hacia dónde avanzaba al llegar) → el rumbo del frente en el choque: en reversa,
 * el contrario; quien da vuelta, ya con la vuelta dada (René, 2026-11-24: el camión que venía del sur
 * y daba vuelta a la derecha quedaba mirando al norte en el choque, y el solver trazaba la vuelta
 * desde el oriente, donde no había calle).
 */
export function rumboDelFrente(e: Expediente, vehiculo: string, llegada: number): number {
  return norm360(rumboDeMarcha(e, vehiculo, llegada + giroNarrado(e, vehiculo)));
}

/** Lo contrario de `rumboDelFrente`: de la pose del choque, por dónde venía. */
export function rumboDeLlegada(e: Expediente, vehiculo: string, frente: number): number {
  return norm360(rumboDeMarcha(e, vehiculo, frente) - giroNarrado(e, vehiculo));
}
