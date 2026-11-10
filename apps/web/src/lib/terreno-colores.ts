/**
 * Los colores del terreno (C3, W5), los mismos en el mapa de la escena, en la maqueta del caso y en
 * las muestras de la pregunta «¿Cómo es el terreno?».
 */
import type { TipoSuperficie } from "@croquis/cesvi";

export const COLOR_SUPERFICIE: Record<TipoSuperficie, string> = {
  terraceria: "#B08D57",
  grava: "#9AA0A6",
  pasto: "#5E8C31",
  tierra: "#8B5E3C",
  lodo: "#5B4636",
  empedrado: "#7D7468",
  adoquin: "#A4574A",
  concreto: "#C9CCD1",
  asfalto: "#4B5058",
};
export const COLOR_ONDULACION = "#2F6FDE";
/** El amarillo con que se pinta un tope. */
export const COLOR_TOPE = "#F2B705";
/** Las curvas de nivel del relieve. */
export const COLOR_CURVA = "#8A6D3B";
