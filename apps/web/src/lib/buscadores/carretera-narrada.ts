/**
 * La carretera que nombra una narración: su número y su tramo. Sin dependencias del servidor, para que
 * lo use también La escena en el navegador (el choque va sobre la carretera narrada; René, 2026-11-28).
 */

/** Un nombre propio de población: «Toluca», «Bahía de Kino», «Villa Ahumada». */
export const NOMBRE =
  "[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ.]*(?:\\s+(?:de\\s+|del\\s+|la\\s+)?[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ.]*){0,3}";

/**
 * La carretera que nombra el texto, sin kilómetro: su número («carretera federal 134», «MEX-15D») y su
 * tramo («Toluca–Temascaltepec»). `null` si no nombra una (René, 2026-11-28: «a la altura de la
 * localidad de X» sobre una carretera es una referencia, no un km).
 */
export function leerCarretera(
  texto: string,
): { ref: string | null; tramo: [string, string] | null } | null {
  const r =
    /\bMEX\s*[-–]?\s*(\d{1,3})\s*([Dd])?\b/.exec(texto) ??
    /\b(?:carretera|autopista)(?:\s+federal)?(?:\s+(?:n[uú]mero|no\.))?\s+(\d{1,3})\s*([Dd])?\b/i.exec(
      texto,
    );
  const ref = r ? `MEX ${r[1]}${r[2] ? "D" : ""}` : null;
  const t = new RegExp(`(${NOMBRE})\\s*[–—-]\\s*(${NOMBRE})`).exec(texto);
  const tramo: [string, string] | null =
    t && !/^MEX$/i.test(t[1]!) ? [t[1]!.trim(), t[2]!.trim()] : null;
  if (!ref && !tramo) return null;
  return { ref, tramo };
}
