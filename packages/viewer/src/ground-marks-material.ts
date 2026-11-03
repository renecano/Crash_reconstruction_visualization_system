/**
 * Material de las huellas de frenado y derrape (T1.2, ADR 0095): una calcomanía oscura con los
 * bordes suaves a lo ancho (u de `quadsToGeometry`) en vez de una franja de bordes duros, para
 * que la marca se funda con el asfalto como en una foto. La geometría y los instantes son los
 * del solver (`ground-marks.ts`); aquí solo cambia cómo se ve.
 */
import { float, smoothstep, uv } from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";

/** Fracción del ancho que ocupa cada borde suave. */
export const MARK_EDGE_FRACTION = 0.35;

export function markMaterial(opacity: number): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    color: "#121212",
    roughness: 0.95,
    metalness: 0,
    transparent: true,
    depthWrite: false,
  });
  const u = uv().x;
  m.opacityNode = float(opacity)
    .mul(smoothstep(float(0), float(MARK_EDGE_FRACTION), u))
    .mul(smoothstep(float(1), float(1 - MARK_EDGE_FRACTION), u));
  return m;
}
