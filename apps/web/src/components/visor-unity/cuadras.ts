/**
 * Las cuadras de una calle mexicana para el visor Unity (U2, segunda pasada): lotes con la fachada
 * pegada a la banqueta y uno junto al otro, a lo largo de cada vía, y más cuadras detrás. Sale de los
 * mismos corredores que usan el croquis 2D y el visor web (`corridorsOf`), con semilla fija: la misma
 * escena da siempre la misma calle. Es entorno procedural, no el lugar real, y la leyenda lo dice.
 */
import { distanceToRoad } from "@croquis/viewer/puro";

type Vec2 = { x: number; y: number };
type Corredor = { a: Vec2; b: Vec2; half: number };

export type TipoLote = "casa" | "comercio" | "baldio" | "taller" | "fondo";

export interface Lote {
  x: number;
  y: number;
  /** Frente (a lo largo de la calle), fondo y alto, en metros. */
  w: number;
  d: number;
  h: number;
  /** Rumbo del frente y hacia dónde mira la fachada (rad). */
  yaw: number;
  front: number;
  floors: number;
  /** Índice de la paleta de fachada. */
  color: number;
  material: "yeso" | "tabique";
  tipo: TipoLote;
  /** Cuánto se mete la casa respecto a la banqueta (m); al frente queda una barda baja con reja. */
  remetimiento: number;
  shutter: boolean;
  awning: boolean;
  sign: boolean;
  tinacos: number;
  antenna: boolean;
  rebar: boolean;
  /** Protecciones de herrería en las ventanas. */
  herreria: boolean;
  /** Portón de cochera. */
  zaguan: boolean;
}

export interface Cuadras {
  lotes: Lote[];
  /** Postes de la calle, con cables entre uno y otro. */
  postes: { x: number; y: number; yaw: number }[];
}

/** El ancho de la banqueta (m): el mismo de `SIDEWALK_WIDTH` en `@croquis/croquis-2d`. */
export const ANCHO_BANQUETA_M = 2.5;
/** Hasta dónde llegan las cuadras con detalle y las de fondo, desde el centro de la acción (m). */
export const RADIO_DETALLE_M = 130;
export const RADIO_FONDO_M = 210;
/** Hasta dónde se alejan de la vía las cuadras de fondo (m). */
const FONDO_HASTA_M = 96;
const PALETA = 12;

/** Mulberry32: el mismo generador con semilla del resto del proyecto. */
function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rect {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  hw: number;
  hd: number;
}

function dentro(r: Rect, p: Vec2, holgura: number): boolean {
  const dx = p.x - r.cx;
  const dy = p.y - r.cy;
  const u = dx * r.ux + dy * r.uy;
  const v = -dx * r.uy + dy * r.ux;
  return Math.abs(u) < r.hw + holgura && Math.abs(v) < r.hd + holgura;
}

/** Nueve puntos del rectángulo: esquinas, medios de lado y centro. */
function muestras(r: Rect): Vec2[] {
  const out: Vec2[] = [];
  for (const i of [-1, 0, 1]) {
    for (const j of [-1, 0, 1]) {
      out.push({
        x: r.cx + r.ux * r.hw * i - r.uy * r.hd * j,
        y: r.cy + r.uy * r.hw * i + r.ux * r.hd * j,
      });
    }
  }
  return out;
}

/** Un tramo de lo que recorre un vehículo del caso: el punto y el radio que ocupa (m). */
export interface ZonaDelCaso {
  x: number;
  y: number;
  r: number;
}

/**
 * Por dónde pasa y dónde queda cada vehículo del caso, en puntos a lo más cada `paso` m, con el radio
 * de su planta más `holgura`. El entorno procedural no pone nada ahí (U6): si el perito deja un
 * vehículo fuera de la calle, una casa inventada no puede quedarle encima.
 */
