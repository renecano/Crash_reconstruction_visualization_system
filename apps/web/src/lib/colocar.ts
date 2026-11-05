/**
 * La lógica de colocar en el mapa (comentario de René, 2026-10-24, punto 3), aparte de la interfaz
 * para probarla sola:
 *
 * - el giro con el anillo: el ángulo es atan2 del cursor respecto del centro del vehículo, absoluto y
 *   1:1 con la pantalla, con imán de 15° (Shift lo suelta);
 * - el tamaño del vehículo en pantalla: metros por pixel del mapa (mosaicos de 512 px de MapLibre);
 * - la alineación con la calle más cercana al soltar un vehículo de la bandeja.
 */
import { avanzar, rumboCercano, type LonLat } from "@croquis/cesvi";

/** Grados del imán del anillo. */
export const IMAN_GRADOS = 15;
/** Grados de Q y E. */
export const PASO_TECLA_GRADOS = 5;
/** Grados de los botones −15° y +15°. */
export const PASO_BOTON_GRADOS = 15;
/** Hasta qué distancia (m) una calle alinea al vehículo que se suelta. */
export const ALCANCE_CALLE_M = 25;

/** Un rumbo en [0, 360). */
export const normalizar = (r: number) => ((r % 360) + 360) % 360;

/**
 * El rumbo (grados desde el norte, horario) que marca el cursor en el anillo. `dx`, `dy`: del centro
 * al cursor, en pixeles de pantalla (y hacia abajo); `bearing`: el giro del mapa (MapLibre, grados
 * horarios). Arriba en la pantalla es el rumbo del mapa; con `libre`, sin imán.
 */
export function rumboDesdePuntero(dx: number, dy: number, bearing: number, libre: boolean): number {
  const r = normalizar((Math.atan2(dx, -dy) * 180) / Math.PI + bearing);
  return libre ? Math.round(r) % 360 : normalizar(Math.round(r / IMAN_GRADOS) * IMAN_GRADOS);
}

