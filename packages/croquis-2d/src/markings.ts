/**
 * Marcas del pavimento que comparten el croquis 2D y el visor 3D, según la NOM-034-SCT2/SEDATU-2022
 * (DOF del 19 de septiembre de 2023): el paso peatonal (M-7, inciso 5.9; ADR 0042) y la raya de
 * alto (M-6, inciso 5.8; ADR 0044). El visor las convierte en triángulos y el croquis en trazos,
 * así que los dos las ponen en el mismo lugar.
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import type { Vec2 } from "./geometry";
import type { LaneStrip, RoadLayout } from "./layout";
import { mapCrossings, PARALLEL_COS, segmentDistance, type MapVia } from "./map-roads";

/** Ancho de la banqueta (m). */
export const SIDEWALK_WIDTH = 2.5;

/** Franjas del paso peatonal (5.9): de 40 cm, separadas 40 cm, en todo el ancho de la calle. */
export const CROSSWALK_STRIPE = 0.4;
export const CROSSWALK_GAP = 0.4;
/**
 * Longitud mínima de las franjas (NOM-034, Tabla 8): carretera 2 m, calle primaria 6 m y calles
 * secundaria y terciaria 4 m.
 */
export const CROSSWALK_LENGTH_M = { carretera: 2, primaria: 6, secundaria: 4 } as const;

/** Un paso peatonal: centro, rumbo y ancho de la vía que cruza, y largo de sus franjas (m). */
export interface Crosswalk {
  center: Vec2;
  roadHeading: number;
  roadWidth: number;
  length: number;
}

/**
 * Largo de las franjas del paso peatonal según la vía (NOM-034, 5.9 y Tabla 8), nunca menor que
 * el ancho de las banquetas que une. La escena no dice si la calle es primaria: se toma como
 * primaria la de dos carriles o más por sentido (supuesto del ADR 0042).
 */
export function crosswalkLength(
  tipoVia: string | undefined,
  carrilesPorSentido: number,
  banquetas: boolean,
): number {
  const base =
    tipoVia === "carretera_dos_carriles" || tipoVia === "autopista"
      ? CROSSWALK_LENGTH_M.carretera
      : carrilesPorSentido >= 2
        ? CROSSWALK_LENGTH_M.primaria
        : CROSSWALK_LENGTH_M.secundaria;
  return banquetas ? Math.max(base, SIDEWALK_WIDTH) : base;
}

/** Los pasos peatonales de la escena, a lo ancho de su vía principal (`mainWidth`). */
export function sceneCrosswalks(lugar: EscenaSpec["lugar"], mainWidth: number): Crosswalk[] {
  const length = crosswalkLength(
    lugar.tipo_via.valor,
    lugar.carriles_por_sentido.valor,
    lugar.banquetas?.valor ?? false,
  );
  return (lugar.dispositivos ?? [])
    .filter((d) => d.tipo === "paso_peatonal")
    .map((d) => ({
      center: { x: d.posicion.x, y: d.posicion.y },
      roadHeading: d.orientacion_deg ?? 0,
      roadWidth: mainWidth,
      length,
    }));
}

/** ¿p cae en el paso peatonal? */
export function insideCrosswalk(p: Vec2, cw: Crosswalk): boolean {
  const d = dir(cw.roadHeading);
  const rel = { x: p.x - cw.center.x, y: p.y - cw.center.y };
  return (
    Math.abs(rel.x * d.x + rel.y * d.y) <= cw.length / 2 &&
    Math.abs(-rel.x * d.y + rel.y * d.x) <= cw.roadWidth / 2
  );
}

/**
 * Raya de alto (5.8): 60 cm de ancho, a 1.20 m antes del paso peatonal o, sin paso, a no menos de
 * 1.20 m de la orilla de la vía que se cruza; cruza todos los carriles del mismo sentido.
 */
export const STOP_LINE_WIDTH = 0.6;
export const STOP_LINE_GAP = 1.2;

/** Una raya de alto: centro, rumbo del tránsito que detiene (grados) y largo a lo ancho (m). */
export interface StopLine {
  center: Vec2;
  heading: number;
  length: number;
}

function dir(headingDeg: number): Vec2 {
  const h = (headingDeg * Math.PI) / 180;
  return { x: Math.cos(h), y: Math.sin(h) };
}

