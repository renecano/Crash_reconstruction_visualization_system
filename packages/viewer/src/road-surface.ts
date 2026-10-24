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
import {
  float,
  mix,
  mx_noise_float,
  normalView,
  positionWorld,
  smoothstep,
  vec2,
  vec3,
} from "three/tsl";
import { MeshStandardNodeMaterial, type Node } from "three/webgpu";
import type { SurfaceState } from "./environment";
import { normalizedColor, normalizedRough, texturedNormal, type EnvTexture } from "./env-textures";

export interface SurfaceLook {
  color: string;
  roughness: number;
  /**
   * Manchas sobre la base: color, rugosidad, fracción cubierta y tamaño típico (m). Con `grainM`,
   * la mancha tiene grano del tamaño de una piedra (m) en vez de ser lisa; `edge` es el ancho del
   * borde en unidades de ruido (por omisión 0.06, un borde nítido) y `opacity` cuánto tapa la
   * mancha a la base en su centro (por omisión 1). La grava usa bordes suaves y opacidad parcial
   * para verse esparcida y no como manchas de camuflaje (ADR 0036).
   */
  patch?: {
    color: string;
    roughness: number;
    coverage: number;
    sizeM: number;
    grainM?: number;
    edge?: number;
    opacity?: number;
  };
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
    patch: {
      color: "#6f6c66",
      roughness: 1,
      coverage: 0.3,
      sizeM: 0.35,
      grainM: 0.025,
      edge: 0.35,
      opacity: 0.65,
    },
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

/**
 * Un `NormalMapNode` es un vec3 (la normal en espacio de vista), pero los tipos de three no lo
 * declaran así; se necesita para mezclar la normal de la grava con la de la base.
 */
function asVec3(n: unknown): Node<"vec3"> {
  return n as Node<"vec3">;
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
  /**
   * Aplica la textura de asfalto (F8e) o vuelve al color liso con null. `patchTexture` (la grava)
   * llena las manchas con su color y su relieve.
   */
  applyTexture(t: EnvTexture | null, patchTexture?: EnvTexture | null): void;
}

/**
 * Manchas de grava de antes de ADR 0036 (nítidas, lisas y sin textura). Solo para medir el costo
 * del cambio en E6 con el interruptor de diagnóstico `gravaPrevia`; la página nunca lo usa.
 */
export const LEGACY_GRAVEL_LOOK: SurfaceLook = {
  color: "#3e4044",
  roughness: 0.95,
  patch: { color: "#7a766d", roughness: 1, coverage: 0.25, sizeM: 0.6 },
  reflect: 0,
  normalScale: 1,
};

export function asphaltMaterial(surface: SurfaceState, legacyGravel = false): AsphaltMaterial {
  const look =
    legacyGravel && surface === "grava_suelta" ? LEGACY_GRAVEL_LOOK : SURFACE_LOOK[surface];
  // `color` es el color plano que lleva la exportación glTF (R11); el dibujo usa colorNode.
  const m = new MeshStandardNodeMaterial({
    color: look.color,
    roughness: look.roughness,
    metalness: 0,
  });
  // Manchas (charcos, aceite, lodo, grava) sobre la base: liso o con textura.
  const p = look.patch;
  const k = p
    ? smoothstep(
        float(patchThreshold(p.coverage)),
        float(patchThreshold(p.coverage) + (p.edge ?? 0.06)),
        mx_noise_float(vec2(positionWorld.x, positionWorld.z).div(p.sizeM)),
      ).mul(float(p.opacity ?? 1))
    : null;
  // Grano de piedra dentro de la mancha: el brillo varía ±30 % con un ruido del tamaño de una
  // piedra, así la grava no se ve como una mancha lisa (camuflaje) al acercarse.
  const patchColor = (): Node<"vec3"> => {
    if (!p?.grainM) return rgb(p!.color);
    const g = smoothstep(
      float(-0.25),
      float(0.25),
      mx_noise_float(vec2(positionWorld.x, positionWorld.z).div(p.grainM)),
    );
    return rgb(p.color).mul(mix(float(0.7), float(1.3), g));
  };
  const paint = (
    base: Node<"vec3">,
    rough: Node<"float">,
    patch: { color: Node<"vec3">; rough: Node<"float"> } | null = null,
  ): void => {
    const pc = patch?.color ?? (p ? patchColor() : null);
    const pr = patch?.rough ?? (p ? float(p.roughness) : null);
    m.colorNode = k && pc ? mix(base, pc, k) : base;
    m.roughnessNode = k && pr ? mix(rough, pr, k) : rough;
  };
  paint(rgb(look.color), float(look.roughness));
  return {
    material: m,
    look,
    applyTexture(t: EnvTexture | null, patchTexture: EnvTexture | null = null) {
      const g = p && k && patchTexture ? patchTexture : null;
      const patch = g
        ? { color: normalizedColor(g, p!.color), rough: normalizedRough(g, p!.roughness) }
        : null;
      if (t === null) {
        paint(rgb(look.color), float(look.roughness), patch);
        m.normalNode = g && k ? mix(normalView, asVec3(texturedNormal(g)), k).normalize() : null;
      } else {
        paint(normalizedColor(t, look.color), normalizedRough(t, look.roughness), patch);
        const base = texturedNormal(t, look.normalScale);
        m.normalNode = g && k ? mix(asVec3(base), asVec3(texturedNormal(g)), k).normalize() : base;
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
