/**
 * Factor de resolución del lienzo (dpr) por nivel de calidad (René, 2026-11-04, MacBook M1):
 * el visor dibujaba a `min(devicePixelRatio, 2) × pixelRatio del perfil`, y en alta (1.5) sobre una
 * pantalla Retina salía dpr 3 (3767 × 1562 px, 516 MB de pantalla, «Page Unresponsive»).
 *
 * Reglas: nunca más de `min(devicePixelRatio, 2)`; baja 1; media tope 1.5; alta y ultra tope 2;
 * y en todos los niveles la memoria de pantalla estimada no pasa de `LIMITE_PANTALLA_MB`
 * (se baja el dpr de 0.25 en 0.25 hasta 1).
 */
import { memoriaPantallaMB, type PantallaParams } from "./diagnostics";
import { NIGHT_PIXEL_RATIO_MEDIA, QUALITY_PROFILES, type QualityLevel } from "./quality";

/** Tope de memoria de pantalla (destinos de color, profundidad y posproceso), en MB. */
export const LIMITE_PANTALLA_MB = 150;
/** Tope de dpr por nivel. */
export const TOPE_DPR: Record<QualityLevel, number> = { baja: 1, media: 1.5, alta: 2, ultra: 2 };
/** Nunca por debajo de este dpr: menos ya se ve borroso. */
const DPR_MINIMO = 1;

/** Parámetros de pantalla de un perfil a un tamaño (CSS px) y dpr, como los del diagnóstico. */
export function pantallaDe(
  level: QualityLevel,
  ancho: number,
  alto: number,
  dpr: number,
  spotShadows = 0,
): PantallaParams {
  const p = QUALITY_PROFILES[level];
  // Pases a resolución completa de cada efecto (bloom, AO y TRAA con pase previo o historia).
  const pasosPost =
    (p.bloom ? 2 : 0) +
    (p.ambientOcclusion ? 2 : 0) +
    (p.temporalAA ? 2 : 0) +
    (p.depthOfField ? 2 : 0) +
    (p.motionBlur ? 1 : 0) +
    (p.screenReflections ? 2 : 0);
  return {
    ancho,
    alto,
    dpr,
    // Con postproceso los pases van sin MSAA (ADR 0102); sin él, el lienzo lleva las muestras.
    msaaSamples: p.ambientOcclusion || p.bloom ? 0 : p.msaaSamples,
    pasosPost,
    shadowMapSize: p.shadowMapSize,
    spotShadowMapSize: p.spotShadowMapSize,
    spotShadows,
  };
}

/**
 * El dpr con el que se dibuja: el tope del nivel acotado por `devicePixelRatio` (y por 2), y
 * bajado de 0.25 en 0.25 hasta que la memoria de pantalla cabe en `LIMITE_PANTALLA_MB` para el
 * tamaño dado (CSS px). De noche en media se aplica además `NIGHT_PIXEL_RATIO_MEDIA`.
 */
export function dprPara(
  level: QualityLevel,
  devicePixelRatio: number,
  ancho: number,
  alto: number,
  opts: { noche?: boolean; limiteMB?: number } = {},
): number {
  const limite = opts.limiteMB ?? LIMITE_PANTALLA_MB;
  let dpr = Math.min(devicePixelRatio || 1, 2, TOPE_DPR[level]);
  dpr = Math.max(DPR_MINIMO, dpr);
  while (
    dpr > DPR_MINIMO &&
    memoriaPantallaMB(pantallaDe(level, ancho, alto, dpr)).pantallaMB > limite
  ) {
    dpr = Math.max(DPR_MINIMO, Math.round((dpr - 0.25) * 100) / 100);
  }
  if (opts.noche && level === "media") dpr *= NIGHT_PIXEL_RATIO_MEDIA;
  return dpr;
}
