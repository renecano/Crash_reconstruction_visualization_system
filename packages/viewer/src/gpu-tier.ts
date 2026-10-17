/**
 * Nivel de calidad inicial según la GPU (PLAN §7.8, ADR 0026). Es solo el punto de arranque: el
 * modo automático luego sube o baja con los fps medidos (`nextQualityLevel`), y el usuario puede
 * elegir a mano.
 *
 * El nombre sale de `WEBGL_debug_renderer_info` (en Chrome y Edge, una cadena de ANGLE como
 * «ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 …)»). Si el navegador no lo da, se arranca
 * en media.
 */
import type { QualityLevel } from "./quality";

interface Rule {
  re: RegExp;
  level: QualityLevel;
  /** Por qué (para el registro y las pruebas). */
  kind: string;
}

/** En orden: la primera que coincide decide. */
const RULES: readonly Rule[] = [
  { re: /swiftshader|llvmpipe|softpipe|basic render/i, level: "baja", kind: "render por software" },
  { re: /mali|adreno|powervr|apple gpu|videocore/i, level: "baja", kind: "GPU móvil" },
  { re: /apple m\d+ (pro|max|ultra)/i, level: "ultra", kind: "Apple Silicon de gama alta" },
  { re: /apple m\d+/i, level: "alta", kind: "Apple Silicon" },
  {
    re: /rtx\s*(20[6-9]0|[3-5]0[6-9]0)|rtx\s*a\d{4}|rx\s*(6[7-9]|7[7-9]|9[0-9])\d0/i,
    level: "ultra",
    kind: "GPU dedicada de gama alta",
  },
  {
    re: /nvidia|geforce|quadro|rtx|gtx|radeon\s*(rx|pro)|arc(\(tm\))?\s*a\d/i,
    level: "alta",
    kind: "GPU dedicada",
  },
  {
    re: /intel|radeon(\(tm\))?\s*(graphics|vega)|amd custom gpu/i,
    level: "media",
    kind: "GPU integrada",
  },
];

export interface GpuTier {
  level: QualityLevel;
  kind: string;
  renderer: string | null;
}

/** Nivel inicial para el nombre de GPU dado (media si no se reconoce o no hay nombre). */
export function qualityForGpu(renderer: string | null | undefined): GpuTier {
  const name = renderer?.trim() || null;
  if (name) {
    for (const r of RULES) {
      if (r.re.test(name)) return { level: r.level, kind: r.kind, renderer: name };
    }
  }
  return { level: "media", kind: name ? "GPU sin clasificar" : "GPU desconocida", renderer: name };
}

/** Nombre de la GPU que reporta el navegador (null si no lo expone o no hay WebGL 2). */
export function readGpuRenderer(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext
      ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as unknown)
      : (gl.getParameter(gl.RENDERER) as unknown);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}
