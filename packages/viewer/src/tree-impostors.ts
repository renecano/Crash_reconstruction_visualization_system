/**
 * Árboles impostores (T1.3b, ADR 0099): tarjetas cruzadas con el color, la normal y el alfa de un
 * modelo CC0 de Poly Haven horneados en Blender (`uv run croquis-assets trees build`,
 * `apps/web/public/arboles/`). Cada especie es una malla instanciada con tres tarjetas verticales
 * (a 0°, 60° y 120°) y una horizontal a la altura de la copa, recortadas por alfa (sin orden de
 * dibujo), con la normal horneada para que la luz las modele y un vaivén leve en las puntas.
 *
 * La palmera no tiene modelo CC0 en Poly Haven: va procedural (tronco inclinado y frondas con
 * foliolos recortados por alfa), también instanciada. Baja sigue con las copas de pocas caras.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Group,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Quaternion,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  abs,
  cameraPosition,
  color,
  dot,
  float,
  fract,
  hash,
  instanceIndex,
  length,
  mix,
  normalMap,
  normalize,
  normalWorld,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";

export const TREE_BASE_URL = "/arboles/";
export const TREE_SPECIES = ["jacaranda", "fresno", "pirul"] as const;
export type TreeSpecies = (typeof TREE_SPECIES)[number];
/** Las especies que reparte el planificador: las tres horneadas y la palmera procedural. */
export type PlannedSpecies = TreeSpecies | "palmera";

export interface TreeImpostor {
  especie: TreeSpecies;
  /** Altura con la que se dibuja si la escena no la da (m). */
  altoM: number;
  /** Ancho / alto del modelo horneado. */
  aspecto: number;
  /** Dónde arranca la copa, como fracción de la altura. */
  copaDesde: number;
  frente: { diff: Texture; nor: Texture };
  planta: { diff: Texture; nor: Texture };
  /** Los archivos de cada tarjeta (para rearmarlas fuera del navegador, R11). */
  archivos: Record<"frente_diff" | "frente_nor" | "planta_diff" | "planta_nor", string>;
  autores: string;
  url: string;
}

export type TreeImpostors = Partial<Record<TreeSpecies, TreeImpostor>>;

interface Manifest {
  especies: Record<
    string,
    {
      modelo: { polyhaven: string; autores: string; licencia: string; url: string };
      alto_m: number;
      medidas: { ancho_m: number; alto_m: number; profundidad_m: number; copa_desde_m: number };
      archivos: Record<string, { archivo: string; sha256: string; bytes: number; px: number }>;
    }
  >;
}

/** Carga el manifiesto y las ocho texturas (color y normal del frente y de la planta). */
export async function loadTreeImpostors(
  baseUrl = TREE_BASE_URL,
  fetchFn: typeof fetch = fetch,
  loader = new TextureLoader(),
): Promise<TreeImpostors> {
  const res = await fetchFn(`${baseUrl}arboles.json`);
  if (!res.ok) throw new Error(`No se pudo leer ${baseUrl}arboles.json (${res.status})`);
  const manifest = (await res.json()) as Manifest;
  const out: TreeImpostors = {};
  await Promise.all(
    TREE_SPECIES.map(async (especie) => {
      const e = manifest.especies[especie];
      if (!e) return;
      const load = async (key: string, srgb: boolean) => {
        const t = await loader.loadAsync(`${baseUrl}${e.archivos[key]!.archivo}`);
        if (srgb) t.colorSpace = SRGBColorSpace;
        t.anisotropy = 4;
        return t;
      };
      const [fd, fn, pd, pn] = await Promise.all([
        load("frente_diff", true),
        load("frente_nor", false),
        load("planta_diff", true),
        load("planta_nor", false),
      ]);
      out[especie] = {
        especie,
        altoM: e.alto_m,
        aspecto: e.medidas.ancho_m / e.medidas.alto_m,
        copaDesde: Math.min(0.6, Math.max(0.05, e.medidas.copa_desde_m / e.medidas.alto_m)),
        frente: { diff: fd, nor: fn },
        planta: { diff: pd, nor: pn },
        archivos: {
          frente_diff: e.archivos.frente_diff!.archivo,
          frente_nor: e.archivos.frente_nor!.archivo,
          planta_diff: e.archivos.planta_diff!.archivo,
          planta_nor: e.archivos.planta_nor!.archivo,
        },
        autores: e.modelo.autores,
        url: e.modelo.url,
      };
    }),
  );
  return out;
}

/** Un cuadrilátero de 1 × 1 con el pie en el origen, en el plano XY, con sus uv. */
function card(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3),
  );
  g.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
  );
  g.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Tres tarjetas verticales cruzadas (0°, 60°, 120°) de un árbol de altura 1 y ancho `aspecto`. */
