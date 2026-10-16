/**
 * Grafo de escena del visor, independiente de React y del renderer.
 *
 * `buildSceneGraph(spec, resultado)` arma los objetos de three.js (vía, entorno, objetos,
 * dispositivos, evidencias declaradas, vehículos y personas) y devuelve `update(t)`, que coloca
 * todo en el instante t leyendo el resultado del solver. No calcula física: solo interpola lo que
 * el solver entregó. Al no depender del renderer se prueba en Node (posiciones, giros, fases) y
 * funciona igual con WebGPU o con el respaldo WebGL 2.
 */
import { roadLayout, sceneLayout } from "@croquis/croquis-2d";
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import { longitudM, velocidadKmh } from "@croquis/scene-schema";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Object3D,
  RingGeometry,
  SpotLight,
  type Texture,
  Vector3,
} from "three";
import { attribute, color, float, mix } from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { toThree } from "./coords";
import type { EnvironmentSettings } from "./environment";
import { applyPosture, buildMannequin, CG_HEIGHT_FACTOR } from "./person-geometry";
import type { QualityProfile } from "./quality";
import { buildDamageRig, type DamageRig } from "./damage-rig";
import {
  computeGroundMarks,
  puddleRadius,
  visibleCount,
  type GroundMarks,
  type TimedQuad,
} from "./ground-marks";
import {
  buildMapRoadGeometry,
  buildRoadGeometry,
  CURB_HEIGHT,
  dashPatternFor,
  markingsFor,
  type Mesh2D,
} from "./road-geometry";
import { asphaltMaterial, type AsphaltMaterial } from "./road-surface";
import { texturedPlanarMaterial, type EnvTextures } from "./env-textures";
import { buildDevice, type DeviceNode } from "./traffic-devices";
import {
  HEADLIGHT_HALF_ANGLE_DEG,
  HEADLIGHT_INTENSITY,
  HEADLIGHT_RANGE_M,
  headlightsOn,
  planNightLights,
  STREETLIGHT_HALF_ANGLE_DEG,
  STREETLIGHT_INTENSITY,
  STREETLIGHT_RANGE_M,
} from "./night-lights";
import { rollsOver } from "./rollover-scene";
import { sunShadowFrame, triangleInShadow, type SunShadowFrame } from "./shadow-frame";
import { phaseAt, samplePerson, sampleVehicle, bracket } from "./sample";
import {
  buildVehicle,
  profileFor,
  seatHeight,
  wheelNames,
  type PartRole,
} from "./vehicle-geometry";

export interface SceneGraphOptions {
  quality: QualityProfile;
  env: Pick<EnvironmentSettings, "night" | "wet" | "groundColor" | "streetLights"> &
    Partial<Pick<EnvironmentSettings, "lightDirection" | "surface">>;
}

export interface VehicleNode {
  id: string;
  group: Group;
  wheels: { obj: Group; radius: number }[];
  /** Distancia acumulada recorrida (m) en cada muestra de la trayectoria. */
  distance: number[];
  track: Resultado["vehiculos"][number]["trayectoria"];
  /** Daño animado (deformación, materiales, faros, parabrisas, llantas, bolsas de aire). */
  rig: DamageRig;
}

export interface PersonNode {
  id: string;
  group: Group;
  mode: "trayectoria" | "a_bordo_visible" | "a_bordo_oculto" | "sin_datos";
  vehicleId?: string;
  seat?: number;
}

export interface SceneGraph {
  root: Group;
  vehicles: VehicleNode[];
  persons: PersonNode[];
  /** Coloca la escena en el instante t (s, relativo al impacto). */
  update(t: number): void;
  /**
   * Registra una actualización adicional (p. ej. restos horneados que llegan después). Con
   * `after`, corre después de colocar los vehículos (p. ej. la volcadura que los sobrescribe).
   */
  addUpdater(fn: (t: number) => void, opts?: { after?: boolean }): void;
  /** Último instante aplicado. */
  readonly time: number;
  /** Mapa de entorno (cielo horneado) para que el piso mojado lo refleje; null lo quita. */
  setReflections(env: Texture | null): void;
  /** Texturas PBR del entorno (F8e): asfalto, concreto de banquetas y camellón, y pasto. */
  applyTextures(t: EnvTextures): void;
  dispose(): void;
  stats: { meshes: number; triangles: number };
}

// ---------------------------------------------------------------------------------------------
// Materiales (compartidos por rol)
// ---------------------------------------------------------------------------------------------

function std(
  color: string,
  roughness: number,
  metalness = 0,
  extra: Partial<MeshStandardMaterial> = {},
): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, roughness, metalness });
  Object.assign(m, extra);
  return m;
}

