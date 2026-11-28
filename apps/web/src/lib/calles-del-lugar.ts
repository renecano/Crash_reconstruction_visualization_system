/**
 * Las calles del lugar donde está ahora el choque (René, 2026-11-27; #388): cuando el perito corregía
 * el lugar a mano, la reconstrucción se quedaba sin las calles del mapa (la glorieta salía como calle
 * recta, Tlalpan sin camellón). La respuesta de Overpass del lugar viejo seguía a la vista mientras
 * llegaba la del nuevo, se guardaba con el caso con el centro nuevo y, al llegar la buena, se conservaba
 * la vieja (el centro coincidía a menos de 30 m).
 *
 * Regla: una respuesta (de Overpass o de las teselas) cuenta solo para el lugar que se pidió (`de`);
 * al mover el lugar se piden las del nuevo y la escena se arma con ellas.
 */
import type { OverpassResponse } from "@croquis/croquis-2d";
import type { Expediente } from "@croquis/cesvi";
import { callesParaGuardar, conCallesGuardadas } from "./calles-guardadas";

/** Una respuesta con el lugar para el que se pidió (el punto redondeado, `claveCalles`). */
export interface CallesPedidas {
  de: string;
  r: OverpassResponse | null;
}

/** La respuesta, si es del lugar de ahora; si es de otro, null. */
export function deAqui(p: CallesPedidas | null, clave: string | null): OverpassResponse | null {
  return p && clave !== null && p.de === clave ? p.r : null;
}

/**
 * El caso con las calles que acaban de llegar para el lugar de ahora (Overpass manda sobre las
 * teselas); igual si no hay ninguna de este lugar.
 */
export function guardarSiEsDeAqui(
  e: Expediente,
  o: {
    origen: { lat: number; lon: number };
    clave: string;
    overpass: CallesPedidas | null;
    teselas: CallesPedidas | null;
    radioM: number;
  },
): Expediente {
  const overpass = deAqui(o.overpass, o.clave);
  const teselas = deAqui(o.teselas, o.clave);
  const r = overpass ?? teselas;
  if (!r) return e;
  return conCallesGuardadas(
    e,
    callesParaGuardar(r, o.origen, o.radioM, overpass ? "overpass" : "teselas"),
  );
}
