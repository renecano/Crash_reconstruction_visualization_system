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
import { longitudM } from "@croquis/scene-schema";
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
  type Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
} from "three";
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
import { buildRoadGeometry, type Mesh2D } from "./road-geometry";
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
  env: Pick<EnvironmentSettings, "night" | "wet" | "groundColor" | "streetLights">;
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

function sceneMaterials(opts: SceneGraphOptions) {
  const wet = opts.env.wet;
  const night = opts.env.night;
  return {
    asphalt: std(wet ? "#26292c" : "#3b3e42", wet ? 0.32 : 0.92),
    sidewalk: std("#a19f99", 0.95),
    white: std("#ecebe4", 0.6),
    yellow: std("#e3b21c", 0.6),
    crosswalk: std("#f2f2ee", 0.6),
    ground: std(opts.env.groundColor, 1),
    evidence: std("#151515", 1, 0, { transparent: true, opacity: 0.55 }),
    trunk: std("#5b4636", 0.95),
    crown: std("#3e6b35", 0.9),
    concrete: std("#a5a39c", 0.9),
    metal: std("#8d9196", 0.45, 0.6),
    wall: std("#b7a68e", 0.95),
    signPlate: std("#e6e6e6", 0.5),
    signRed: std("#b3261e", 0.5),
    dark: std("#2a2c2e", 0.6),
    lamp: std("#fff3cf", 0.4, 0, {
      emissive: new Color(night ? "#ffe2a0" : "#000000"),
      emissiveIntensity: night ? 2 : 0,
    }),
    impact: std("#f0b429", 0.5, 0, { transparent: true, opacity: 0.9, side: DoubleSide }),
    person: std("#b7bcc6", 0.8),
    personHead: std("#cfd3da", 0.8),
  };
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

/** Hash determinista de una cadena a [0, 1) (FNV-1a), para variar árboles con semilla. */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x1_0000_0000;
}

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
  const mats = sceneMaterials(opts);
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
  const road = buildRoadGeometry(layout, {
    dobleSentido: lugar.sentidos.valor === "doble_sentido",
    banquetas: lugar.banquetas?.valor ?? false,
    crosswalks,
  });
  const roadGroup = new Group();
  roadGroup.name = "via";
  const layers: [string, Mesh2D, Material, number][] = [
    ["calzada", road.pavement, mats.asphalt, 0],
    ["banqueta", road.sidewalk, mats.sidewalk, 0.15],
    ["rayas_blancas", road.whiteLines, mats.white, 0.012],
    ["rayas_amarillas", road.yellowLines, mats.yellow, 0.012],
    ["paso_peatonal", road.crosswalks, mats.crosswalk, 0.014],
  ];
  for (const [name, m2d, mat, h] of layers) {
    if (m2d.indices.length === 0) continue;
    const mesh = new Mesh(mesh2DToGeometry(m2d, h), mat);
    mesh.name = name;
    mesh.receiveShadow = true;
    roadGroup.add(mesh);
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

  // Objetos del entorno.
  const objGroup = new Group();
  objGroup.name = "objetos";
  const seedText = String(spec.meta.semilla);
  const solverObjects = new Map((resultado.objetos ?? []).map((g) => [g.id, g]));
  let trees = 0;
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
      const crown = new Mesh(new IcosahedronGeometry(crownR, 1), mats.crown);
      crown.name = "copa";
      crown.position.y = geo?.copa?.centro_m ?? h + crownR * 0.7;
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
      const vm = vehicleMaterials(o.color?.hex ?? "#8a8d91", opts.env.night);
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
  root.add(objGroup);

  // Dispositivos de tránsito (básicos en F3; fases de semáforo y señalización completa en F8).
  const devGroup = new Group();
  devGroup.name = "dispositivos";
  for (const d of lugar.dispositivos ?? []) {
    if (
      d.tipo === "paso_peatonal" ||
      d.tipo === "linea_continua" ||
      d.tipo === "linea_discontinua"
    ) {
      continue;
    }
    const g = new Group();
    g.name = `dispositivo_${d.id}`;
    if (d.tipo === "tope") {
      const bump = new Mesh(new BoxGeometry(0.6, 0.08, mainWidth), mats.yellow);
      bump.position.y = 0.04;
      g.add(bump);
    } else {
      const h = d.tipo === "semaforo" ? 3.2 : 2.4;
      const pole = new Mesh(new CylinderGeometry(0.06, 0.07, h, 8), mats.metal);
      pole.position.y = h / 2;
      pole.castShadow = true;
      g.add(pole);
      if (d.tipo === "semaforo") {
        const head = new Mesh(new BoxGeometry(0.3, 0.9, 0.3), mats.dark);
        head.name = "semaforo";
        head.position.y = h + 0.35;
        g.add(head);
      } else {
        const plate = new Mesh(
          new BoxGeometry(0.04, 0.6, 0.6),
          d.tipo === "alto" ? mats.signRed : mats.signPlate,
        );
        plate.name = "placa";
        plate.position.y = h - 0.1;
        g.add(plate);
      }
    }
    place(g, d.posicion.x, d.posicion.y, d.orientacion_deg ?? 0);
    devGroup.add(g);
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
    const vm = vehicleMaterials(glyphs.get(v.id)?.colorHex ?? "#9aa0a6", opts.env.night);
    disposables.push(...Object.values(vm));
    group.traverse((m) => {
      if (m instanceof Mesh) {
        m.material = vm[m.userData.role as PartRole] ?? vm.plastico;
        m.castShadow = opts.quality.shadows;
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
      if (m instanceof Mesh) m.castShadow = opts.quality.shadows;
    });
    const wheels = wheelNames(group).flatMap((n) => {
      const obj = group.getObjectByName(n);
      return obj instanceof Group ? [{ obj, radius: obj.userData.radius as number }] : [];
    });
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
      triangles += (g.index ? g.index.count : (g.getAttribute("position")?.count ?? 0)) / 3;
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
    dispose() {
      root.traverse((o) => {
        if (o instanceof Mesh) (o.geometry as BufferGeometry).dispose();
      });
      for (const d of disposables) d.dispose();
    },
    stats: { meshes, triangles: Math.round(triangles) },
  };
}
