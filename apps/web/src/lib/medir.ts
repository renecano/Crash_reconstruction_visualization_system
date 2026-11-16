/**
 * «Medir una distancia» en el mapa de La escena (ronda 2, A5): qué se dibuja y qué se le dice al
 * perito en cada momento. La línea sigue al puntero desde el primer extremo, con los metros en vivo;
 * con los dos extremos, queda fija con su medida.
 */
import { distanciaM, formato as F } from "@croquis/cesvi";
import type { Punto } from "./escena-facil";

/** El color de señal del sistema de diseño (#FF5B2E), para la línea y los extremos de la medida. */
export const COLOR_MEDIDA = "#FF5B2E";

export function metrosEntre(a: Punto, b: Punto): number {
  return distanciaM([a.lon, a.lat], [b.lon, b.lat]);
}

/** Lo que dice la banda del modo de medición, según cuántos extremos van. */
export function textoMedicion(puntos: readonly Punto[]): string {
  if (puntos.length === 0) return "Toca en el mapa el primer extremo de lo que mides.";
  if (puntos.length === 1)
    return "Toca el segundo extremo: la línea sigue al puntero con los metros.";
  return `${F.metros(metrosEntre(puntos[0]!, puntos[1]!))}. Toca el mapa para medir otra distancia.`;
}

/**
 * Lo que se dibuja: los extremos numerados y la línea (del primero al segundo, o al puntero mientras
 * falta el segundo). La medida va en la etiqueta: al final de la línea.
 */
export function dibujoMedicion(
  puntos: readonly Punto[],
  puntero: Punto | null,
): {
  geojson: {
    type: "FeatureCollection";
    features: {
      type: "Feature";
      properties: { tipo: "extremo" | "linea"; n?: number; viva?: boolean };
      geometry:
        | { type: "Point"; coordinates: [number, number] }
        | { type: "LineString"; coordinates: [number, number][] };
    }[];
  };
  etiqueta: { en: Punto; texto: string; viva: boolean } | null;
} {
  const fin = puntos[1] ?? (puntos.length === 1 ? puntero : null);
  const features: ReturnType<typeof dibujoMedicion>["geojson"]["features"] = puntos
    .slice(0, 2)
    .map((p, k) => ({
      type: "Feature" as const,
      properties: { tipo: "extremo" as const, n: k + 1 },
      geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] as [number, number] },
    }));
  if (puntos[0] && fin)
    features.unshift({
      type: "Feature",
      properties: { tipo: "linea", viva: !puntos[1] },
      geometry: {
        type: "LineString",
        coordinates: [
          [puntos[0].lon, puntos[0].lat],
          [fin.lon, fin.lat],
        ],
      },
    });
  return {
    geojson: { type: "FeatureCollection", features },
    etiqueta:
      puntos[0] && fin
        ? { en: fin, texto: F.metros(metrosEntre(puntos[0], fin)), viva: !puntos[1] }
        : null,
  };
}
