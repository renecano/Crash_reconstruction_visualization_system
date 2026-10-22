/**
 * La rigidez A y B de cada vehículo (docs/cesvi/PLAN-CESVI.md, C1). Se toma, en este orden:
 * la que escriba el perito; la que trae el dictamen; la de la tabla que CESVI entregue (aún no la
 * tenemos: ver «Bloqueado» en PROGRESS); y, si no hay ninguna, la mediana de la clase medida por
 * Croquis en pruebas de choque de NHTSA (E2), marcada como tal. Si la clase no tiene pruebas, el
 * respaldo genérico de E2 va marcado como supuesto. Siempre dice de dónde salió.
 */
import { stiffnessFor } from "@croquis/solver-ts";

export type FuenteRigidez = "perito" | "dictamen" | "tabla_cesvi" | "nhtsa_e2" | "supuesto";

export interface Rigidez {
  /** N/m. */
  A: number;
  /** N/m². */
  B: number;
  fuente: FuenteRigidez;
  /** De dónde viene, en palabras para el perito. */
  nota: string;
  /** La cita del dictamen, si la rigidez viene de él. */
  cita?: string;
}

export interface EntradaRigidez {
  /** Clase del vehículo como la usa E2 (p. ej. «sedan», «pickup»). */
  clase: string;
  /** Zona dañada: «frontal», «posterior» o «lateral». */
  zona: string;
  perito?: { A: number; B: number };
  dictamen?: { A: number; B: number; cita?: string };
  tablaCesvi?: { A: number; B: number; referencia: string };
}

const valida = (r: { A: number; B: number }) => r.A >= 0 && r.B > 0;

export function rigidezPorVehiculo(e: EntradaRigidez): Rigidez {
  if (e.perito && valida(e.perito)) {
    return { ...e.perito, fuente: "perito", nota: "Capturada por el perito." };
  }
  if (e.dictamen && valida(e.dictamen)) {
    return {
      A: e.dictamen.A,
      B: e.dictamen.B,
      fuente: "dictamen",
      nota: "La que escribe el reporte de CESVI.",
      ...(e.dictamen.cita ? { cita: e.dictamen.cita } : {}),
    };
  }
  if (e.tablaCesvi && valida(e.tablaCesvi)) {
    return {
      A: e.tablaCesvi.A,
      B: e.tablaCesvi.B,
      fuente: "tabla_cesvi",
      nota: `Tabla de CESVI: ${e.tablaCesvi.referencia}.`,
    };
  }
  const nhtsa = stiffnessFor(e.clase, e.zona);
  if (nhtsa.origen === "supuesto") {
    return {
      A: nhtsa.stiffness.a,
      B: nhtsa.stiffness.b,
      fuente: "supuesto",
      nota: `${nhtsa.nota} Es un supuesto, no una medida: conviene capturar la rigidez.`,
    };
  }
  return {
    A: nhtsa.stiffness.a,
    B: nhtsa.stiffness.b,
    fuente: "nhtsa_e2",
    nota: `Mediana de la clase «${e.clase}» (${e.zona}) en ${nhtsa.nTests} pruebas de choque de NHTSA medidas por Croquis (E2); no es un valor de CESVI.`,
  };
}
