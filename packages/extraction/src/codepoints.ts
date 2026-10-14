/**
 * Posiciones en puntos de código, como las de Python (`str` indexa por punto de código).
 *
 * Las posiciones de la evidencia en la EscenaSpec (`inicio`, `fin`) son las de la referencia
 * Python; en JS los índices son unidades UTF-16. Dentro del pipeline TS se trabaja en UTF-16 y
 * solo al escribir el contrato se convierte.
 */

/** Índice UTF-16 → punto de código. */
export function cpIndex(text: string, utf16: number): number {
  let n = 0;
  for (let i = 0; i < utf16 && i < text.length; i++) {
    const c = text.charCodeAt(i);
    // El segundo de un par sustituto no cuenta como un punto de código nuevo.
    if (!(c >= 0xdc00 && c <= 0xdfff && i > 0 && isHigh(text.charCodeAt(i - 1)))) n++;
  }
  return n;
}

function isHigh(c: number): boolean {
  return c >= 0xd800 && c <= 0xdbff;
}

/** Longitud en puntos de código. */
export function cpLength(text: string): number {
  return cpIndex(text, text.length);
}

/** Punto de código → índice UTF-16. */
export function utf16Index(text: string, cp: number): number {
  let n = 0;
  let i = 0;
  while (i < text.length && n < cp) {
    i += isHigh(text.charCodeAt(i)) && i + 1 < text.length ? 2 : 1;
    n++;
  }
  return i;
}

/** `text[start:end]` de Python (en puntos de código, con índices ya válidos). */
export function cpSlice(text: string, start: number, end?: number): string {
  const a = utf16Index(text, start);
  const b = end === undefined ? text.length : utf16Index(text, end);
  return text.slice(a, b);
}

/** Recorta a `n` puntos de código, como `s[:n]` en Python. */
export function cpTruncate(text: string, n: number): string {
  return cpSlice(text, 0, n);
}
