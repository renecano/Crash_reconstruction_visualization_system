/**
 * Escena glTF (F9, PLAN §7.9): la escena del visor en el instante actual, con la animación de todo
 * lo que se mueve (vehículos, volcaduras, restos, personas y sus huesos) y el daño (pesos de los
 * morph targets), en un solo `.glb`. Lleva la leyenda de reconstrucción ilustrativa en
 * `asset.copyright` y en los `extras` de la escena (PLAN §10).
 *
 * No se toca la escena que se está dibujando: se muestrea la animación con `graph.update(t)` (y se
 * regresa al instante actual) y se exporta una copia (`SkeletonUtils.clone`, que conserva los
 * esqueletos) cuyos materiales de nodos se cambian por sus equivalentes clásicos, que es lo que
 * entiende `GLTFExporter`. Los efectos procedurales de esos materiales (texturas TSL del asfalto)
 * quedan como su color base; las instancias (árboles, vidrios) van en su lugar del instante actual.
 */
import { legendLines, legendString, type LegendInfo, type Resultado } from "@croquis/scene-schema";
import {
  AnimationClip,
  type InstancedMesh,
  type KeyframeTrack,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  type Object3D,
  QuaternionKeyframeTrack,
  Scene,
  VectorKeyframeTrack,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { SceneGraph } from "../scene-graph";

export interface GltfExportOptions {
  resultado: Resultado;
  legend: LegendInfo;
  /** Cuadros por segundo de la animación (30 por omisión). */
  fps?: number;
}

const EPS = 1e-7;

/** Valores que se muestrean de un objeto: posición, rotación, escala y pesos de morph targets. */
interface Sampled {
  obj: Object3D;
  first: number[];
  /** Solo se crea cuando el objeto cambia (la mayoría de la escena no se mueve). */
  values: Float32Array | null;
}

function read(obj: Object3D): number[] {
  const p = obj.position;
  const q = obj.quaternion;
  const s = obj.scale;
  const out = [p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z];
  const w = (obj as Mesh).morphTargetInfluences;
  if (w) out.push(...w);
  return out;
}

/** Instantes de muestreo de t0 a t1 (incluido t1) a `fps` cuadros por segundo. */
export function sampleTimes(t0: number, t1: number, fps: number): number[] {
  const n = Math.floor((t1 - t0) * fps + 1e-9);
  const times = Array.from({ length: n + 1 }, (_, i) => t0 + i / fps);
  if (t1 - times[times.length - 1]! > 1e-9) times.push(t1);
  return times;
}

/** Recorre la escena en `graph.update(t)` para cada instante y guarda lo que cambia. */
function sample(graph: SceneGraph, times: number[]): Sampled[] {
  const objs: Object3D[] = [];
  graph.root.traverse((o) => objs.push(o));
  const tNow = graph.time;
  graph.update(times[0]!);
  const sampled: Sampled[] = objs.map((obj) => ({ obj, first: read(obj), values: null }));
  const n = times.length;
  for (let k = 0; k < n; k++) {
    if (k > 0) graph.update(times[k]!);
    for (const s of sampled) {
      const v = read(s.obj);
      if (!s.values) {
        if (v.length === s.first.length && v.every((x, i) => Math.abs(x - s.first[i]!) <= EPS)) {
          continue;
        }
        // Primer cambio: se rellenan los cuadros anteriores con el valor inicial.
        s.values = new Float32Array(n * s.first.length);
        for (let j = 0; j < k; j++) s.values.set(s.first, j * s.first.length);
      }
      s.values.set(v.slice(0, s.first.length), k * s.first.length);
    }
  }
  graph.update(Number.isFinite(tNow) ? tNow : times[0]!);
  return sampled;
}

function tracksFor(s: Sampled, target: Object3D, times: Float32Array): KeyframeTrack[] {
  const v = s.values;
  if (!v) return [];
  const n = times.length;
  const stride = s.first.length;
  const pick = (from: number, size: number) => {
    const out = new Float32Array(n * size);
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < size; j++) out[k * size + j] = v[k * stride + from + j]!;
    }
    return out;
  };
  const changed = (from: number, size: number) => {
    for (let k = 1; k < n; k++) {
      for (let j = 0; j < size; j++) {
        if (Math.abs(v[k * stride + from + j]! - v[from + j]!) > EPS) return true;
      }
    }
    return false;
  };
  const id = target.uuid;
  const out: KeyframeTrack[] = [];
  if (changed(0, 3)) out.push(new VectorKeyframeTrack(`${id}.position`, times, pick(0, 3)));
  if (changed(3, 4)) out.push(new QuaternionKeyframeTrack(`${id}.quaternion`, times, pick(3, 4)));
  if (changed(7, 3)) out.push(new VectorKeyframeTrack(`${id}.scale`, times, pick(7, 3)));
  const morphs = stride - 10;
  if (morphs > 0 && changed(10, morphs)) {
    out.push(new NumberKeyframeTrack(`${id}.morphTargetInfluences`, times, pick(10, morphs)));
  }
  return out;
}

