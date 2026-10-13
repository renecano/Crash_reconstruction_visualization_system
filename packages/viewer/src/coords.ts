/**
 * Marco del mundo de Croquis → marco de three.js.
 *
 * Croquis: X al este, Y al norte, rumbo en radianes antihorario desde +X (visto desde arriba).
 * three.js: Y arriba. Se usa x = X, z = −Y, de modo que una rotación positiva alrededor de +Y
 * (regla de la mano derecha) también gira de +X hacia el norte: `rotation.y = rumbo`.
 */
export type Vec3 = readonly [number, number, number];

export function toThree(x: number, y: number, height = 0): Vec3 {
  return [x, height, -y];
}

export function fromThree(v: Vec3): { x: number; y: number; height: number } {
  return { x: v[0], y: -v[2], height: v[1] };
}

/** Ángulo equivalente en (−π, π]. */
export function wrapAngle(a: number): number {
  const twoPi = 2 * Math.PI;
  let r = ((((a + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  if (r <= -Math.PI) r += twoPi;
  return r;
}
