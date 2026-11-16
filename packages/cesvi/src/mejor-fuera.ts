/**
 * Cuando el mejor ajuste queda fuera de su propio rango (hallado el 2026-11-15 en el caso de ejemplo
 * con poste: «102 km/h, rango 72–99»). No es un error de cálculo: el mejor ajuste usa la evidencia y
 * los supuestos en su valor nominal, y el rango es el p10–p90 de las simulaciones, que los sortean
 * dentro de su incertidumbre. Si la solución depende mucho de ellos, el nominal puede caer fuera.
 * Lo que no puede pasar es que la pantalla lo muestre sin decirlo: va como límite, con las cifras.
 */
import { kmhConUnidad, rangoKmh } from "./formato";

/** Lo que el redondeo a enteros de la pantalla puede esconder (km/h). */
export const HOLGURA_FUERA_KMH = 0.5;

export type LadoFuera = "arriba" | "abajo";

interface Estimacion {
  mejor?: number;
  p10?: number;
  p90?: number;
  /** `laplace`: el rango es lineal, centrado en el mejor ajuste; nunca lo deja fuera. */
  rango_por?: string;
}

/** De qué lado del p10–p90 queda el mejor ajuste, o `null` si queda dentro o no hay rango. */
export function mejorFueraDelRango(e: Estimacion | null | undefined): LadoFuera | null {
  if (!e || e.mejor === undefined || e.p10 === undefined || e.p90 === undefined) return null;
  if (e.mejor > e.p90 + HOLGURA_FUERA_KMH) return "arriba";
  if (e.mejor < e.p10 - HOLGURA_FUERA_KMH) return "abajo";
  return null;
}

/** El límite que lee el perito, con las dos cifras; `null` si el mejor ajuste queda dentro. */
export function limiteMejorFuera(
  vehiculo: string,
  e: Estimacion | null | undefined,
): string | null {
  const lado = mejorFueraDelRango(e);
  if (!lado || !e) return null;
  return (
    `${vehiculo}: el mejor ajuste (${kmhConUnidad(e.mejor, "reconstruccion")}) queda ${lado === "arriba" ? "por arriba" : "por debajo"} ` +
    `del rango de las simulaciones (${rangoKmh(e.p10, e.p90, "reconstruccion")}). El rango es donde cae el 80 % de las simulaciones, ` +
    "que sortean la evidencia y los supuestos dentro de su incertidumbre; aquí la solución depende mucho de ellos. " +
    "Conviene revisar la evidencia del caso antes de citar la cifra."
  );
}
