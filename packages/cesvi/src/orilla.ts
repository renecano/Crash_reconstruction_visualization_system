/**
 * El objeto del primer choque en la orilla de la calle (René, 2026-11-26: en Tollocan, «me salí de la
 * carretera impactando de frente contra un árbol», el árbol quedaba dentro de la calzada). Un árbol, un
 * poste o una señal están fuera del arroyo vial: si donde el perito colocó el choque el objeto cae
 * dentro de la calzada de las calles guardadas con el caso, va en la orilla compatible con la narración
 * (la derecha o la izquierda que dice, o hacia donde iba el vehículo) y el choque, en ese borde: el
 * vehículo sale de su carril y llega de frente al objeto.
 *
 * Coordenadas de la escena: x al este, y al norte (m); rumbos desde +x, antihorario (grados).
 */
import { viaWidthM, type ViaMedida } from "@croquis/scene-schema";
import { VIAS_DE_VEHICULOS } from "./eje-calle";

type P = { x: number; y: number };

/** m: medio tronco típico (el mismo que usa la reconstrucción para colocar el objeto). */
export const RADIO_OBJETO_M = 0.15;
/** m: lo que queda el objeto fuera de la orilla de la calzada (banqueta o acotamiento). */
export const MARGEN_ORILLA_M = 0.5;
/** Los objetos que están fuera del arroyo vial. */
export const TIPOS_DE_ORILLA: ReadonlySet<string> = new Set(["arbol", "poste", "senal"]);
/** grados: más que esto de desvío desde su carril, el vehículo se traslada en vez de girar. */
export const DESVIO_MAXIMO_DEG = 60;

export type Lado = "derecha" | "izquierda";

/** El lado que dice la narración («a la derecha», «del lado izquierdo»), o null si no dice o dice los dos. */
export function ladoNarrado(textos: readonly (string | undefined)[]): Lado | null {
  const t = textos.join(" ").toLowerCase();
  const d = /\bderech/.test(t);
  const i = /\bizquierd/.test(t);
  return d === i ? null : d ? "derecha" : "izquierda";
}

export interface ChoqueEnLaOrilla {
  /** La pose del vehículo en el choque, en el borde. */
  impacto: { x: number; y: number; rumboDeg: number };
  /** Dónde queda el objeto, fuera de la calzada. */
  objeto: P;
  /** m que se movió el objeto desde donde caía con el choque del perito. */
  movidoM: number;
  /** m que quedaba el objeto dentro de la calzada (de su orilla hacia adentro). */
  dentroM: number;
  via: string | null;
  /** A qué lado del vehículo queda la orilla. */
  lado: Lado;
}

const dir = (deg: number): P => ({
  x: Math.cos((deg * Math.PI) / 180),
  y: Math.sin((deg * Math.PI) / 180),
});

/** El punto más cercano de un segmento y la distancia a él. */
function pie(p: P, a: P, b: P): { q: P; d: number; u: P } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.sqrt(dx * dx + dy * dy);
  const u = L > 0 ? { x: dx / L, y: dy / L } : { x: 1, y: 0 };
  const t = L > 0 ? Math.max(0, Math.min(L, (p.x - a.x) * u.x + (p.y - a.y) * u.y)) : 0;
  const q = { x: a.x + t * u.x, y: a.y + t * u.y };
  return { q, d: Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2), u };
}

/** Cuánto queda `p` fuera de la calzada (m; negativo, dentro) y la vía más cercana. */
function fuera(p: P, vias: readonly (ViaMedida & { nombre?: string })[]) {
  let mejor: { m: number; q: P; u: P; half: number; nombre: string | null } | null = null;
  for (const v of vias) {
    const half = viaWidthM(v) / 2;
    for (let i = 0; i + 1 < v.puntos.length; i++) {
      const { q, d, u } = pie(p, v.puntos[i]!, v.puntos[i + 1]!);
      if (!mejor || d - half < mejor.m)
        mejor = { m: d - half, q, u, half, nombre: v.nombre ?? null };
    }
  }
  return mejor;
}

