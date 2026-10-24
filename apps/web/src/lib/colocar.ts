/**
 * La lógica de colocar en el mapa (comentario de René, 2026-10-24, punto 3), aparte de la interfaz
 * para probarla sola:
 *
 * - el giro con el anillo: el ángulo es atan2 del cursor respecto del centro del vehículo, absoluto y
 *   1:1 con la pantalla, con imán de 15° (Shift lo suelta);
 * - el tamaño del vehículo en pantalla: metros por pixel del mapa (mosaicos de 512 px de MapLibre);
 * - la alineación con la calle más cercana al soltar un vehículo de la bandeja.
 */
import { rumboCercano, type LonLat } from "@croquis/cesvi";

/** Grados del imán del anillo. */
export const IMAN_GRADOS = 15;
/** Grados de Q y E. */
export const PASO_TECLA_GRADOS = 5;
/** Grados de los botones −15° y +15°. */
export const PASO_BOTON_GRADOS = 15;
/** Hasta qué distancia (m) una calle alinea al vehículo que se suelta. */
export const ALCANCE_CALLE_M = 25;

/** Un rumbo en [0, 360). */
export const normalizar = (r: number) => ((r % 360) + 360) % 360;

/**
 * El rumbo (grados desde el norte, horario) que marca el cursor en el anillo. `dx`, `dy`: del centro
 * al cursor, en pixeles de pantalla (y hacia abajo); `bearing`: el giro del mapa (MapLibre, grados
 * horarios). Arriba en la pantalla es el rumbo del mapa; con `libre`, sin imán.
 */
export function rumboDesdePuntero(dx: number, dy: number, bearing: number, libre: boolean): number {
  const r = normalizar((Math.atan2(dx, -dy) * 180) / Math.PI + bearing);
  return libre ? Math.round(r) % 360 : normalizar(Math.round(r / IMAN_GRADOS) * IMAN_GRADOS);
}

/** Metros por pixel de un mapa de MapLibre (mosaicos de 512 px) a esa latitud y zoom. */
export function metrosPorPixel(lat: number, zoom: number): number {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/**
 * El rumbo de la calle más cercana a `p` (dentro de `ALCANCE_CALLE_M`), en el sentido más parecido
 * a `preferido` (si lo hay); null si no hay calle cerca. Una calle no tiene sentido de por sí: el
 * perito lo voltea 180° si hace falta.
 */
export function rumboDeCalle(
  lineas: readonly (readonly LonLat[])[],
  p: LonLat,
  preferido: number | null,
): number | null {
  let mejor: { rumbo: number; distancia: number } | null = null;
  for (const l of lineas) {
    const r = rumboCercano(l, p);
    if (r && r.distancia <= ALCANCE_CALLE_M && (!mejor || r.distancia < mejor.distancia)) mejor = r;
  }
  if (!mejor) return null;
  const r = normalizar(Math.round(mejor.rumbo));
  if (preferido === null) return r;
  const dif = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  return dif(r, preferido) <= dif(normalizar(r + 180), preferido) ? r : normalizar(r + 180);
}
