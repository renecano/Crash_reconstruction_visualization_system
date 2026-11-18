/**
 * Cómo se nombra y se colorea cada vehículo de un caso de CESVI en todo el recorrido (ADR 0053):
 * el mapa, los daños, los números, la sugerencia y el PDF. Los colores son los de `vehiculo-a` y
 * `vehiculo-b` en `assets/brand/tokens.json`; el PDF, que es papel blanco, usa los del tema claro
 * (`claro-vehiculo-a` y `claro-vehiculo-b`). Una prueba revisa que coincidan.
 */
import type { CasoCesvi } from "@croquis/cesvi";
import { marcaYModelo } from "./escena-facil";

export type Letra = "A" | "B";

/** Los del tema claro: el PDF es papel blanco (ADR 0057). */
export const COLOR_VEHICULO: Readonly<Record<Letra, string>> = { A: "#2257C9", B: "#A35A00" };

/**
 * «A · Chevrolet Silverado»: la letra del dictamen, la marca y la primera palabra del tipo (el
 * modelo; en estos reportes `modelo` es el año). René, 2026-11-18: siempre marca y modelo.
 */
export function nombreVehiculo(caso: CasoCesvi, letra: Letra): string {
  const v = caso.vehiculos[letra];
  const nombre = marcaYModelo(v.marca, v.tipo.trim().split(/\s+/)[0] ?? "");
  return nombre ? `${letra} · ${nombre}` : letra;
}

export const nombresVehiculos = (caso: CasoCesvi): Record<Letra, string> => ({
  A: nombreVehiculo(caso, "A"),
  B: nombreVehiculo(caso, "B"),
});

/** Los colores de los vehículos de un caso de expediente (V2): V1 azul, V2 ámbar, como las maquetas. */
const COLORES_ID = ["#5AA9FF", "#FFC24B", "#A07CFF", "#3CC98B", "#FF7A9C", "#8FA3B8"];
export const colorDeVehiculo = (id: string): string =>
  COLORES_ID[(Number(id.replace(/\D/g, "")) - 1 + COLORES_ID.length) % COLORES_ID.length] ??
  COLORES_ID[0]!;
