/**
 * El encuadre de la maqueta en 2D (W6, O3; PLAN-CESVI §3.4): qué parte de la escena se ve y cómo se
 * mueve el perito por ella. Sin interfaz, para probarlo solo.
 *
 * - **«Ver todo»:** la caja de todo lo que importa (las trayectorias completas, los reposos, la
 *   evidencia física, los puntos de paso, los objetos, el terreno marcado y los impactos), con margen.
 * - **«Ir al impacto»:** el encuadre de siempre (`encuadre` de `maqueta.ts`): el impacto, los
 *   últimos segundos de cada vehículo y su reposo.
 * - **Acercar, alejar y desplazar:** alrededor de un punto que no se mueve en pantalla, con límites.
 *
 * Coordenadas: las de la escena en metros (X al este, Y al norte). Una vista es la caja visible
 * [x0, y0, x1, y1] en esos metros.
 */
import { encuadre, poseEn, tImpacto, type ResultadoMaqueta } from "./maqueta";

export type Caja = readonly [number, number, number, number];
type XY = { x: number; y: number };

/** Lo más cerca que se acerca: 6 m por lado. */
export const LADO_MINIMO_M = 6;
/** Lo más lejos que se aleja: 4 veces «Ver todo», y nunca más de 3 km. */
export const ALEJAR_MAXIMO = 4;
export const LADO_MAXIMO_M = 3000;

/** Lo que la escena tiene en el plano, además del resultado: evidencia, puntos de paso, objetos y terreno. */
export interface EscenaPlano {
  evidencias?: { puntos?: XY[] }[];
  vehiculos?: { puntos_paso?: { posicion?: XY }[]; posicion_final?: { x?: number; y?: number } }[];
  entorno?: { objetos?: { posicion?: XY }[] };
  eventos?: { punto_impacto?: XY }[];
  lugar?: {
    terreno?: {
      superficies?: { poligono: XY[] }[];
      ondulaciones?: { poligono: XY[] }[];
      topes?: { linea: XY[] }[];
    };
  };
}

const finito = (p: Partial<XY> | undefined): p is XY =>
  p !== undefined && Number.isFinite(p.x) && Number.isFinite(p.y);

/**
 * Los puntos que «Ver todo» debe dejar a la vista. Las zonas del terreno no entran (una de «todo el
 * lugar» mide 400 m y se comería el encuadre); sí sus topes, que son marcas puntuales.
 */
export function puntosDeInteres(spec: EscenaPlano, r: ResultadoMaqueta): XY[] {
  const out: XY[] = [];
  for (const v of r.vehiculos) {
    const tr = v.trayectoria;
    // Cada 0.25 s alcanza para la caja y no carga miles de puntos.
    const paso = Math.max(1, Math.round(0.25 / Math.max(tr.t[1]! - tr.t[0]!, 1e-3)));
    for (let i = 0; i < tr.x.length; i += paso) out.push({ x: tr.x[i]!, y: tr.y[i]! });
    if (tr.x.length) out.push({ x: tr.x.at(-1)!, y: tr.y.at(-1)! });
    if (finito(v.pose_final)) out.push(v.pose_final);
  }
  if (finito(r.punto_impacto ?? undefined)) out.push(r.punto_impacto!);
  for (const e of spec.evidencias ?? []) for (const p of e.puntos ?? []) if (finito(p)) out.push(p);
  for (const v of spec.vehiculos ?? []) {
    for (const p of v.puntos_paso ?? []) if (finito(p.posicion)) out.push(p.posicion);
    if (finito(v.posicion_final)) out.push(v.posicion_final);
  }
  for (const o of spec.entorno?.objetos ?? []) if (finito(o.posicion)) out.push(o.posicion);
  for (const ev of spec.eventos ?? []) if (finito(ev.punto_impacto)) out.push(ev.punto_impacto);
  for (const t of spec.lugar?.terreno?.topes ?? [])
    for (const p of t.linea) if (finito(p)) out.push(p);
  return out;
}

/** La caja de los puntos con `margen` metros, y al menos `minimo` por lado. */
export function cajaDePuntos(puntos: readonly XY[], margen = 8, minimo = 30): Caja {
  if (!puntos.length) return [-minimo / 2, -minimo / 2, minimo / 2, minimo / 2];
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of puntos) {
    a = Math.min(a, p.x);
    b = Math.min(b, p.y);
    c = Math.max(c, p.x);
    d = Math.max(d, p.y);
  }
  [a, b, c, d] = [a - margen, b - margen, c + margen, d + margen];
  if (c - a < minimo) [a, c] = [(a + c) / 2 - minimo / 2, (a + c) / 2 + minimo / 2];
  if (d - b < minimo) [b, d] = [(b + d) / 2 - minimo / 2, (b + d) / 2 + minimo / 2];
  return [a, b, c, d];
}

/** «Ver todo»: la caja de todo lo que importa de la escena. */
export const verTodo = (spec: EscenaPlano, r: ResultadoMaqueta): Caja =>
  cajaDePuntos(puntosDeInteres(spec, r));

/** «Ir al impacto»: el impacto, los últimos 2.5 s de cada vehículo y su reposo. */
export const irAlImpacto = (r: ResultadoMaqueta): Caja => encuadre(r);

