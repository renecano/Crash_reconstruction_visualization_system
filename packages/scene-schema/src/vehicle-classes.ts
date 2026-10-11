/**
 * Tabla de rangos de plausibilidad por clase de vehículo, generada por
 * `uv run croquis-data vehicles build` a partir de fichas técnicas (ver data/SOURCES.md).
 * Cada campo indica su `origen`: ficha, secundaria, derivado_pbv o supuesto.
 */
import raw from "../vehicle_classes.json";
import type { RangoClase, TablaClases } from "./check";

export type OrigenRango = "ficha" | "secundaria" | "derivado_pbv" | "supuesto";

export interface VehicleClassEntry extends RangoClase {
  origen: Record<keyof RangoClase, OrigenRango>;
  n_modelos: number;
  n_modelos_completos: number;
  modelos: string[];
}

export const VEHICLE_CLASSES_META = {
  generado: raw.generado,
  fuente: raw._fuente,
  nota: raw._nota,
};

export const VEHICLE_CLASSES: Record<string, VehicleClassEntry> = raw.clases as unknown as Record<
  string,
  VehicleClassEntry
>;

/** La tabla como la espera `checkEscena`. */
export const DEFAULT_CLASES: TablaClases = VEHICLE_CLASSES;
