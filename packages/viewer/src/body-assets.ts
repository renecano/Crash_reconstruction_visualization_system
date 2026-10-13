/**
 * Cuerpos de MakeHuman (CC0) para el visor: manifiesto, carga de los glTF, elección de variante por
 * edad, complexión por índice de masa corporal y material con ropa neutra por regiones.
 *
 * Los glTF salen de `uv run croquis-assets humans build` (ver `assets/ASSETS.md` y ADR 0008): altura
 * normalizada a 1, pies en y = 0, mirando a +z, esqueleto de 16 segmentos con rotaciones de reposo
 * nulas y dos _morph targets_ de complexión (`peso_min`, `peso_max`).
 */
import { abs, attribute, clamp, float, uniform, vec3 } from "three/tsl";
import { Color, type Group, type Object3D, SkinnedMesh, type Bone } from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { BoneSpec } from "./person-pose";

export type BodyVariant = "nino" | "adulto" | "mayor";

export interface BodyManifestEntry {
  variante: BodyVariant;
  edad_anios: number;
  archivo: string;
  sha256: string;
  bytes: number;
  altura_base_m: number;
  vertices: number;
  triangulos: number;
  huesos: BoneSpec[];
}

export interface BodyManifest {
  regiones: string[];
  morph_targets: string[];
  variantes: BodyManifestEntry[];
}

export interface BodyTemplate {
  entry: BodyManifestEntry;
  scene: Group;
}

export const BODY_BASE_URL = "/modelos/personas/";
export const CHILD_MAX_AGE = 14;
export const OLDER_MIN_AGE = 60;

/** Variante del cuerpo según la edad aproximada (sin dato: adultez). */
export function variantForAge(edad?: number): BodyVariant {
  if (edad === undefined || !Number.isFinite(edad)) return "adulto";
  if (edad < CHILD_MAX_AGE) return "nino";
  if (edad >= OLDER_MIN_AGE) return "mayor";
  return "adulto";
}

/**
 * Influencias de los _morph targets_ de complexión a partir del IMC. Adultos: 18.5 → delgado,
 * 25 → promedio, 35 → robusto (cortes de la OMS); niñez: 13 → 16.5 → 22 (aproximación).
 * Sin masa declarada, complexión promedio.
 */
export function complexionInfluences(
  massKg: number | undefined,
  stature: number,
  variant: BodyVariant,
): [number, number] {
  if (massKg === undefined || !(massKg > 0) || !(stature > 0)) return [0, 0];
  const bmi = massKg / (stature * stature);
  const [lo, mid, hi] = variant === "nino" ? [13, 16.5, 22] : [18.5, 25, 35];
  const w =
    bmi <= mid
      ? 0.5 * Math.max(0, (bmi - lo) / (mid - lo))
      : 0.5 + 0.5 * Math.min(1, (bmi - mid) / (hi - mid));
  return w < 0.5 ? [1 - 2 * w, 0] : [0, 2 * w - 1];
}

/** Masa para la física cuando el relato no la da: 75 kg (como el solver); niñez por IMC 16.5. */
export function defaultMass(variant: BodyVariant, stature: number): number {
  return variant === "nino" ? 16.5 * stature * stature : 75;
}

function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x1_0000_0000;
}

const SKIN = ["#f1c9a5", "#e0ac83", "#c68e63", "#a26b45", "#7c4f32", "#5a3826"];
const SHIRT = ["#5c6f86", "#7a8b6f", "#8a6f5c", "#6b6f78", "#8c8f94", "#4f6a74", "#9a8467"];
const PANTS = ["#2f3742", "#3b3f45", "#4a4f57", "#55503f", "#2b2e33"];
const HAIR = ["#241c17", "#3a2a1f", "#1a1716", "#4a3628"];
const HAIR_OLD = ["#b9b7b2", "#d6d3cc", "#8f8c86"];

export interface BodyPalette {
  piel: string;
  camisa: string;
  pantalon: string;
  zapatos: string;
  cabello: string;
  ojos: string;
}

