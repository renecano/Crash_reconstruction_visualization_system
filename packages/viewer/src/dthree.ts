/**
 * Equivalentes deterministas de los ayudantes de three.js que usan trigonometría (E8, ADR 0029).
 *
 * El horneado con Rapier (restos, volcaduras y ragdolls) debe dar los mismos cuadros en cualquier
 * navegador. `Quaternion.setFromAxisAngle`, `Vector3.applyAxisAngle` y `Quaternion.slerp` llaman a
 * `Math.sin`, `Math.cos` y `Math.acos`, cuya precisión depende del motor. Aquí están las mismas
 * fórmulas de three.js r186 con `dmath` (fdlibm): en Chromium dan lo mismo, bit a bit.
 */
import { dmath } from "@croquis/solver-ts";
import { Quaternion, type Vector3 } from "three";

/** `out.setFromAxisAngle(axis, angle)` determinista (eje unitario). */
export function quatFromAxisAngle(
  axis: Vector3,
  angle: number,
  out: Quaternion = new Quaternion(),
): Quaternion {
  const halfAngle = angle / 2;
  const s = dmath.sin(halfAngle);
  return out.set(axis.x * s, axis.y * s, axis.z * s, dmath.cos(halfAngle));
}

const tmp = new Quaternion();

/** `v.applyAxisAngle(axis, angle)` determinista: gira v (en su lugar) y lo devuelve. */
export function applyAxisAngle(v: Vector3, axis: Vector3, angle: number): Vector3 {
  return v.applyQuaternion(quatFromAxisAngle(axis, angle, tmp));
}

/** `qa.slerp(qb, t)` determinista: interpola qa (en su lugar) hacia qb y lo devuelve. */
export function slerp(qa: Quaternion, qb: Quaternion, tIn: number): Quaternion {
  let x = qb.x;
  let y = qb.y;
  let z = qb.z;
  let w = qb.w;
  let dot = qa.dot(qb);
  if (dot < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
    dot = -dot;
  }
  let s = 1 - tIn;
  let t = tIn;
  if (dot < 0.9995) {
    const theta = dmath.acos(dot);
    const sin = dmath.sin(theta);
    s = dmath.sin(s * theta) / sin;
    t = dmath.sin(t * theta) / sin;
    return qa.set(qa.x * s + x * t, qa.y * s + y * t, qa.z * s + z * t, qa.w * s + w * t);
  }
  // Ángulos pequeños: interpolación lineal y normalización (como three.js).
  return qa.set(qa.x * s + x * t, qa.y * s + y * t, qa.z * s + z * t, qa.w * s + w * t).normalize();
}
