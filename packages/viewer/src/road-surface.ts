/**
 * Material del pavimento según `lugar.estado_superficie` (PLAN §7.1: asfalto seco contra mojado).
 *
 * El pavimento mojado es más oscuro y casi liso, así que refleja el cielo (el visor le da el mapa
 * cúbico del cielo horneado). Encharcado agrega charcos casi espejo; aceite, lodo y grava suelta
 * son manchas sobre el asfalto. Las manchas salen de ruido en coordenadas del mundo y son siempre
 * las mismas para la misma escena. Con la textura de asfalto (F8e, calidad media y alta) la base
 * conserva el color y la rugosidad de cada estado (`env-textures`) y gana detalle y relieve.
 * Valores visuales, no física: la fricción de cada estado la pone el solver (`friction.json`).
 */
import { Color, type Texture } from "three";
import { float, mix, mx_noise_float, positionWorld, smoothstep, vec2, vec3 } from "three/tsl";
import { MeshStandardNodeMaterial, type Node } from "three/webgpu";
import type { SurfaceState } from "./environment";
import {
  normalizedColor,
  normalizedRough,
  planarSample,
  texturedNormal,
  type EnvTexture,
} from "./env-textures";

export interface SurfaceLook {
  color: string;
  roughness: number;
  /** Manchas sobre la base: color, rugosidad, fracción cubierta y tamaño típico (m). */
  patch?: { color: string; roughness: number; coverage: number; sizeM: number };
  /** Cuánto refleja el cielo (intensidad del mapa de entorno). */
  reflect: number;
  /** Con textura: cuánto relieve conserva (el agua lo suaviza). */
  normalScale: number;
}

export const SURFACE_LOOK: Record<SurfaceState, SurfaceLook> = {
  seco: { color: "#3b3e42", roughness: 0.92, reflect: 0, normalScale: 1 },
  mojado: {
    color: "#26292c",
    roughness: 0.32,
    reflect: 0.6,
    normalScale: 0.5,
  },
  encharcado: {
    color: "#232629",
    roughness: 0.28,
    patch: { color: "#16191c", roughness: 0.04, coverage: 0.3, sizeM: 3 },
    reflect: 0.9,
    normalScale: 0.4,
  },
  aceite: {
    color: "#3b3e42",
    roughness: 0.9,
    patch: { color: "#15161a", roughness: 0.12, coverage: 0.2, sizeM: 1.5 },
    reflect: 0.35,
    normalScale: 1,
  },
  lodo: {
    color: "#3d3a35",
    roughness: 0.95,
    patch: { color: "#5a4632", roughness: 0.9, coverage: 0.45, sizeM: 2.5 },
    reflect: 0,
    normalScale: 0.8,
  },
  grava_suelta: {
    color: "#3e4044",
    roughness: 0.95,
    patch: { color: "#7a766d", roughness: 1, coverage: 0.25, sizeM: 0.6 },
    reflect: 0,
    normalScale: 1,
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

/** Color constante como vec3 (lineal, como `color()` de TSL). */
function rgb(hex: string) {
  const c = new Color(hex);
  return vec3(c.r, c.g, c.b);
}

export interface AsphaltMaterial {
  material: MeshStandardNodeMaterial;
  look: SurfaceLook;
  /** Da el mapa de entorno (cielo) para los reflejos del piso mojado; null lo quita. */
  setReflections(env: Texture | null): void;
  /** Aplica la textura de asfalto (F8e) o vuelve al color liso con null. */
  applyTexture(t: EnvTexture | null): void;
}

export function asphaltMaterial(surface: SurfaceState): AsphaltMaterial {
  const look = SURFACE_LOOK[surface];
  const m = new MeshStandardNodeMaterial({ roughness: look.roughness, metalness: 0 });
  // Manchas (charcos, aceite, lodo, grava) sobre la base: liso o con textura.
  const p = look.patch;
  const k = p
    ? smoothstep(
        float(patchThreshold(p.coverage)),
        float(patchThreshold(p.coverage) + 0.06),
        mx_noise_float(vec2(positionWorld.x, positionWorld.z).div(p.sizeM)),
      )
    : null;
  const paint = (base: Node<"vec3">, rough: Node<"float">): void => {
    m.colorNode = p && k ? mix(base, rgb(p.color), k) : base;
    m.roughnessNode = p && k ? mix(rough, float(p.roughness), k) : rough;
  };
  paint(rgb(look.color), float(look.roughness));
  return {
    material: m,
    look,
    applyTexture(t: EnvTexture | null) {
      if (t === null) {
        paint(rgb(look.color), float(look.roughness));
        m.normalNode = null;
      } else {
        const s = planarSample(t);
        paint(normalizedColor(t, look.color, s), normalizedRough(t, look.roughness, s));
        m.normalNode = texturedNormal(t, look.normalScale, s);
      }
      m.needsUpdate = true;
    },
    setReflections(env: Texture | null) {
      const on = env !== null && look.reflect > 0;
      m.envMap = on ? env : null;
      m.envMapIntensity = on ? look.reflect : 1;
      m.needsUpdate = true;
    },
  };
}