/** Colores neutros, deterministas por persona (sin relación con datos personales). */
export function paletteFor(id: string, variant: BodyVariant): BodyPalette {
  const pick = (list: readonly string[], salt: string): string =>
    list[Math.floor(hash01(`${id}:${salt}`) * list.length)] ?? list[0]!;
  return {
    piel: pick(SKIN, "piel"),
    camisa: pick(SHIRT, "camisa"),
    pantalon: pick(PANTS, "pantalon"),
    zapatos: "#2a2622",
    cabello: variant === "mayor" ? pick(HAIR_OLD, "cabello") : pick(HAIR, "cabello"),
    ojos: "#1b1d20",
  };
}

/** Material con colores por región (atributo `_region` del glTF). */
export function bodyMaterial(p: BodyPalette): MeshStandardNodeMaterial {
  const r = attribute("_region", "float");
  const w = (k: number) => float(1).sub(clamp(abs(r.sub(k)).mul(2), 0, 1));
  const col = (hex: string) => {
    const c = new Color(hex);
    return uniform(vec3(c.r, c.g, c.b));
  };
  const m = new MeshStandardNodeMaterial();
  m.colorNode = col(p.piel)
    .mul(w(0))
    .add(col(p.camisa).mul(w(1)))
    .add(col(p.pantalon).mul(w(2)))
    .add(col(p.zapatos).mul(w(3)))
    .add(col(p.cabello).mul(w(4)))
    .add(col(p.ojos).mul(w(5)));
  m.roughnessNode = float(0.55)
    .mul(w(0))
    .add(float(0.88).mul(w(1).add(w(2))))
    .add(float(0.6).mul(w(3)))
    .add(float(0.75).mul(w(4)))
    .add(float(0.25).mul(w(5)));
  m.metalnessNode = float(0);
  return m;
}

/** Interpreta un glTF de cuerpo (ArrayBuffer) y devuelve su escena. */
export async function parseBody(data: ArrayBuffer): Promise<Group> {
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(data, "");
  return gltf.scene;
}

/** Carga el manifiesto y las variantes pedidas (cada archivo pesa < 1 MB). */
export async function loadBodies(
  variants: readonly BodyVariant[],
  baseUrl = BODY_BASE_URL,
  fetchFn: typeof fetch = fetch,
): Promise<Map<BodyVariant, BodyTemplate>> {
  const res = await fetchFn(`${baseUrl}personas.json`);
  if (!res.ok) throw new Error(`No se pudo cargar el manifiesto de cuerpos (${res.status})`);
  const manifest = (await res.json()) as BodyManifest;
  const out = new Map<BodyVariant, BodyTemplate>();
  await Promise.all(
    [...new Set(variants)].map(async (v) => {
      const entry = manifest.variantes.find((e) => e.variante === v);
      if (!entry) throw new Error(`Variante de cuerpo desconocida: ${v}`);
      const r = await fetchFn(`${baseUrl}${entry.archivo}`);
      if (!r.ok) throw new Error(`No se pudo cargar ${entry.archivo} (${r.status})`);
      out.set(v, { entry, scene: await parseBody(await r.arrayBuffer()) });
    }),
  );
  return out;
}

export interface BodyInstance {
  root: Object3D;
  mesh: SkinnedMesh;
  bones: Map<string, Bone>;
  material: MeshStandardNodeMaterial;
}

/** Clona una plantilla con su propio esqueleto, material y complexión. */
export function instantiateBody(
  template: BodyTemplate,
  palette: BodyPalette,
  influences: [number, number],
): BodyInstance {
  const root = cloneSkinned(template.scene);
  let mesh: SkinnedMesh | undefined;
  const bones = new Map<string, Bone>();
  root.traverse((o) => {
    if (o instanceof SkinnedMesh) mesh = o;
    if ((o as Bone).isBone) bones.set(o.name, o as Bone);
  });
  if (!mesh) throw new Error("El cuerpo no trae una malla con piel");
  const material = bodyMaterial(palette);
  mesh.material = material;
  mesh.castShadow = true;
  mesh.frustumCulled = false; // los huesos se mueven fuera de la caja de reposo
  if (mesh.morphTargetInfluences) {
    mesh.morphTargetInfluences[0] = influences[0];
    mesh.morphTargetInfluences[1] = influences[1];
  }
  return { root, mesh, bones, material };
}