function sceneMaterials(opts: SceneGraphOptions, asphalt: AsphaltMaterial) {
  const wet = opts.env.wet;
  return {
    asphalt: asphalt.material,
    // La banqueta mojada se oscurece un poco y pierde rugosidad, sin llegar a reflejar.
    sidewalk: std(wet ? "#85837d" : "#a19f99", wet ? 0.6 : 0.95),
    white: std("#ecebe4", 0.6),
    yellow: std("#e3b21c", 0.6),
    crosswalk: std("#f2f2ee", 0.6),
    ground: std(opts.env.groundColor, 1),
    evidence: std("#151515", 1, 0, { transparent: true, opacity: 0.55 }),
    trunk: std("#5b4636", 0.95),
    crown: std("#3e6b35", 0.9),
    concrete: std("#a5a39c", 0.9),
    // Cara de la guarnición: concreto, visible por los dos lados (el segmento no tiene sentido).
    curb: std("#b9b6ad", 0.9, 0, { side: DoubleSide }),
    metal: std("#8d9196", 0.45, 0.6),
    wall: std("#b7a68e", 0.95),
    signPlate: std("#e6e6e6", 0.5),
    signRed: std("#b3261e", 0.5),
    dark: std("#2a2c2e", 0.6),
    lamp: std("#fff3cf", 0.4, 0, {
      emissive: new Color(opts.env.streetLights ? "#ffe2a0" : "#000000"),
      emissiveIntensity: opts.env.streetLights ? 2 : 0,
    }),
    impact: std("#f0b429", 0.5, 0, { transparent: true, opacity: 0.9, side: DoubleSide }),
    person: std("#b7bcc6", 0.8),
    personHead: std("#cfd3da", 0.8),
  };
}

/** Llanta y rin con un solo material: el atributo `_parte` elige entre ambos (ver `wheelMesh`). */
function wheelMaterial(): MeshStandardNodeMaterial {
  const k = attribute("_parte", "float");
  const m = new MeshStandardNodeMaterial();
  m.colorNode = mix(color("#141414"), color("#b9bcc0"), k);
  m.roughnessNode = mix(float(0.95), float(0.3), k);
  m.metalnessNode = mix(float(0), float(0.8), k);
  return m;
}

function vehicleMaterials(color: string, night: boolean): Record<PartRole, Material> {
  return {
    pintura: new MeshPhysicalMaterial({
      color,
      roughness: 0.38,
      metalness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    }),
    vidrio: new MeshPhysicalMaterial({
      color: "#1c2730",
      roughness: 0.06,
      metalness: 0.1,
      transparent: true,
      opacity: 0.78,
    }),
    llanta: std("#141414", 0.95),
    rin: std("#b9bcc0", 0.3, 0.8),
    rueda: wheelMaterial(),
    faro: std("#f5f3e8", 0.2, 0, {
      emissive: new Color(night ? "#fff6d5" : "#000000"),
      emissiveIntensity: night ? 3 : 0,
    }),
    calavera: std("#8c0f0f", 0.3, 0, {
      emissive: new Color(night ? "#ff2a2a" : "#000000"),
      emissiveIntensity: night ? 1.5 : 0,
    }),
    plastico: std("#1f2124", 0.7),
    cromo: std("#c9ccd1", 0.15, 0.9),
    carga: std("#e7e7e2", 0.8),
  };
}

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------