export function crossedCards(aspecto: number): BufferGeometry {
  const parts = [0, 1, 2].map((k) => {
    const g = card();
    g.scale(aspecto, 1, 1);
    g.rotateY((k * Math.PI) / 3);
    return g;
  });
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** La tarjeta horizontal de la copa (vista desde arriba), centrada a la altura `copaY`. */
export function crownCard(aspecto: number, copaY: number): BufferGeometry {
  const g = card();
  g.translate(0, -0.5, 0);
  g.rotateX(-Math.PI / 2);
  g.scale(aspecto, 1, aspecto);
  g.translate(0, copaY, 0);
  return g;
}

export interface TreeInstance {
  /** Posición del pie en el marco de three.js. */
  x: number;
  y: number;
  z: number;
  /** Altura total (m) y giro (rad). */
  height: number;
  yaw: number;
}

/** Material de tarjeta: color y alfa horneados, normal en el espacio de la tarjeta y vaivén. */
function cardMaterial(
  maps: { diff: Texture; nor: Texture },
  opts: {
    night: boolean;
    sway: boolean;
    tint?: string;
    /** Los archivos de la tarjeta, para Blender (R11). */
    archivos?: { diff: string; nor: string; especie: string; tarjeta: "frente" | "planta" };
  },
): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    side: DoubleSide,
    alphaTest: 0.5,
    roughness: 0.92,
    metalness: 0,
  });
  // El glTF no lleva los nodos: la tarjeta viaja como dato y Blender la rearma (R11).
  if (opts.archivos) {
    m.userData.croquisArbol = { ...opts.archivos, tinte: opts.tint ?? null, noche: opts.night };
  }
  const diff = texture(maps.diff, uv());
  let rgb = diff.rgb;
  // Tono de la especie (la jacaranda, lila) sobre el follaje horneado.
  if (opts.tint) rgb = mix(rgb, color(opts.tint), 0.35);
  // De noche el follaje casi no refleja el cielo: se oscurece un poco para que no flote.
  if (opts.night) rgb = rgb.mul(vec3(0.75, 0.78, 0.8));
  // De lejos los mipmaps promedian el alfa y el recorte a 0.5 deshacía el árbol: el alfa sube
  // con la distancia para que la silueta se mantenga.
  const far = smoothstep(float(40), float(260), length(positionWorld.sub(cameraPosition)));
  // Una tarjeta vista de canto es una línea vertical (la «costura» de las tarjetas cruzadas,
  // T1.3c): su alfa se desvanece con el ángulo entre la normal y la vista.
  const view = normalize(cameraPosition.sub(positionWorld));
  const canto = smoothstep(float(0.08), float(0.38), abs(dot(normalize(normalWorld), view)));
  m.colorNode = vec4(rgb, diff.a.mul(mix(float(1), float(2.6), far)).mul(canto));
  m.normalNode = normalMap(texture(maps.nor, uv()), vec2(1, 1));
  if (opts.sway) {
    // Vaivén leve de las puntas (crece con la altura): cada árbol con su fase.
    const fase = hash(instanceIndex.add(3)).mul(6.28);
    const k = smoothstep(float(0.35), float(1), uv().y);
    const dx = sin(time.mul(0.9).add(fase)).mul(0.015).mul(k);
    m.positionNode = positionLocal.add(vec3(dx, 0, 0));
  }
  return m;
}

/**
 * Las instancias de una especie: una malla de tarjetas cruzadas y otra de copas horizontales.
 * `height` fija la escala; el ancho sale del aspecto del modelo horneado.
 */
