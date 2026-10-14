/**
 * Plegado del relato (port de `extraction/croquis_extraction/text.py`).
 *
 * Minúsculas, sin acentos, ñ → n y espacios Unicode → " ", carácter por carácter: el texto plegado
 * mide lo mismo que el original (en unidades UTF-16) y una coincidencia en uno tiene la misma
 * posición en el otro.
 */

/** Espacios fuera de ASCII; la misma lista que `UNICODE_SPACES` en Python. */
export const UNICODE_SPACES: ReadonlySet<string> = new Set(
  [
    0x1c, 0x1d, 0x1e, 0x1f, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
    0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
  ].map((c) => String.fromCharCode(c)),
);

/** El texto con los espacios Unicode como " " (misma longitud). */
export function normalizeSpaces(text: string): string {
  let out = "";
  for (const ch of text) out += UNICODE_SPACES.has(ch) ? " " : ch;
  return out;
}

/** Un punto de código en minúscula y sin diacríticos, con la misma longitud UTF-16. */
export function foldChar(ch: string): string {
  if (UNICODE_SPACES.has(ch)) return " ";
  const first = ch.normalize("NFD").codePointAt(0);
  if (first === undefined) return ch;
  const base = String.fromCodePoint(first);
  const low = base.toLowerCase();
  const out = [...low].length === 1 ? low : base;
  // Un astral cuya descomposición empieza en el BMP cambiaría la longitud: se conserva.
  return out.length === ch.length ? out : ch;
}

export function fold(text: string): string {
  let out = "";
  for (const ch of text) out += foldChar(ch);
  return out;
}

/** Escapa un texto para usarlo literal dentro de una expresión regular. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
