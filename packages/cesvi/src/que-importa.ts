/**
 * «Qué importa» (René, 2026-11-26): lo de la escena que no influye en la cifra va en gris. La misma
 * lógica que la prueba del poste (`escena-corregir.spec.ts`): un objeto fuera de los recorridos de los
 * vehículos no cambia la cifra; uno en su recorrido, sí.
 *
 * Un objeto o una zona influye si algún vehículo, en la reconstrucción que se ve (`especReconstruida`,
 * la que anima el 3D), pasa a menos de `MARGEN_QUE_IMPORTA_M` de él. El margen es de diseño: cubre la
 * dispersión de las simulaciones alrededor del mejor ajuste (con el poste a 18 m, fuera del recorrido
 * del mejor ajuste, el rango llegó a moverse 1 km/h). Los objetos de un choque declarado no pasan por
 * aquí: son evidencia del caso y siempre importan.
 */
import { reconstruct } from "@croquis/solver-ts";
import { enMetros, type LonLat } from "./geo";
import { especReconstruida, type Reconstruccion } from "./reconstruccion";

export const MARGEN_QUE_IMPORTA_M = 2;

/** El recorrido de un vehículo: su caja y sus poses (escena v1, m y rad). */
export interface Barrido {
  largo: number;
  ancho: number;
  x: number[];
  y: number[];
  yaw: number[];
}

/** Los recorridos de la reconstrucción que se ve, en metros desde su origen. null sin cifra. */
export function barridosDeLaReconstruccion(r: Reconstruccion): Barrido[] | null {
  if (r.noCuadra || !r.origen) return null;
  try {
    const rec = reconstruct(especReconstruida(r));
    return rec.vehiculos.map((v) => ({
      largo: v.length,
      ancho: v.width,
      x: [...v.trajectory.x],
      y: [...v.trajectory.y],
      yaw: [...v.trajectory.yaw],
    }));
  } catch {
    return null;
  }
}

/** La distancia de un punto a la caja de un vehículo en una pose (0 si cae dentro). */
function aLaCaja(px: number, py: number, b: Barrido, i: number): number {
  const dx = px - b.x[i]!;
  const dy = py - b.y[i]!;
  const c = Math.cos(b.yaw[i]!);
  const s = Math.sin(b.yaw[i]!);
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  return Math.hypot(
    Math.max(Math.abs(lx) - b.largo / 2, 0),
    Math.max(Math.abs(ly) - b.ancho / 2, 0),
  );
}

/** La distancia mínima de un punto a todo lo que barren los vehículos. */
export function distanciaAlBarrido(px: number, py: number, barridos: readonly Barrido[]): number {
  let min = Infinity;
  for (const b of barridos)
    for (let i = 0; i < b.x.length; i++) min = Math.min(min, aLaCaja(px, py, b, i));
  return min;
}

/** Algo de la escena: un objeto (su centro y su radio) o una zona (su contorno). */
export type ElementoQueImporta =
  { clave: string; punto: LonLat; radioM: number } | { clave: string; contorno: LonLat[] };

/** ¿Un punto (m) cae dentro de un polígono (m)? */
function dentro(px: number, py: number, pol: readonly { x: number; y: number }[]): boolean {
  let si = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const a = pol[i]!;
    const b = pol[j]!;
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) si = !si;
  }
  return si;
}

/**
 * Para cada elemento, si influye en la cifra: un objeto, si algún vehículo pasa a menos del margen
 * de su borde; una zona, si algún vehículo pisa su contorno o pasa a menos del margen de él.
 */
export function queImporta(
  elementos: readonly ElementoQueImporta[],
  barridos: readonly Barrido[],
  origen: LonLat,
  margen = MARGEN_QUE_IMPORTA_M,
): Record<string, boolean> {
  const m = (p: LonLat) => {
    const r = enMetros(p, origen);
    return { x: r.este, y: r.norte };
  };
  const out: Record<string, boolean> = {};
  for (const el of elementos) {
    if ("punto" in el) {
      const p = m(el.punto);
      out[el.clave] = distanciaAlBarrido(p.x, p.y, barridos) <= el.radioM + margen;
      continue;
    }
    const pol = el.contorno.map(m);
    let toca = pol.some((p) => distanciaAlBarrido(p.x, p.y, barridos) <= margen);
    if (!toca)
      outer: for (const b of barridos)
        for (let i = 0; i < b.x.length; i++)
          if (dentro(b.x[i]!, b.y[i]!, pol)) {
            toca = true;
            break outer;
          }
    out[el.clave] = toca;
  }
  return out;
}
