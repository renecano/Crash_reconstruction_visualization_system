/**
 * Cómo se nombra y se colorea cada vehículo de un caso de CESVI en todo el recorrido (ADR 0053):
 * el mapa, los daños, los números, la sugerencia y el PDF. Los colores son los de `vehiculo-a` y
 * `vehiculo-b` en `assets/brand/tokens.json`; el PDF, que es papel blanco, usa los del tema claro
 * (`claro-vehiculo-a` y `claro-vehiculo-b`). Una prueba revisa que coincidan.
 */
import type { CasoCesvi } from "@croquis/cesvi";

export type Letra = "A" | "B";

/** Los del tema claro: el PDF es papel blanco (ADR 0057). */
export const COLOR_VEHICULO: Readonly<Record<Letra, string>> = { A: "#2257C9", B: "#A35A00" };

/** «A · Silverado», «B · Tacoma»: la letra del dictamen y la primera palabra del tipo. */
export function nombreVehiculo(caso: CasoCesvi, letra: Letra): string {
  const tipo = caso.vehiculos[letra].tipo.trim().split(/\s+/)[0] ?? "";
  return tipo ? `${letra} · ${tipo}` : letra;
}

export const nombresVehiculos = (caso: CasoCesvi): Record<Letra, string> => ({
  A: nombreVehiculo(caso, "A"),
  B: nombreVehiculo(caso, "B"),
});