function insideStrip(p: Vec2, s: LaneStrip, margin = 0): boolean {
  const d = dir(s.heading);
  const rel = { x: p.x - s.center.x, y: p.y - s.center.y };
  const along = rel.x * d.x + rel.y * d.y;
  const across = -rel.x * d.y + rel.y * d.x;
  return Math.abs(along) <= s.length / 2 + margin && Math.abs(across) <= s.width / 2 + margin;
}

/**
 * Vehículos a cuyo flujo aplica un semáforo o un alto: los de `aplica_a` y los de sus fases.
 * Sin ellos, un semáforo aplica a todos (controla el cruce) y un alto, al vehículo más cercano.
 */
export function controlledVehicles(spec: EscenaSpec): string[] {
  const ids = new Set(spec.vehiculos.map((v) => v.id));
  const out = new Set<string>();
  for (const d of spec.lugar.dispositivos ?? []) {
    if (d.tipo !== "semaforo" && d.tipo !== "alto") continue;
    const named = [...(d.aplica_a ?? []), ...(d.fases ?? []).map((f) => f.movimiento)].filter(
      (id) => ids.has(id),
    );
    if (named.length > 0) {
      for (const id of named) out.add(id);
    } else if (d.tipo === "semaforo") {
      for (const id of ids) out.add(id);
    } else {
      let best: string | null = null;
      let bestD = Infinity;
      for (const v of spec.vehiculos) {
        const dd = Math.hypot(
          v.posicion_inicial.x - d.posicion.x,
          v.posicion_inicial.y - d.posicion.y,
        );
        if (dd < bestD) {
          bestD = dd;
          best = v.id;
        }
      }
      if (best !== null) out.add(best);
    }
  }
  return spec.vehiculos.map((v) => v.id).filter((id) => out.has(id));
}

/** La calle por la que llega un vehículo: su eje cerca de un punto, ancho, camellón y sentido. */
interface Approach {
  /** Punto del eje más cercano a `q` y dirección unitaria del eje ahí. */
  axis: (q: Vec2) => { a: Vec2; u: Vec2 };
  width: number;
  median: number;
  oneWay: boolean;
  /** ¿q está en la calzada de una calle que cruza a esta? */
  crossing: (q: Vec2) => boolean;
}

function templateApproach(
  p: Vec2,
  d: Vec2,
  layout: RoadLayout,
  dobleSentido: boolean,
): Approach | null {
  const s = layout.strips.find((st) => {
    const sd = dir(st.heading);
    return insideStrip(p, st, 1) && Math.abs(sd.x * d.x + sd.y * d.y) >= PARALLEL_COS;
  });
  if (!s) return null;
  const sd = dir(s.heading);
  const others = layout.strips.filter((o) => {
    const od = dir(o.heading);
    return o !== s && Math.abs(od.x * sd.x + od.y * sd.y) < PARALLEL_COS;
  });
  return {
    axis: (q) => {
      const t = (q.x - s.center.x) * sd.x + (q.y - s.center.y) * sd.y;
      return { a: { x: s.center.x + sd.x * t, y: s.center.y + sd.y * t }, u: sd };
    },
    width: s.width,
    median: s.median,
    oneWay: !dobleSentido,
    crossing: (q) =>
      others.some((o) => insideStrip(q, o)) ||
      layout.rings.some((r) => Math.hypot(q.x - r.center.x, q.y - r.center.y) <= r.outerRadius),
  };
}

