/**
 * Cielo, luz de ambiente y aire (T1.1 de PLAN-CESVI v3, ADR 0094). Funciones puras; `SceneViewer`
 * las aplica.
 *
 * - **El cielo visible es procedural:** de día, el modelo de Preetham (`SkyMesh`) con el sol en la
 *   posición calculada para el lugar, la fecha y la hora del hecho; de noche, un domo con
 *   gradiente, estrellas y el resplandor de la luna (`sky-scene.ts`). Nada de imágenes de fondo.
 * - **La luz de ambiente y los reflejos salen de un HDRI CC0 de Poly Haven** elegido por el clima y
 *   la hora (`hdriFor`), prefiltrado (PMREM) y girado para que su sol caiga en el azimut del sol
 *   calculado (`hdriRotationY`). El sol directo y las sombras siguen siendo la luz direccional.
 * - **Exposición por escena** (`exposureFor`): el tone mapping de cine (ACES) es el mismo en todas;
 *   lo que cambia es la exposición, como la abriría una cámara de noche.
 * - **El aire** (`fogColorFor`): la niebla toma el color del horizonte, no el del cenit, y su
 *   densidad sigue saliendo de la visibilidad declarada (`environment.ts`).
 */
import type { EnvironmentSettings } from "./environment";

export type SkyHdri = "dia" | "nublado" | "crepusculo" | "noche";
/** Como los modelos (ADR 0107): en producción, de Vercel Blob; en local y en CI, de `public/`. */
export const HDRI_BASE_URL = process.env.CROQUIS_RECURSOS_HDRI || "/hdri/";

export interface HdriManifest {
  resolucion: string;
  hdri: Record<
    string,
    {
      archivo: string;
      autor: string;
      licencia: string;
      url: string;
      /** Azimut (desde el norte, horario) del punto más brillante del cielo del HDRI. */
      azimut_sol_deg: number;
    }
  >;
}

type Env = Pick<EnvironmentSettings, "night" | "turbidity" | "sun" | "streetLights">;

const overcast = (env: Pick<Env, "turbidity">): boolean => env.turbidity > 5;
const twilight = (env: Pick<Env, "night" | "sun">): boolean => !env.night && env.sun.elevation < 15;

/** Qué HDRI da la luz de ambiente: por la hora y el clima (el mismo criterio que `environmentFor`). */
export function hdriFor(env: Pick<Env, "night" | "turbidity" | "sun">): SkyHdri {
  if (env.night) return "noche";
  if (overcast(env)) return "nublado";
  if (twilight(env)) return "crepusculo";
  return "dia";
}

/**
 * Radiancia media que debe tener el HDRI como luz de ambiente, por cielo (unidades del render,
 * valores visuales). El visor mide la radiancia media del HDRI ya sin su sol (`SKY_RADIANCE_CAP`)
 * y escala `scene.environmentIntensity` para que quede en esta meta: así los cuatro cielos
 * iluminan parecido aunque sus fotos tengan exposiciones distintas. De día, 0.15 equivale a la
 * irradiancia que daba la luz de hemisferio de antes (0.85 × el color del cielo ≈ 0.47 = π × 0.15).
 */
export const AMBIENT_TARGET: Record<SkyHdri, number> = {
  dia: 0.15,
  nublado: 0.15,
  crepusculo: 0.1,
  noche: 0.04,
};

/**
 * Tope de radiancia por texel del HDRI (lineal): el cielo despejado va de 0.1 a 1 y las nubes al
 * sol a unos pocos; el disco del sol vale miles y, como luz de ambiente, lavaría la escena. El sol
 * directo y las sombras los pone la luz direccional calculada.
 */
export const SKY_RADIANCE_CAP = 6;

/** `scene.environmentIntensity` para que la radiancia media medida llegue a la meta del cielo. */
export function environmentIntensityFor(
  env: Pick<Env, "night" | "turbidity" | "sun">,
  meanLuminance: number,
): number {
  const target = AMBIENT_TARGET[hdriFor(env)];
  if (!(meanLuminance > 0)) return 1;
  return Math.min(50, target / meanLuminance);
}

/**
 * Exposición del tone mapping por escena. De día, 1 (la calibración de siempre); de noche la
 * cámara abre, como lo haría una real: lo que se ve sigue saliendo de los faros y el alumbrado.
 */
export function exposureFor(env: Env): number {
  if (env.night) return env.streetLights ? 2.2 : 2.6;
  if (twilight(env)) return 1.1;
  return 1;
}

/**
 * Con el HDRI como luz de ambiente, la luz de hemisferio solo rellena (sin ella, lo que no ve el
 * cielo queda negro en GPU integrada, donde no hay oclusión ambiental).
 */
export const HEMISPHERE_WITH_HDRI = 0.3;

/**
 * Columna (u, de 0 a 1) del mapa equirectangular de three.js que mira a un azimut (desde el
 * norte, horario). En three, u = 0.5 mira a +X (el este) y u crece hacia +Z (el sur).
 */
export function equirectU(azimuthDeg: number): number {
  const u = 0.5 + (azimuthDeg - 90) / 360;
  return ((u % 1) + 1) % 1;
}

/** Normaliza un ángulo a (−π, π]. */
function wrap(rad: number): number {
  let a = rad % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/**
 * Giro del HDRI sobre el eje vertical (`scene.environmentRotation.y`, radianes) para que su sol
 * (`hdriSunAzimuthDeg`, del manifiesto) caiga en el azimut del sol calculado de la escena. Una
 * rotación positiva sobre +Y de three.js lleva el este hacia el norte, así que lo que está en el
 * mapa a un azimut a aparece en el mundo en a + giro.
 */
export function hdriRotationY(sceneSunAzimuthDeg: number, hdriSunAzimuthDeg: number): number {
  return wrap(((sceneSunAzimuthDeg - hdriSunAzimuthDeg) * Math.PI) / 180);
}

/** Color de la niebla: el del horizonte (perspectiva aérea), no el del cenit. */
export function fogColorFor(env: Env): string {
  // De noche, azul oscuro neutro a casi negro (T1.3c; antes el alumbrado la teñía de oliva); de
  // día, un horizonte azulado y no casi blanco (T1.3c: con #cfdbe6 el cielo bajo se veía blanco).
  if (env.night) return env.streetLights ? "#12161f" : "#0b0e18";
  if (overcast(env)) return "#a8b1ba";
  if (twilight(env)) return "#d9bba7";
  return "#9fb3c6";
}

/** Colores del domo de noche (`sky-scene.ts`): horizonte y cenit, con o sin alumbrado. */
export function nightSkyColors(streetLights: boolean): { horizon: string; zenith: string } {
  // Azul oscuro neutro a casi negro (T1.3c, René): el horizonte con alumbrado ya no es pardo.
  return streetLights
    ? { horizon: "#1b2030", zenith: "#04060b" }
    : { horizon: "#10162a", zenith: "#030509" };
}