/** Cuadriláteros con tiempo (marcas) en una sola malla plana, en orden de aparición. */
export function quadsToGeometry(quads: readonly TimedQuad[], height: number): BufferGeometry {
  const pos = new Float32Array(quads.length * 12);
  const nor = new Float32Array(quads.length * 12);
  const idx: number[] = [];
  quads.forEach((q, k) => {
    for (let c = 0; c < 4; c++) {
      const [x, y, z] = toThree(q.corners[2 * c] ?? 0, q.corners[2 * c + 1] ?? 0, height);
      pos.set([x, y, z], 12 * k + 3 * c);
      nor.set([0, 1, 0], 12 * k + 3 * c);
    }
    const b = 4 * k;
    // Esquinas en orden antihorario visto desde arriba en el mundo (ver mesh2DToGeometry).
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("normal", new BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Malla plana a partir de triángulos del mundo, a la altura dada (y de three). */
export function mesh2DToGeometry(m: Mesh2D, height: number): BufferGeometry {
  const n = m.positions.length / 2;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = toThree(m.positions[2 * i] ?? 0, m.positions[2 * i + 1] ?? 0, height);
    pos[3 * i] = x;
    pos[3 * i + 1] = y;
    pos[3 * i + 2] = z;
    nor[3 * i + 1] = 1;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("normal", new BufferAttribute(nor, 3));
  g.setIndex(m.indices);
  return g;
}

/**
 * Parte una capa de la vía en la zona que puede recibir sombra (toca el cuadrado de la cámara de
 * sombra del sol) y la que no. Los triángulos se subdividen por su lado más largo hasta medir a lo
 * más `maxEdge` para que la separación siga la zona. Fuera de esa zona ninguna sombra puede caer,
 * así que dibujarla sin muestrear el mapa de sombras da la misma imagen con menos costo (E6).
 */
export function splitByShadow(
  m: Mesh2D,
  height: number,
  frame: SunShadowFrame,
  maxEdge = 10,
): { near: BufferGeometry | null; far: BufferGeometry | null } {
  const pt = (i: number): Vector3 =>
    new Vector3(...toThree(m.positions[2 * i] ?? 0, m.positions[2 * i + 1] ?? 0, height));
  const stack: [Vector3, Vector3, Vector3][] = [];
  for (let k = 0; k + 2 < m.indices.length; k += 3) {
    stack.push([pt(m.indices[k]!), pt(m.indices[k + 1]!), pt(m.indices[k + 2]!)]);
  }
  const near: number[] = [];
  const far: number[] = [];
  while (stack.length > 0) {
    const [a, b, c] = stack.pop()!;
    const ab = a.distanceToSquared(b);
    const bc = b.distanceToSquared(c);
    const ca = c.distanceToSquared(a);
    const longest = Math.max(ab, bc, ca);
    if (longest > maxEdge * maxEdge) {
      if (longest === ab) {
        const mid = a.clone().add(b).multiplyScalar(0.5);
        stack.push([a, mid, c], [mid, b, c]);
      } else if (longest === bc) {
        const mid = b.clone().add(c).multiplyScalar(0.5);
        stack.push([a, b, mid], [a, mid, c]);
      } else {
        const mid = c.clone().add(a).multiplyScalar(0.5);
        stack.push([a, b, mid], [mid, b, c]);
      }
      continue;
    }
    const out = triangleInShadow(frame, a, b, c) ? near : far;
    out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const make = (arr: number[]): BufferGeometry | null => {
    if (arr.length === 0) return null;
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(arr), 3));
    const nor = new Float32Array(arr.length);
    for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
    g.setAttribute("normal", new BufferAttribute(nor, 3));
    return g;
  };
  return { near: make(near), far: make(far) };
}

/** Hash determinista de una cadena a [0, 1) (FNV-1a), para variar árboles con semilla. */
/**
 * ¿La pieza proyecta sombra? El renderer está limitado por CPU por objeto (E6), y cada malla en el
 * pase de sombras cuesta lo mismo que en el principal. Rines (su sombra cae dentro de la de la
 * llanta), faros y calaveras (dentro de la silueta de la carrocería) y vidrios (transparentes: no
 * deberían dar sombra opaca) no la proyectan; la carrocería, llantas, defensas y espejos sí.
 */
export function castsShadow(m: { userData: Record<string, unknown> }): boolean {
  const role = m.userData.role as PartRole | undefined;
  return role !== "rin" && role !== "faro" && role !== "calavera" && role !== "vidrio";
}

export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x1_0000_0000;
}

const TIEMPO_A_S: Record<string, number> = { s: 1, ms: 0.001, min: 60 };

function place(obj: Group | Mesh, x: number, y: number, headingDeg = 0, height = 0): void {
  const [px, py, pz] = toThree(x, y, height);
  obj.position.set(px, py, pz);
  obj.rotation.y = (headingDeg * Math.PI) / 180;
}

function cumulativeDistance(tr: VehicleNode["track"]): number[] {
  const out = [0];
  for (let i = 1; i < tr.t.length; i++) {
    const dx = (tr.x[i] ?? 0) - (tr.x[i - 1] ?? 0);
    const dy = (tr.y[i] ?? 0) - (tr.y[i - 1] ?? 0);
    const yaw = tr.rumbo[i - 1] ?? 0;
    // Con signo: hacia atrás (reversa o rebote) la llanta gira al revés.
    const fwd = dx * Math.cos(yaw) + dy * Math.sin(yaw);
    out.push((out[i - 1] ?? 0) + (fwd >= 0 ? 1 : -1) * Math.hypot(dx, dy));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------------------------

export function buildSceneGraph(
  spec: EscenaSpec,
  resultado: Resultado,
  opts: SceneGraphOptions,
): SceneGraph {
  // Sin estado del piso (pruebas y llamadas antiguas): mojado o seco según `wet`.
  const asphalt = asphaltMaterial(opts.env.surface ?? (opts.env.wet ? "mojado" : "seco"));
  const mats = sceneMaterials(opts, asphalt);
  const root = new Group();
  root.name = "escena";
  const disposables: { dispose(): void }[] = Object.values(mats);

  // Suelo y vía.
  const ground = new Mesh(new PlaneGeometry(800, 800), mats.ground);
  ground.name = "suelo";
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  // El pasto no recibe sombras: cubre casi toda la pantalla y las sombras importan en la calzada (E6).
  ground.receiveShadow = false;
  // Se dibuja después de la vía, los vehículos y los objetos: la prueba de profundidad descarta
  // los pixeles de pasto que quedan tapados y no se sombrean dos veces (E6, limitado por relleno).
  ground.renderOrder = 2;
  root.add(ground);

  const lugar = spec.lugar;
  const layout = roadLayout(lugar);
  const mainWidth = layout.strips[0]?.width ?? layout.arcs[0]?.width ?? 7;
  const crosswalks = (lugar.dispositivos ?? [])
    .filter((d) => d.tipo === "paso_peatonal")
    .map((d) => ({
      center: { x: d.posicion.x, y: d.posicion.y },
      roadHeading: d.orientacion_deg ?? 0,
      roadWidth: mainWidth,
    }));
  const devTipos = (lugar.dispositivos ?? []).map((d) => d.tipo);
  const limite = (lugar.dispositivos ?? []).find((d) => d.limite_velocidad)?.limite_velocidad;
  const dobleSentido = lugar.sentidos.valor === "doble_sentido";
  // Con calles del mapa (ADR 0023) se dibuja la red de OSM; la plantilla queda para la física.
  const mapa = sceneLayout(spec).mapa;
  const road = mapa
    ? buildMapRoadGeometry(mapa.vias, { crosswalks })
    : buildRoadGeometry(layout, {
        dobleSentido,
        banquetas: lugar.banquetas?.valor ?? false,
        crosswalks,
        dash: dashPatternFor(lugar.tipo_via.valor, limite ? velocidadKmh(limite) : undefined),
        markings: markingsFor(dobleSentido, devTipos),
        guarniciones: lugar.guarniciones?.valor ?? false,
      });
  const roadGroup = new Group();
  roadGroup.name = "via";
  const layers: [string, Mesh2D, Material, number][] = [
    ["calzada", road.pavement, mats.asphalt, 0],
    ["banqueta", road.sidewalk, mats.sidewalk, CURB_HEIGHT],
    ["camellon", road.medians, mats.sidewalk, CURB_HEIGHT],
    ["rayas_blancas", road.whiteLines, mats.white, 0.012],
    ["rayas_amarillas", road.yellowLines, mats.yellow, 0.012],
    ["paso_peatonal", road.crosswalks, mats.crosswalk, 0.014],
  ];
  const frame =
    opts.quality.shadows && opts.env.lightDirection
      ? sunShadowFrame(resultado, opts.env.lightDirection)
      : undefined;
  for (const [name, m2d, mat, h] of layers) {
    if (m2d.indices.length === 0) continue;
    if (!frame) {
      const mesh = new Mesh(mesh2DToGeometry(m2d, h), mat);
      mesh.name = name;
      mesh.receiveShadow = true;
      roadGroup.add(mesh);
      continue;
    }
    const { near, far } = splitByShadow(m2d, h, frame);
    if (near) {
      const mesh = new Mesh(near, mat);
      mesh.name = name;
      mesh.receiveShadow = true;
      roadGroup.add(mesh);
    }
    if (far) {
      const mesh = new Mesh(far, mat);
      mesh.name = `${name}_sin_sombra`;
      mesh.receiveShadow = false;
      roadGroup.add(mesh);
    }
  }
  // Caras verticales de las guarniciones (de la calzada a la banqueta o al camellón).
  if (road.curbs.length > 0) {
    const pos: number[] = [];
    const idx: number[] = [];
    for (const c of road.curbs) {
      const base = pos.length / 3;
      const [ax, , az] = toThree(c.a.x, c.a.y, 0);
      const [bx, , bz] = toThree(c.b.x, c.b.y, 0);
      pos.push(ax, 0, az, bx, 0, bz, bx, CURB_HEIGHT, bz, ax, CURB_HEIGHT, az);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const curbs = new Mesh(g, mats.curb);
    curbs.name = "guarniciones";
    curbs.receiveShadow = true;
    roadGroup.add(curbs);
  }
  root.add(roadGroup);

  // Evidencias declaradas en el relato (marcas, restos): trazos oscuros sobre el piso.
  const evGroup = new Group();
  evGroup.name = "evidencias";
  for (const e of spec.evidencias ?? []) {
    const pts = e.puntos ?? [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!a || !b) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.05) continue;
      const seg = new Mesh(new PlaneGeometry(len, 0.22), mats.evidence);
      seg.name = `evidencia_${e.id}_${i}`;
      seg.rotation.x = -Math.PI / 2;
      const holder = new Group();
      place(
        holder,
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
        0.016,
      );
      holder.add(seg);
      evGroup.add(holder);
    }
  }
  root.add(evGroup);

  // Luces reales de noche (F8b): qué vehículos y postes llevan foco, según el nivel de calidad.
  const nightPlan = planNightLights(spec, resultado, opts.env, opts.quality.level);
  const headlightSpots: { vehicleId: string; spot: SpotLight }[] = [];

  // Objetos del entorno.
  const objGroup = new Group();
  objGroup.name = "objetos";
  const seedText = String(spec.meta.semilla);
  const solverObjects = new Map((resultado.objetos ?? []).map((g) => [g.id, g]));
  let trees = 0;
  // Objetos que participan en un evento (p. ej. el árbol del choque): malla propia.
  const actorIds = new Set(resultado.eventos.flatMap((e) => e.actores));
  const decorTrees: {
    x: number;
    z: number;
    d: number;
    h: number;
    crownR: number;
    crownY: number;
    yaw: number;
  }[] = [];
  for (const o of spec.entorno.objetos ?? []) {
    const g = new Group();
    g.name = `objeto_${o.id}`;
    const largo = o.largo ? longitudM(o.largo) : undefined;
    const ancho = o.ancho ? longitudM(o.ancho) : undefined;
    const alto = o.alto ? longitudM(o.alto) : undefined;
    if (o.tipo === "arbol") {
      if (trees++ >= opts.quality.maxTrees) continue;
      // Geometría del solver (la misma del análisis de visibilidad); sin ella, la del hash.
      const geo = solverObjects.get(o.id);
      const d = o.diametro_tronco ? longitudM(o.diametro_tronco) : 0.35;
      const u = hash01(`${seedText}:${o.id}`);
      const h = geo?.copa?.tronco_alto_m ?? 3.5 + 2.5 * u;
      const trunk = new Mesh(new CylinderGeometry(d / 2, (d / 2) * 1.15, h, 12), mats.trunk);
      trunk.name = "tronco";
      trunk.position.y = h / 2;
      trunk.userData.radius = d / 2;
      const crownR = geo?.copa?.radio_m ?? 1.8 + 1.6 * u + 2 * d;
      const crownY = geo?.copa?.centro_m ?? h + crownR * 0.7;
      if (!actorIds.has(o.id)) {
        // Árbol que no participa en un evento: va en las mallas instanciadas (una llamada de
        // dibujo para todos los troncos y otra para todas las copas).
        const [px, , pz] = toThree(o.posicion.x, o.posicion.y, 0);
        decorTrees.push({ x: px, z: pz, d, h, crownR, crownY, yaw: 2 * Math.PI * u });
        continue;
      }
      const crown = new Mesh(new IcosahedronGeometry(crownR, 1), mats.crown);
      crown.name = "copa";
      crown.position.y = crownY;
      crown.rotation.y = 2 * Math.PI * u;
      for (const m of [trunk, crown]) m.castShadow = true;
      g.add(trunk, crown);
    } else if (o.tipo === "poste") {
      const d = o.diametro_tronco ? longitudM(o.diametro_tronco) : 0.3;
      const h = alto ?? 8;
      const metal = o.material === "metal";
      const pole = new Mesh(
        new CylinderGeometry((d / 2) * 0.8, d / 2, h, 12),
        metal ? mats.metal : mats.concrete,
      );
      pole.name = "poste";
      pole.position.y = h / 2;
      pole.userData.radius = d / 2;
      const arm = new Mesh(new BoxGeometry(1.6, 0.1, 0.1), mats.metal);
      arm.position.set(0.8, h - 0.3, 0);
      const lamp = new Mesh(new BoxGeometry(0.5, 0.12, 0.25), mats.lamp);
      lamp.name = "luminaria";
      lamp.position.set(1.5, h - 0.4, 0);
      for (const m of [pole, arm]) m.castShadow = true;
      g.add(pole, arm, lamp);
      if (nightPlan.poles.includes(o.id)) {
        const spot = new SpotLight(
          "#ffe7c2",
          STREETLIGHT_INTENSITY,
          STREETLIGHT_RANGE_M,
          (STREETLIGHT_HALF_ANGLE_DEG * Math.PI) / 180,
          0.6,
          2,
        );
        spot.name = "luz_poste";
        spot.position.copy(lamp.position);
        const target = new Object3D();
        target.position.set(lamp.position.x, 0, 0);
        spot.target = target;
        g.add(spot, target);
        disposables.push(spot);
      }
    } else if (o.tipo === "vehiculo_estacionado") {
      const clase = o.clase_vehiculo?.valor ?? "sedan_compacto";
      const t = profileFor(clase);
      const dims = {
        length: largo ?? (t.kind === "car" ? 4.4 : 2),
        width: ancho ?? 1.8,
        height: alto ?? 1.5,
        wheelbase: 0.6 * (largo ?? 4.4),
      };
      const parked = buildVehicle(clase, dims);
      const vm = vehicleMaterials(o.color?.hex ?? "#8a8d91", false);
      disposables.push(...Object.values(vm));
      parked.traverse((m) => {
        if (m instanceof Mesh) m.material = vm[m.userData.role as PartRole] ?? vm.plastico;
      });
      g.add(parked);
    } else if (o.tipo === "senal") {
      const pole = new Mesh(new CylinderGeometry(0.04, 0.04, 2.4, 8), mats.metal);
      pole.position.y = 1.2;
      const plate = new Mesh(new BoxGeometry(0.04, 0.6, 0.6), mats.signPlate);
      plate.position.y = 2.3;
      g.add(pole, plate);
    } else {
      // Muro, barda, puesto, contenedor, parada u otro: volumen simple con sus medidas.
      const sx = largo ?? (o.tipo === "muro" || o.tipo === "barda" ? 6 : 2);
      const sz = ancho ?? (o.tipo === "muro" || o.tipo === "barda" ? 0.25 : 1.5);
      const sy = alto ?? (o.tipo === "muro" || o.tipo === "barda" ? 2.2 : 2);
      const b = new Mesh(
        new BoxGeometry(sx, sy, sz),
        o.tipo === "muro" || o.tipo === "barda" ? mats.wall : mats.dark,
      );
      b.name = o.tipo;
      b.position.y = sy / 2;
      b.castShadow = true;
      b.receiveShadow = true;
      g.add(b);
    }
    place(g, o.posicion.x, o.posicion.y, o.rumbo_deg ?? 0);
    objGroup.add(g);
  }
  if (decorTrees.length > 0) {
    // Geometrías unitarias escaladas por instancia: tronco de radio 0.5 y alto 1, copa de radio 1.
    const trunkGeo = new CylinderGeometry(0.5, 0.575, 1, 12);
    trunkGeo.translate(0, 0.5, 0);
    const crownGeo = new IcosahedronGeometry(1, 1);
    const trunks = new InstancedMesh(trunkGeo, mats.trunk, decorTrees.length);
    const crowns = new InstancedMesh(crownGeo, mats.crown, decorTrees.length);
    trunks.name = "troncos";
    crowns.name = "copas";
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    decorTrees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.yaw);
      m.compose(new Vector3(t.x, 0, t.z), q, new Vector3(t.d, t.h, t.d));
      trunks.setMatrixAt(i, m);
      m.compose(new Vector3(t.x, t.crownY, t.z), q, new Vector3(t.crownR, t.crownR, t.crownR));
      crowns.setMatrixAt(i, m);
    });
    for (const im of [trunks, crowns]) {
      im.castShadow = true;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      objGroup.add(im);
    }
  }
  root.add(objGroup);

  // Dispositivos de tránsito (F8c): semáforos con su fase en el tiempo y una placa por señal.
  const devGroup = new Group();
  devGroup.name = "dispositivos";
  const devices: DeviceNode[] = [];
  const firstPose = new Map(
    resultado.vehiculos.map((v) => [
      v.id,
      { x: v.trayectoria.x[0] ?? 0, y: v.trayectoria.y[0] ?? 0 },
    ]),
  );
  for (const d of lugar.dispositivos ?? []) {
    if (
      d.tipo === "paso_peatonal" ||
      d.tipo === "linea_continua" ||
      d.tipo === "linea_discontinua"
    ) {
      continue;
    }
    const orient = ((d.orientacion_deg ?? 0) * Math.PI) / 180;
    // Cada fase mira al vehículo cuyo flujo regula (su id en `movimiento` o en `aplica_a`); si no
    // hay vehículo, las cabezas se reparten en cruz a partir de la orientación del dispositivo.
    const fases = (d.fases ?? []).map((f, i) => {
      const vid = firstPose.has(f.movimiento) ? f.movimiento : d.aplica_a?.[i];
      const at = vid ? firstPose.get(vid) : undefined;
      const yaw = at
        ? Math.atan2(at.y - d.posicion.y, at.x - d.posicion.x) - orient
        : (i * Math.PI) / 2;
      const tau = f.tiempo_en_fase
        ? f.tiempo_en_fase.valor * (TIEMPO_A_S[f.tiempo_en_fase.unidad] ?? 1)
        : undefined;
      return { phase: { color: f.color, tiempoEnFaseS: tau }, yaw };
    });
    const node = buildDevice(
      {
        tipo: d.tipo,
        limiteKmh: d.limite_velocidad ? velocidadKmh(d.limite_velocidad) : undefined,
        fases,
        anchoTopeM: mainWidth,
      },
      mats.metal,
    );
    node.group.name = `dispositivo_${d.id}`;
    place(node.group, d.posicion.x, d.posicion.y, d.orientacion_deg ?? 0);
    devGroup.add(node.group);
    disposables.push(...node.materials);
    devices.push(node);
  }
  root.add(devGroup);

  // Punto de impacto: anillo neutro sobre el piso.
  if (resultado.punto_impacto) {
    const ring = new Mesh(new RingGeometry(0.45, 0.6, 32), mats.impact);
    ring.name = "punto_impacto";
    ring.rotation.x = -Math.PI / 2;
    const [x, y, z] = toThree(resultado.punto_impacto.x, resultado.punto_impacto.y, 0.02);
    ring.position.set(x, y, z);
    const dot = new Mesh(new CircleGeometry(0.12, 16), mats.impact);
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(x, y, z);
    root.add(ring, dot);
  }

  // Vehículos.
  const glyphs = new Map(sceneLayout(spec).vehicles.map((v) => [v.id, v]));
  const specVehicles = new Map(spec.vehiculos.map((v) => [v.id, v]));
  const vehicles: VehicleNode[] = [];
  for (const v of resultado.vehiculos) {
    const sv = specVehicles.get(v.id);
    const dims = {
      length: v.dimensiones.largo_m,
      width: v.dimensiones.ancho_m,
      height: v.dimensiones.alto_m,
      wheelbase: v.dimensiones.distancia_entre_ejes_m,
      frontOverhang: sv?.voladizo_delantero ? longitudM(sv.voladizo_delantero) : undefined,
    };
    const group = buildVehicle(v.clase, dims);
    group.name = `vehiculo_${v.id}`;
    group.userData.id = v.id;
    const vm = vehicleMaterials(
      glyphs.get(v.id)?.colorHex ?? "#9aa0a6",
      opts.env.night && headlightsOn(spec, v.id),
    );
    disposables.push(...Object.values(vm));
    group.traverse((m) => {
      if (m instanceof Mesh) {
        m.material = vm[m.userData.role as PartRole] ?? vm.plastico;
        m.castShadow = opts.quality.shadows && castsShadow(m);
      }
    });
    const rig = buildDamageRig(group, v, dims, glyphs.get(v.id)?.colorHex ?? "#9aa0a6", {
      spec,
      resultado,
      colorOf: (id) => glyphs.get(id)?.colorHex,
      seed: Math.trunc(spec.meta.semilla) * 31 + resultado.vehiculos.indexOf(v),
    });
    disposables.push(...rig.materials);
    group.traverse((m) => {
      if (m instanceof Mesh) m.castShadow = opts.quality.shadows && castsShadow(m);
    });
    const wheels = wheelNames(group).flatMap((n) => {
      const obj = group.getObjectByName(n);
      return obj instanceof Group ? [{ obj, radius: obj.userData.radius as number }] : [];
    });
    if (nightPlan.vehicles.includes(v.id)) {
      // Foco al frente, entre los faros, apuntando al piso unos 25 m adelante.
      const lights = ["headlight_l", "headlight_r", "headlight_c"]
        .map((n) => group.getObjectByName(n))
        .filter((o): o is Object3D => o !== undefined);
      const at = new Vector3();
      for (const l of lights) at.add(l.position);
      if (lights.length > 0) at.divideScalar(lights.length);
      else at.set(dims.length / 2, 0.7, 0);
      const spot = new SpotLight(
        "#fff4dc",
        HEADLIGHT_INTENSITY,
        HEADLIGHT_RANGE_M,
        (HEADLIGHT_HALF_ANGLE_DEG * Math.PI) / 180,
        0.4,
        2,
      );
      spot.name = "luz_faros";
      spot.position.copy(at);
      const target = new Object3D();
      target.position.set(at.x + 25, 0, at.z);
      spot.target = target;
      group.add(spot, target);
      disposables.push(spot);
      headlightSpots.push({ vehicleId: v.id, spot });
    }
    root.add(group);
    vehicles.push({
      id: v.id,
      group,
      wheels,
      distance: cumulativeDistance(v.trayectoria),
      track: v.trayectoria,
      rig,
    });
  }

  // Marcas en el piso desde las trayectorias del solver.
  const reposo = new Map(
    resultado.eventos.filter((e) => e.tipo === "reposo").map((e) => [e.actores[0], e.t]),
  );
  const frenadoT = new Map(
    resultado.eventos.filter((e) => e.tipo === "inicio_frenado").map((e) => [e.actores[0], e.t]),
  );
  const marks = computeGroundMarks(
    resultado.vehiculos.map((v) => {
      const sv = specVehicles.get(v.id);
      return {
        id: v.id,
        clase: v.clase,
        dims: {
          length: v.dimensiones.largo_m,
          width: v.dimensiones.ancho_m,
          height: v.dimensiones.alto_m,
          wheelbase: v.dimensiones.distancia_entre_ejes_m,
        },
        track: v.trayectoria,
        tFrenado: frenadoT.get(v.id),
        abs: sv?.frenado?.abs?.valor ?? false,
        bloqueadas: sv?.frenado?.aplico?.valor ?? false,
        aplastamientoFrontal: (v.dano.cdc?.lado ?? "F") === "F" ? Math.max(...v.dano.perfil_m) : 0,
        tReposo: v.involucrado ? reposo.get(v.id) : undefined,
        volcado: rollsOver(resultado, v.id),
      };
    }),
  );
  const markMeshes: { mesh: Mesh; quads: TimedQuad[] }[] = [];
  for (const [name, quads, opacity] of [
    ["marcas_frenado", marks.frenado, 0.8],
    ["marcas_derrape", marks.derrape, 0.6],
  ] as const) {
    if (quads.length === 0) continue;
    const mat = std("#121212", 0.95, 0, { transparent: true, opacity, depthWrite: false });
    disposables.push(mat);
    const mesh = new Mesh(quadsToGeometry(quads, 0.018), mat);
    mesh.name = name;
    mesh.renderOrder = 1;
    root.add(mesh);
    markMeshes.push({ mesh, quads: [...quads] });
  }
  const puddles: { mesh: Mesh; spec: GroundMarks["charcos"][number] }[] = [];
  if (marks.charcos.length > 0) {
    const mat = std("#1b1e1d", 0.15, 0.1, { transparent: true, opacity: 0.75, depthWrite: false });
    disposables.push(mat);
    for (const c of marks.charcos) {
      const mesh = new Mesh(new CircleGeometry(1, 24), mat);
      mesh.name = "charco";
      mesh.rotation.x = -Math.PI / 2;
      const [x, y, z] = toThree(c.x, c.y, 0.02);
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(0);
      root.add(mesh);
      puddles.push({ mesh, spec: c });
    }
  }

  // Personas.
  const vehicleById = new Map(resultado.vehiculos.map((v) => [v.id, v]));
  const persons: PersonNode[] = [];
  for (const p of resultado.personas) {
    const group = buildMannequin(p.estatura_m);
    group.name = `persona_${p.id}`;
    group.traverse((m) => {
      if (m instanceof Mesh)
        m.material = m.userData.role === "persona_cabeza" ? mats.personHead : mats.person;
    });
    let mode: PersonNode["mode"] = "sin_datos";
    let seat: number | undefined;
    if (p.trayectoria.t.length > 0) mode = "trayectoria";
    else if (p.vehiculo_id) {
      const veh = vehicleById.get(p.vehiculo_id);
      const twoWheel = veh ? profileFor(veh.clase).kind === "two_wheel" : false;
      mode = twoWheel ? "a_bordo_visible" : "a_bordo_oculto";
      if (veh && twoWheel) {
        seat = seatHeight(veh.clase, {
          length: veh.dimensiones.largo_m,
          width: veh.dimensiones.ancho_m,
          height: veh.dimensiones.alto_m,
          wheelbase: veh.dimensiones.distancia_entre_ejes_m,
        });
      }
    }
    group.visible = mode === "trayectoria" || mode === "a_bordo_visible";
    root.add(group);
    persons.push({ id: p.id, group, mode, vehicleId: p.vehiculo_id, seat });
  }

  const personData = new Map(resultado.personas.map((p) => [p.id, p]));
  const vehicleNodes = new Map(vehicles.map((n) => [n.id, n]));

  const extraUpdaters: ((t: number) => void)[] = [];
  const postUpdaters: ((t: number) => void)[] = [];
  let lastT = resultado.t_inicio;

  function update(t: number): void {
    lastT = t;
    for (const dv of devices) dv.update(t);
    for (const fn of extraUpdaters) fn(t);
    for (const m of markMeshes) m.mesh.geometry.setDrawRange(0, visibleCount(m.quads, t) * 6);
    for (const p of puddles) {
      const r = puddleRadius(p.spec, t);
      p.mesh.scale.setScalar(Math.max(r, 1e-4));
    }
    for (const n of vehicles) {
      const pose = sampleVehicle(n.track, t);
      const [x, y, z] = toThree(pose.x, pose.y, 0);
      n.group.position.set(x, y, z);
      // Rotación completa: la volcadura (actualización posterior) puede dejar alabeo y cabeceo.
      n.group.rotation.set(0, pose.yaw, 0);
      const { i, f } = bracket(n.track.t, t);
      const s =
        (n.distance[i] ?? 0) +
        ((n.distance[i + 1] ?? n.distance[i] ?? 0) - (n.distance[i] ?? 0)) * f;
      for (const w of n.wheels) w.obj.rotation.z = -s / w.radius;
      n.rig.update(t);
      for (const h of headlightSpots) {
        if (h.vehicleId === n.id)
          h.spot.intensity = HEADLIGHT_INTENSITY * n.rig.workingHeadlights(t);
      }
    }
    for (const n of persons) {
      const data = personData.get(n.id);
      if (!data) continue;
      if (n.mode === "trayectoria") {
        const pose = samplePerson(data.trayectoria, t);
        if (!pose) continue;
        const [x, y, z] = toThree(pose.x, pose.y, pose.z);
        n.group.position.set(x, y, z);
        n.group.rotation.y = pose.yaw;
        const fase = phaseAt(data.fases, t);
        const posture = fase?.fase === "montado" ? "sentado" : (fase?.fase ?? "de_pie");
        const progress =
          fase && fase.t_fin > fase.t_inicio
            ? (t - fase.t_inicio) / (fase.t_fin - fase.t_inicio)
            : 1;
        applyPosture(n.group, posture, (t * 1.8) % 1, progress);
      } else if (n.mode === "a_bordo_visible" && n.vehicleId) {
        const veh = vehicleNodes.get(n.vehicleId);
        if (!veh) continue;
        const pose = sampleVehicle(veh.track, t);
        const cg = CG_HEIGHT_FACTOR * data.estatura_m;
        // Sentado: la cadera queda en el asiento; el centro de masa un poco arriba.
        const [x, y, z] = toThree(
          pose.x,
          pose.y,
          (n.seat ?? 0.8) + cg - 0.47 * data.estatura_m + 0.1,
        );
        n.group.position.set(x, y, z);
        n.group.rotation.y = pose.yaw;
        applyPosture(n.group, "sentado");
      }
    }
    for (const fn of postUpdaters) fn(t);
  }

  update(resultado.t_inicio);

  let meshes = 0;
  let triangles = 0;
  root.traverse((o) => {
    if (o instanceof Mesh) {
      meshes++;
      const g = o.geometry as BufferGeometry;
      const perInstance = (g.index ? g.index.count : (g.getAttribute("position")?.count ?? 0)) / 3;
      // Una malla instanciada dibuja su geometría una vez por instancia.
      triangles += perInstance * (o instanceof InstancedMesh ? o.count : 1);
    }
  });

  return {
    root,
    vehicles,
    persons,
    update,
    addUpdater(fn: (t: number) => void, o?: { after?: boolean }) {
      (o?.after ? postUpdaters : extraUpdaters).push(fn);
      update(lastT);
    },
    get time() {
      return lastT;
    },
    setReflections(env: Texture | null) {
      asphalt.setReflections(env);
    },
    applyTextures(t: EnvTextures) {
      asphalt.applyTexture(t.asfalto ?? null);
      // Banqueta y camellón de concreto; suelo de pasto. Cada textura toma el color y la rugosidad
      // del material liso que reemplaza (seco o mojado, día o noche). La guarnición conserva su
      // material liso: en sus caras verticales la proyección en planta se vería rayada.
      const calibrated = (m: MeshStandardMaterial) => ({
        color: `#${m.color.getHexString()}`,
        roughness: m.roughness,
      });
      const swaps = new Map<Material, Material>();
      if (t.concreto) {
        swaps.set(mats.sidewalk, texturedPlanarMaterial(t.concreto, calibrated(mats.sidewalk)));
      }
      if (t.pasto) {
        swaps.set(
          mats.ground,
          texturedPlanarMaterial(t.pasto, { ...calibrated(mats.ground), variation: true }),
        );
      }
      root.traverse((o) => {
        if (o instanceof Mesh && swaps.has(o.material as Material)) {
          o.material = swaps.get(o.material as Material)!;
        }
      });
      disposables.push(...swaps.values());
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof Mesh) (o.geometry as BufferGeometry).dispose();
      });
      for (const d of disposables) d.dispose();
    },
    stats: { meshes, triangles: Math.round(triangles) },
  };
}
