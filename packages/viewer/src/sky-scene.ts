/**
 * El cielo en la escena (T1.1, ADR 0094): el domo procedural de noche y el HDRI prefiltrado que da
 * la luz de ambiente y los reflejos. `sky.ts` decide (funciones puras); aquí se construye con
 * three.js.
 */
import {
  BackSide,
  EquirectangularReflectionMapping,
  FloatType,
  Mesh,
  SphereGeometry,
  type DataTexture,
  type Texture,
} from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import {
  color,
  dot,
  float,
  floor,
  fract,
  max,
  mix,
  normalize,
  positionWorld,
  pow,
  sin,
  smoothstep,
  vec3,
} from "three/tsl";
import { MeshBasicNodeMaterial, PMREMGenerator, type WebGPURenderer } from "three/webgpu";
import {
  HDRI_BASE_URL,
  nightSkyColors,
  SKY_RADIANCE_CAP,
  type HdriManifest,
  type SkyHdri,
} from "./sky";

/** La luna de `environment.ts` (x este, y norte, z arriba) en el marco de three.js. */
const MOON_THREE = [-0.3, 0.86, -0.4] as const;

/**
 * Domo de noche: gradiente del horizonte al cenit, estrellas por hash de la dirección (fijas: la
 * captura en t = 0 siempre sale igual) y el resplandor de la luna. Se hornea en el mismo mapa
 * cúbico que el cielo de día, así que cuesta lo mismo que un color plano al dibujar.
 */
export function buildNightSkyMesh(streetLights: boolean): Mesh {
  const c = nightSkyColors(streetLights);
  const dir = normalize(positionWorld);
  const elev = dir.y;
  const base = mix(color(c.horizon), color(c.zenith), smoothstep(float(-0.02), float(0.5), elev));
  // Estrellas: una por celda de la dirección, con brillo por hash; se apagan junto al horizonte
  // (el aire) y con el alumbrado (el cielo urbano casi no las deja ver).
  const cell = floor(dir.mul(260));
  const h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  const stars = smoothstep(float(0.993), float(0.999), h)
    .mul(smoothstep(float(0.03), float(0.2), elev))
    .mul(streetLights ? 0.45 : 0.9);
  const moon = pow(max(dot(dir, vec3(...MOON_THREE)), float(0)), float(64)).mul(
    streetLights ? 0.18 : 0.3,
  );
  const m = new MeshBasicNodeMaterial({ side: BackSide, fog: false, depthWrite: false });
  m.colorNode = base.add(stars).add(moon);
  const mesh = new Mesh(new SphereGeometry(1, 48, 24), m);
  mesh.scale.setScalar(4000);
  mesh.name = "cielo_noche";
  return mesh;
}

const manifests = new Map<string, Promise<HdriManifest>>();
const equirects = new Map<string, Promise<LoadedHdri>>();

export interface LoadedHdri {
  texture: Texture;
  /** Radiancia media del cielo ya sin su sol, ponderada por el área real de cada fila. */
  meanLuminance: number;
}

/** El manifiesto de los HDRI (`hdri.json`), una sola vez por sesión. */
export function loadHdriManifest(
  baseUrl = HDRI_BASE_URL,
  fetchFn: typeof fetch = fetch,
): Promise<HdriManifest> {
  let p = manifests.get(baseUrl);
  if (!p) {
    p = fetchFn(`${baseUrl}hdri.json`).then((r) => {
      if (!r.ok) throw new Error(`hdri.json: ${r.status}`);
      return r.json() as Promise<HdriManifest>;
    });
    manifests.set(baseUrl, p);
  }
  return p;
}

/**
 * Quita el sol del HDRI (tope por canal, `SKY_RADIANCE_CAP`) y mide su radiancia media. El
 * promedio pondera cada fila por el coseno de su latitud: en el mapa equirectangular los polos
 * ocupan tantas columnas como el horizonte, pero casi nada de cielo.
 */
export function capAndMeasure(
  data: Float32Array,
  width: number,
  height: number,
  cap = SKY_RADIANCE_CAP,
): number {
  let sum = 0;
  let weight = 0;
  for (let y = 0; y < height; y++) {
    const w = Math.cos(((y + 0.5) / height - 0.5) * Math.PI);
    for (let x = 0; x < width; x++) {
      const i = 4 * (y * width + x);
      const r = Math.min(cap, data[i]!);
      const g = Math.min(cap, data[i + 1]!);
      const b = Math.min(cap, data[i + 2]!);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      sum += w * (0.2126 * r + 0.7152 * g + 0.0722 * b);
      weight += w;
    }
  }
  return weight > 0 ? sum / weight : 0;
}

/** El HDRI equirectangular (RGBE a flotante), sin su sol y medido; una sola vez por sesión. */
export function loadHdriTexture(name: SkyHdri, baseUrl = HDRI_BASE_URL): Promise<LoadedHdri> {
  const url = `${baseUrl}${name}.hdr`;
  let p = equirects.get(url);
  if (!p) {
    const loader = new HDRLoader();
    loader.setDataType(FloatType);
    p = loader.loadAsync(url).then((t: DataTexture) => {
      const img = t.image as { data: Float32Array; width: number; height: number };
      const meanLuminance = capAndMeasure(img.data, img.width, img.height);
      t.mapping = EquirectangularReflectionMapping;
      t.needsUpdate = true;
      return { texture: t, meanLuminance };
    });
    equirects.set(url, p);
  }
  return p;
}

export interface SkyEnvironment {
  /** Mapa prefiltrado para `scene.environment` y los reflejos. */
  texture: Texture;
  /** Radiancia media del HDRI sin su sol (para `environmentIntensityFor`). */
  meanLuminance: number;
  /** Azimut del sol del HDRI (del manifiesto), para girarlo hacia el sol calculado. */
  sunAzimuthDeg: number;
  dispose(): void;
}

/** Carga el HDRI pedido y lo prefiltra (PMREM) con el renderer ya inicializado. */
export async function buildSkyEnvironment(
  renderer: WebGPURenderer,
  name: SkyHdri,
  baseUrl = HDRI_BASE_URL,
): Promise<SkyEnvironment> {
  const [manifest, equirect] = await Promise.all([
    loadHdriManifest(baseUrl),
    loadHdriTexture(name, baseUrl),
  ]);
  const entry = manifest.hdri[name];
  if (!entry) throw new Error(`hdri.json no trae «${name}»`);
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(equirect.texture);
  pmrem.dispose();
  return {
    texture: target.texture,
    meanLuminance: equirect.meanLuminance,
    sunAzimuthDeg: entry.azimut_sol_deg,
    dispose() {
      target.dispose();
    },
  };
}
