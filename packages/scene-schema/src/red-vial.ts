/**
 * Medidas de las calles del mapa (`lugar.red_vial`, ADR 0023), compartidas por el croquis 2D, el
 * visor y el port TS del solver. Fuente única: `red_vial.json` (la lee también la referencia
 * Python, `croquis_scene_schema.red_vial`).
 */
import table from "../red_vial.json";

export const RED_VIAL_DEFAULTS = table as {
  ancho_carril_m: number;
  carriles_por_tipo: Record<string, number>;
  tolerancia_fuera_m: number;
};

export interface ViaMedida {
  tipo: string;
  carriles?: number;
  ancho_m?: number;
  puntos: readonly { x: number; y: number }[];
}

/** Ancho de la calzada (m): `width` de OSM; si no, carriles × ancho de carril. */
export function viaWidthM(via: Omit<ViaMedida, "puntos">, laneM?: number): number {
  if (via.ancho_m !== undefined) return via.ancho_m;
  const lanes =
    via.carriles ?? RED_VIAL_DEFAULTS.carriles_por_tipo[via.tipo.replace(/_link$/, "")] ?? 2;
  return lanes * (laneM ?? RED_VIAL_DEFAULTS.ancho_carril_m);
}

function segmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  // √ de la suma de cuadrados y no Math.hypot: la raíz es exacta en todos los motores y hypot no
  // (el solver la usa y E8 exige el mismo resultado en cualquier navegador; ADR 0029).
  const ex = p.x - (a.x + t * dx);
  const ey = p.y - (a.y + t * dy);
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Cuánto queda el punto fuera de la calzada del mapa (m): distancia al eje de la calle más
 * cercana menos su medio ancho; 0 o negativo es estar sobre la calle.
 */
export function outsideRedVialM(
  p: { x: number; y: number },
  vias: readonly ViaMedida[],
  laneM?: number,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const v of vias) {
    const half = viaWidthM(v, laneM) / 2;
    for (let i = 0; i + 1 < v.puntos.length; i++) {
      best = Math.min(best, segmentDistance(p, v.puntos[i]!, v.puntos[i + 1]!) - half);
    }
  }
  return best;
}
