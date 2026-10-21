/**
 * Cómo se nombra y se colorea cada vehículo de un caso de CESVI en todo el recorrido (ADR 0053):
 * el mapa, los daños, los números y el PDF. Los colores son los de `--vehiculo-a` y `--vehiculo-b`
 * en `styles/sistema.css` (una prueba revisa que coincidan); el PDF no tiene CSS y los toma de aquí.
 */
import type { CasoCesvi } from "@croquis/cesvi";

export type Letra = "A" | "B";

export const COLOR_VEHICULO: Readonly<Record<Letra, string>> = { A: "#2b8cff", B: "#a05cff" };

/** «A · Silverado», «B · Tacoma»: la letra del dictamen y la primera palabra del tipo. */
export function nombreVehiculo(caso: CasoCesvi, letra: Letra): string {
  const tipo = caso.vehiculos[letra].tipo.trim().split(/\s+/)[0] ?? "";
  return tipo ? `${letra} · ${tipo}` : letra;
}

export const nombresVehiculos = (caso: CasoCesvi): Record<Letra, string> => ({
  A: nombreVehiculo(caso, "A"),
  B: nombreVehiculo(caso, "B"),
});
