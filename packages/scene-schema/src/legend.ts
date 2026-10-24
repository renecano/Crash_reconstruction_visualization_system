/**
 * Leyenda obligatoria (PLAN §10): visible en el visor y como marca en cada exportación (cuadros,
 * video, glTF, informe y croquis). El texto es fijo; se le agregan la semilla, el hash de entradas
 * y, si la escena trae vía de OpenStreetMap, su atribución (ODbL, ADR 0023).
 */
import type { EscenaSpec } from "./generated/escena.zod";

export const LEGEND_TEXT =
  "Reconstrucción ilustrativa generada a partir de un relato. No es un peritaje.";

/** La de /cesvi: ahí la reconstrucción apoya al perito, que es quien firma el dictamen. */
export const LEGEND_TEXT_CESVI = "Reconstrucción de apoyo · el dictamen es del perito.";

export interface LegendInfo {
  texto: string;
  semilla: string;
  /** Hash de las entradas (el relato redactado), si existe. */
  hash?: string;
  /** Atribución de los datos del mapa, si la escena usa una vía de OpenStreetMap. */
  atribucion?: string;
  /** Palabra antes de la semilla en el idioma de la exportación («semilla» por omisión). */
  etiquetaSemilla?: string;
}

export function legendFor(spec: EscenaSpec): LegendInfo {
  const hash = spec.meta.hash_relato;
  const atribucion = spec.lugar.red_vial?.atribucion;
  return {
    texto: LEGEND_TEXT,
    semilla: String(spec.meta.semilla),
    ...(hash ? { hash } : {}),
    ...(atribucion ? { atribucion } : {}),
  };
}

/** Renglones de la marca para imágenes y documentos: texto, semilla y hash, y atribución. */
export function legendLines(info: LegendInfo): string[] {
  const ids = [
    `${info.etiquetaSemilla ?? "semilla"} ${info.semilla}`,
    ...(info.hash ? [`hash ${info.hash}`] : []),
  ].join(" · ");
  return [info.texto, ids, ...(info.atribucion ? [info.atribucion] : [])];
}

/** La marca en un solo texto (metadatos de PNG, video y glTF). */
export function legendString(info: LegendInfo): string {
  return legendLines(info).join(" — ");
}
