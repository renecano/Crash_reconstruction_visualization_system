/**
 * Pintura automotriz (T1.4, ADR 0097): base metálica con hojuelas bajo una capa transparente.
 *
 * - **Hojuelas:** celdas de ~1 mm en el espacio del vehículo; cada una gira un poco la normal de
 *   la base y cambia un poco su brillo (tres hashes por pixel, sin texturas). El barniz
 *   (`clearcoat`) conserva la normal lisa de la geometría: los reflejos del entorno siguen nítidos
 *   y debajo centellea el metal, como en una pintura real.
 * - **Estado de la pintura** del contrato (`estado_pintura`: nueva, normal, desgastada): cambia la
 *   rugosidad de la base y del barniz, y cuánto se notan las hojuelas.
 * - Funciona igual sobre WebGPU y WebGL 2 (TSL). La pintura dañada (`damage-material.ts`) usa las
 *   mismas hojuelas para que una puerta deformada no cambie de pintura junto a la intacta.
 */
import {
  color,
  float,
  floor,
  hash,
  mix,
  normalize,
  normalView,
  positionLocal,
  vec3,
} from "three/tsl";
import { MeshPhysicalNodeMaterial, type Node } from "three/webgpu";

export type PaintState = "nueva" | "normal" | "desgastada";

export interface PaintLook {
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  /** Cuánto giran la normal las hojuelas (0 = pintura lisa). */
  flake: number;
}

/** Valores de diseño por estado de la pintura (no son mediciones). */
export const PAINT_LOOK: Readonly<Record<PaintState, PaintLook>> = {
  nueva: { roughness: 0.3, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05, flake: 0.1 },
  normal: { roughness: 0.38, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12, flake: 0.08 },
  desgastada: {
    roughness: 0.55,
    metalness: 0.3,
    clearcoat: 0.55,
    clearcoatRoughness: 0.32,
    flake: 0.05,
  },
};

/** Celdas de hojuela por metro (≈1.1 mm cada una). */
export const FLAKE_CELLS_PER_M = 900;

export function paintLookFor(estado: PaintState | undefined): PaintLook {
  return PAINT_LOOK[estado ?? "normal"];
}

type FloatNode = Node<"float">;
type Vec3Node = Node<"vec3">;

/** Tres números pseudoaleatorios por celda de hojuela, en [0, 1). */
export function flakeHashes(): { a: FloatNode; b: FloatNode; c: FloatNode } {
  const cell = floor(positionLocal.mul(FLAKE_CELLS_PER_M));
  const seed = cell.x.mul(7919).add(cell.y.mul(104729)).add(cell.z.mul(13));
  return { a: hash(seed), b: hash(seed.add(17)), c: hash(seed.add(29)) };
}

/**
 * Normal de la base (espacio de vista) girada por la hojuela de la celda. `extra` suma otra
 * perturbación en el mismo espacio (las abolladuras de la pintura dañada).
 */
export function flakeNormal(flake: number, extra?: Vec3Node): Vec3Node {
  const h = flakeHashes();
  const tilt = vec3(h.a.sub(0.5), h.b.sub(0.5), 0).mul(flake * 2);
  const base = extra ?? normalView;
  return normalize(base.add(tilt));
}

/** Brillo de la hojuela: ±jitter alrededor del metalness base, por celda. */
export function flakeMetalness(base: number, jitter: number): FloatNode {
  const h = flakeHashes();
  return float(base).add(h.c.sub(0.5).mul(jitter * 2));
}

/** La pintura intacta de un vehículo, con el color del caso. */
export function paintMaterial(hex: string, estado?: PaintState): MeshPhysicalNodeMaterial {
  const look = paintLookFor(estado);
  const m = new MeshPhysicalNodeMaterial();
  // El color plano manda en la exportación glTF (R11) y en la galería; el dibujo usa los nodos.
  m.color.set(hex);
  m.roughness = look.roughness;
  m.metalness = look.metalness;
  m.clearcoat = look.clearcoat;
  m.clearcoatRoughness = look.clearcoatRoughness;
  // Hojuelas: la normal de la base gira por celda y el brillo varía un poco; el barniz queda liso.
  m.colorNode = mix(color(hex), color(hex).mul(1.12), flakeHashes().c.mul(look.flake * 4));
  m.metalnessNode = flakeMetalness(look.metalness, look.flake);
  m.normalNode = flakeNormal(look.flake);
  return m;
}
