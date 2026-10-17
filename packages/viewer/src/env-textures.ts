/**
 * Texturas PBR del entorno (F8e, ADR 0024): asfalto, concreto y pasto de Poly Haven (CC0), en
 * WebP de 512 px (`apps/web/public/texturas/`, pipeline en `assets/pipeline`).
 *
 * Las mallas de la vía no tienen coordenadas UV: la textura se proyecta en planta, con las
 * coordenadas del mundo (x, z) divididas entre el tamaño del mosaico del manifiesto.
 *
 * La textura aporta detalle, no tono: se escala para que su promedio (calculado por el pipeline,
 * `media` en el manifiesto) sea el color y la rugosidad calibrados de cada material, así que seco
 * contra mojado, día contra noche y el resto de la calibración quedan igual que sin textura.
 *
 * Costo (E6): el suelo cubre casi toda la pantalla y se ve rasante. Donde un píxel ya cubre muchos
 * texeles, la textura filtrada se ve como su promedio, que es justo el color calibrado: ahí no se
 * lee (corte por nivel de mip, con transición suave). La normal se arma con el marco tangente
 * conocido de una superficie horizontal con UV en planta (T = +X, B = +Z, N = +Y), sin derivadas,
 * para poder leerla dentro de la rama.
 *
 * En calidad baja no se cargan (los materiales quedan de color liso).
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
  cameraViewMatrix,
  dFdx,
  dFdy,
  dot,
  float,
  Fn,
  If,
  log2,
  max,
  mix,
  mx_noise_float,
  normalize,
  positionWorld,
  smoothstep,
  texture,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { MeshStandardNodeMaterial, type Node } from "three/webgpu";
import type { QualityLevel } from "./quality";

export const TEXTURE_BASE_URL = "/texturas/";
export const ENV_TEXTURE_NAMES = ["asfalto", "concreto", "pasto"] as const;
export type EnvTextureName = (typeof ENV_TEXTURE_NAMES)[number];

/**
 * Corte por nivel de mip (log2 de texeles por píxel, eje mayor): desde `LOD_NEAR` la textura se
 * funde con su promedio y desde `LOD_FAR` ya no se lee. Con 512 px, 6 equivale a ver el mosaico
 * entero en 8×8 texeles. La diferencia visible la mide `eval/e6_corte_texturas.mjs`.
 */
export const LOD_NEAR = 4.5;
export const LOD_FAR = 6;

export interface EnvTexture {
  map: Texture;
  normal: Texture;
  rough: Texture;
  /** Lado del mosaico en el mundo (m). */
  tileM: number;
  /** Lado de los mapas en texeles. */
  sizePx: number;
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
  tamano_px: number;
  texturas: Record<string, { mosaico_m: number; archivos: Record<string, ManifestFile> }>;
}

export function texturesWanted(quality: QualityLevel): boolean {
  return quality !== "baja";
}

