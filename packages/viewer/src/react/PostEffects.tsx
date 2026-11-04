/**
 * Efectos de pantalla de alta y ultra (PLAN §7.8, ADR 0026; R10, ADR 0077). Baja y media no los
 * usan.
 *
 * - **Oclusión ambiental:** un prepaso escribe normales y profundidad; GTAO calcula cuánto cielo
 *   ve cada punto y oscurece contactos y rincones (llantas contra el piso, bajo la carrocería,
 *   junto a guarniciones). Entra en la iluminación indirecta de la escena (`builtinAOContext`), no
 *   como capa encima.
 * - **Reflejos en pantalla (ultra):** SSR con las normales y el metal/rugosidad del pase; el
 *   asfalto mojado y la pintura reflejan la escena. Se suma al color (salida premultiplicada).
 * - **Resplandor:** solo de lo que emite luz (faros, lámparas, semáforos), leído del canal
 *   `emissive` por MRT. De día casi nada emite, así que no lava el cielo.
 * - **Antialiasing temporal (TRAA):** reproyecta los cuadros anteriores con la velocidad del pase.
 * - **Profundidad de campo:** solo con la cámara cinemática, enfocada en los vehículos.
 * - **Desenfoque de movimiento:** solo alrededor del impacto y al reproducir (`impactBlurWeight`).
 *   `motionBlur` muestrea su entrada como textura: el color de antes se convierte con
 *   `convertToTexture` (TRAA y la profundidad de campo lo hacen por dentro).
 *
 * Patrón de la documentación y los ejemplos de three r186 (`GTAONode`, `BloomNode`, `SSRNode`,
 * `TRAANode`, `DepthOfFieldNode`, `MotionBlur`, `RenderPipeline`). Con prioridad 1 en `useFrame`,
 * este componente toma el dibujo del cuadro en lugar de R3F.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { dof } from "three/addons/tsl/display/DepthOfFieldNode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { motionBlur } from "three/addons/tsl/display/MotionBlur.js";
import { ssr } from "three/addons/tsl/display/SSRNode.js";
import { traa } from "three/addons/tsl/display/TRAANode.js";
import {
  builtinAOContext,
  convertToTexture,
  dot,
  emissive,
  float,
  metalness,
  mrt,
  normalView,
  output,
  pass,
  roughness,
  sample,
  saturate,
  screenUV,
  sqrt,
  uniform,
  vec3,
  vec4,
  velocity,
} from "three/tsl";
import { RenderPipeline, type Node, type WebGPURenderer } from "three/webgpu";
import type { FxState } from "../cinematic-fx";
import type { QualityProfile } from "../quality";

/** Resplandor: intensidad, radio (0-1) y umbral de luminancia. */
export const BLOOM_STRENGTH = 0.6;
export const BLOOM_RADIUS = 0.3;
export const BLOOM_THRESHOLD = 0;
/** Tamaño del bokeh de la cámara cinemática (sin unidades, artístico). */
export const BOKEH_SCALE = 2;
/** Cuánto se estira el desenfoque de movimiento a peso 1 (múltiplo de la velocidad del cuadro). */
export const MOTION_BLUR_AMOUNT = 1;

export function PostEffects({ profile, fx }: { profile: QualityProfile; fx: FxState }): null {
  const { gl, scene, camera } = useThree();
  const {
    ambientOcclusion,
    bloom: withBloom,
    temporalAA,
    depthOfField,
    motionBlur: blur,
  } = profile;
  const reflections = profile.screenReflections;
  const built = useMemo(() => {
    const p = new RenderPipeline(gl as unknown as WebGPURenderer);
    // Sin MSAA en los pases (ADR 0102): heredan las muestras del renderer (4 en alta y ultra) y
    // WebGPU no puede ni muestrear ni copiar una profundidad multimuestra a una textura sencilla
    // («sample count (4) and destination sample count (1) does not match» en cada cuadro: el visor
    // dejaba de dibujar). El antialiasing de alta y ultra es el temporal (TRAA).
    const scenePass = pass(scene, camera, { samples: 0 });
    const needVelocity = temporalAA || blur;
    scenePass.setMRT(
      mrt({
        output,
        ...(withBloom ? { emissive } : {}),
        ...(needVelocity ? { velocity } : {}),
        // Normal (xy en vista, z se reconstruye) y metal/rugosidad en un solo destino: WebGPU
        // admite 32 bytes por muestra entre todos los destinos (cuatro RGBA16F); con normal y
        // metal/rugosidad aparte eran 40 y el pipeline de ultra no se creaba (ADR 0102).
        ...(reflections
          ? { nmr: vec4(normalView.xy.mul(0.5).add(0.5), metalness, roughness) }
          : {}),
      }),
    );
    if (ambientOcclusion) {
      // Sin MSAA: el pase hereda las muestras del renderer (4 en alta y ultra) y la GTAO hace
      // `textureGather` sobre la profundidad, que WGSL no admite en una textura multimuestra. El
      // módulo de sombreado quedaba inválido y, con él, todos los búferes de comandos siguientes:
      // el visor dejaba de dibujar (pantalla blanca en las computadoras que eligen alta o ultra
      // con WebGPU; René, 2026-11-04). La oclusión no necesita antialiasing.
      const prePass = pass(scene, camera, { samples: 0 });
      prePass.setMRT(mrt({ output: normalView }));
      const aoPass = ao(prePass.getTextureNode("depth"), prePass.getTextureNode(), camera);
      scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
    }
    const depth = scenePass.getTextureNode("depth");
    let color: Node<"vec4"> = scenePass.getTextureNode("output");
    if (reflections) {
      const nmr = scenePass.getTextureNode("nmr");
      const reflejos = ssr(
        color,
        depth,
        sample((uv) => {
          const xy = nmr.sample(uv).xy.mul(2).sub(1);
          return vec3(xy, sqrt(saturate(float(1).sub(dot(xy, xy)))));
        }),
        {
          metalnessNode: nmr.b,
          roughnessNode: nmr.a,
          reflectNonMetals: true,
          camera,
        },
      );
      color = color.add(reflejos.rgb);
    }
    if (withBloom)
      color = color.add(
        bloom(scenePass.getTextureNode("emissive"), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD),
      );
    const vel = needVelocity ? scenePass.getTextureNode("velocity") : null;
    if (temporalAA && vel) color = traa(color, depth, vel, camera);
    const focus = uniform(10);
    const focal = uniform(6);
    const bokeh = uniform(0);
    // `dof` devuelve un TempNode que se usa como nodo de color (así en los ejemplos de r186); sus
    // tipos no lo dicen.
    if (depthOfField)
      color = dof(color, scenePass.getViewZNode(), focus, focal, bokeh) as unknown as Node<"vec4">;
    const blurAmount = uniform(0);
    if (blur && vel) color = motionBlur(convertToTexture(color), vel.mul(blurAmount));
    p.outputNode = color;
    return { pipeline: p, focus, focal, bokeh, blurAmount };
  }, [gl, scene, camera, ambientOcclusion, withBloom, temporalAA, depthOfField, blur, reflections]);
  useEffect(() => () => built.pipeline.dispose(), [built]);
  useFrame(() => {
    built.focus.value = fx.focus?.distance ?? 10;
    built.focal.value = fx.focus?.focalLength ?? 6;
    built.bokeh.value = fx.focus ? BOKEH_SCALE : 0;
    built.blurAmount.value = fx.blur * MOTION_BLUR_AMOUNT;
    built.pipeline.render();
  }, 1);
  return null;
}
