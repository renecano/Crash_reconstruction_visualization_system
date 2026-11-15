/**
 * El único formateador de las cifras que lee el perito (auditoría del 2026-11-15, §3.3; decisión 5
 * de René; ADR 0138). Pantalla, PDF y Word escriben cada número con estas funciones: nadie más llama
 * a `toFixed` en el flujo de CESVI (`formato.test.ts` lo vigila).
 *
 * Dos precisiones, según de dónde sale la cifra:
 *
 * - **`reconstruccion`** — lo que concluye la reconstrucción física de Croquis: velocidades, sus
 *   rangos y sus diferencias. En **enteros**. El rango p10–p90 se mueve cerca de 1 km/h entre
 *   semillas (T3.1) y cambia varios km/h con los supuestos: dos decimales aparentaban una certeza
 *   que no hay.
 * - **`metodo`** — la tabla que reproduce el método de CESVI con los datos del reporte, y su
 *   comparación con lo que el reporte imprime: **dos decimales**, como los escribe CESVI, para que
 *   una diferencia de centésimas se vea.
 *
 * Las funciones reciben el número completo y solo redondean al escribir: los cálculos, los atributos
 * `data-*` y los JSON conservan toda la precisión.
 */

export const DECIMALES = { reconstruccion: 0, metodo: 2 } as const;
export type Precision = keyof typeof DECIMALES;

const MENOS = "−";
const RAYA = "–";
const SIN_DATO = "—";

/** `x` con `decimales` fijos. Un cero no lleva signo («−0» y «−0.00» se escriben «0» y «0.00»). */
export function fijo(x: number, decimales: number): string {
  const t = x.toFixed(decimales);
  return Number(t) === 0 ? t.replace("-", "") : t;
}

/** Como `fijo`, con el signo menos tipográfico («−3.2»), para texto que lee el perito. */
export function numero(x: number, decimales: number): string {
  return fijo(x, decimales).replace("-", MENOS);
}

/** `x` con su signo siempre a la vista: «+0.75», «−6». El cero va sin signo. */
export function conSigno(x: number, decimales: number): string {
  const t = fijo(Math.abs(x), decimales);
  if (Number(t) === 0) return t;
  return `${x > 0 ? "+" : MENOS}${t}`;
}

/** Una velocidad sin su unidad: «57» o «63.15»; «—» si no hay dato. */
export function kmh(x: number | null | undefined, precision: Precision): string {
  return x === null || x === undefined || !Number.isFinite(x)
    ? SIN_DATO
    : numero(x, DECIMALES[precision]);
}

/** Una velocidad con su unidad: «57 km/h» o «63.15 km/h». */
export function kmhConUnidad(x: number | null | undefined, precision: Precision): string {
  return `${kmh(x, precision)} km/h`;
}

/** Un rango p10–p90: «55–78». */
export function rangoKmh(
  p10: number | null | undefined,
  p90: number | null | undefined,
  precision: Precision,
): string {
  return `${kmh(p10, precision)}${RAYA}${kmh(p90, precision)}`;
}

/** Una velocidad estimada, con su rango si lo tiene: «57 km/h (55–78)». */
export function velocidad(
  v: { mejor: number; p10?: number | null; p90?: number | null },
  precision: Precision = "reconstruccion",
): string {
  const hayRango = v.p10 !== undefined && v.p10 !== null && v.p90 !== undefined && v.p90 !== null;
  return hayRango
    ? `${kmhConUnidad(v.mejor, precision)} (${rangoKmh(v.p10, v.p90, precision)})`
    : kmhConUnidad(v.mejor, precision);
}

/** Una diferencia de velocidades con su signo y su unidad: «−6 km/h», «+0.75 km/h». */
export function diferenciaKmh(x: number, precision: Precision): string {
  return `${conSigno(x, DECIMALES[precision])} km/h`;
}

/** Un porcentaje (el valor ya en %): «58.3 %». */
export function porcentaje(x: number, decimales: number): string {
  return `${numero(x, decimales)} %`;
}

/** Una diferencia en porcentaje, con su signo: «+1.19 %», «−48 %». */
export function diferenciaPct(x: number, precision: Precision): string {
  return `${conSigno(x, DECIMALES[precision])} %`;
}

/** Una tasa medida, k de n, con su porcentaje (null sin casos). */
export interface Tasa {
  k: number;
  n: number;
  pct: number | null;
}

/**
 * Una tasa completa, nunca el porcentaje solo: «91 de 156 (58.3 %)». Sin casos, «0 de 0». `de`
 * cambia la palabra para otro idioma («of»).
 */
export function tasa(t: Tasa, de = "de"): string {
  const base = `${t.k} ${de} ${t.n}`;
  return t.pct === null ? base : `${base} (${porcentaje(t.pct, 1)})`;
}

/** Una longitud en metros: «15.89 m». */
export function metros(x: number, decimales = 2): string {
  return `${numero(x, decimales)} m`;
}

/** Un instante respecto al impacto, con su signo: «+1.20 s», «−0.40 s»; el impacto es «0.00 s». */
export function instante(t: number, decimales = 2): string {
  return `${conSigno(t, decimales)} s`;
}

/** Una duración en segundos: «1.20 s». */
export function segundos(t: number, decimales = 2): string {
  return `${numero(t, decimales)} s`;
}

/** Un ángulo en grados: «12.5°». */
export function grados(x: number, decimales = 1): string {
  return `${numero(x, decimales)}°`;
}

/**
 * `x` redondeado a `decimales`, como número: para geometría y posiciones en pantalla (un porcentaje
 * de CSS, una coordenada de SVG), no para escribir una cifra.
 */
export function redondea(x: number, decimales: number): number {
  const e = 10 ** decimales;
  return Math.round(x * e) / e;
}
