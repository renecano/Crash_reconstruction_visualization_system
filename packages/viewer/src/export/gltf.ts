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
 *
 * Para el video cinematográfico (R11, ADR 0085) lleva también las cámaras del visor, animadas con las
 * mismas poses que en pantalla, y el ambiente que calcula el visor (el sol del lugar y la hora, la
 * noche, la niebla, el piso mojado) en los `extras` de la escena: el script de Blender
 * (`tools/blender/croquis_render.py`) arma con eso el cielo y la luz.
 */
import { legendLines, legendString, type LegendInfo, type Resultado } from "@croquis/scene-schema";
import {
  AnimationClip,
  Color,
  Group,
  Matrix4,
  type InstancedMesh,
  type KeyframeTrack,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  type Object3D,
  PerspectiveCamera,
  Quaternion,
  QuaternionKeyframeTrack,
  Scene,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { CameraPose, ExportCamera } from "../cameras";
import type { EnvironmentSettings } from "../environment";
import type { SceneGraph } from "../scene-graph";

export interface GltfExportOptions {
  resultado: Resultado;
  legend: LegendInfo;
  /** Cuadros por segundo de la animación (30 por omisión). */
  fps?: number;
  /** Las cámaras del visor (R11); la primera es la principal. */
  cameras?: readonly ExportCamera[];
  /** El ambiente del visor (R11), para armar el cielo y la luz fuera del navegador. */
  ambiente?: GltfAmbiente;
}

/**
 * El ambiente que calcula el visor (`environmentFor`), con nombres del contrato. Las direcciones van
 * en el marco del solver (X este, Y norte, Z arriba), que es también el de Blender al importar.
 * Son valores visuales, no física.
 */
export interface GltfAmbiente {
  sol: { elevacion_deg: number; azimut_deg: number };
  /** Hacia la luz principal (el sol o, de noche, la luna), unitaria. */
  direccion_luz: [number, number, number];
  noche: boolean;
  intensidad_luz: number;
  intensidad_ambiente: number;
  color_cielo: string;
  color_ambiente: string;
  /** Densidad de la niebla exponencial cuadrática del visor (`FogExp2`), por metro. */
  densidad_niebla: number;
  piso_mojado: boolean;
  precipitacion: string;
  alumbrado: boolean;
  turbidez: number;
}

/** El ambiente del visor en la forma que viaja en el glTF. */
export function ambienteDe(env: EnvironmentSettings): GltfAmbiente {
  return {
    sol: { elevacion_deg: env.sun.elevation, azimut_deg: env.sun.azimuth },
    direccion_luz: env.lightDirection,
    noche: env.night,
    intensidad_luz: env.sunIntensity,
    intensidad_ambiente: env.ambientIntensity,
    color_cielo: env.skyColor,
    color_ambiente: env.ambientSkyColor,
    densidad_niebla: env.fogDensity,
    piso_mojado: env.wet,
    precipitacion: env.precipitation,
    alumbrado: env.streetLights,
    turbidez: env.turbidity,
  };
}

function place(cam: PerspectiveCamera, pose: CameraPose): void {
  cam.position.set(...pose.position);
  cam.up.set(...pose.up);
  cam.fov = pose.fov;
  cam.lookAt(new Vector3(...pose.target));
}

/**
 * Las cámaras exportadas: cada una en su pose del primer instante y, si se mueve, con su posición y
 * su orientación muestreadas en los mismos instantes que la escena.
 */
export function cameraTracks(
  cameras: readonly ExportCamera[],
  times: readonly number[],
  rel: Float32Array,
): { cams: PerspectiveCamera[]; tracks: KeyframeTrack[] } {
  const tracks: KeyframeTrack[] = [];
  const cams = cameras.map((c) => {
    const cam = new PerspectiveCamera(c.pose(times[0]!).fov, 16 / 9, 0.1, 2000);
    cam.name = c.nombre;
    cam.userData = { clave: c.clave };
    const pos = new Float32Array(times.length * 3);
    const rot = new Float32Array(times.length * 4);
    times.forEach((t, k) => {
      place(cam, c.pose(t));
      cam.position.toArray(pos, k * 3);
      cam.quaternion.toArray(rot, k * 4);
    });
    place(cam, c.pose(times[0]!));
    const moves = (v: Float32Array, n: number) =>
      v.some((x, i) => i >= n && Math.abs(x - v[i % n]!) > EPS);
    if (moves(pos, 3)) tracks.push(new VectorKeyframeTrack(`${cam.uuid}.position`, rel, pos));
    if (moves(rot, 4)) tracks.push(new QuaternionKeyframeTrack(`${cam.uuid}.quaternion`, rel, rot));
    return cam;
  });
  return { cams, tracks };
}

const EPS = 1e-7;

/** Valores que se muestrean de un objeto: posición, rotación, escala y pesos de morph targets. */
interface Sampled {
  obj: Object3D;
  first: number[];
  /** Solo se crea cuando el objeto cambia (la mayoría de la escena no se mueve). */
  values: Float32Array | null;
  /**
   * Las matrices de las instancias de una `InstancedMesh` en cada instante (count × 16 por
   * instante), solo si cambian: los restos se mueven por sus matrices, no por su objeto (R11).
   */
  instFirst: Float32Array | null;
  inst: Float32Array | null;
}

function instanceMatrices(obj: Object3D): Float32Array | null {
  const inst = obj as InstancedMesh;
  if (!inst.isInstancedMesh || inst.count === 0) return null;
  return inst.instanceMatrix.array.slice(0, inst.count * 16) as Float32Array;
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
  const sampled: Sampled[] = objs.map((obj) => ({
    obj,
    first: read(obj),
    values: null,
    instFirst: instanceMatrices(obj),
    inst: null,
  }));
  const n = times.length;
  for (let k = 0; k < n; k++) {
    if (k > 0) graph.update(times[k]!);
    for (const s of sampled) {
      if (s.instFirst) {
        const m = instanceMatrices(s.obj)!;
        if (!s.inst && m.length === s.instFirst.length && m.some((x, i) => x !== s.instFirst![i])) {
          s.inst = new Float32Array(n * s.instFirst.length);
          for (let j = 0; j < k; j++) s.inst.set(s.instFirst, j * s.instFirst.length);
        }
        if (s.inst && m.length * n === s.inst.length) s.inst.set(m, k * m.length);
      }
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

/**
 * Una instancia en un instante: posición, rotación y escala. La matriz de una instancia oculta tiene
 * escala cero, y `Matrix4.decompose` la devolvería con escala 1 (un cubo de un metro donde no hay
 * nada): aquí sale con escala cero.
 */
function decomposeInstance(
  buf: Float32Array,
  offset: number,
): { p: Vector3; q: Quaternion; s: Vector3 } {
  const m = new Matrix4().fromArray(buf, offset);
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  if (Math.abs(m.determinant()) < 1e-15) {
    p.setFromMatrixPosition(m);
    return { p, q, s: s.set(0, 0, 0) };
  }
  m.decompose(p, q, s);
  return { p, q, s };
}

/**
 * Una `InstancedMesh` que se mueve (los restos) como un grupo de mallas, una por instancia, cada una
 * con su animación y su color: glTF no anima instancias. Las que no se mueven siguen como instancias.
 */
export function expandInstances(
  inst: InstancedMesh,
  matrices: Float32Array,
  rel: Float32Array,
): { group: Group; tracks: KeyframeTrack[]; materials: Material[] } {
  const n = rel.length;
  const stride = inst.count * 16;
  const group = new Group();
  group.name = inst.name;
  group.position.copy(inst.position);
  group.quaternion.copy(inst.quaternion);
  group.scale.copy(inst.scale);
  const base = Array.isArray(inst.material) ? inst.material[0]! : inst.material;
  const byColor = new Map<string, Material>();
  const tracks: KeyframeTrack[] = [];
  const c = new Color();
  for (let i = 0; i < inst.count; i++) {
    let mat = base;
    if (inst.instanceColor) {
      inst.getColorAt(i, c);
      const key = c.getHexString();
      mat = byColor.get(key) ?? base.clone();
      (mat as MeshStandardMaterial).color?.copy(c);
      byColor.set(key, mat);
    }
    const mesh = new Mesh(inst.geometry, mat);
    mesh.name = `${inst.name}_${i}`;
    const pos = new Float32Array(n * 3);
    const rot = new Float32Array(n * 4);
    const scl = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const { p, q, s } = decomposeInstance(matrices, k * stride + i * 16);
      p.toArray(pos, k * 3);
      q.toArray(rot, k * 4);
      s.toArray(scl, k * 3);
    }
    mesh.position.fromArray(pos, 0);
    mesh.quaternion.fromArray(rot, 0);
    mesh.scale.fromArray(scl, 0);
    tracks.push(
      new VectorKeyframeTrack(`${mesh.uuid}.position`, rel, pos),
      new QuaternionKeyframeTrack(`${mesh.uuid}.quaternion`, rel, rot),
      new VectorKeyframeTrack(`${mesh.uuid}.scale`, rel, scl),
    );
    group.add(mesh);
  }
  return { group, tracks, materials: [...byColor.values()] };
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
  // Colores por instancia (los restos): glTF no los lleva; la copia usa su color promedio.
  const averaged: Material[] = [];
  copy.traverse((o) => {
    const inst = o as InstancedMesh;
    if (!inst.isInstancedMesh || !inst.instanceColor || inst.count === 0) return;
    const mean = new Color(0, 0, 0);
    const c = new Color();
    for (let i = 0; i < inst.count; i++) mean.add(inst.getColorAt(i, c));
    mean.multiplyScalar(1 / inst.count);
    const m = (Array.isArray(inst.material) ? inst.material[0]! : inst.material).clone();
    (m as MeshStandardMaterial).color?.copy(mean);
    averaged.push(m);
    inst.material = m;
  });
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
  // Las instancias que se mueven (los restos) pasan a mallas animadas, una por instancia.
  sampled.forEach((s, i) => {
    const inst = copies[i] as InstancedMesh;
    if (!s.inst || !inst.parent) return;
    const e = expandInstances(inst, s.inst, rel);
    inst.parent.add(e.group);
    inst.visible = false;
    tracks.push(...e.tracks);
    averaged.push(...e.materials);
  });
  const { cams, tracks: camTracks } = cameraTracks(opts.cameras ?? [], times, rel);
  tracks.push(...camTracks);
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
    fps,
    ...(cams.length
      ? {
          camaras: cams.map((c) => ({ nombre: c.name, clave: c.userData.clave as string })),
          camara_principal: cams[0]!.name,
        }
      : {}),
    ...(opts.ambiente ? { ambiente: opts.ambiente } : {}),
    marco: "Y arriba; el solver usa X al este y Y al norte (glTF: x = este, z = −norte).",
  };
  scene.add(copy, ...cams);

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
    for (const m of averaged) m.dispose();
  }
}