function mapApproach(p: Vec2, d: Vec2, vias: readonly MapVia[]): Approach | null {
  let best: MapVia | null = null;
  let bestD = Infinity;
  for (const v of vias) {
    for (let i = 0; i + 1 < v.puntos.length; i++) {
      const r = segmentDistance(p, v.puntos[i]!, v.puntos[i + 1]!);
      if (Math.abs(r.d.x * d.x + r.d.y * d.y) >= PARALLEL_COS && r.dist < bestD) {
        bestD = r.dist;
        best = v;
      }
    }
  }
  if (!best || bestD > best.ancho / 2 + 1) return null;
  const via = best;
  const { inCrossing } = mapCrossings(vias);
  const axis = (q: Vec2): { a: Vec2; u: Vec2 } => {
    let out = { a: via.puntos[0]!, u: { x: 1, y: 0 } };
    let dmin = Infinity;
    for (let i = 0; i + 1 < via.puntos.length; i++) {
      const a = via.puntos[i]!;
      const r = segmentDistance(q, a, via.puntos[i + 1]!);
      if (r.dist < dmin) {
        dmin = r.dist;
        const t = (q.x - a.x) * r.d.x + (q.y - a.y) * r.d.y;
        out = { a: { x: a.x + r.d.x * t, y: a.y + r.d.y * t }, u: r.d };
      }
    }
    return out;
  };
  return {
    axis,
    width: via.ancho,
    median: 0,
    oneWay: via.unSentido ?? false,
    crossing: (q) => inCrossing(q, via, axis(q).u, 0),
  };
}

/** Paso con el que se recorre el camino del vehículo hacia el cruce (m) y hasta dónde. */
const STEP_M = 0.05;
const REACH_M = 80;

/**
 * Rayas de alto (ADR 0044) en los accesos de los vehículos que controla un semáforo o un alto.
 *
 * - **Dónde:** se avanza desde la posición inicial del vehículo, en su rumbo, hasta la calzada de
 *   la calle que cruza. La raya queda 1.20 m antes de esa orilla, o 1.20 m antes del paso
 *   peatonal si lo hay en el camino (5.8).
 * - **A lo ancho:** los carriles de su sentido. En doble sentido es la mitad derecha, del camellón
 *   a la orilla; en un sentido, todo el ancho.
 * - **Sin cruce:** en una recta no hay vía que se cruce y la escena no dice dónde se detienen los
 *   vehículos (la posición del dispositivo es un supuesto de acomodo), así que no se dibuja.
 *
 * `vias` son las calles del mapa si la escena las trae (ADR 0023); si no, se usa la plantilla.
 */
export function stopLines(
  spec: EscenaSpec,
  layout: RoadLayout,
  vias: readonly MapVia[] | undefined,
  crosswalks: readonly Crosswalk[],
): StopLine[] {
  const dobleSentido = spec.lugar.sentidos.valor === "doble_sentido";
  const ids = new Set(controlledVehicles(spec));
  const out: StopLine[] = [];
  for (const v of spec.vehiculos) {
    if (!ids.has(v.id)) continue;
    const p = { x: v.posicion_inicial.x, y: v.posicion_inicial.y };
    const d = dir(v.posicion_inicial.rumbo_deg);
    const road = vias ? mapApproach(p, d, vias) : templateApproach(p, d, layout, dobleSentido);
    if (!road || road.crossing(p)) continue;
    const at = (t: number): Vec2 => ({ x: p.x + d.x * t, y: p.y + d.y * t });
    let edge: number | null = null;
    let walk: number | null = null;
    for (let t = 0; t <= REACH_M; t += STEP_M) {
      const q = at(t);
      if (walk === null && crosswalks.some((cw) => insideCrosswalk(q, cw))) walk = t;
      if (road.crossing(q)) {
        edge = t;
        break;
      }
    }
    if (edge === null) continue;
    const stopAt = (walk ?? edge) - STOP_LINE_GAP - STOP_LINE_WIDTH / 2;
    if (stopAt <= 0) continue;
    const { a, u } = road.axis(at(stopAt));
    const forward = u.x * d.x + u.y * d.y >= 0 ? 1 : -1;
    const n = { x: -u.y, y: u.x };
    const half = road.width / 2;
    // Lado derecho del tránsito: con el eje a favor queda en -n; en contra, en +n.
    const [lo, hi] = road.oneWay
      ? [-half, half]
      : forward > 0
        ? [-half, -road.median / 2]
        : [road.median / 2, half];
    const mid = (lo + hi) / 2;
    const heading = (Math.atan2(u.y * forward, u.x * forward) * 180) / Math.PI;
    const line = {
      center: { x: a.x + n.x * mid, y: a.y + n.y * mid },
      heading,
      length: hi - lo,
    };
    if (
      out.every((o) => Math.hypot(o.center.x - line.center.x, o.center.y - line.center.y) > 0.5)
    ) {
      out.push(line);
    }
  }
  return out;
}
