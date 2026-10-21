/**
 * La descripción técnica de ejemplo del caso A2010930 (ADR 0055), escrita por Croquis con palabras
 * propias, y la lectura grabada de Claude para ella y para la declaración (la usan la e2e y las
 * pruebas: CI no llama a la API).
 */
import hechoA2010930 from "../../../data/cesvi/casos/A2010930-hecho.json";

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
