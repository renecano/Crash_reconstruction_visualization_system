/**
 * La modalidad que CESVI escribe en el título de su reporte («DICTAMEN TÉCNICO DEL HECHO DE
 * TRÁNSITO EN SU MODALIDAD DE ALCANCE…»), para la segunda medición de E-R4 (ADR 0071): la etiqueta
 * de R0 (lo que leyó Claude de las conclusiones) se queda, y esta va al lado.
 *
 * La regla se fijó con los títulos de desarrollo y se congeló antes de mirar la prueba:
 * 1. la frase tras «modalidad de», hasta el primer «en el que», «donde», «entre»… (el resto
 *    describe el hecho, no la modalidad);
 * 2. su primera cláusula («salida del camino y volcadura» → «salida del camino»; «colisión lateral
 *    con volcadura» → «colisión lateral»): el título nombra primero la modalidad;
 * 3. en esa cláusula, la primera regla que aplica, en este orden: reversa; hecho sin choque
 *    («otra»: incendio, inundación, corte de circulación, bache, desprendimiento, partes bajas,
 *    daños en el motor…); objeto fijo; volcadura; salida del camino; alcance (también «posterior»);
 *    frontal; lateral (perpendicular, oblicua, embestida, raspado); atropello; carambola
 *    («múltiple»);
 * 4. un título genérico («colisión», «choque», «impacto», «informe») o sin «modalidad de» no da
 *    modalidad: ese reporte no se compara en esta medición.
 */

/** Sin acentos ni mayúsculas (las marcas combinantes, `\p{M}`, se quitan tras NFD). */
const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

/** La regla, en orden: la primera que aplica a la primera cláusula da la modalidad. */
export const REGLAS_TITULO: readonly [RegExp, string][] = [
  [/revers/, "reversa"],
  [
    /incendi|inundaci|corte de|bache|desprendimiento|partes? bajas?|danos? (?:en (?:el )?motor|mecanicos)|succion de agua|calentamiento|caja de transmision|ruptura|activacion de bolsas|fractura/,
    "otra",
  ],
  [
    /objeto (?:duro )?fijo|cuerpo (?:duro|fijo)|cuero duro|guarnicion|\barbol|\bpostes?\b|contra objeto/,
    "objeto_fijo",
  ],
  [/volcadura|vuelco|\btonel/, "volcadura"],
  [/salida de|despiste|\bsalto\b/, "salida_de_camino"],
  [/alcance|posterior/, "alcance"],
  [/frontal|\bfrente/, "frontal"],
  [/lateral|perpendicular|oblicu|embestida|envestida|raspado/, "lateral"],
  [/atropell/, "atropellamiento"],
  [/multiple|carambola/, "carambola"],
];

/** La frase de la modalidad en el título del reporte, normalizada; null si no la escribe. */
export function fraseDelTitulo(textoReporte: string): string | null {
  const m = /modalidad\s+de\s+([^\n.,;:]{3,120})/.exec(normal(textoReporte));
  if (!m) return null;
  return m[1]!
    .replace(/\s+/g, " ")
    .trim()
    .split(
      /\s+(?:en el que|en la que|en el cual|donde|del vehiculo|entre|ocurrid|suscitad|que se)\b/,
    )[0]!
    .trim();
}

/** La modalidad del título del reporte con la regla congelada (null si no da una). */
export function modalidadDelTitulo(textoReporte: string): {
  frase: string | null;
  modalidad: string | null;
} {
  const frase = fraseDelTitulo(textoReporte);
  if (!frase) return { frase: null, modalidad: null };
  const clausula = frase.split(/\s+(?:y|e|con)\s+/)[0]!;
  // «choque contra vehículo volcado» es un choque contra un vehículo, no una volcadura.
  if (/vehiculo volcado/.test(clausula)) return { frase, modalidad: null };
  const regla = REGLAS_TITULO.find(([rx]) => rx.test(clausula));
  return { frase, modalidad: regla ? regla[1] : null };
}
