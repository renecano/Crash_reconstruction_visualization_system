/**
 * La luz del lugar, de la hora que narró el perito (René, 2026-11-18): «Crucero de noche» y
 * «Carambola de noche con lluvia» se veían de día en el 3D porque la escena salía siempre con la
 * luz por omisión.
 *
 * Es un supuesto declarado, «según la hora del relato». Nunca da «noche sin alumbrado»: esa es la
 * única luz que entra al cálculo (acorta lo que alcanza a ver un conductor), y sin que la narración
 * diga que no había alumbrado no se supone. Con «noche con alumbrado», ningún número cambia.
 */
export type Iluminacion = "dia" | "amanecer" | "atardecer" | "noche_con_alumbrado";

/**
 * La hora (0–23, con minutos en fracción) de un texto como «21:45 horas», «22.30 hrs» o «9:10 p. m.».
 * «00:00» sin a. m. ni p. m. no cuenta como hora: en los reportes suele acompañar a una fecha sin hora.
 */
export function horaDeTexto(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const m = /(\d{1,2})\s*[:.h]\s*(\d{2})?\s*(a\.?\s*m\.?|p\.?\s*m\.?|horas|hrs?\.?)?/i.exec(texto);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 24 || min > 59) return null;
  // «00:00 horas» junto a la fecha suele ser un relleno del reporte, no la hora del hecho.
  if (h % 24 === 0 && min === 0 && !/(a\.?\s*m\.?|p\.?\s*m\.?)/i.test(m[3] ?? "")) return null;
  const sufijo = (m[3] ?? "").toLowerCase().replace(/[\s.]/g, "");
  if (sufijo === "pm" && h < 12) h += 12;
  if (sufijo === "am" && h === 12) h = 0;
  if (h === 24) h = 0;
  return h + min / 60;
}

/**
 * La luz a esa hora en México, de forma conservadora: amanecer de 6:00 a 7:00, día de 7:00 a
 * 18:30, atardecer de 18:30 a 19:30 y noche el resto (con alumbrado).
 */
export function iluminacionDeHora(texto: string | null | undefined): Iluminacion | null {
  const h = horaDeTexto(texto);
  if (h === null) return null;
  if (h >= 6 && h < 7) return "amanecer";
  if (h >= 7 && h < 18.5) return "dia";
  if (h >= 18.5 && h < 19.5) return "atardecer";
  return "noche_con_alumbrado";
}