/** Sin corte por mip (solo para medir su efecto: `window.__croquisDiag.texturasSinCorte`). */
function lodCutDisabled(): boolean {
  const g = globalThis as { __croquisDiag?: { texturasSinCorte?: boolean } };
  return g.__croquisDiag?.texturasSinCorte === true;
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

/** Carga el manifiesto y los tres mapas de cada textura. */
export async function loadEnvTextures(
  baseUrl = TEXTURE_BASE_URL,
  fetchFn: typeof fetch = fetch,
  loadFn: (url: string) => Promise<Texture> = (url) => new TextureLoader().loadAsync(url),
): Promise<EnvTextures> {
  const res = await fetchFn(`${baseUrl}texturas.json`);
  if (!res.ok) throw new Error(`No se pudo leer ${baseUrl}texturas.json (${res.status})`);
  const manifest = (await res.json()) as Manifest;
  if (!(manifest.tamano_px > 0)) throw new Error("El manifiesto no trae el tamaño de los mapas");
  const out: EnvTextures = {};
  for (const name of ENV_TEXTURE_NAMES) {
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
      sizePx: manifest.tamano_px,
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

/**
 * Muestreo en planta compartido por los tres mapas de un material: UV, sus derivadas (calculadas
 * fuera de la rama, para leer con gradiente explícito dentro), el nivel de mip y el peso del
 * promedio.
 */
export interface PlanarSample {
  uv: ReturnType<typeof planarUv>;
  dx: Node<"vec2">;
  dy: Node<"vec2">;
  /** Se lee la textura (nivel de mip por debajo del corte). */
  near: Node<"bool">;
  /** Peso del promedio: 0 cerca, 1 en el corte. */
  w: Node<"float">;
}

export function planarSample(t: EnvTexture): PlanarSample {
  const uv = planarUv(t.tileM);
  const dx = dFdx(uv);
  const dy = dFdy(uv);
  // log2 del lado mayor de la huella del píxel, en texeles.
  const lod = log2(max(dot(dx, dx), dot(dy, dy)))
    .mul(0.5)
    .add(Math.log2(t.sizePx));
  const off = lodCutDisabled();
  return {
    uv,
    dx,
    dy,
    near: off ? float(1).greaterThan(0) : lod.lessThan(LOD_FAR),
    w: off ? float(0) : smoothstep(LOD_NEAR, LOD_FAR, lod),
  };
}

/** Factor por canal que lleva el color medio de la textura al color calibrado `hex`. */
export function colorGain(t: EnvTexture, hex: string): [number, number, number] {
  const c = new Color(hex); // lineal, como `color()` de TSL
  return [c.r / t.meanRgb[0], c.g / t.meanRgb[1], c.b / t.meanRgb[2]];
}

/** Color de la textura con promedio igual a `hex` (lejos, el promedio mismo). */
export function normalizedColor(
  t: EnvTexture,
  hex: string,
  s: PlanarSample = planarSample(t),
): Node<"vec3"> {
  const [r, g, b] = colorGain(t, hex);
  const c = new Color(hex);
  return Fn(() => {
    const out = vec3(c.r, c.g, c.b).toVar();
    If(s.near, () => {
      const tex = texture(t.map, s.uv)
        .grad(s.dx, s.dy)
        .rgb.mul(vec3(r, g, b));
      out.assign(mix(tex, out, s.w));
    });
    return out;
  })();
}

/** Rugosidad de la textura con promedio igual a `roughness` (lejos, el promedio mismo). */
export function normalizedRough(
  t: EnvTexture,
  roughness: number,
  s: PlanarSample = planarSample(t),
): Node<"float"> {
  return Fn(() => {
    const out = float(roughness).toVar();
    If(s.near, () => {
      const tex = texture(t.rough, s.uv)
        .grad(s.dx, s.dy)
        .r.mul(roughness / t.meanRough)
        .clamp(0.02, 1);
      out.assign(mix(tex, out, s.w));
    });
    return out;
  })();
}

/**
 * Normal en vista de una superficie horizontal con el relieve de la textura. `scale` < 1 lo
 * suaviza (p. ej. con agua encima); lejos, el relieve se funde con la normal plana.
 */
export function texturedNormal(t: EnvTexture, scale = 1, s: PlanarSample = planarSample(t)) {
  return Fn(() => {
    const world = vec3(0, 1, 0).toVar();
    If(s.near, () => {
      const n = texture(t.normal, s.uv).grad(s.dx, s.dy).xyz.mul(2).sub(1);
      const k = float(scale).mul(float(1).sub(s.w));
      // Tangente = dP/du = +X, bitangente = dP/dv = +Z, normal = +Y.
      world.assign(normalize(vec3(n.x.mul(k), n.z, n.y.mul(k))));
    });
    return normalize(cameraViewMatrix.mul(vec4(world, 0)).xyz);
  })();
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
  const m = new MeshStandardNodeMaterial({ metalness: 0 });
  const s = planarSample(t);
  const base = normalizedColor(t, opts.color, s);
  m.colorNode = opts.variation
    ? base.mul(
        mix(
          float(0.85),
          float(1.15),
          smoothstep(-0.3, 0.3, mx_noise_float(vec2(positionWorld.x, positionWorld.z).div(23))),
        ),
      )
    : base;
  m.roughnessNode = normalizedRough(t, opts.roughness, s);
  m.normalNode = texturedNormal(t, 1, s);
  return m;
}
