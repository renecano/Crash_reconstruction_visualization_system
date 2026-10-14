/**
 * Marco de la sombra del sol: el visor coloca la luz direccional y su cámara ortográfica con estos
 * valores, y el grafo de escena los usa para saber qué parte de la vía puede recibir sombra. Fuera
 * del cuadrado de la cámara de sombra ningún pixel recibe sombra, así que esa parte se dibuja sin
 * muestrear el mapa de sombras: la imagen es idéntica y el costo por pixel baja (E6, limitado por
 * relleno en GPU integrada).
 */
import { Vector3 } from "three";
import { actionBounds, type CameraScene } from "./cameras";
import { toThree } from "./coords";

export interface SunShadowFrame {
  /** Posición del sol y su objetivo (three.js). */
  position: Vector3;
  target: Vector3;
  /** Medio lado del cuadrado de la cámara de sombra (m). */
  extent: number;
  /** Ejes de la cámara de sombra en el mundo (unitarios). */
  right: Vector3;
  up: Vector3;
}

export const SUN_DISTANCE = 120;

export function sunShadowFrame(
  scene: CameraScene,
  lightDirection: readonly [number, number, number],
): SunShadowFrame {
  const bounds = actionBounds(scene);
  const [dx, dy, dz] = lightDirection;
  const center = toThree(bounds.cx, bounds.cy, 0);
  const target = new Vector3(center[0], 0, center[2]);
  const position = new Vector3(
    center[0] + dx * SUN_DISTANCE,
    Math.max(8, dz * SUN_DISTANCE),
    center[2] - dy * SUN_DISTANCE,
  );
  const extent = Math.max(18, 0.75 * bounds.size);
  // Misma base que `Camera.lookAt` de three.js (arriba = +Y del mundo).
  const forward = target.clone().sub(position).normalize();
  let right = forward.clone().cross(new Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-9) right = new Vector3(1, 0, 0);
  right.normalize();
  const up = right.clone().cross(forward).normalize();
  return { position, target, extent, right, up };
}

/**
 * ¿El triángulo (puntos de three.js) puede recibir sombra? Compara su caja en el plano de la
 * cámara de sombra con el cuadrado ±extent (con un margen); conservador: si toca, recibe.
 */
export function triangleInShadow(
  frame: SunShadowFrame,
  a: Vector3,
  b: Vector3,
  c: Vector3,
  margin = 1,
): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of [a, b, c]) {
    const q = p.clone().sub(frame.target);
    const x = q.dot(frame.right);
    const y = q.dot(frame.up);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const e = frame.extent + margin;
  return maxX >= -e && minX <= e && maxY >= -e && minY <= e;
}
