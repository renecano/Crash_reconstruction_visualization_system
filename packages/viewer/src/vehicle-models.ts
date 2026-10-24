/**
 * Vehículos realistas de Sketchfab (R10, ADR 0086): un modelo por clase, para calidad alta y ultra
 * (versión completa) y media (versión ligera). Baja usa el vehículo paramétrico.
 *
 * Los modelos salen de `uv run croquis-assets vehicles build` (ver `assets/ASSETS.md`) con la misma
 * estructura que el vehículo paramétrico (`vehicle-geometry.ts`): piezas con `userData.role`,
 * nombres que usa el visor (`windshield`, `headlight_l`/`headlight_r`, `bumper_front`/`bumper_rear`),
 * ruedas `wheel_*` con su radio, frente hacia +x, izquierda hacia −z y llantas sobre el piso. Así el
 * color del caso, las luces de noche, el daño en la zona narrada, los restos y las bolsas de aire
 * funcionan igual que con el paramétrico.
 *
 * Cada modelo se ajusta a las dimensiones del caso (largo, ancho y alto del contrato): la carrocería
 * se escala en cada eje y las ruedas, igual en todos (siguen redondas), con la escala del alto.
 */
import {
  Box3,
  BufferAttribute,
  type BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  type Object3D,
  REVISION,
  type WebGLRenderer,
  Vector3,
} from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { TessellateModifier } from "three/addons/modifiers/TessellateModifier.js";
import type { QualityLevel } from "./quality";
import { buildVehicle, type VehicleDimensions } from "./vehicle-geometry";

export const VEHICLE_MODEL_BASE_URL = "/modelos/vehiculos/";
/** Draco y Basis, copiados de three en cada build (`apps/web/scripts/decodificadores.mjs`). */
export const DECODERS_BASE_URL = `/decodificadores/r${REVISION}/`;

export type ModelClass = "sedan" | "hatchback" | "suv" | "pickup" | "camion" | "moto";
export type ModelVariant = "alta" | "ligero";

/** La clase del visor que dibuja cada modelo; las demás (van, autobús…) siguen paramétricas. */
export const MODEL_FOR_CLASS: Readonly<Record<string, ModelClass>> = {
  sedan_compacto: "sedan",
  sedan_mediano: "sedan",
  hatchback: "hatchback",
  suv_compacta: "suv",
  suv_grande: "suv",
  pickup: "pickup",
  camion_unitario: "camion",
  motocicleta: "moto",
};

/** La versión del modelo para cada calidad (§7.8): completa en alta y ultra, ligera en media. */
export function modelVariantFor(quality: QualityLevel): ModelVariant | null {
  if (quality === "alta" || quality === "ultra") return "alta";
  if (quality === "media") return "ligero";
  return null;
}

export interface VehicleModelFile {
  archivo: string;
  sha256: string;
  bytes: number;
}

export interface VehicleModelEntry {
  modelo: { nombre: string; autor: string; usuario: string; licencia: string; url: string };
  archivos: Record<ModelVariant | "blender", VehicleModelFile>;
  largo_m: number;
  ancho_m: number;
  alto_m: number;
  caras: number;
  ruedas: { nombre: string; centro: [number, number, number]; radio: number }[];
  quitados: string[];
}

export interface VehicleModelManifest {
  clases: Record<ModelClass, VehicleModelEntry>;
}

export interface VehicleModelTemplate {
  clase: ModelClass;
  entry: VehicleModelEntry;
  scene: Object3D;
}

/** Atribución de un modelo (CC-BY): se muestra en el 3D, el dictamen y el video (ADR 0086). */
export interface VehicleCredit {
  modelo: string;
  autor: string;
  licencia: string;
  url: string;
}

/** Los créditos de los modelos de una escena, sin repetir. */
export function creditsOf(templates: readonly VehicleModelTemplate[]): VehicleCredit[] {
  const out = new Map<string, VehicleCredit>();
  for (const { entry } of templates) {
    const m = entry.modelo;
    out.set(m.url, { modelo: m.nombre, autor: m.autor, licencia: m.licencia, url: m.url });
  }
  return [...out.values()];
}

