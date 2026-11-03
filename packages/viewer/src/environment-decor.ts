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
/** Capas de cerros (T1.3b): radio (m) y segmentos de un anillo completo. El de 520 m era un tazón. */
export const HILL_LAYERS: readonly { radius: number; segments: number }[] = [
  { radius: 1100, segments: 128 },
  { radius: 720, segments: 96 },
  { radius: 430, segments: 72 },
];
export const HILLS_SEGMENTS = HILL_LAYERS[0]!.segments;
export const SKYLINE_RADIUS_M = 420;

/** Un tramo de cerros: anillo (o arco) a un radio, con la altura de cada segmento. */
export interface HillLayer {
  radius: number;
  /** Ángulo inicial y final del arco (rad); el anillo completo va de 0 a 2π. */
  from: number;
  to: number;
  heights: number[];
}
/** Sin árboles a menos de esta distancia de la acción: no tapan el impacto a las cámaras. */
export const TREE_CLEAR_M = 22;

/** Especies comunes en México (T1.3b): tres horneadas de Poly Haven y la palmera procedural. */
export type TreeSpecies = "jacaranda" | "fresno" | "pirul" | "palmera";

export interface Tree {
  x: number;
  y: number;
  /** Altura del tronco (m), radio de la copa (m), orientación (rad). */
  trunk: number;
  crown: number;
  yaw: number;
  /** 0: árbol redondo; 1: alargado (ciprés o eucalipto); 2: arbusto. */
  kind: 0 | 1 | 2;
  /** Especie del impostor (T1.3b) y altura total (m); los arbustos no la llevan. */
  species?: TreeSpecies;
  height?: number;
}

/** Reparto de especies por zona (fracciones acumuladas). */
export function speciesFor(zone: Zone, u: number): TreeSpecies {
  if (zone === "urbana") return u < 0.5 ? "fresno" : u < 0.85 ? "jacaranda" : "palmera";
  return u < 0.5 ? "pirul" : u < 0.9 ? "fresno" : "jacaranda";
}

/** Altura total típica de cada especie (m) con una variación `u` en [0, 1). */
const TREE_HEIGHTS: Record<TreeSpecies, readonly [number, number]> = {
  jacaranda: [8, 12],
  fresno: [8, 14],
  pirul: [6, 9],
  palmera: [7, 12],
};

export function treeHeightFor(species: TreeSpecies, u: number): number {
  const [lo, hi] = TREE_HEIGHTS[species];
  return lo + (hi - lo) * u;
}
/** Señal de tránsito genérica (T1.3b): sin texto ni número real. */
export interface Sign {
  x: number;
  y: number;
  /** Hacia dónde mira la placa (rad). */
  yaw: number;
  kind: "alto" | "ceda" | "velocidad" | "informativa";
}

export interface Building {
  /** Hacia dónde da la fachada principal (rad), la que mira a la calle. */
  front: number;
  /** Aplanado pintado o tabique visible. */
  material: "yeso" | "tabique";
  /** Planta baja: cortina metálica, toldo y letrero (sin texto). */
  shutter: boolean;
  awning: boolean;
  sign: boolean;
  /** Azotea: tinacos, antena y varillas. */
  tinacos: number;
  antenna: boolean;
  rebar: boolean;
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
  hills: HillLayer[];
  signs: Sign[];
  /** Silueta urbana lejana: bloques (ángulo rad, ancho angular rad, alto m); vacío en rural. */
  skyline: { angle: number; span: number; height: number }[];
}

