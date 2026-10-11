/** Transformaciones entre metros de la escena y unidades del SVG (eje Y invertido). */
import type { Vec2 } from "./geometry";

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  /** Píxeles de SVG por metro. */
  scale: number;
  viewBox: ViewBox;
  bounds: [number, number, number, number];
}

export function makeViewport(bounds: [number, number, number, number], scale = 10): Viewport {
  const [minX, minY, maxX, maxY] = bounds;
  return {
    scale,
    bounds,
    viewBox: { x: 0, y: 0, width: (maxX - minX) * scale, height: (maxY - minY) * scale },
  };
}

export function worldToSvg(vp: Viewport, p: Vec2): Vec2 {
  const [minX, , , maxY] = vp.bounds;
  return { x: (p.x - minX) * vp.scale, y: (maxY - p.y) * vp.scale };
}

export function svgToWorld(vp: Viewport, p: Vec2): Vec2 {
  const [minX, , , maxY] = vp.bounds;
  return { x: p.x / vp.scale + minX, y: maxY - p.y / vp.scale };
}

/**
 * Convierte coordenadas de puntero (clientX/Y) a metros usando el rectángulo en pantalla del SVG
 * y su viewBox. Funciona sin `getScreenCTM`, así que también se puede probar en jsdom.
 */
export function clientToWorld(
  vp: Viewport,
  rect: { left: number; top: number; width: number; height: number },
  client: Vec2,
): Vec2 {
  const sx = rect.width > 0 ? vp.viewBox.width / rect.width : 1;
  const sy = rect.height > 0 ? vp.viewBox.height / rect.height : 1;
  return svgToWorld(vp, { x: (client.x - rect.left) * sx, y: (client.y - rect.top) * sy });
}
