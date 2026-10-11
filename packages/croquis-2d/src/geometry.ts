/** Utilidades geométricas 2D del croquis. Coordenadas en metros, eje X al este y eje Y al norte. */
export interface Vec2 {
  x: number;
  y: number;
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/** Rota un vector `theta` radianes en sentido antihorario. */
export function rotate(v: Vec2, theta: number): Vec2 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/**
 * Rectángulo orientado (vehículo visto desde arriba): centro, largo (eje de avance), ancho y rumbo.
 * Devuelve las 4 esquinas en orden: frente-izq, frente-der, atrás-der, atrás-izq.
 */
export function orientedBox(center: Vec2, long: number, wide: number, heading: number): Vec2[] {
  const hl = long / 2;
  const hw = wide / 2;
  const local: Vec2[] = [
    { x: hl, y: hw },
    { x: hl, y: -hw },
    { x: -hl, y: -hw },
    { x: -hl, y: hw },
  ];
  return local.map((p) => add(center, rotate(p, heading)));
}