/** Metros por pixel de un mapa de MapLibre (mosaicos de 512 px) a esa latitud y zoom. */
export function metrosPorPixel(lat: number, zoom: number): number {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/**
 * El rumbo de la calle más cercana a `p` (dentro de `ALCANCE_CALLE_M`), en el sentido más parecido
 * a `preferido` (si lo hay); null si no hay calle cerca. Una calle no tiene sentido de por sí: el
 * perito lo voltea 180° si hace falta.
 */
export function rumboDeCalle(
  lineas: readonly (readonly LonLat[])[],
  p: LonLat,
  preferido: number | null,
): number | null {
  let mejor: { rumbo: number; distancia: number } | null = null;
  for (const l of lineas) {
    const r = rumboCercano(l, p);
    if (r && r.distancia <= ALCANCE_CALLE_M && (!mejor || r.distancia < mejor.distancia)) mejor = r;
  }
  if (!mejor) return null;
  const r = normalizar(Math.round(mejor.rumbo));
  if (preferido === null) return r;
  const dif = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  return dif(r, preferido) <= dif(normalizar(r + 180), preferido) ? r : normalizar(r + 180);
}

// --- Colocación rehecha (René, 2026-11-04, B) ----------------------------------------------------

const difAngulo = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Una flecha de dirección sobre un carril: el rumbo y si es la que propone Croquis. */
export interface Direccion {
  rumbo: number;
  propuesta: boolean;
}

/**
 * Las direcciones por las que pudo llegar un vehículo al impacto: los dos sentidos de cada calle a
 * menos de `ALCANCE_CALLE_M` (las de rumbos parecidos, a menos de 20°, cuentan una vez), en orden
 * de rumbo. La más cercana a `propuesta` (la de Croquis, por las zonas de contacto y la narración)
 * va marcada. Sin calles cerca, solo la propuesta.
 */
export function direccionesCandidatas(
  lineas: readonly (readonly LonLat[])[],
  p: LonLat,
  propuesta: number | null,
): Direccion[] {
  const rumbos: number[] = [];
  for (const l of lineas) {
    const r = rumboCercano(l, p);
    if (!r || r.distancia > ALCANCE_CALLE_M) continue;
    for (const x of [normalizar(Math.round(r.rumbo)), normalizar(Math.round(r.rumbo) + 180)])
      if (!rumbos.some((y) => difAngulo(x, y) < 20)) rumbos.push(x);
  }
  if (!rumbos.length)
    return propuesta === null ? [] : [{ rumbo: normalizar(propuesta), propuesta: true }];
  rumbos.sort((a, b) => a - b);
  let elegida = -1;
  if (propuesta !== null) {
    let mejor = Infinity;
    rumbos.forEach((r, i) => {
      const d = difAngulo(r, propuesta);
      if (d < mejor) {
        mejor = d;
        elegida = i;
      }
    });
  }
  return rumbos.slice(0, 8).map((rumbo, i) => ({ rumbo, propuesta: i === elegida }));
}

/** En qué parte de la colocación va el perito: «Paso N de 3». */
export interface Subpaso {
  n: 1 | 2 | 3;
  titulo: string;
  /** El vehículo de este momento (en los pasos 2 y 3). */
  vehiculo: string | null;
}

export function subpasoLugar(s: {
  impactoColocado: boolean;
  /** Vehículos cuya dirección de llegada propone Croquis y el perito aún no confirma, en orden. */
  sinConfirmar: readonly string[];
  /** Vehículos sin posición final ni «No sé», en orden. */
  sinFinal: readonly string[];
}): Subpaso | null {
  if (!s.impactoColocado) return { n: 1, titulo: "Toca dónde chocaron", vehiculo: null };
  const v = s.sinConfirmar[0];
  if (v) return { n: 2, titulo: `¿Por dónde venía ${v}?`, vehiculo: v };
  const f = s.sinFinal[0];
  if (f) return { n: 3, titulo: `¿Dónde quedó ${f}?`, vehiculo: f };
  return null;
}

/**
 * La silueta vista desde arriba de una clase de vehículo, en una caja de 1 × 1 con el frente hacia
 * arriba (y = −0.5): se escala al ancho y al largo del vehículo. Autos con el frente redondeado;
 * pickup con cabina y caja; autobús, camión y tracto con cabina recta; moto y bicicleta angostas.
 */
export function siluetaClase(clase: string): string {
  if (/moto|bici/.test(clase))
    return "M -0.18 -0.5 L 0.18 -0.5 L 0.3 -0.1 L 0.3 0.25 L 0.18 0.5 L -0.18 0.5 L -0.3 0.25 L -0.3 -0.1 Z";
  if (/autobus|camion|tracto|microbus/.test(clase))
    return "M -0.46 -0.5 L 0.46 -0.5 L 0.5 -0.46 L 0.5 0.48 L 0.48 0.5 L -0.48 0.5 L -0.5 0.48 L -0.5 -0.46 Z M -0.42 -0.38 L 0.42 -0.38";
  if (/pickup/.test(clase))
    return "M -0.38 -0.5 Q 0 -0.54 0.38 -0.5 L 0.5 -0.36 L 0.5 0.5 L -0.5 0.5 L -0.5 -0.36 Z M -0.44 0.02 L 0.44 0.02";
  return "M -0.36 -0.5 Q 0 -0.55 0.36 -0.5 L 0.5 -0.32 L 0.5 0.4 Q 0.48 0.5 0.36 0.5 L -0.36 0.5 Q -0.48 0.5 -0.5 0.4 L -0.5 -0.32 Z";
}

/**
 * El contorno de la silueta de una clase (el de `siluetaClase`, con las curvas en tramos), en la caja
 * de 1 × 1 con el frente arriba (y = −0.5). Cerrado: el último punto repite el primero.
 */
export function contornoClase(clase: string): [number, number][] {
  const c: [number, number][] = /moto|bici/.test(clase)
    ? [
        [-0.18, -0.5],
        [0.18, -0.5],
        [0.3, -0.1],
        [0.3, 0.25],
        [0.18, 0.5],
        [-0.18, 0.5],
        [-0.3, 0.25],
        [-0.3, -0.1],
      ]
    : /autobus|camion|tracto|microbus/.test(clase)
      ? [
          [-0.46, -0.5],
          [0.46, -0.5],
          [0.5, -0.46],
          [0.5, 0.48],
          [0.48, 0.5],
          [-0.48, 0.5],
          [-0.5, 0.48],
          [-0.5, -0.46],
        ]
      : /pickup/.test(clase)
        ? [
            [-0.38, -0.5],
            [0, -0.52],
            [0.38, -0.5],
            [0.5, -0.36],
            [0.5, 0.5],
            [-0.5, 0.5],
            [-0.5, -0.36],
          ]
        : [
            [-0.36, -0.5],
            [-0.18, -0.525],
            [0, -0.53],
            [0.18, -0.525],
            [0.36, -0.5],
            [0.5, -0.32],
            [0.5, 0.4],
            [0.45, 0.48],
            [0.36, 0.5],
            [-0.36, 0.5],
            [-0.45, 0.48],
            [-0.5, 0.4],
            [-0.5, -0.32],
          ];
  return [...c, c[0]!];
}

/**
 * El contorno de un vehículo en el mapa (lon, lat), para su huella: la silueta de su clase con su
 * centro en `centro`, su frente hacia `rumbo` y sus medidas.
 */
export function contornoVehiculo(
  centro: LonLat,
  rumbo: number,
  largo: number,
  ancho: number,
  clase: string,
): [number, number][] {
  return contornoClase(clase).map(([x, y]) =>
    avanzar(avanzar(centro, rumbo, -y * largo), rumbo + 90, x * ancho),
  );
}
