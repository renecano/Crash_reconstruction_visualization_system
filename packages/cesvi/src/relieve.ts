/**
 * El relieve real del lugar en la escena (C3 y O4, W5). `/api/relieve` entrega la malla centrada en
 * un punto del mapa; aquí se lleva al marco de la escena (metros desde el punto de impacto, con
 * altura 0 ahí, como pide `caso3d.relieve`) y se sacan de ella las curvas de nivel del croquis.
 *
 * Lo que la malla no ve: tiene una muestra cada 10 m (del LiDAR de terreno del INEGI) o cada 30 m
 * (donde no lo hay). Sirve para la pendiente de una vía a lo largo de decenas o cientos de metros;
 * no ve una rampa de 2 m, el bombeo ni un tope.
 */
import { enMetros, type LonLat } from "./geo";

/** La malla, con la forma de `caso3d.relieve`. */
export interface MallaRelieve {
  id: string;
  /** La esquina suroeste: en el mapa y en metros de la escena. */
  origen: { lat: number; lon: number; x: number; y: number };
  resolucion_m: number;
  ancho: number;
  alto: number;
  /** Por filas de sur a norte y, en cada fila, de oeste a este. */
  alturas_m: number[];
  fuente: string;
  licencia: string;
  resolucion_nativa_m: number;
}

/** Lo que hay que decirle al perito del relieve, siempre junto a él. */
export const LIMITE_RELIEVE =
  "Da la pendiente general de la vía, con una muestra cada 10 m (cada 30 m donde el INEGI no tiene LiDAR). No ve una rampa corta, el bombeo ni un tope: esos se marcan aparte.";

/**
 * El punto para pedir la malla: el origen de la escena redondeado a 4 decimales (unos 11 m), para
 * que mover un vehículo unos metros no pida otra malla. La diferencia se corrige en `relieveEnEscena`.
 */
export function puntoDeRelieve(origen: LonLat): { lat: number; lon: number } {
  return { lat: Math.round(origen[1] * 1e4) / 1e4, lon: Math.round(origen[0] * 1e4) / 1e4 };
}

/** Altura de la malla en (x, y) de su marco, bilineal; fuera de la malla vale la de la orilla. */
export function alturaEn(m: MallaRelieve, x: number, y: number): number {
  const fx = Math.min(Math.max((x - m.origen.x) / m.resolucion_m, 0), m.ancho - 1);
  const fy = Math.min(Math.max((y - m.origen.y) / m.resolucion_m, 0), m.alto - 1);
  const i = Math.min(Math.floor(fx), m.ancho - 2);
  const j = Math.min(Math.floor(fy), m.alto - 2);
  const tx = fx - i;
  const ty = fy - j;
  const h = (jj: number, ii: number) => m.alturas_m[jj * m.ancho + ii]!;
  return (
    (h(j, i) + (h(j, i + 1) - h(j, i)) * tx) * (1 - ty) +
    (h(j + 1, i) + (h(j + 1, i + 1) - h(j + 1, i)) * tx) * ty
  );
}

/**
 * La malla en el marco de la escena: su esquina suroeste en metros desde el punto de impacto
 * (`origen`, lon y lat) y las alturas relativas a ese punto, al centímetro.
 */
export function relieveEnEscena(malla: MallaRelieve, origen: LonLat): MallaRelieve {
  const so = enMetros([malla.origen.lon, malla.origen.lat], origen);
  const movida: MallaRelieve = {
    ...malla,
    origen: {
      ...malla.origen,
      x: Math.round(so.este * 1000) / 1000,
      y: Math.round(so.norte * 1000) / 1000,
    },
  };
  const z0 = alturaEn(movida, 0, 0);
  return { ...movida, alturas_m: malla.alturas_m.map((z) => Math.round((z - z0) * 100) / 100) };
}

/** Cuánto sube el terreno del punto más bajo al más alto de la malla (m). */
export function desnivelDe(m: MallaRelieve): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const z of m.alturas_m) {
    if (z < lo) lo = z;
    if (z > hi) hi = z;
  }
  return Math.round((hi - lo) * 100) / 100;
}

/** La separación entre curvas de nivel (m) con la que salen unas diez o menos. */
export function intervaloDeCurvas(m: MallaRelieve): number {
  const d = desnivelDe(m);
  return [0.5, 1, 2, 5, 10, 20, 50, 100].find((k) => d / k <= 10) ?? 200;
}

export interface CurvaDeNivel {
  /** Altura de la curva, en metros sobre el punto de impacto. */
  nivel: number;
  /** Tramos [x1, y1, x2, y2] en metros de la escena. */
  tramos: [number, number, number, number][];
}

/**
 * Las curvas de nivel de la malla cada `intervalo` metros (cuadros en marcha, con interpolación
 * lineal en cada lado). La curva de nivel 0 pasa por el punto de impacto.
 */
export function curvasDeNivel(m: MallaRelieve, intervalo = intervaloDeCurvas(m)): CurvaDeNivel[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const z of m.alturas_m) {
    if (z < lo) lo = z;
    if (z > hi) hi = z;
  }
  if (!(hi > lo)) return [];
  const curvas: CurvaDeNivel[] = [];
  const h = (j: number, i: number) => m.alturas_m[j * m.ancho + i]!;
  for (let k = Math.ceil(lo / intervalo); k * intervalo <= hi; k++) {
    // Un nivel que coincide exacto con un nodo se corre un pelo: evita tramos degenerados.
    const nivel = k * intervalo;
    const c = nivel + 1e-6;
    const tramos: CurvaDeNivel["tramos"] = [];
    for (let j = 0; j < m.alto - 1; j++) {
      for (let i = 0; i < m.ancho - 1; i++) {
        const x = m.origen.x + i * m.resolucion_m;
        const y = m.origen.y + j * m.resolucion_m;
        const r = m.resolucion_m;
        // Esquinas: suroeste, sureste, noreste, noroeste.
        const z = [h(j, i), h(j, i + 1), h(j + 1, i + 1), h(j + 1, i)] as const;
        const p = [
          [x, y],
          [x + r, y],
          [x + r, y + r],
          [x, y + r],
        ] as const;
        const cortes: [number, number][] = [];
        for (let a = 0; a < 4; a++) {
          const b = (a + 1) % 4;
          if (z[a]! > c === z[b]! > c) continue;
          const t = (c - z[a]!) / (z[b]! - z[a]!);
          cortes.push([p[a]![0] + (p[b]![0] - p[a]![0]) * t, p[a]![1] + (p[b]![1] - p[a]![1]) * t]);
        }
        // Dos cortes: un tramo. Cuatro (silla): se unen por pares vecinos.
        for (let q = 0; q + 1 < cortes.length; q += 2)
          tramos.push([cortes[q]![0], cortes[q]![1], cortes[q + 1]![0], cortes[q + 1]![1]]);
      }
    }
    if (tramos.length) curvas.push({ nivel, tramos });
  }
  return curvas;
}