export function zonasDelCaso(
  vehiculos: readonly {
    trayectoria: { x: readonly number[]; y: readonly number[] };
    dimensiones?: { largo_m: number; ancho_m: number };
  }[],
  holgura = 1.5,
  paso = 1,
): ZonaDelCaso[] {
  const out: ZonaDelCaso[] = [];
  for (const v of vehiculos) {
    const r =
      Math.hypot(v.dimensiones?.largo_m ?? 4.5, v.dimensiones?.ancho_m ?? 1.8) / 2 + holgura;
    const { x, y } = v.trayectoria;
    let ultimo: Vec2 | null = null;
    for (let k = 0; k < x.length; k++) {
      const p = { x: x[k]!, y: y[k]! };
      const esUltimo = k === x.length - 1;
      if (!ultimo || esUltimo || Math.hypot(p.x - ultimo.x, p.y - ultimo.y) >= paso) {
        out.push({ ...p, r });
        ultimo = p;
      }
    }
  }
  return out;
}

/** Si un punto cae en lo que recorre el caso. */
export function enElCaso(zonas: readonly ZonaDelCaso[], p: Vec2): boolean {
  return zonas.some((z) => Math.hypot(p.x - z.x, p.y - z.y) < z.r);
}

/**
 * Las cuadras de una zona urbana. `corredores` son las vías; `centro`, la acción. Los lotes de la
 * primera fila llevan detalle cerca de la acción; lo demás son volúmenes de fondo, que Unity dibuja
 * baratos. Ningún lote cae en `libres` (lo que recorren los vehículos del caso).
 */