/** Los créditos en una línea: «Kiri '10» de Daniel Zhabotinsky (CC-BY 4.0); … */
export function creditLine(credits: readonly VehicleCredit[], de = "de"): string {
  return credits.map((c) => `«${c.modelo}» ${de} ${c.autor} (${c.licencia})`).join("; ");
}

/** Los modelos que pide una escena: uno por cada clase del visor que tiene modelo. */
export function modelClassesFor(clases: readonly string[]): ModelClass[] {
  return [...new Set(clases.map((c) => MODEL_FOR_CLASS[c]).filter((c) => c !== undefined))];
}

/**
 * Carga los modelos de las clases pedidas. Las texturas KTX2 necesitan al renderizador (qué
 * formatos comprimidos admite la tarjeta de video).
 */
export async function loadVehicleModels(
  clases: readonly ModelClass[],
  variant: ModelVariant,
  renderer: WebGLRenderer | { isWebGPURenderer: true },
  opts: { baseUrl?: string; decodersUrl?: string; fetchFn?: typeof fetch } = {},
): Promise<Map<ModelClass, VehicleModelTemplate>> {
  const baseUrl = opts.baseUrl ?? VEHICLE_MODEL_BASE_URL;
  const decoders = opts.decodersUrl ?? DECODERS_BASE_URL;
  const fetchFn = opts.fetchFn ?? fetch;
  const out = new Map<ModelClass, VehicleModelTemplate>();
  if (clases.length === 0) return out;
  const res = await fetchFn(`${baseUrl}vehiculos.json`);
  if (!res.ok) throw new Error(`No se pudo cargar el manifiesto de vehículos (${res.status})`);
  const manifest = (await res.json()) as VehicleModelManifest;
  const draco = new DRACOLoader().setDecoderPath(`${decoders}draco/`);
  const ktx2 = new KTX2Loader().setTranscoderPath(`${decoders}basis/`);
  ktx2.detectSupport(renderer as WebGLRenderer);
  const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2);
  try {
    await Promise.all(
      clases.map(async (clase) => {
        const entry = manifest.clases[clase];
        if (!entry) return;
        const gltf = await loader.loadAsync(`${baseUrl}${entry.archivos[variant].archivo}`);
        out.set(clase, { clase, entry, scene: gltf.scene });
      }),
    );
  } finally {
    draco.dispose();
    ktx2.dispose();
  }
  return out;
}

const tmpBox = new Box3();
const tmpCenter = new Vector3();

/** Una pieza como hija directa del vehículo, escalada y con su pivote en el centro de su caja. */
function placePart(source: Mesh, toVehicle: Matrix4): Mesh {
  const geo = source.geometry.clone();
  geo.applyMatrix4(toVehicle);
  geo.computeBoundingBox();
  geo.boundingBox!.getCenter(tmpCenter);
  geo.translate(-tmpCenter.x, -tmpCenter.y, -tmpCenter.z);
  const mesh = new Mesh(geo, source.material);
  mesh.name = source.name;
  mesh.userData = { ...source.userData, modelo: true };
  // El pivote en el centro: el daño ubica faros y piezas por su posición, como en el paramétrico.
  mesh.position.copy(tmpCenter);
  mesh.castShadow = true;
  mesh.receiveShadow = source.userData.role === "pintura";
  return mesh;
}

/**
 * El vehículo de un caso con su modelo: hijas directas con su papel, ruedas `wheel_*` con su radio
 * y las cotas del habitáculo del paramétrico (bolsas de aire y vidrios laterales).
 */
