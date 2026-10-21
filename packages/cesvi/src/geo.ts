/**
 * Geometría sobre el mapa para el croquis del perito (Hito 2): distancias en metros entre puntos
 * geográficos, puntos a una distancia y rumbo, y el rectángulo de un vehículo a escala. A la escala
 * de un hecho de tránsito (decenas de metros) basta el plano tangente local; se usa el mismo radio
 * terrestre que `@croquis/croquis-2d` (OSM).
 */

export const RADIO_TIERRA_M = 6_371_008.8;

/** Un punto geográfico: [longitud, latitud], en el orden de GeoJSON y MapLibre. */
export type LonLat = readonly [number, number];

const rad = (g: number) => (g * Math.PI) / 180;
const grados = (r: number) => (r * 180) / Math.PI;

/** Este y norte (m) de `p` respecto a `origen`. */
export function enMetros(p: LonLat, origen: LonLat): { este: number; norte: number } {
  const k = rad(1) * RADIO_TIERRA_M;
  return {
    este: (p[0] - origen[0]) * k * Math.cos(rad(origen[1])),
    norte: (p[1] - origen[1]) * k,
  };
}

/** El punto a `este` y `norte` metros de `origen`. */
export function desdeMetros(este: number, norte: number, origen: LonLat): [number, number] {
  const k = rad(1) * RADIO_TIERRA_M;
  return [origen[0] + este / (k * Math.cos(rad(origen[1]))), origen[1] + norte / k];
}

/** Distancia en metros entre dos puntos (haversine). */
export function distanciaM(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo de `a` a `b`, en grados desde el norte en sentido horario (0 = norte, 90 = este). */
export function rumboDeg(a: LonLat, b: LonLat): number {
  const { este, norte } = enMetros(b, a);
  return (grados(Math.atan2(este, norte)) + 360) % 360;
}

/** El punto a `distancia` metros de `p` con `rumbo` (grados desde el norte, horario). */
export function avanzar(p: LonLat, rumbo: number, distancia: number): [number, number] {
  return desdeMetros(distancia * Math.sin(rad(rumbo)), distancia * Math.cos(rad(rumbo)), p);
}

/**
 * Las cuatro esquinas (y la primera repetida, como pide GeoJSON) de un vehículo con su centro en
 * `centro`, su frente hacia `rumbo` y las medidas dadas.
 */
export function rectanguloVehiculo(
  centro: LonLat,
  rumbo: number,
  largo: number,
  ancho: number,
): [number, number][] {
  const f = { e: Math.sin(rad(rumbo)), n: Math.cos(rad(rumbo)) };
  const d = { e: f.n, n: -f.e }; // a la derecha del frente
  const esquinas = [
    [largo / 2, ancho / 2],
    [largo / 2, -ancho / 2],
    [-largo / 2, -ancho / 2],
    [-largo / 2, ancho / 2],
  ].map(([l, a]) => desdeMetros(l! * f.e + a! * d.e, l! * f.n + a! * d.n, centro));
  return [...esquinas, esquinas[0]!];
}

/** Rumbo de una línea (lista de puntos) en el tramo más cercano a `p`, en el sentido de la línea. */
export function rumboCercano(
  linea: readonly LonLat[],
  p: LonLat,
): { rumbo: number; distancia: number } | null {
  let mejor: { rumbo: number; distancia: number } | null = null;
  for (let i = 0; i < linea.length - 1; i++) {
    const a = enMetros(linea[i]!, p);
    const b = enMetros(linea[i + 1]!, p);
    const dx = b.este - a.este;
    const dy = b.norte - a.norte;
    const largo2 = dx * dx + dy * dy;
    if (largo2 === 0) continue;
    const t = Math.max(0, Math.min(1, -(a.este * dx + a.norte * dy) / largo2));
    const distancia = Math.hypot(a.este + t * dx, a.norte + t * dy);
    if (!mejor || distancia < mejor.distancia) {
      mejor = { rumbo: (grados(Math.atan2(dx, dy)) + 360) % 360, distancia };
    }
  }
  return mejor;
}
