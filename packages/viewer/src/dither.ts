/**
 * Tramado (dithering) para las superficies grandes y oscuras (T1.2, ADR 0095). En media el
 * lienzo es de 8 bits por canal (E6) y de noche el pasto y la calzada, iluminados por los conos
 * de las luminarias, mostraban anillos y bandas de color alrededor de cada lámpara (comentario de
 * René sobre T1.1): un degradado lento no cabe en 256 niveles. Un ruido de ±1/2 nivel por pixel,
 * sumado como emisión después de la iluminación (en lineal, con amplitud constante), rompe las
 * bandas sin cambiar el tono medio. three r186 no aplica `material.dithering` en WebGPU.
 */
import { dot, float, fract, screenCoordinate, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";

/** Amplitud del tramado en lineal (un poco más de medio nivel de 8 bits tras el tone mapping). */
export const DITHER_AMPLITUDE = 1 / 180;

/** Ruido por pixel en [−0.5, 0.5] × amplitud, como vec3 para `emissiveNode`. */
export function ditherNode(amplitude = DITHER_AMPLITUDE): Node<"vec3"> {
  // Interruptor de diagnóstico (`eval/t1_tirones.mjs --diag '{"sinTramado":true}'`).
  // (Sin el tipo global de `SceneViewer.tsx`: este módulo también lo compila `eval/js`.)
  const diag =
    typeof window !== "undefined"
      ? (window as { __croquisDiag?: { sinTramado?: boolean } }).__croquisDiag
      : undefined;
  if (diag?.sinTramado === true) {
    return vec3(0, 0, 0);
  }
  // Ruido de gradiente entrelazado (Jimenez 2014): sin seno, dos multiplicaciones por pixel.
  // Con `sin` costaba un 12 % de los fps de media en AXA (`t1_tirones.mjs`, sinTramado).
  const n = fract(
    float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))),
  );
  const v = n.sub(float(0.5)).mul(float(amplitude));
  return vec3(v, v, v);
}
