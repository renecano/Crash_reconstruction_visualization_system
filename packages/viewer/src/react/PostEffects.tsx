/**
 * Efectos de pantalla de alta y ultra (PLAN §7.8, ADR 0026): oclusión ambiental (GTAO) y
 * resplandor selectivo. Baja y media no los usan.
 *
 * - **Oclusión ambiental:** un prepaso escribe normales y profundidad; GTAO calcula cuánto cielo
 *   ve cada punto y oscurece contactos y rincones (llantas contra el piso, bajo la carrocería,
 *   junto a guarniciones). Entra en la iluminación indirecta de la escena (`builtinAOContext`), no
 *   como capa encima.
 * - **Resplandor:** solo de lo que emite luz (faros, lámparas, semáforos), leído del canal
 *   `emissive` por MRT. De día casi nada emite, así que no lava el cielo.
 *
 * Patrón de la documentación de three r186 (`GTAONode`, `BloomNode`, `RenderPipeline`). Con
 * prioridad 1 en `useFrame`, este componente toma el dibujo del cuadro en lugar de R3F.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { builtinAOContext, emissive, mrt, normalView, output, pass, screenUV } from "three/tsl";
import { RenderPipeline, type WebGPURenderer } from "three/webgpu";

/** Resplandor: intensidad, radio (0-1) y umbral de luminancia. */
export const BLOOM_STRENGTH = 0.6;
export const BLOOM_RADIUS = 0.3;
export const BLOOM_THRESHOLD = 0;

export function PostEffects({
  ambientOcclusion,
  withBloom,
}: {
  ambientOcclusion: boolean;
  withBloom: boolean;
}): null {
  const { gl, scene, camera } = useThree();
  const pipeline = useMemo(() => {
    const p = new RenderPipeline(gl as unknown as WebGPURenderer);
    const scenePass = pass(scene, camera);
    if (withBloom) scenePass.setMRT(mrt({ output, emissive }));
    if (ambientOcclusion) {
      const prePass = pass(scene, camera);
      prePass.setMRT(mrt({ output: normalView }));
      const aoPass = ao(prePass.getTextureNode("depth"), prePass.getTextureNode(), camera);
      scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
    }
    const color = scenePass.getTextureNode("output");
    p.outputNode = withBloom
      ? color.add(
          bloom(
            scenePass.getTextureNode("emissive"),
            BLOOM_STRENGTH,
            BLOOM_RADIUS,
            BLOOM_THRESHOLD,
          ),
        )
      : color;
    return p;
  }, [gl, scene, camera, ambientOcclusion, withBloom]);
  useEffect(() => () => pipeline.dispose(), [pipeline]);
  useFrame(() => {
    pipeline.render();
  }, 1);
  return null;
}
