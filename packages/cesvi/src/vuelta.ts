/**
 * La vuelta en un cruce real de la red vial (René, 2026-11-27: en el atropello, el camión cruzaba el
 * camellón donde no hay esquina). Si la narración dice que dio vuelta, la vuelta ocurre donde la calle
 * de llegada toca de verdad la calzada del choque: un vértice compartido o un cruce de segmentos, detrás
 * del choque, con la calle de llegada en la dirección de la llegada. Nunca a través de un camellón o de
 * una manzana: si no hay un cruce así, no se inventa.
 *
 * Coordenadas de la escena: x al este, y al norte (m); direcciones en radianes desde +x.
 */
import { VIAS_DE_VEHICULOS } from "./eje-calle";

type P = { x: number; y: number };

/** m: lo más lejos del choque que se busca el cruce, hacia atrás en la salida. */
export const CRUCE_MAXIMO_M = 80;
/** m: la calzada del choque pasa a menos de esto de él. */
const CALZADA_DEL_CHOQUE_M = 15;
/** Lo que se aparta una calle de la dirección (llegada o salida) y aún cuenta como alineada. */
const ALINEADA = Math.cos((35 * Math.PI) / 180);

function cruceDeSegmentos(a: P, b: P, c: P, d: P): P | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6
    ? { x: a.x + t * r.x, y: a.y + t * r.y }
    : null;
}

const unit = (a: P, b: P) => {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  return l > 0 ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l, l } : null;
};

/**
 * El cruce de la vuelta: el punto de la calzada del choque donde la calle de llegada la toca, y cuántos
 * metros hay de él al choque en la dirección de la salida. Null si no hay un cruce real.
 */
export function cruceDeLaVuelta(
  vias: readonly { tipo: string; nombre?: string; puntos: readonly P[] }[],
  choque: P,
  llegada: number,
  salida: number,
): { cruce: P; distanciaM: number; llegaPor: string | null } | null {
  const A = { x: Math.cos(llegada), y: Math.sin(llegada) };
  const H = { x: Math.cos(salida), y: Math.sin(salida) };
  const deVehiculos = vias.filter((v) => VIAS_DE_VEHICULOS.has(v.tipo) && v.puntos.length >= 2);
  // La calzada del choque: la más cercana a él de las alineadas con la salida (en una avenida de dos
  // cuerpos, el cuerpo donde está el choque, no el de enfrente).
  const distancia = (v: (typeof deVehiculos)[number]) => {
    let m = Infinity;
    for (let i = 1; i < v.puntos.length; i++) {
      const a = v.puntos[i - 1]!;
      const u = unit(a, v.puntos[i]!);
      if (!u || Math.abs(u.x * H.x + u.y * H.y) < ALINEADA) continue;
      const t = Math.max(0, Math.min(u.l, (choque.x - a.x) * u.x + (choque.y - a.y) * u.y));
      m = Math.min(m, Math.hypot(choque.x - (a.x + t * u.x), choque.y - (a.y + t * u.y)));
    }
    return m;
  };
  const conDistancia = deVehiculos
    .map((v) => ({ v, d: distancia(v) }))
    .filter((x) => x.d <= CALZADA_DEL_CHOQUE_M);
  const cerca = Math.min(...conDistancia.map((x) => x.d));
  const salidas = conDistancia.filter((x) => x.d <= cerca + 1).map((x) => x.v);
  let mejor: { cruce: P; distanciaM: number; llegaPor: string | null } | null = null;
  for (const s of salidas)
    for (const l of deVehiculos) {
      if (l === s) continue;
      for (let i = 1; i < s.puntos.length; i++)
        for (let j = 1; j < l.puntos.length; j++) {
          const C = cruceDeSegmentos(
            s.puntos[i - 1]!,
            s.puntos[i]!,
            l.puntos[j - 1]!,
            l.puntos[j]!,
          );
          if (!C) continue;
          // Detrás del choque en la salida, y no más lejos que CRUCE_MAXIMO_M.
          const d = (choque.x - C.x) * H.x + (choque.y - C.y) * H.y;
          if (d <= 0 || d > CRUCE_MAXIMO_M) continue;
          // La calle de llegada llega al cruce en la dirección de la llegada: uno de sus tramos que
          // tocan el cruce va alineado con ella y viene de atrás.
          const u = unit(l.puntos[j - 1]!, l.puntos[j]!);
          if (!u || Math.abs(u.x * A.x + u.y * A.y) < ALINEADA) continue;
          const atras = [l.puntos[j - 1]!, l.puntos[j]!].some(
            (q) => (q.x - C.x) * A.x + (q.y - C.y) * A.y < -1,
          );
          if (!atras) continue;
          if (!mejor || d < mejor.distanciaM)
            mejor = { cruce: C, distanciaM: d, llegaPor: l.nombre ?? null };
        }
    }
  return mejor;
}
