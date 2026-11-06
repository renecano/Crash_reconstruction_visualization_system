/**
 * Un archivo elegido o soltado en la lista de casos, mientras se abre su pantalla: el reporte va a
 * «Cargar un reporte» y el `.croquis` a «Caso nuevo», que lo abren como si se eligiera ahí. Vive en
 * memoria: no sobrevive a una recarga y nunca sale del navegador.
 */
export type TipoPendiente = "reporte" | "caso";

let pendiente: { tipo: TipoPendiente; archivo: File } | null = null;

/** De qué tipo es un archivo según su nombre: `.croquis` y `.json` son casos, lo demás, reportes. */
export const tipoDeArchivo = (nombre: string): TipoPendiente =>
  /\.(croquis|json)$/i.test(nombre) ? "caso" : "reporte";

/**
 * Deja el archivo y dice a qué pantalla va. Quien lo eligió con «Abrir archivo» ya dijo qué es; solo
 * lo que se suelta en la página se deduce de su nombre.
 */
export function dejarArchivo(
  archivo: File,
  tipo: TipoPendiente = tipoDeArchivo(archivo.name),
): TipoPendiente {
  pendiente = { tipo, archivo };
  return tipo;
}

/** Entrega el archivo una sola vez, si es del tipo que se pide. */
export function tomarArchivo(tipo: TipoPendiente): File | null {
  if (pendiente?.tipo !== tipo) return null;
  const { archivo } = pendiente;
  pendiente = null;
  return archivo;
}
