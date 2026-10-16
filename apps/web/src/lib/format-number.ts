/**
 * Números en español de México con `d` decimales fijos.
 *
 * Equivale a `v.toLocaleString("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d })`,
 * pero reusa un `Intl.NumberFormat` por cantidad de decimales: `toLocaleString` con opciones crea
 * uno nuevo en cada llamada, y los paneles del visor formatean cientos de números por render.
 */
const formats = new Map<number, Intl.NumberFormat>();

export function fmtNumber(v: number, d = 0): string {
  let f = formats.get(d);
  if (!f) {
    f = new Intl.NumberFormat("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d });
    formats.set(d, f);
  }
  return f.format(v);
}