/** Material clásico equivalente a uno de nodos (lo que exporta `GLTFExporter`). */
export function classicMaterial(m: Material): Material {
  const node = m as Material & {
    isNodeMaterial?: boolean;
    isMeshPhysicalNodeMaterial?: boolean;
    isMeshStandardNodeMaterial?: boolean;
    isMeshBasicNodeMaterial?: boolean;
  };
  if (!node.isNodeMaterial) return m;
  const src = m as unknown as MeshPhysicalMaterial;
  const common = {
    name: m.name,
    color: src.color?.clone(),
    map: src.map ?? null,
    opacity: m.opacity,
    transparent: m.transparent,
    side: m.side,
    vertexColors: m.vertexColors,
  };
  if (node.isMeshBasicNodeMaterial) return new MeshBasicMaterial(common);
  const pbr = {
    ...common,
    roughness: src.roughness ?? 1,
    metalness: src.metalness ?? 0,
    emissive: src.emissive?.clone(),
    emissiveIntensity: src.emissiveIntensity ?? 1,
    normalMap: src.normalMap ?? null,
    roughnessMap: src.roughnessMap ?? null,
  };
  if (node.isMeshPhysicalNodeMaterial) {
    return new MeshPhysicalMaterial({
      ...pbr,
      clearcoat: src.clearcoat ?? 0,
      clearcoatRoughness: src.clearcoatRoughness ?? 0,
      transmission: src.transmission ?? 0,
      ior: src.ior ?? 1.5,
    });
  }
  return new MeshStandardMaterial(pbr);
}

/** Exporta la escena (con su animación) como `.glb`. */
export async function exportSceneGlb(
  graph: SceneGraph,
  opts: GltfExportOptions,
): Promise<ArrayBuffer> {
  const fps = opts.fps ?? 30;
  const { t_inicio, t_fin } = opts.resultado;
  const times = sampleTimes(t_inicio, t_fin, fps);
  const sampled = sample(graph, times);

  // Copia en el instante actual: los objetos se emparejan por orden de recorrido.
  const copy = cloneSkinned(graph.root);
  const copies: Object3D[] = [];
  copy.traverse((o) => copies.push(o));
  if (copies.length !== sampled.length) throw new Error("La copia de la escena no coincide");
  const converted = new Map<Material, Material>();
  const convert = (m: Material) => {
    let c = converted.get(m);
    if (!c) {
      c = classicMaterial(m);
      converted.set(m, c);
    }
    return c;
  };
  copy.traverse((o) => {
    // Grupos de instancias vacíos (p. ej. vidrios cuando ninguno se rompió): no dibujan nada y
    // GLTFExporter les escribiría accesores vacíos que ningún lector abre.
    const inst = o as InstancedMesh;
    if (inst.isInstancedMesh && inst.count === 0) o.visible = false;
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(convert)
      : convert(mesh.material);
  });

  const rel = new Float32Array(times.map((t) => t - t_inicio));
  const tracks = sampled.flatMap((s, i) => tracksFor(s, copies[i]!, rel));
  const clip = new AnimationClip("reconstruccion", t_fin - t_inicio, tracks);

  const scene = new Scene();
  scene.name = "Croquis — reconstrucción ilustrativa";
  scene.userData = {
    leyenda: legendLines(opts.legend),
    semilla: opts.legend.semilla,
    ...(opts.legend.hash ? { hash_entradas: opts.legend.hash } : {}),
    ...(opts.legend.atribucion ? { atribucion_mapa: opts.legend.atribucion } : {}),
    tiempo_inicio_s: t_inicio,
    tiempo_fin_s: t_fin,
    marco: "Y arriba; el solver usa X al este y Y al norte (glTF: x = este, z = −norte).",
  };
  scene.add(copy);

  try {
    const result = await new GLTFExporter().parseAsync(scene, {
      binary: true,
      animations: tracks.length > 0 ? [clip] : [],
      onlyVisible: true,
      copyright: legendString(opts.legend),
    });
    if (!(result instanceof ArrayBuffer)) throw new Error("GLTFExporter no devolvió un .glb");
    return result;
  } finally {
    for (const [orig, c] of converted) if (c !== orig) c.dispose();
  }
}