/** La caja con la proporción `ancho / alto` de la pantalla, sin recortar: crece por el lado corto. */
export function conProporcion(c: Caja, aspecto: number): Caja {
  if (!(aspecto > 0) || !Number.isFinite(aspecto)) return c;
  const [a, b, x, y] = c;
  const w = x - a;
  const h = y - b;
  const cx = (a + x) / 2;
  const cy = (b + y) / 2;
  if (w / h < aspecto) {
    const w2 = h * aspecto;
    return [cx - w2 / 2, b, cx + w2 / 2, y];
  }
  const h2 = w / aspecto;
  return [a, cy - h2 / 2, x, cy + h2 / 2];
}

/** Lo que tapan los paneles encima de la maqueta, en pixeles de pantalla. */
export interface Margenes {
  arriba: number;
  abajo: number;
  izq: number;
  der: number;
}
export const SIN_MARGENES: Margenes = { arriba: 0, abajo: 0, izq: 0, der: 0 };

/**
 * La vista (con la proporción de una pantalla de `w` × `h` pixeles) en la que la caja `c` queda
 * entera dentro de lo que no tapan los paneles, centrada en ese hueco. Si los márgenes dejan menos
 * de la mitad de la pantalla, se ignoran: mejor algo tapado que una escena diminuta.
 */
export function encajar(c: Caja, w: number, h: number, m: Margenes = SIN_MARGENES): Caja {
  if (!(w > 0 && h > 0)) return c;
  const libreW = w - m.izq - m.der;
  const libreH = h - m.arriba - m.abajo;
  const mm = libreW >= w / 2 && libreH >= h / 2 ? m : SIN_MARGENES;
  const aw = w - mm.izq - mm.der;
  const ah = h - mm.arriba - mm.abajo;
  // Metros por pixel: lo justo para que la caja quepa en el hueco.
  const k = Math.max((c[2] - c[0]) / aw, (c[3] - c[1]) / ah);
  const cx = (c[0] + c[2]) / 2;
  const cy = (c[1] + c[3]) / 2;
  const x0 = cx - (mm.izq + aw / 2) * k;
  // La pantalla crece hacia abajo; la escena, hacia el norte.
  const y1 = cy + (mm.arriba + ah / 2) * k;
  return [x0, y1 - h * k, x0 + w * k, y1];
}

/**
 * La vista acercada (`factor` > 1) o alejada (`factor` < 1) alrededor de `ancla`, que se queda en el
 * mismo lugar de la pantalla. El lado no baja de `LADO_MINIMO_M` ni pasa de `ALEJAR_MAXIMO` veces
 * `todo` (ni de `LADO_MAXIMO_M`).
 */
export function acercar(v: Caja, factor: number, ancla: XY, todo: Caja): Caja {
  const [a, b, c, d] = v;
  const lado = Math.max(c - a, d - b);
  const ladoTodo = Math.max(todo[2] - todo[0], todo[3] - todo[1]);
  const maximo = Math.min(LADO_MAXIMO_M, Math.max(ladoTodo * ALEJAR_MAXIMO, LADO_MINIMO_M));
  const nuevo = Math.min(maximo, Math.max(LADO_MINIMO_M, lado / factor));
  const k = nuevo / lado;
  return [
    ancla.x + (a - ancla.x) * k,
    ancla.y + (b - ancla.y) * k,
    ancla.x + (c - ancla.x) * k,
    ancla.y + (d - ancla.y) * k,
  ];
}

/**
 * La vista desplazada `dx`, `dy` metros. El centro no se sale de `todo` agrandado por la mitad de
 * la vista: lo que importa nunca queda fuera de la pantalla del todo.
 */
export function desplazar(v: Caja, dx: number, dy: number, todo: Caja): Caja {
  const [a, b, c, d] = v;
  const w = c - a;
  const h = d - b;
  const cx = Math.min(todo[2] + w / 2, Math.max(todo[0] - w / 2, (a + c) / 2 + dx));
  const cy = Math.min(todo[3] + h / 2, Math.max(todo[1] - h / 2, (b + d) / 2 + dy));
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

/** El largo de la escala gráfica (m): 1, 2 o 5 por una potencia de 10, cerca de un quinto del ancho. */
export function escalaGrafica(anchoM: number): number {
  const objetivo = anchoM / 5;
  const pot = 10 ** Math.floor(Math.log10(Math.max(objetivo, 1e-6)));
  return [5, 2, 1].map((k) => k * pot).find((x) => x <= objetivo) ?? pot;
}

/** Cuánto se ve de la escena, para decirlo («Ves 120 m de ancho»). */
export const anchoVisible = (v: Caja) => v[2] - v[0];

/** La vista que abre la maqueta: «Ver todo» con la proporción de la pantalla. */
export function vistaInicial(spec: EscenaPlano, r: ResultadoMaqueta, aspecto: number): Caja {
  return conProporcion(verTodo(spec, r), aspecto);
}

/** Dónde está cada vehículo en el instante del impacto (para comprobar que se ve). */
export const posesEnImpacto = (r: ResultadoMaqueta) =>
  r.vehiculos.map((v) => poseEn(v.trayectoria, tImpacto(r)));
