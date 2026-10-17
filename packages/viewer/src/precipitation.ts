/**
 * Lluvia y granizo (PLAN §7.1): partículas que caen dentro de una caja centrada en la acción.
 *
 * Todo es determinista: cada partícula tiene una semilla fija (derivada de la semilla de la
 * escena) y su posición es función del tiempo de la línea de tiempo, no del reloj del sistema. Con
 * la escena en pausa la lluvia se detiene y una captura en t = 0 siempre sale igual.
 *
 * Velocidades de caída (valores visuales, no física): gotas de lluvia ligera ≈ 1 mm y de lluvia
 * fuerte ≈ 2–3 mm, con velocidad terminal de 4.0 y 7.0 m/s según las mediciones de Gunn y Kinzer
 * (1949, J. Meteorology 6, 243–248). El granizo pequeño (≈ 1–2 cm) cae a unos 9 m/s (supuesto
 * de orden de magnitud). Sin viento (supuesto).
 */
import type { Precipitation } from "./environment";
import type { QualityLevel } from "./quality";
import { mulberry32 } from "./debris";

export interface PrecipitationParams {
  kind: Exclude<Precipitation, "ninguna">;
  /** Partículas en la caja. */
  count: number;
  /** Velocidad de caída (m/s). */
  speed: number;
  /** Largo de la estela de una gota (m): lo que avanza en ~30 ms, como en una foto con barrido. */
  streak: number;
  /** Ancho de la estela o diámetro del grano (m). */
  size: number;
  color: string;
  opacity: number;
}

/** Partículas de lluvia fuerte por nivel de calidad; la ligera y el granizo usan una fracción. */
export const RAIN_COUNT: Record<QualityLevel, number> = { baja: 1500, media: 6000, alta: 15000 };
/** Altura de la caja de lluvia (m). */
export const PRECIPITATION_HEIGHT = 24;

export function precipitationParams(
  kind: Precipitation,
  quality: QualityLevel,
): PrecipitationParams | null {
  const base = RAIN_COUNT[quality];
  if (kind === "lluvia_fuerte") {
    return {
      kind,
      count: base,
      speed: 7.0,
      streak: 7.0 * 0.03,
      size: 0.012,
      color: "#c7d3df",
      opacity: 0.42,
    };
  }
  if (kind === "lluvia_ligera") {
    return {
      kind,
      count: Math.round(base * 0.4),
      speed: 4.0,
      streak: 4.0 * 0.03,
      size: 0.008,
      color: "#c7d3df",
      opacity: 0.32,
    };
  }
  if (kind === "granizo") {
    // Granos de ≈ 2 cm: a 9 m/s también se ven como estela corta, más ancha y opaca que la gota.
    return {
      kind,
      count: Math.round(base * 0.35),
      speed: 9.0,
      streak: 9.0 * 0.02,
      size: 0.02,
      color: "#f4f7fa",
      opacity: 0.85,
    };
  }
  return null;
}

/** Semillas uniformes en [0, 1)³ por partícula (x, z y fase vertical). */
export function particleSeeds(count: number, seed: number): Float32Array {
  const rng = mulberry32(Math.trunc(seed) * 2654435761 + 4049);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < out.length; i++) out[i] = rng();
  return out;
}

export interface PrecipitationBox {
  /** Centro de la caja en el suelo (three.js: x, z). */
  cx: number;
  cz: number;
  /** Medio lado horizontal (m). */
  half: number;
  height: number;
}

/**
 * Posición de una partícula en el tiempo `t` (s): la misma cuenta que hace el sombreador. Cae a
 * velocidad constante y, al llegar al suelo, vuelve a la parte alta de la caja.
 */
export function particlePosition(
  seed: readonly [number, number, number],
  t: number,
  speed: number,
  box: PrecipitationBox,
): [number, number, number] {
  const phase = seed[2] - (speed * t) / box.height;
  const frac = phase - Math.floor(phase);
  return [
    box.cx + (seed[0] * 2 - 1) * box.half,
    frac * box.height,
    box.cz + (seed[1] * 2 - 1) * box.half,
  ];
}