/**
 * El choque contra un objeto de orilla movido al borde de la calzada, o null si el objeto ya cae
 * fuera de ella (o no hay calles de vehículos, o ninguna orilla queda libre).
 *
 * - `impacto`: la pose del vehículo donde el perito colocó el choque.
 * - `alcance`: m del centro del vehículo al centro del objeto, en la dirección de la cara.
 * - `giroCara`: la cara respecto al rumbo (0 el frente, 180 la parte posterior, ±90 los costados).
 * - `antesM`: m antes del choque donde arranca (supuesto): de ahí sale de su carril hacia el objeto.
 */
export function choqueEnLaOrilla(o: {
  impacto: { x: number; y: number; rumboDeg: number };
  alcance: number;
  giroCara: number;
  antesM: number;
  vias: readonly (ViaMedida & { nombre?: string })[];
  lado: Lado | null;
}): ChoqueEnLaOrilla | null {
  const vias = o.vias.filter((v) => VIAS_DE_VEHICULOS.has(v.tipo) && v.puntos.length >= 2);
  if (!vias.length) return null;
  const h = dir(o.impacto.rumboDeg);
  const f = dir(o.impacto.rumboDeg + o.giroCara);
  const obj0 = { x: o.impacto.x + o.alcance * f.x, y: o.impacto.y + o.alcance * f.y };
  const cerca = fuera(obj0, vias);
  if (!cerca || cerca.m >= RADIO_OBJETO_M) return null;
  // La normal de la vía (a su izquierda) y la derecha del vehículo.
  const n = { x: -cerca.u.y, y: cerca.u.x };
  const derecha = { x: h.y, y: -h.x };
  const nd = n.x * derecha.x + n.y * derecha.y;
  const nf = n.x * f.x + n.y * f.y;
  const lado0 = (obj0.x - cerca.q.x) * n.x + (obj0.y - cerca.q.y) * n.y;
  const signo = o.lado
    ? (o.lado === "derecha" ? 1 : -1) * (nd >= 0 ? 1 : -1)
    : Math.abs(nf) > 0.1
      ? Math.sign(nf)
      : Math.abs(lado0) > 0.01
        ? Math.sign(lado0)
        : nd >= 0
          ? 1
          : -1;
  const lados = o.lado ? [signo] : [signo, -signo];
  for (const s of lados) {
    const k = cerca.half + RADIO_OBJETO_M + MARGEN_ORILLA_M;
    const T = { x: cerca.q.x + s * k * n.x, y: cerca.q.y + s * k * n.y };
    const libre = fuera(T, vias);
    if (!libre || libre.m < RADIO_OBJETO_M - 1e-9) continue;
    // De frente: sale de su carril (donde arrancaba, `antesM` antes del choque) hacia el objeto.
    let impacto: ChoqueEnLaOrilla["impacto"];
    const P0 = { x: o.impacto.x - o.antesM * h.x, y: o.impacto.y - o.antesM * h.y };
    const phi = (Math.atan2(T.y - P0.y, T.x - P0.x) * 180) / Math.PI;
    const desvio = Math.abs(((((phi - o.impacto.rumboDeg) % 360) + 540) % 360) - 180);
    if (o.giroCara === 0 && desvio <= DESVIO_MAXIMO_DEG) {
      const g = dir(phi);
      impacto = { x: T.x - o.alcance * g.x, y: T.y - o.alcance * g.y, rumboDeg: phi };
    } else {
      impacto = {
        x: o.impacto.x + (T.x - obj0.x),
        y: o.impacto.y + (T.y - obj0.y),
        rumboDeg: o.impacto.rumboDeg,
      };
    }
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    return {
      impacto: { x: r3(impacto.x), y: r3(impacto.y), rumboDeg: r3(impacto.rumboDeg) },
      objeto: { x: r3(T.x), y: r3(T.y) },
      movidoM: r3(Math.hypot(T.x - obj0.x, T.y - obj0.y)),
      dentroM: r3(RADIO_OBJETO_M - cerca.m),
      via: cerca.nombre,
      lado: s * nd >= 0 ? "derecha" : "izquierda",
    };
  }
  return null;
}
