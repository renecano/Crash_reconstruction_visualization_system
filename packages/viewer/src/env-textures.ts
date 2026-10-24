/**
 * Texturas PBR del entorno (F8e, ADR 0024): asfalto, concreto y pasto de Poly Haven (CC0), en
 * WebP de 512 px (`apps/web/public/texturas/`, pipeline en `assets/pipeline`).
 *
 * Las mallas de la vía no tienen coordenadas UV: la textura se proyecta en planta, con las
 * coordenadas del mundo (x, z) divididas entre el tamaño del mosaico del manifiesto. El normal
 * se aplica con `normalMap` de TSL, que sin tangentes las deriva en pantalla.
 *
 * La textura aporta detalle, no tono: se escala para que su promedio (calculado por el pipeline,
 * `media` en el manifiesto) sea el color y la rugosidad calibrados de cada material, así que seco
 * contra mojado, día contra noche y el resto de la calibración quedan igual que sin textura.
 *
 * Solo en alta y ultra (ADR 0026, decisión 7); en baja y media los materiales quedan de color liso.
 */
import {
  Color,
  LinearSRGBColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from "three";
import {
  float,
  mix,
  mx_noise_float,
  normalMap,
  positionWorld,
  smoothstep,
  texture,
  vec2,
  vec3,
} from "three/tsl";
import { MeshStandardNodeMaterial, type Node } from "three/webgpu";
import { QUALITY_PROFILES, type QualityLevel } from "./quality";

export const TEXTURE_BASE_URL = "/texturas/";
export const ENV_TEXTURE_NAMES = ["asfalto", "concreto", "pasto"] as const;
/** Texturas que solo se cargan si la escena las usa (la grava, con `grava_suelta`; ADR 0036). */
export const OPTIONAL_TEXTURE_NAMES = ["grava"] as const;
export type EnvTextureName =
  (typeof ENV_TEXTURE_NAMES)[number] | (typeof OPTIONAL_TEXTURE_NAMES)[number];

export interface EnvTexture {
  map: Texture;
  normal: Texture;
  rough: Texture;
  /** Lado del mosaico en el mundo (m). */
  tileM: number;
  /** Color medio del mapa de color, en RGB lineal. */
  meanRgb: readonly [number, number, number];
  /** Rugosidad media (0-1). */
  meanRough: number;
}
export type EnvTextures = Partial<Record<EnvTextureName, EnvTexture>>;

interface ManifestFile {
  archivo: string;
  media?: number | number[];
}
interface Manifest {
  texturas: Record<string, { mosaico_m: number; archivos: Record<string, ManifestFile> }>;
}

export function texturesWanted(quality: QualityLevel): boolean {
  return QUALITY_PROFILES[quality].envTextures;
}

function meanRgbOf(f: ManifestFile, name: string): [number, number, number] {
  const m = f.media;
  if (!Array.isArray(m) || m.length !== 3 || !m.every((c) => c > 0)) {
    throw new Error(`${name}: el manifiesto no trae el color medio`);
  }
  return [m[0]!, m[1]!, m[2]!];
}

function meanRoughOf(f: ManifestFile, name: string): number {
  if (typeof f.media !== "number" || !(f.media > 0)) {
    throw new Error(`${name}: el manifiesto no trae la rugosidad media`);
  }
  return f.media;
}

/** Carga el manifiesto y los tres mapas de cada textura pedida (por omisión, las de siempre). */
export async function loadEnvTextures(
  baseUrl = TEXTURE_BASE_URL,
  fetchFn: typeof fetch = fetch,
  loadFn: (url: string) => Promise<Texture> = (url) => new TextureLoader().loadAsync(url),
  names: readonly EnvTextureName[] = ENV_TEXTURE_NAMES,
): Promise<EnvTextures> {
  const res = await fetchFn(`${baseUrl}texturas.json`);
  if (!res.ok) throw new Error(`No se pudo leer ${baseUrl}texturas.json (${res.status})`);
  const manifest = (await res.json()) as Manifest;
  const out: EnvTextures = {};
  for (const name of names) {
    const entry = manifest.texturas[name];
    if (!entry) continue;
    const files = (["diff", "nor_gl", "rough"] as const).map((m) => {
      const file = entry.archivos[m];
      if (!file) throw new Error(`${name}: falta el mapa ${m}`);
      return file;
    });
    const meanRgb = meanRgbOf(files[0]!, name);
    const meanRough = meanRoughOf(files[2]!, name);
    const [map, normal, rough] = await Promise.all(
      files.map((f) => loadFn(`${baseUrl}${f.archivo}`)),
    );
    for (const t of [map!, normal!, rough!]) {
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
      t.anisotropy = 4;
    }
    map!.colorSpace = SRGBColorSpace;
    normal!.colorSpace = LinearSRGBColorSpace;
    rough!.colorSpace = LinearSRGBColorSpace;
    out[name] = {
      map: map!,
      normal: normal!,
      rough: rough!,
      tileM: entry.mosaico_m,
      meanRgb,
      meanRough,
    };
  }
  return out;
}

/** Coordenadas de textura en planta (mundo x, z) para un mosaico de `tileM` metros. */
export function planarUv(tileM: number) {
  return vec2(positionWorld.x, positionWorld.z).div(tileM);
}

/** Factor por canal que lleva el color medio de la textura al color calibrado `hex`. */
export function colorGain(t: EnvTexture, hex: string): [number, number, number] {
  const c = new Color(hex); // lineal, como `color()` de TSL
  return [c.r / t.meanRgb[0], c.g / t.meanRgb[1], c.b / t.meanRgb[2]];
}

/** Color de la textura con promedio igual a `hex`. */
export function normalizedColor(t: EnvTexture, hex: string): Node<"vec3"> {
  const [r, g, b] = colorGain(t, hex);
  return vec3(texture(t.map, planarUv(t.tileM)).rgb.mul(vec3(r, g, b)));
}

/** Rugosidad de la textura con promedio igual a `roughness`. */
export function normalizedRough(t: EnvTexture, roughness: number): Node<"float"> {
  return float(
    texture(t.rough, planarUv(t.tileM))
      .r.mul(float(roughness / t.meanRough))
      .clamp(0.02, 1),
  );
}

/** Relieve de la textura; `scale` < 1 lo suaviza (p. ej. con agua encima). */
export function texturedNormal(t: EnvTexture, scale = 1) {
  return normalMap(texture(t.normal, planarUv(t.tileM)), vec2(scale, scale));
}

/**
 * Material de concreto o pasto con textura en planta, con el color y la rugosidad calibrados del
 * material liso al que reemplaza. `variation` agrega un ruido de brillo de 23 m (±15 %) para que
 * no se note el mosaico en superficies grandes.
 */
export function texturedPlanarMaterial(
  t: EnvTexture,
  opts: { color: string; roughness: number; variation?: boolean },
): MeshStandardNodeMaterial {
  // `color` es el color plano que lleva la exportación glTF (R11); el dibujo usa colorNode.
  const m = new MeshStandardNodeMaterial({ metalness: 0, color: opts.color });
  const base = normalizedColor(t, opts.color);
  m.colorNode = opts.variation
    ? base.mul(
        mix(
          float(0.85),
          float(1.15),
          smoothstep(-0.3, 0.3, mx_noise_float(vec2(positionWorld.x, positionWorld.z).div(23))),
        ),
      )
    : base;
  m.roughnessNode = normalizedRough(t, opts.roughness);
  m.normalNode = texturedNormal(t);
  return m;
}