export function planCuadras(
  corredores: readonly Corredor[],
  centro: Vec2,
  semilla: number,
  libres: readonly ZonaDelCaso[] = [],
): Cuadras {
  const rng = azar(Math.trunc(semilla) * 53 + 11);
  const lotes: Lote[] = [];
  const postes: Cuadras["postes"] = [];
  const ocupados: Rect[] = [];
  const lejos = (p: Vec2) => Math.hypot(p.x - centro.x, p.y - centro.y);

  const cabe = (r: Rect, retiro: number): boolean => {
    const ps = muestras(r);
    // Ningún punto sobre otra calle ni sobre su banqueta.
    if (ps.some((p) => distanceToRoad(p, corredores) < retiro - 0.05)) return false;
    // Ni sobre lo que recorre un vehículo del caso.
    if (libres.some((z) => dentro(r, z, z.r))) return false;
    for (const o of ocupados) {
      if (ps.some((p) => dentro(o, p, 0.05))) return false;
      if (dentro(r, { x: o.cx, y: o.cy }, 0.05)) return false;
    }
    return true;
  };

  /** Una fila de lotes a `desde` m del borde de la calzada, de ambos lados de cada vía. */
  const fila = (desde: number, deFondo: boolean) => {
    for (const c of corredores) {
      const len = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
      if (len < 8) continue;
      const ux = (c.b.x - c.a.x) / len;
      const uy = (c.b.y - c.a.y) / len;
      for (const lado of [-1, 1]) {
        const nx = -uy * lado;
        const ny = ux * lado;
        let s = rng() * 2;
        // Cada tanto, una bocacalle: las cuadras de fondo se leen como manzanas, no como un muro.
        let hastaBocacalle = 45 + rng() * 30;
        while (s < len - 4) {
          const ancho = deFondo ? 8 + rng() * 7 : 5.5 + rng() * 4.5;
          const d = deFondo ? 10 + rng() * 5 : 9 + rng() * 7;
          const u = rng();
          const tipo: TipoLote = deFondo
            ? "fondo"
            : u < 0.34
              ? "casa"
              : u < 0.6
                ? "casa"
                : u < 0.8
                  ? "comercio"
                  : u < 0.89
                    ? "baldio"
                    : "taller";
          const dosPisos = deFondo ? rng() < 0.55 : tipo === "casa" ? u >= 0.34 : rng() < 0.4;
          const floors = tipo === "taller" || tipo === "baldio" ? 1 : dosPisos ? 2 : 1;
          const remetimiento = tipo === "casa" && rng() < 0.3 ? 1.5 + rng() * 1.5 : 0;
          const afuera = c.half + desde + remetimiento + d / 2;
          // Junto a una esquina no siempre cabe el lote entero: se prueba más angosto, como los
          // locales de esquina, antes de dejar un hueco.
          let w = ancho;
          let r: Rect | null = null;
          for (const intento of deFondo ? [ancho] : [ancho, 4.4, 3.2]) {
            const medio = s + intento / 2;
            const rect: Rect = {
              cx: c.a.x + ux * medio + nx * afuera,
              cy: c.a.y + uy * medio + ny * afuera,
              ux,
              uy,
              hw: intento / 2,
              hd: d / 2,
            };
            if (cabe(rect, ANCHO_BANQUETA_M)) {
              w = intento;
              r = rect;
              break;
            }
          }
          const cx = r?.cx ?? c.a.x + ux * (s + w / 2) + nx * afuera;
          const cy = r?.cy ?? c.a.y + uy * (s + w / 2) + ny * afuera;
          const dist = lejos({ x: cx, y: cy });
          const valores = {
            color: Math.floor(rng() * PALETA),
            tabique: rng() < (tipo === "baldio" ? 0.6 : 0.2),
            toldo: rng() < 0.55,
            letrero: rng() < 0.75,
            tinacos: rng() < 0.75 ? 1 + Math.floor(rng() * 2) : 0,
            antena: rng() < 0.45,
            varillas: rng() < 0.5,
            herreria: rng() < 0.7,
            zaguan: rng() < 0.45,
            extra: rng() * 0.7,
          };
          if (dist > RADIO_FONDO_M || !r) {
            s += deFondo ? 2 : 0.5;
            continue;
          }
          const detalle = !deFondo && dist <= RADIO_DETALLE_M;
          const t: TipoLote = detalle ? tipo : tipo === "baldio" ? "baldio" : "fondo";
          lotes.push({
            x: cx,
            y: cy,
            w,
            d,
            h: tipo === "taller" ? 4.3 + valores.extra : floors * 3 + 0.2 + valores.extra,
            yaw: Math.atan2(uy, ux),
            front: Math.atan2(-ny, -nx),
            floors,
            color: valores.color,
            material: valores.tabique ? "tabique" : "yeso",
            tipo: t,
            remetimiento,
            shutter: tipo === "comercio",
            awning: tipo === "comercio" && valores.toldo,
            sign: tipo === "comercio" && valores.letrero,
            tinacos: tipo === "baldio" ? 0 : valores.tinacos,
            antenna: valores.antena,
            rebar: valores.varillas,
            herreria: valores.herreria,
            zaguan: tipo === "taller" || (tipo === "casa" && w >= 7 && valores.zaguan),
          });
          ocupados.push(r);
          s += w;
          if (deFondo) {
            hastaBocacalle -= w;
            if (hastaBocacalle <= 0) {
              s += 7;
              hastaBocacalle = 45 + rng() * 30;
            }
          }
        }
      }
    }
  };

  fila(ANCHO_BANQUETA_M, false);
  for (let desde = ANCHO_BANQUETA_M + 20; desde < FONDO_HASTA_M; desde += 17) fila(desde, true);

  // Postes de la calle cada 32 m, de un lado, a 0.5 m de la guarnición.
  for (const c of corredores) {
    const len = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
    if (len < 40) continue;
    const ux = (c.b.x - c.a.x) / len;
    const uy = (c.b.y - c.a.y) / len;
    for (let s = 14; s < len - 6; s += 32) {
      const p = {
        x: c.a.x + ux * s - uy * (c.half + 0.5),
        y: c.a.y + uy * s + ux * (c.half + 0.5),
      };
      if (lejos(p) > RADIO_DETALLE_M || lejos(p) < 9) continue;
      // En el cruce con otra calle no va poste.
      if (distanceToRoad(p, corredores) < 0.4) continue;
      postes.push({ x: p.x, y: p.y, yaw: Math.atan2(uy, ux) });
    }
  }
  return { lotes, postes };
}