const FAST_HIGHWAYS = /^(motorway|trunk)(_link)?$/;
const RURAL_TEMPLATES = new Set(["carretera_dos_carriles", "autopista"]);
/** Colores de fachada (hex): blancos, ocres, grises y un rosa mexicano apagado. */
/** Concreto pintado a la mexicana (T1.3b): rosa, ocre, azul, lima, terracota, blanco, lila… */
export const FACADE_PALETTE_MX = [
  "#e8d7b5",
  "#d9a066",
  "#c1532f",
  "#e7a5b8",
  "#6fa8c9",
  "#a9c47a",
  "#f1efe9",
  "#c8b7d8",
  "#8a5a44",
  "#f0c75e",
  "#d94f70",
  "#2f6f8f",
] as const;

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
  const signs: Sign[] = [];
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
      // Variedad de alturas (T1.3b): hasta cuatro niveles lejos de la acción, casi siempre uno o dos.
      const floors = near ? 1 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * rng() * 4);
      const comercio = rng() < 0.45;
      buildings.push({
        x: cx,
        y: cy,
        w,
        d,
        h: floors * 3.2 + rng() * 0.6,
        yaw: Math.atan2(dir.y, dir.x),
        color: Math.floor(rng() * FACADE_PALETTE_MX.length),
        floors,
        // La fachada mira a la calle: en contra de la normal con la que se corrió el lote.
        front: Math.atan2(-dir.x * side, dir.y * side),
        material: rng() < 0.22 ? "tabique" : "yeso",
        shutter: comercio,
        awning: comercio && rng() < 0.6,
        sign: comercio && rng() < 0.8,
        tinacos: rng() < 0.75 ? 1 + Math.floor(rng() * 2) : 0,
        antenna: rng() < 0.5,
        rebar: rng() < 0.55,
      });
      occupied.push({ x: cx, y: cy, r: Math.max(w, d) / 2 + 1.5 });
    });
    // Señales de tránsito genéricas en la banqueta, cada 70 m; ninguna a menos de 12 m del impacto.
    const kinds: Sign["kind"][] = ["alto", "velocidad", "ceda", "informativa"];
    let k = 0;
    alongCorridors(corridors, 0.9, 70, 25, (p, dir) => {
      if (!inWindow(p) || Math.hypot(p.x - opts.center.x, p.y - opts.center.y) < 12) return;
      if (!free(p, 0.8)) return;
      signs.push({
        x: p.x,
        y: p.y,
        yaw: Math.atan2(dir.y, dir.x),
        kind: kinds[k++ % kinds.length]!,
      });
      occupied.push({ x: p.x, y: p.y, r: 0.8 });
    });
    // Árboles de banqueta cada 15 m, a 1.5 m del borde de la calzada.
    alongCorridors(corridors, 1.5, 15, 7, (p) => {
      if (!inWindow(p) || trees.length >= opts.maxTrees) return;
      if (distanceToRoad(p, corridors) < 1 || !free(p, 2)) return;
      // Claro alrededor de la acción: un árbol de banqueta tapaba el impacto en la cinematográfica.
      if (Math.hypot(p.x - opts.center.x, p.y - opts.center.y) < TREE_CLEAR_M) return;
      const species = speciesFor(zone, rng());
      trees.push({
        x: p.x,
        y: p.y,
        trunk: 2.6 + rng() * 1.2,
        crown: 1.3 + rng() * 0.8,
        yaw: rng() * Math.PI * 2,
        kind: 0,
        species,
        height: treeHeightFor(species, rng()) * 0.8,
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
      // Claro de la órbita de la cámara (T1.5): un poste en primer plano tapaba la escena.
      if (Math.hypot(p.x - opts.center.x, p.y - opts.center.y) < 26) return;
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
        const species = bush ? undefined : speciesFor(zone, rng());
        trees.push({
          x: p.x,
          y: p.y,
          trunk: bush ? 0.3 : 2.5 + rng() * 2.5,
          crown: bush ? 0.9 + rng() * 0.6 : 1.8 + rng() * 1.6,
          yaw: rng() * Math.PI * 2,
          kind: bush ? 2 : rng() < 0.3 ? 1 : 0,
          species,
          height: species ? treeHeightFor(species, rng()) : undefined,
        });
        occupied.push({ x: p.x, y: p.y, r: 2.5 });
      }
    }
  }
  // Cerros a lo lejos en tres capas (T1.3b): el anillo del fondo completo y alto; delante, arcos
  // sueltos más bajos a distinta distancia, con las puntas en rampa. En ciudad, la mitad de alto.
  const hills: HillLayer[] = [];
  const escala = zone === "rural" ? 1 : 0.5;
  HILL_LAYERS.forEach((layer, li) => {
    const noise = valueNoise2D(Math.trunc(opts.seed) * 31 + 11 + li * 97, 1);
    const rangos: readonly (readonly [number, number])[] = [
      [90, 240],
      [45, 150],
      [18, 70],
    ];
    const [hMin, hMax] = rangos[li] ?? [18, 70];
    const arcs: [number, number][] =
      li === 0
        ? [[0, Math.PI * 2]]
        : Array.from(
            { length: li === 1 ? 1 + Math.floor(rng() * 2) : Math.floor(rng() * 3) },
            () => {
              const start = rng() * Math.PI * 2;
              const span = (li === 1 ? 1.2 : 0.6) + rng() * (li === 1 ? 1.6 : 0.9);
              return [start, start + span] as [number, number];
            },
          );
    for (const [from, to] of arcs) {
      const n = Math.max(8, Math.round((layer.segments * (to - from)) / (Math.PI * 2)));
      const heights: number[] = [];
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        const u = (from + (to - from) * f) * (1.3 + li * 0.7);
        const v = 0.55 * noise(u, 0.5 + li) + 0.45 * noise(u * 2.7, 7.5 + li);
        // Las puntas de un arco bajan a cero; el anillo completo no tiene puntas.
        const taper = li === 0 ? 1 : Math.sin(Math.PI * f);
        heights.push(escala * (hMin + v * (hMax - hMin)) * taper);
      }
      hills.push({ radius: layer.radius, from, to, heights });
    }
  });
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
    signs,
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
