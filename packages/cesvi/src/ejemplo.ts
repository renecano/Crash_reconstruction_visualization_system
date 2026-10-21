/**
 * Lo de ejemplo del caso A2010930: la descripción técnica escrita por Croquis con palabras propias
 * y la lectura grabada de Claude para ella y para la declaración (ADR 0055; la usan la e2e y las
 * pruebas, CI no llama a la API), y la ubicación ilustrativa del lugar (ADR 0056).
 */
import hechoA2010930 from "../../../data/cesvi/casos/A2010930-hecho.json";
import ubicacionA2010930 from "../../../data/cesvi/casos/A2010930-ubicacion.json";

export interface EjemploHecho {
  caso: string;
  declarante: "A" | "B";
  descripcion: string;
}

const EJEMPLOS: Readonly<Record<string, EjemploHecho>> = {
  A2010930: hechoA2010930 as EjemploHecho,
};

/** La descripción técnica de ejemplo de un caso (null si no tiene). */
export function ejemploHecho(caso: string): EjemploHecho | null {
  return EJEMPLOS[caso] ?? null;
}

export interface UbicacionIlustrativa {
  lat: number;
  lon: number;
  via: { ref: string; nombre: string | null };
  distancia_a_los_mochis_km: number;
}

const UBICACIONES: Readonly<Record<string, UbicacionIlustrativa>> = {
  A2010930: ubicacionA2010930,
};

/**
 * La ubicación ILUSTRATIVA del lugar del hecho (ADR 0056), para mostrar el recorrido con
 * coordenadas cuando el dictamen no las da. No es la ubicación real; la pantalla y el PDF lo dicen.
 */
export function ubicacionIlustrativa(caso: string): UbicacionIlustrativa | null {
  return UBICACIONES[caso] ?? null;
}

/** Si un punto es la ubicación ilustrativa del caso (con la precisión de sus 5 decimales). */
export function esUbicacionIlustrativa(caso: string, p: readonly [number, number]): boolean {
  const u = UBICACIONES[caso];
  return Boolean(u && Math.abs(p[0] - u.lon) < 5e-6 && Math.abs(p[1] - u.lat) < 5e-6);
}
