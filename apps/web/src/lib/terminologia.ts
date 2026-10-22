/**
 * Terminología de CESVI (docs/cesvi/glosario.md): lo que tiene CESVI es el «reporte»; el «dictamen»
 * es lo que produce Croquis. Estas frases llaman dictamen al documento de CESVI y no deben verse.
 */
export const TERMINOS_PROHIBIDOS: readonly RegExp[] = [
  /dict[aá]men(?:es)?\s+(?:de|del)\s+CESVI/i,
  /dict[aá]men(?:es)?\s+original(?:es)?/i,
  /contra\s+(?:el\s+)?dict[aá]men(?:es)?/i,
  /reproducci[oó]n\s+de(?:l)?\s+(?:los\s+)?dict[aá]men(?:es)?/i,
];

/** Las frases prohibidas que aparecen en un texto, tal como están escritas. */
export function terminosProhibidos(texto: string): string[] {
  return TERMINOS_PROHIBIDOS.flatMap((rx) => {
    const m = new RegExp(rx.source, "gi");
    return [...texto.matchAll(m)].map((x) => x[0].replace(/\s+/g, " "));
  });
}
