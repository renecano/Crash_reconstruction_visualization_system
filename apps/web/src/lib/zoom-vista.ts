/**
 * El acercamiento del 2D de Reconstrucción (René, 2026-11-25: «Foto en 2D: además de mover, acercar y
 * alejar, con botones, rueda del mouse y pellizco en celular»). Una vista es una escala y un
 * desplazamiento en píxeles de la caja: lo que se ve en (x, y) de la caja es el punto
 * ((x − dx) / k, (y − dy) / k) del dibujo sin acercar.
 */
export interface Vista {
  k: number;
  dx: number;
  dy: number;
}

export const VISTA_INICIAL: Vista = { k: 1, dx: 0, dy: 0 };
/** De 1× (todo el croquis) a 8×. */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;
/** Cuánto acerca cada clic en «+» (y aleja en «−»). */
export const PASO_ZOOM = 1.5;

/** La vista sin salirse del dibujo: en 1× no se mueve; acercada, ningún borde queda adentro. */
export function acotar(v: Vista, ancho: number, alto: number): Vista {
  const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k));
  const dx = Math.min(0, Math.max(ancho - ancho * k, v.dx));
  const dy = Math.min(0, Math.max(alto - alto * k, v.dy));
  return { k, dx, dy };
}

/** Acerca (factor > 1) o aleja (< 1) dejando fijo el punto (px, py) de la caja. */
export function zoomEn(
  v: Vista,
  factor: number,
  px: number,
  py: number,
  ancho: number,
  alto: number,
): Vista {
  const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * factor));
  const f = k / v.k;
  return acotar({ k, dx: px - (px - v.dx) * f, dy: py - (py - v.dy) * f }, ancho, alto);
}

/** Mueve la vista (arrastrar) dentro del dibujo. */
export function mover(v: Vista, ddx: number, ddy: number, ancho: number, alto: number): Vista {
  return acotar({ k: v.k, dx: v.dx + ddx, dy: v.dy + ddy }, ancho, alto);
}

/** El factor de un paso de la rueda (deltaY en píxeles; hacia arriba acerca). */
export const factorRueda = (deltaY: number) =>
  Math.exp(-Math.max(-300, Math.min(300, deltaY)) / 300);