export function buildModelVehicle(
  template: VehicleModelTemplate,
  clase: string,
  dims: VehicleDimensions,
): Group {
  const { entry, scene } = template;
  const sx = dims.length / entry.largo_m;
  const sy = dims.height / entry.alto_m;
  const sz = dims.width / entry.ancho_m;
  const body = new Matrix4().makeScale(sx, sy, sz);
  const g = new Group();
  g.name = `vehiculo_${clase}`;
  g.userData.clase = clase;
  g.userData.dims = dims;
  g.userData.modelo = template.clase;
  scene.updateMatrixWorld(true);
  const wheels = new Set<Object3D>();
  scene.traverse((o) => {
    if (o.name.startsWith("wheel_") && typeof o.userData.radius === "number") wheels.add(o);
  });
  const inWheel = (o: Object3D): boolean => {
    for (let p: Object3D | null = o; p; p = p.parent) if (wheels.has(p)) return true;
    return false;
  };
  scene.traverse((o) => {
    if (!(o as Mesh).isMesh || inWheel(o)) return;
    const m = o as Mesh;
    g.add(placePart(m, body.clone().multiply(m.matrixWorld)));
  });
  // Las ruedas no se deforman: escala igual en los tres ejes para que sigan redondas.
  for (const w of wheels) {
    const r = (w.userData.radius as number) * sy;
    const wheel = new Group();
    wheel.name = w.name;
    wheel.userData.radius = r;
    const c = new Vector3().setFromMatrixPosition(w.matrixWorld);
    wheel.position.set(c.x * sx, r, c.z * sz);
    const toWheel = new Matrix4().makeScale(sy, sy, sy).multiply(w.matrixWorld.clone().invert());
    w.traverse((o) => {
      if (!(o as Mesh).isMesh) return;
      const m = o as Mesh;
      const geo = m.geometry.clone();
      geo.applyMatrix4(toWheel.clone().multiply(m.matrixWorld));
      const part = new Mesh(geo, m.material);
      part.name = m.name;
      part.userData = { ...m.userData, role: "rueda", modelo: true };
      part.castShadow = true;
      wheel.add(part);
    });
    g.add(wheel);
  }
  // Las cotas del habitáculo (bolsas de aire, vidrios laterales) son las del paramétrico.
  const parametric = buildVehicle(clase, dims, { fuse: false });
  g.userData.layout = parametric.userData.layout as unknown;
  parametric.traverse((o) => (o as Mesh).geometry?.dispose());
  return g;
}

/**
 * Lado máximo de las aristas de un modelo antes de hornear el daño (m). Las piezas de Sketchfab
 * tienen paneles grandes con pocos vértices; el paramétrico se segmenta cada ~8 cm (F4).
 */
export const DAMAGE_EDGE_M = 0.1;

/**
 * Subdivide la carrocería y las defensas de un modelo para que la deformación del daño se vea suave
 * (solo en vehículos con daño). Conserva normales y coordenadas de textura.
 */
export function tessellateForDamage(group: Group): void {
  for (const child of group.children) {
    const m = child as Mesh;
    if (!m.isMesh || !m.userData.modelo) continue;
    if (m.userData.role !== "pintura" && !/bumper/i.test(m.name)) continue;
    const before = m.geometry;
    m.geometry = new TessellateModifier(DAMAGE_EDGE_M, 6).modify(before);
    before.dispose();
  }
}

/**
 * Coordenadas planas sobre el parabrisas de un modelo (de lado a lado y de abajo arriba, 0–1): la
 * grieta se dibuja sobre `uv`, y las del modelo apuntan a su atlas de texturas.
 */
export function windshieldUv(geo: BufferGeometry): void {
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  const pos = geo.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  const dz = Math.max(1e-6, b.max.z - b.min.z);
  const dy = Math.max(1e-6, b.max.y - b.min.y);
  for (let i = 0; i < pos.count; i++) {
    uv[2 * i] = (pos.getZ(i) - b.min.z) / dz;
    uv[2 * i + 1] = (pos.getY(i) - b.min.y) / dy;
  }
  geo.setAttribute("uv", new BufferAttribute(uv, 2));
}

/** El tamaño de una malla en su marco (caja de su geometría): para restos y vidrio agrietado. */
export function meshSize(m: Mesh): Vector3 {
  const geo = m.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  return tmpBox.copy(geo.boundingBox!).getSize(new Vector3());
}
