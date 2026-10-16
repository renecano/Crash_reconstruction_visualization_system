/**
 * Lluvia y granizo en la escena: una malla instanciada cuyo movimiento calcula el sombreador (TSL,
 * igual en WebGPU y WebGL 2) a partir de la semilla de cada partícula y del tiempo de la línea de
 * tiempo. La CPU solo actualiza un uniforme por cuadro, así que miles de gotas no cuestan subir
 * posiciones a la GPU. La cuenta es la de `particlePosition` en `precipitation.ts`.
 */
import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  PlaneGeometry,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  color,
  float,
  fract,
  instancedBufferAttribute,
  positionLocal,
  uniform,
  vec3,
} from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { particleSeeds, type PrecipitationBox, type PrecipitationParams } from "./precipitation";

export interface PrecipitationAttachment {
  object: InstancedMesh;
  params: PrecipitationParams;
  box: PrecipitationBox;
  /** Tiempo de la línea de tiempo (s). */
  setTime(t: number): void;
  dispose(): void;
}

/** Estela de una gota: dos planos cruzados, para que se vea desde cualquier lado. */
function streakGeometry(width: number, length: number): BufferGeometry {
  const a = new PlaneGeometry(width, length);
  a.translate(0, length / 2, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b]);
  a.dispose();
  b.dispose();
  return g;
}

export function buildPrecipitation(
  params: PrecipitationParams,
  box: PrecipitationBox,
  seed: number,
  night: boolean,
): PrecipitationAttachment {
  const seeds = particleSeeds(params.count, seed);
  const s = instancedBufferAttribute<"vec3">(new InstancedBufferAttribute(seeds, 3), "vec3");
  const time = uniform(0);
  const phase = s.z.sub(time.mul(params.speed / box.height));
  const offset = vec3(
    s.x.mul(2).sub(1).mul(box.half).add(box.cx),
    fract(phase).mul(box.height),
    s.y.mul(2).sub(1).mul(box.half).add(box.cz),
  );
  // De noche, sin luz que las ilumine, las gotas casi no se ven (las luces llegan en F8b).
  const tint = new Color(params.color).multiplyScalar(night ? 0.35 : 1);
  const geometry = streakGeometry(params.size, params.streak);
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  material.colorNode = color(tint);
  material.opacityNode = float(params.opacity);
  material.positionNode = positionLocal.add(offset);
  const mesh = new InstancedMesh(geometry, material, params.count);
  mesh.name = `precipitacion-${params.kind}`;
  // La caja de la malla no incluye el desplazamiento del sombreador: sin recorte por cámara.
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return {
    object: mesh,
    params,
    box,
    setTime(t: number) {
      time.value = t;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
