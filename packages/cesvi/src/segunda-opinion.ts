/**
 * La segunda opinión de Croquis: la misma deformación medida por el perito, con la rigidez de la
 * clase de vehículo que Croquis midió en pruebas de choque de NHTSA (E2, `@croquis/solver-ts`) en
 * lugar de los coeficientes del dictamen. Va aparte y no reemplaza el cálculo de CESVI.
 *
 * El intervalo no es aleatorio: es la EBS con los coeficientes de cada prueba de la clase, del
 * percentil 10 al 90 (80 % central). El valor central usa la mediana de la clase.
 */
import { crushEnergy, stiffnessFor } from "@croquis/solver-ts";

export interface SegundaOpinion {
  clase: string;
  zona: string;
  origen: string;
  pruebas: number;
  /** Mediana de la clase, en N/m y N/m². */
  A: number;
  B: number;
  energiaJ: number;
  kmh: number;
  /** EBS del percentil 10 y 90 de las pruebas de la clase, en km/h. */
  intervaloKmh: [number, number] | null;
  nota: string;
}

/** Cuantil con interpolación lineal sobre valores ordenados. */
function cuantil(ordenados: readonly number[], q: number): number {
  const pos = (ordenados.length - 1) * q;
  const i = Math.floor(pos);
  const f = pos - i;
  const a = ordenados[i]!;
  const b = ordenados[Math.min(ordenados.length - 1, i + 1)]!;
  return a + (b - a) * f;
}

const kmhEbs = (energiaJ: number, masaKg: number): number =>
  Math.sqrt((2 * energiaJ) / masaKg) * 3.6;

export function segundaOpinion(
  perfilM: readonly number[],
  anchoM: number,
  masaKg: number,
  clase: string,
  zona = "frontal",
): SegundaOpinion {
  const entrada = stiffnessFor(clase, zona);
  const energiaJ = crushEnergy(perfilM, anchoM, entrada.stiffness);
  const muestras = entrada.samples
    .map((k) => kmhEbs(crushEnergy(perfilM, anchoM, k), masaKg))
    .sort((a, b) => a - b);
  return {
    clase,
    zona,
    origen: entrada.origen,
    pruebas: entrada.nTests,
    A: entrada.stiffness.a,
    B: entrada.stiffness.b,
    energiaJ,
    kmh: kmhEbs(energiaJ, masaKg),
    intervaloKmh: muestras.length ? [cuantil(muestras, 0.1), cuantil(muestras, 0.9)] : null,
    nota: entrada.nota,
  };
}
