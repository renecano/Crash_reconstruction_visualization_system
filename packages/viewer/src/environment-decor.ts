/**
 * Entorno más allá de la vía (T1.3 de PLAN-CESVI v3, ADR 0096): qué se pone alrededor de la
 * escena cuando el mapa no trae nada (casi todo México), por tipo de vía y uso de suelo, con la
 * semilla de la escena. Funciones puras en planta; el grafo de escena las convierte en mallas
 * instanciadas. Todo es procedural y la leyenda lo dice: no es el lugar real.
 *
 * - **Zona:** rural (carretera, autopista, vías rápidas del mapa) o urbana (lo demás).
 * - **Relieve leve:** ruido suave de hasta `RELIEF_MAX_M`, plano en el corredor de la vía
 *   (`terrainHeightAt`), para que la física (que vive en z = 0) no cambie.
 * - **Rural:** parcelas (franjas de color del suelo), cercas con postes, árboles y arbustos en
 *   grupos, postes de luz eléctrica a lo largo de la vía.
 * - **Urbana:** lotes con edificios sencillos de 1 a 3 niveles a lo largo de cada calle (retiro de
 *   la banqueta), árboles de banqueta cada tramo, señales.
 * - **Horizonte:** un anillo de cerros a lo lejos (y, en ciudad, un perfil de edificios lejanos).
 */
import type { EscenaSpec } from "@croquis/scene-schema";
import { mulberry32 } from "./debris";

export type Zone = "rural" | "urbana";

export interface Vec2 {
  x: number;
  y: number;
}
export interface Strip {
  center: Vec2;
  length: number;
  width: number;
  heading: number;
}
export interface Via {
  puntos: readonly Vec2[];
  ancho: number;
  tipo?: string;
}

/** Altura máxima del relieve (m) y a qué distancia de la vía empieza a subir. */
export const RELIEF_MAX_M = 3;
export const RELIEF_FLAT_M = 18;
export const RELIEF_RAMP_M = 40;
/** Lado de la ventana del mundo donde se coloca el entorno (m), centrada en la acción. */
export const DECOR_WINDOW_M = 360;
/** Radio del anillo de cerros y de la silueta urbana (m). */
export const HILLS_RADIUS_M = 520;
export const HILLS_SEGMENTS = 96;
export const SKYLINE_RADIUS_M = 420;
/** Sin árboles a menos de esta distancia de la acción: no tapan el impacto a las cámaras. */
export const TREE_CLEAR_M = 22;

export interface Tree {
  x: number;
  y: number;
  /** Altura del tronco (m), radio de la copa (m), orientación (rad). */
  trunk: number;
  crown: number;
  yaw: number;
  /** 0: árbol redondo; 1: alargado (ciprés o eucalipto); 2: arbusto. */
  kind: 0 | 1 | 2;
}
export interface Building {
  x: number;
  y: number;
  /** Largo (a lo largo de la calle), fondo y alto (m), rumbo (rad, convención matemática). */
  w: number;
  d: number;
  h: number;
  yaw: number;
  /** Índice de la paleta de fachada. */
  color: number;
  floors: number;
}
export interface Pole {
  x: number;
  y: number;
  yaw: number;
}
export interface Fence {
  a: Vec2;
  b: Vec2;
}
export interface Parcel {
  /** Polígono (cuadrilátero) en planta y su tono (0–1) para el color del suelo. */
  corners: Vec2[];
  tone: number;
}

export interface EnvironmentPlan {
  zone: Zone;
  trees: Tree[];
  buildings: Building[];
  poles: Pole[];
  fences: Fence[];
  parcels: Parcel[];
  /** Altura de los cerros por segmento del anillo (m). */
  hills: number[];
  /** Silueta urbana lejana: bloques (ángulo rad, ancho angular rad, alto m); vacío en rural. */
  skyline: { angle: number; span: number; height: number }[];
}

const FAST_HIGHWAYS = /^(motorway|trunk)(_link)?$/;
const RURAL_TEMPLATES = new Set(["carretera_dos_carriles", "autopista"]);
/** Colores de fachada (hex): blancos, ocres, grises y un rosa mexicano apagado. */
export const FACADE_PALETTE = [
  "#d9d4c7",
  "#c9b99a",
  "#b7b2a8",
  "#e0cdb0",
  "#a89f94",
  "#c4a78a",
  "#d6c7bd",
  "#9fa6a3",
] as const;