export function buildTreeImpostors(
  tree: TreeImpostor,
  instances: readonly TreeInstance[],
  opts: { night: boolean },
): Group | null {
  if (instances.length === 0) return null;
  const g = new Group();
  g.name = `arboles_${tree.especie}`;
  const tint = tree.especie === "jacaranda" ? "#9b7fd4" : undefined;
  const vertical = new InstancedMesh(
    crossedCards(tree.aspecto),
    cardMaterial(tree.frente, {
      night: opts.night,
      sway: true,
      tint,
      archivos: {
        diff: tree.archivos.frente_diff,
        nor: tree.archivos.frente_nor,
        especie: tree.especie,
        tarjeta: "frente",
      },
    }),
    instances.length,
  );
  vertical.name = "tarjetas";
  const copaY = (tree.copaDesde + 1) / 2;
  const horizontal = new InstancedMesh(
    crownCard(tree.aspecto, copaY),
    cardMaterial(tree.planta, {
      night: opts.night,
      sway: false,
      tint,
      archivos: {
        diff: tree.archivos.planta_diff,
        nor: tree.archivos.planta_nor,
        especie: tree.especie,
        tarjeta: "planta",
      },
    }),
    instances.length,
  );
  horizontal.name = "copas";
  const m4 = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  instances.forEach((t, i) => {
    q.setFromAxisAngle(up, t.yaw);
    m4.compose(new Vector3(t.x, t.y, t.z), q, new Vector3(t.height, t.height, t.height));
    vertical.setMatrixAt(i, m4);
    horizontal.setMatrixAt(i, m4);
  });
  for (const im of [vertical, horizontal]) {
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = false;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}

/** Frondas por palmera y largo de cada una como fracción de la altura. */
export const PALM_FRONDS = 12;

let frondTex: Texture | null = null;

/**
 * Textura de una fronda (T1.3c): foliolos con bordes suaves, vena central y punta que se
 * estrecha, en un mapa con mipmaps. Antes el patrón se calculaba por pixel con `step` y el
 * recorte alfa lo volvía escalera de lejos (la palmera pixeleada).
 */
export function frondTexture(): Texture {
  if (frondTex) return frondTex;
  const W = 128;
  const H = 512;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H; // a lo largo de la fronda (0 pie, 1 punta)
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W - 0.5; // ancho, −0.5…0.5
      const half = 0.5 * (1 - 0.65 * v); // la fronda se estrecha hacia la punta
      const leaf = 0.5 + 0.5 * Math.sin(v * 30 * Math.PI * 2);
      const leaflet = Math.min(1, Math.max(0, (leaf - 0.25) / 0.2));
      const edge = Math.min(1, Math.max(0, (half - Math.abs(u)) / 0.04));
      // La fronda es sólida (el alfa solo recorta la silueta): los foliolos se sugieren con el
      // tono, no con huecos, que de lejos se veían como rayas (T1.3c).
      const a = edge;
      const sombra = 0.72 + 0.28 * leaflet;
      const g = (0.42 + 0.22 * v) * sombra;
      const i = 4 * (y * W + x);
      data[i] = Math.round(255 * (0.25 + 0.15 * v) * sombra);
      data[i + 1] = Math.round(255 * g);
      data[i + 2] = Math.round(255 * 0.17 * sombra);
      data[i + 3] = Math.round(255 * Math.min(1, a));
    }
  }
  const t = new DataTexture(data, W, H);
  t.colorSpace = SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  frondTex = t;
  return t;
}

/** Una fronda: plano estrecho de 4 segmentos que se curva hacia abajo, con el pie en el origen. */
function frond(): BufferGeometry {
  const seg = 6;
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const s = i / seg;
    // Se arquea: sube un poco y cae hacia la punta.
    const y = 0.12 * Math.sin(s * Math.PI) - 0.35 * s * s;
    const w = 0.14 * (1 - 0.55 * s);
    pos.push(-w, y, s, w, y, s);
    nor.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, s, 1, s);
    if (i < seg) {
      const a = 2 * i;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(idx);
  return g;
}

/** La corona de frondas de una palmera de altura 1, en abanico desde la punta del tronco. */
export function palmCrown(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < PALM_FRONDS; k++) {
    const f = frond();
    f.scale(1, 1, 0.42);
    f.rotateX(-0.25 - 0.12 * (k % 3));
    f.rotateY((k * 2 * Math.PI) / PALM_FRONDS + 0.2 * (k % 2));
    f.translate(0, 1, 0);
    parts.push(f);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** Palmeras procedurales instanciadas: tronco cónico un poco inclinado y corona de frondas. */
export function buildPalms(
  instances: readonly TreeInstance[],
  opts: { night: boolean },
): Group | null {
  if (instances.length === 0) return null;
  const g = new Group();
  g.name = "arboles_palmera";
  const trunkGeo = new CylinderGeometry(0.03, 0.05, 1, 8);
  trunkGeo.translate(0, 0.5, 0);
  const trunk = new MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  // Anillos del tronco (las bases de las hojas viejas).
  const ring = step(float(0.5), fract(uv().y.mul(28)));
  trunk.colorNode = mix(color("#6d5537"), color("#4f3d28"), ring);
  const trunks = new InstancedMesh(trunkGeo, trunk, instances.length);
  trunks.name = "troncos";
  const frondMat = new MeshStandardNodeMaterial({
    side: DoubleSide,
    alphaTest: 0.5,
    roughness: 0.85,
    metalness: 0,
  });
  // Foliolos desde la textura con mipmaps (T1.3c); el alfa sube de lejos como en los impostores.
  const fr = texture(frondTexture(), uv());
  const farP = smoothstep(float(30), float(200), length(positionWorld.sub(cameraPosition)));
  const verde = opts.night ? fr.rgb.mul(0.75) : fr.rgb;
  frondMat.colorNode = vec4(verde, fr.a.mul(mix(float(1), float(2.2), farP)));
  const crowns = new InstancedMesh(palmCrown(), frondMat, instances.length);
  crowns.name = "frondas";
  const m4 = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const lean = new Quaternion();
  instances.forEach((t, i) => {
    q.setFromAxisAngle(up, t.yaw);
    lean.setFromAxisAngle(new Vector3(1, 0, 0), 0.06);
    q.multiply(lean);
    m4.compose(new Vector3(t.x, t.y, t.z), q, new Vector3(t.height, t.height, t.height));
    trunks.setMatrixAt(i, m4);
    crowns.setMatrixAt(i, m4);
  });
  for (const im of [trunks, crowns]) {
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}
