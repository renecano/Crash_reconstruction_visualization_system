/**
 * Matas de pasto instanciadas cerca de la acción (T1.3b, ADR 0099), solo en alta y ultra: dos
 * tarjetas cruzadas con tres hojas recortadas por alfa (procedural, sin texturas), un verde que
 * sigue al del suelo y un vaivén leve. Se reparten con la semilla dentro de un radio alrededor de
 * la acción, nunca sobre la calzada ni las banquetas.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  abs,
  color,
  float,
  fract,
  hash,
  instanceIndex,
  mix,
  positionLocal,
  sin,
  smoothstep,
  step,
  time,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { toThree } from "./coords";
import { mulberry32 } from "./debris";

/** Radio alrededor de la acción con matas (m) y tamaño de cada mata (m). */
export const GRASS_RADIUS_M = 30;
export const GRASS_TUFT_W = 0.55;
export const GRASS_TUFT_H = 0.32;

function card(): BufferGeometry {
  const g = new BufferGeometry();
  const w = GRASS_TUFT_W / 2;
  const h = GRASS_TUFT_H;
  g.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-w, 0, 0, w, 0, 0, w, h, 0, -w, h, 0]), 3),
  );
  g.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3),
  );
  g.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Dos tarjetas cruzadas por mata. */
export function tuftGeometry(): BufferGeometry {
  const a = card();
  const b = card();
  b.rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b], false);
  a.dispose();
  b.dispose();
  return g;
}

export interface GrassOptions {
  seed: number;
  center: { x: number; y: number };
  count: number;
  /** ¿Se puede poner pasto aquí? (fuera de la calzada y las banquetas). */
  allowed: (x: number, y: number) => boolean;
  heightAt: (x: number, y: number) => number;
  night: boolean;
  /** Color del pasto del suelo, para que las matas no desentonen. */
  groundColor: string;
}

export function buildGrassTufts(opts: GrassOptions): InstancedMesh | null {
  if (opts.count <= 0) return null;
  const rng = mulberry32(Math.trunc(opts.seed) * 53 + 17);
  const mats: Matrix4[] = [];
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  let tries = 0;
  while (mats.length < opts.count && tries < opts.count * 4) {
    tries++;
    const r = GRASS_RADIUS_M * Math.sqrt(rng());
    const a = rng() * Math.PI * 2;
    const x = opts.center.x + Math.cos(a) * r;
    const y = opts.center.y + Math.sin(a) * r;
    if (!opts.allowed(x, y)) continue;
    const [tx, ty, tz] = toThree(x, y, opts.heightAt(x, y));
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    const s = 0.7 + rng() * 0.7;
    mats.push(new Matrix4().compose(new Vector3(tx, ty, tz), q, new Vector3(s, s, s)));
  }
  if (mats.length === 0) return null;
  const m = new MeshStandardNodeMaterial({
    side: DoubleSide,
    alphaTest: 0.5,
    roughness: 0.95,
    metalness: 0,
    // El color plano que lleva la exportación glTF; el dibujo usa colorNode.
    color: opts.groundColor,
  });
  // El glTF no lleva los nodos: las hojas viajan como dato y Blender las rearma (R11).
  m.userData.croquisPasto = { color: opts.groundColor, noche: opts.night };
  // Tres hojas por tarjeta: franjas que se estrechan hacia la punta.
  const u = uv();
  const hoja = abs(fract(u.x.mul(3)).sub(0.5)).mul(2);
  const ancho = float(1).sub(u.y.mul(0.85));
  const alpha = step(hoja, ancho);
  const base = color(opts.groundColor);
  const verde = mix(base.mul(0.85), base.mul(1.35).add(0.03), u.y);
  m.colorNode = vec4(opts.night ? verde.mul(0.6) : verde, alpha);
  // Vaivén leve en las puntas, con la fase de cada mata.
  const fase = hash(instanceIndex.add(5)).mul(6.28);
  const k = smoothstep(float(0.2), float(1), u.y);
  m.positionNode = positionLocal.add(vec3(sin(time.mul(1.3).add(fase)).mul(0.02).mul(k), 0, 0));
  const mesh = new InstancedMesh(tuftGeometry(), m, mats.length);
  mesh.name = "matas_pasto";
  mats.forEach((mat, i) => mesh.setMatrixAt(i, mat));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.computeBoundingSphere();
  return mesh;
}
