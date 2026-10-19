/** Formatos de números para las páginas (español de México). */

/** Número con separador de miles y hasta tres decimales. */
export function numero(x: number): string {
  return x.toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

/** Fracción como porcentaje con un decimal. */
export function pct(x: number): string {
  return `${numero(Math.round(x * 1000) / 10)} %`;
}

/** «primer», «segundo», «tercer» lugar; después, el número. */
export function ordinal(n: number): string {
  return ["primer", "segundo", "tercer", "cuarto", "quinto"][n - 1] ?? `${n}.º`;
}