export function zoneFor(lugar: EscenaSpec["lugar"], mapVias?: readonly Via[]): Zone {
  if (mapVias && mapVias.length > 0) {
    const fast = mapVias.filter((v) => v.tipo && FAST_HIGHWAYS.test(v.tipo)).length;
    return fast * 2 >= mapVias.length ? "rural" : "urbana";
  }
  return RURAL_TEMPLATES.has(lugar.tipo_via.valor) ? "rural" : "urbana";
}

/** Corredores de las vías: segmentos en planta con su medio ancho. */
export interface Corridor {
  a: Vec2;
  b: Vec2;
  half: number;
}

export function corridorsOf(
  layout: { strips: readonly Strip[] },
  mapVias?: readonly Via[],
): Corridor[] {
  const out: Corridor[] = [];
  if (mapVias && mapVias.length > 0) {
    for (const v of mapVias) {
      for (let i = 1; i < v.puntos.length; i++) {
        out.push({ a: v.puntos[i - 1]!, b: v.puntos[i]!, half: v.ancho / 2 });
      }
    }
    return out;
  }
  for (const s of layout.strips) {
    const r = (s.heading * Math.PI) / 180;
    const dx = Math.cos(r);
    const dy = Math.sin(r);
    out.push({
      a: { x: s.center.x - (dx * s.length) / 2, y: s.center.y - (dy * s.length) / 2 },
      b: { x: s.center.x + (dx * s.length) / 2, y: s.center.y + (dy * s.length) / 2 },
      half: s.width / 2,
    });
  }
  return out;
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distancia de un punto al borde de la vía más cercana (negativa dentro de la calzada). */
export function distanceToRoad(p: Vec2, corridors: readonly Corridor[]): number {
  let best = Infinity;
  for (const c of corridors) best = Math.min(best, distToSegment(p, c.a, c.b) - c.half);
  return best;
}

/** Ruido de valor suave en [0, 1] sobre el mundo (m), con celdas de `cellM`. */
export function valueNoise2D(seed: number, cellM: number): (x: number, y: number) => number {
  const rng = mulberry32(seed);
  const table = new Float32Array(512);
  for (let i = 0; i < table.length; i++) table[i] = rng();
  const at = (i: number, j: number) => table[(((i * 73 + j * 151) % 512) + 512) % 512]!;
  return (x, y) => {
    const u = x / cellM;
    const v = y / cellM;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fx = u - i;
    const fy = v - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = at(i, j) * (1 - sx) + at(i + 1, j) * sx;
    const bottom = at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
}

/**
 * Altura del terreno (m) en un punto: ruido suave que empieza a subir a `RELIEF_FLAT_M` del borde
 * de la vía y llega a su valor pleno a `RELIEF_FLAT_M + RELIEF_RAMP_M`. En el corredor es 0.
 */
export function terrainHeightAt(
  seed: number,
  corridors: readonly Corridor[],
  zone: Zone,
): (x: number, y: number) => number {
  const noise = valueNoise2D(Math.trunc(seed) * 17 + 9, zone === "rural" ? 60 : 45);
  const max = zone === "rural" ? RELIEF_MAX_M : RELIEF_MAX_M * 0.5;
  return (x, y) => {
    const d = distanceToRoad({ x, y }, corridors);
    if (d <= RELIEF_FLAT_M) return 0;
    const k = Math.min(1, (d - RELIEF_FLAT_M) / RELIEF_RAMP_M);
    const s = k * k * (3 - 2 * k);
    return s * max * (noise(x, y) - 0.5) * 2 * 0.5 + s * max * 0.25;
  };
}

export interface PlanOptions {
  seed: number;
  center: Vec2;
  /** Máximo de árboles (por nivel de calidad, `QualityProfile.maxTrees`). */
  maxTrees: number;
  maxBuildings?: number;
}

/** Puntos a lo largo de un corredor, a `offset` m de su borde, cada `step` m, de ambos lados. */
function alongCorridors(
  corridors: readonly Corridor[],
  offset: number,
  step: number,
  phase: number,
  cb: (p: Vec2, dir: Vec2, side: number, s: number) => void,
): void {
  for (const c of corridors) {
    const len = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
    if (len < step) continue;
    const ux = (c.b.x - c.a.x) / len;
    const uy = (c.b.y - c.a.y) / len;
    for (const side of [-1, 1]) {
      const nx = -uy * side;
      const ny = ux * side;
      for (let s = phase; s <= len - phase; s += step) {
        cb(
          {
            x: c.a.x + ux * s + nx * (c.half + offset),
            y: c.a.y + uy * s + ny * (c.half + offset),
          },
          { x: ux, y: uy },
          side,
          s,
        );
      }
    }
  }
}

export function planEnvironment(
  lugar: EscenaSpec["lugar"],
  layout: { strips: readonly Strip[] },
  mapVias: readonly Via[] | undefined,
  opts: PlanOptions,
): EnvironmentPlan {
  const zone = zoneFor(lugar, mapVias);
  const corridors = corridorsOf(layout, mapVias);
  const rng = mulberry32(Math.trunc(opts.seed) * 29 + 7);
  const half = DECOR_WINDOW_M / 2;
  const inWindow = (p: Vec2) =>
    Math.abs(p.x - opts.center.x) <= half && Math.abs(p.y - opts.center.y) <= half;
  const trees: Tree[] = [];
  const buildings: Building[] = [];
  const poles: Pole[] = [];
  const fences: Fence[] = [];
  const parcels: Parcel[] = [];
  const occupied: { x: number; y: number; r: number }[] = [];
  const free = (p: Vec2, r: number) =>
    occupied.every((o) => Math.hypot(o.x - p.x, o.y - p.y) > o.r + r);

  if (zone === "urbana") {
    // Lotes con edificios a lo largo de cada calle, con retiro de la banqueta; esquinas libres.
    // Retiro de la calzada (banqueta y patio) y un claro alrededor de la acción para que las
    // cámaras no queden tapadas por una fachada.
    const setback = 7;
    const clearR = 28;
    alongCorridors(corridors, setback, 1, 10, (p, dir, side, s) => {
      void s;
      if (!inWindow(p)) return;
      const w = 8 + rng() * 10;
      const d = 9 + rng() * 6;
      // El centro del lote queda a medio fondo del retiro.
      const cx = p.x + -dir.y * side * (d / 2);
      const cy = p.y + dir.x * side * (d / 2);
      const c = { x: cx, y: cy };
      // Cerca de otra calle (esquina o calle paralela) no cabe: deja libre.
      if (distanceToRoad(c, corridors) < setback - 0.5) return;
      if (Math.hypot(cx - opts.center.x, cy - opts.center.y) < clearR + Math.max(w, d) / 2) return;
      if (!free(c, Math.max(w, d) / 2 + 1.5)) return;
      // Cerca de la acción, bajos (1–2 niveles): lo alto va al fondo.
      const near = Math.hypot(cx - opts.center.x, cy - opts.center.y) < 70;
      const floors = 1 + Math.floor(rng() * (near ? 2 : 3));
      buildings.push({
        x: cx,
        y: cy,
        w,
        d,
        h: floors * 3.2 + rng() * 0.6,
        yaw: Math.atan2(dir.y, dir.x),
        color: Math.floor(rng() * FACADE_PALETTE.length),
        floors,
      });
      occupied.push({ x: cx, y: cy, r: Math.max(w, d) / 2 + 1.5 });
    });
    // Árboles de banqueta cada 15 m, a 1.5 m del borde de la calzada.
    alongCorridors(corridors, 1.5, 15, 7, (p) => {
      if (!inWindow(p) || trees.length >= opts.maxTrees) return;
      if (distanceToRoad(p, corridors) < 1 || !free(p, 2)) return;
      // Claro alrededor de la acción: un árbol de banqueta tapaba el impacto en la cinematográfica.
      if (Math.hypot(p.x - opts.center.x, p.y - opts.center.y) < TREE_CLEAR_M) return;
      trees.push({
        x: p.x,
        y: p.y,
        trunk: 2.6 + rng() * 1.2,
        crown: 1.3 + rng() * 0.8,
        yaw: rng() * Math.PI * 2,
        kind: 0,
      });
      occupied.push({ x: p.x, y: p.y, r: 2 });
    });
  } else {
    // Parcelas: franjas perpendiculares a la vía, de 60–120 m, a cada lado, con su tono.
    for (const c of corridors) {
      const len = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
      if (len < 10) continue;
      const ux = (c.b.x - c.a.x) / len;
      const uy = (c.b.y - c.a.y) / len;
      for (const side of [-1, 1]) {
        const nx = -uy * side;
        const ny = ux * side;
        let s = 0;
        while (s < len) {
          const w = 60 + rng() * 60;
          const d0 = c.half + 6;
          const d1 = d0 + 120 + rng() * 60;
          const at = (along: number, off: number): Vec2 => ({
            x: c.a.x + ux * along + nx * off,
            y: c.a.y + uy * along + ny * off,
          });
          const e = Math.min(len, s + w);
          parcels.push({ corners: [at(s, d0), at(e, d0), at(e, d1), at(s, d1)], tone: rng() });
          // Cerca entre parcelas, del borde del derecho de vía hacia afuera.
          fences.push({ a: at(e, d0), b: at(e, d0 + 40) });
          s = e;
        }
        // Cerca a lo largo del derecho de vía.
        fences.push({
          a: at0(c, ux, uy, nx, ny, 0, c.half + 6),
          b: at0(c, ux, uy, nx, ny, len, c.half + 6),
        });
      }
    }
    // Postes de luz eléctrica cada 45 m, de un lado.
    alongCorridors(corridors, 5, 45, 20, (p, dir, side) => {
      if (side !== 1 || !inWindow(p)) return;
      poles.push({ x: p.x, y: p.y, yaw: Math.atan2(dir.y, dir.x) });
      occupied.push({ x: p.x, y: p.y, r: 1.5 });
    });
    // Árboles y arbustos en grupos, nunca a menos de 8 m del borde de la vía.
    const clusters = 10 + Math.floor(rng() * 6);
    for (let k = 0; k < clusters && trees.length < opts.maxTrees; k++) {
      const cx = opts.center.x + (rng() - 0.5) * DECOR_WINDOW_M;
      const cy = opts.center.y + (rng() - 0.5) * DECOR_WINDOW_M;
      const n = 6 + Math.floor(rng() * 14);
      for (let i = 0; i < n && trees.length < opts.maxTrees; i++) {
        const r = rng() * 22;
        const a = rng() * Math.PI * 2;
        const p = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
        if (!inWindow(p) || distanceToRoad(p, corridors) < 8 || !free(p, 2.5)) continue;
        if (Math.hypot(p.x - opts.center.x, p.y - opts.center.y) < TREE_CLEAR_M) continue;
        const bush = rng() < 0.35;
        trees.push({
          x: p.x,
          y: p.y,
          trunk: bush ? 0.3 : 2.5 + rng() * 2.5,
          crown: bush ? 0.9 + rng() * 0.6 : 1.8 + rng() * 1.6,
          yaw: rng() * Math.PI * 2,
          kind: bush ? 2 : rng() < 0.3 ? 1 : 0,
        });
        occupied.push({ x: p.x, y: p.y, r: 2.5 });
      }
    }
  }
  // Cerros a lo lejos: alturas suaves por segmento; en ciudad más bajos y con silueta de edificios.
  const hillNoise = valueNoise2D(Math.trunc(opts.seed) * 31 + 11, 1);
  const hills: number[] = [];
  for (let i = 0; i < HILLS_SEGMENTS; i++) {
    const u = (i / HILLS_SEGMENTS) * 8;
    const n = 0.6 * hillNoise(u, 0.5) + 0.4 * hillNoise(u * 3, 7.5);
    hills.push((zone === "rural" ? 50 : 25) + n * (zone === "rural" ? 110 : 55));
  }
  const skyline: EnvironmentPlan["skyline"] = [];
  if (zone === "urbana") {
    const blocks = 28 + Math.floor(rng() * 12);
    for (let i = 0; i < blocks; i++) {
      skyline.push({
        angle: rng() * Math.PI * 2,
        span: 0.03 + rng() * 0.06,
        height: 8 + rng() * 18,
      });
    }
  }
  return {
    zone,
    trees,
    buildings: buildings.slice(0, opts.maxBuildings ?? 160),
    poles,
    fences,
    parcels,
    hills,
    skyline,
  };
}

function at0(
  c: Corridor,
  ux: number,
  uy: number,
  nx: number,
  ny: number,
  along: number,
  off: number,
): Vec2 {
  return { x: c.a.x + ux * along + nx * off, y: c.a.y + uy * along + ny * off };
}
