/**
 * Niveles de calidad del visor (PLAN §7.8). El presupuesto se mide en la laptop de
 * referencia (Intel UHD integrada, 8 GB) y los umbrales se registran en eval/results.
 */
export type QualityLevel = "baja" | "media" | "alta";

export interface QualityProfile {
  level: QualityLevel;
  /** Factor de resolución de render respecto a la ventana. */
  pixelRatio: number;
  shadows: boolean;
  /** Número máximo de instancias de árboles. */
  maxTrees: number;
  postprocessing: boolean;
  /** MSAA (4 muestras) en el renderer. */
  antialias: boolean;
  /** Lado del mapa de sombras del sol (texeles). */
  shadowMapSize: number;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  baja: {
    level: "baja",
    pixelRatio: 0.75,
    shadows: false,
    maxTrees: 60,
    postprocessing: false,
    antialias: false,
    shadowMapSize: 0,
  },
  media: {
    level: "media",
    pixelRatio: 1,
    shadows: true,
    maxTrees: 200,
    postprocessing: false,
    antialias: true,
    shadowMapSize: 1024,
  },
  alta: {
    level: "alta",
    pixelRatio: 1.5,
    shadows: true,
    maxTrees: 600,
    postprocessing: true,
    antialias: true,
    shadowMapSize: 2048,
  },
};

const ORDER: readonly QualityLevel[] = ["baja", "media", "alta"];

/**
 * Elige el nivel según fps medidos con histéresis: baja si < 28 fps sostenidos,
 * sube si > 58 fps sostenidos. Nunca salta dos niveles de golpe.
 */
export function nextQualityLevel(current: QualityLevel, measuredFps: number): QualityLevel {
  const i = ORDER.indexOf(current);
  if (measuredFps < 28 && i > 0) return ORDER[i - 1] ?? current;
  if (measuredFps > 58 && i < ORDER.length - 1) return ORDER[i + 1] ?? current;
  return current;
}
