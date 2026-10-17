/**
 * Niveles de calidad del visor (PLAN §7.8, ADR 0026). La laptop de referencia (Intel UHD
 * integrada, 8 GB) es el piso, no el techo:
 *
 * - **baja y media** se ajustan a ella (media ≥ 60 fps y baja ≥ 30 fps a 1080p, medido en E6);
 * - **alta y ultra** buscan la máxima calidad visual y nunca se recortan por la laptop. Su meta
 *   (≥ 60 fps) se mide en la computadora de demo.
 */
export type QualityLevel = "baja" | "media" | "alta" | "ultra";

export interface QualityProfile {
  level: QualityLevel;
  /** Factor de resolución de render respecto a la ventana. */
  pixelRatio: number;
  /** Sombras de la luz direccional (sol o luna). */
  shadows: boolean;
  /** Lado del mapa de sombras del sol (texeles). */
  shadowMapSize: number;
  /**
   * Sombra de la luna de noche. No se ve junto a los faros y el alumbrado
   * (`eval/results/e6_sombra_luna.json`), así que baja y media no la calculan; alta y ultra sí.
   */
  moonShadow: boolean;
  /** Lado del mapa de sombras de cada foco de faros y alumbrado (0: sin sombras). */
  spotShadowMapSize: number;
  /** Número máximo de instancias de árboles. */
  maxTrees: number;
  /**
   * Muestras de MSAA (0: sin antialiasing). Media usa 2: en la laptop de referencia 4 muestras
   * costaban ~5 ms por cuadro (ADR 0026, decisión 7).
   */
  msaaSamples: number;
  /**
   * Texturas PBR del entorno (asfalto, concreto, pasto; ADR 0024). Solo alta y ultra: en media
   * costaban 3–4 ms por cuadro y la superficie queda con su color calibrado (ADR 0026, decisión 7).
   */
  envTextures: boolean;
  /** Oclusión ambiental en pantalla (GTAO). */
  ambientOcclusion: boolean;
  /** Resplandor de luces y superficies muy brillantes (faros, lámparas, cielo). */
  bloom: boolean;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  baja: {
    level: "baja",
    pixelRatio: 0.75,
    shadows: false,
    shadowMapSize: 0,
    moonShadow: false,
    spotShadowMapSize: 0,
    maxTrees: 60,
    msaaSamples: 0,
    envTextures: false,
    ambientOcclusion: false,
    bloom: false,
  },
  media: {
    level: "media",
    pixelRatio: 1,
    shadows: true,
    shadowMapSize: 1024,
    moonShadow: false,
    spotShadowMapSize: 0,
    maxTrees: 200,
    msaaSamples: 2,
    envTextures: false,
    ambientOcclusion: false,
    bloom: false,
  },
  alta: {
    level: "alta",
    pixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    moonShadow: true,
    spotShadowMapSize: 1024,
    maxTrees: 600,
    msaaSamples: 4,
    envTextures: true,
    ambientOcclusion: true,
    bloom: true,
  },
  ultra: {
    level: "ultra",
    pixelRatio: 2,
    shadows: true,
    shadowMapSize: 4096,
    moonShadow: true,
    spotShadowMapSize: 2048,
    maxTrees: 1500,
    msaaSamples: 4,
    envTextures: true,
    ambientOcclusion: true,
    bloom: true,
  },
};

export const QUALITY_LEVELS: readonly QualityLevel[] = ["baja", "media", "alta", "ultra"];

export function isQualityLevel(v: unknown): v is QualityLevel {
  return typeof v === "string" && (QUALITY_LEVELS as readonly string[]).includes(v);
}

/**
 * Elige el nivel según fps medidos con histéresis: baja si < 28 fps sostenidos,
 * sube si > 58 fps sostenidos. Nunca salta dos niveles de golpe.
 */
export function nextQualityLevel(current: QualityLevel, measuredFps: number): QualityLevel {
  const i = QUALITY_LEVELS.indexOf(current);
  if (measuredFps < 28 && i > 0) return QUALITY_LEVELS[i - 1] ?? current;
  if (measuredFps > 58 && i < QUALITY_LEVELS.length - 1) return QUALITY_LEVELS[i + 1] ?? current;
  return current;
}
