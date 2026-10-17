/**
 * Material del pavimento según `lugar.estado_superficie` (PLAN §7.1: asfalto seco contra mojado).
 *
 * El pavimento mojado es más oscuro y casi liso, así que refleja el cielo (el visor le da el mapa
 * cúbico del cielo horneado). Encharcado agrega charcos casi espejo; aceite, lodo y grava suelta
 * son manchas sobre el asfalto. Las manchas salen de ruido en coordenadas del mundo, sin texturas
 * descargadas, y son siempre las mismas para la misma escena. Valores visuales, no física: la
 * fricción de cada estado la pone el solver con su tabla (`friction.json`).
 */
import type { Texture } from "three";
import { color, float, mix, mx_noise_float, positionWorld, smoothstep, vec2 } from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import type { SurfaceState } from "./environment";

export interface SurfaceLook {
  color: string;
  roughness: number;
  /** Manchas sobre la base: color, rugosidad, fracción cubierta y tamaño típico (m). */
  patch?: { color: string; roughness: number; coverage: number; sizeM: number };
  /** Cuánto refleja el cielo (intensidad del mapa de entorno). */
  reflect: number;
}

export const SURFACE_LOOK: Record<SurfaceState, SurfaceLook> = {
  seco: { color: "#3b3e42", roughness: 0.92, reflect: 0 },
  mojado: { color: "#26292c", roughness: 0.32, reflect: 0.6 },
  encharcado: {
    color: "#232629",
    roughness: 0.28,
    patch: { color: "#16191c", roughness: 0.04, coverage: 0.3, sizeM: 3 },
    reflect: 0.9,
  },
  aceite: {
    color: "#3b3e42",
    roughness: 0.9,
    patch: { color: "#15161a", roughness: 0.12, coverage: 0.2, sizeM: 1.5 },
    reflect: 0.35,
  },
  lodo: {
    color: "#3d3a35",
    roughness: 0.95,
    patch: { color: "#5a4632", roughness: 0.9, coverage: 0.45, sizeM: 2.5 },
    reflect: 0,
  },
  grava_suelta: {
    color: "#3e4044",
    roughness: 0.95,
    patch: { color: "#7a766d", roughness: 1, coverage: 0.25, sizeM: 0.6 },
    reflect: 0,
  },
};

/**
 * Umbral del ruido que deja cubierta la fracción pedida: el ruido de gradiente de MaterialX
 * (`mx_noise_float`) se concentra cerca de 0, con la mayor parte entre ±0.5, así que se usa un
 * umbral lineal en ese rango (aproximado: las manchas son ilustrativas).
 */
export function patchThreshold(coverage: number): number {
  const c = Math.min(Math.max(coverage, 0), 1);
  return 0.5 - c;
}

export interface AsphaltMaterial {
  material: MeshStandardNodeMaterial;
  look: SurfaceLook;
  /** Da el mapa de entorno (cielo) para los reflejos del piso mojado; null lo quita. */
  setReflections(env: Texture | null): void;
}

export function asphaltMaterial(surface: SurfaceState): AsphaltMaterial {
  const look = SURFACE_LOOK[surface];
  const m = new MeshStandardNodeMaterial({ roughness: look.roughness, metalness: 0 });
  if (look.patch) {
    const p = look.patch;
    const uvw = vec2(positionWorld.x, positionWorld.z).div(p.sizeM);
    const t = patchThreshold(p.coverage);
    const k = smoothstep(float(t), float(t + 0.06), mx_noise_float(uvw));
    m.colorNode = mix(color(look.color), color(p.color), k);
    m.roughnessNode = mix(float(look.roughness), float(p.roughness), k);
  } else {
    m.colorNode = color(look.color);
    m.roughnessNode = float(look.roughness);
  }
  return {
    material: m,
    look,
    setReflections(env: Texture | null) {
      const on = env !== null && look.reflect > 0;
      m.envMap = on ? env : null;
      m.envMapIntensity = on ? look.reflect : 1;
      m.needsUpdate = true;
    },
  };
}
