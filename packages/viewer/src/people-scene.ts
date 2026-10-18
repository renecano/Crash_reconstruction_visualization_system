/**
 * Personas en la escena (PLAN §7.4): cuerpos de MakeHuman con postura animada, ocupantes dentro del
 * habitáculo con el desplazamiento del solver (`ocupante`), jinetes sobre su vehículo y personas
 * proyectadas con un ragdoll Rapier calibrado contra la banda de Searle del solver.
 *
 * Indicadores de contacto neutros (aros translúcidos, sin sangre ni lesiones): dónde el frente del
 * vehículo toca a la persona peatona (defensa, borde del cofre, cabeza) y qué parte del interior
 * alcanza cada ocupante. Son ilustrativos y no son un diagnóstico (PLAN §10).
 */
import type { EscenaSpec, Resultado } from "@croquis/scene-schema";
import {
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  TorusGeometry,
  Vector3,
  type Material,
} from "three";
import {
  complexionInfluences,
  defaultMass,
  instantiateBody,
  paletteFor,
  variantForAge,
  type BodyInstance,
  type BodyManifestEntry,
  type BodyTemplate,
  type BodyVariant,
} from "./body-assets";
import { toThree } from "./coords";
import { mulberry32, type KinematicBox, type StaticCollider } from "./debris";
import {
  applyPose,
  drivingDirections,
  occupantLean,
  passengerDirections,
  poseFromDirections,
  posedJoints,
  ridingDirections,
  standingDirections,
  walkingDirections,
  STEP_LENGTH_FACTOR,
  type BoneName,
  type BoneSpec,
  type Pose,
} from "./person-pose";
import {
  calibrateRagdoll,
  ragdollPoseAt,
  type RagdollInput,
  type RagdollResult,
} from "./person-ragdoll";
import { phaseAt, samplePerson, sampleVehicle } from "./sample";
import type { SceneGraph } from "./scene-graph";
import { profileFor, seatHeight } from "./vehicle-geometry";
import { dmath } from "@croquis/solver-ts";
import { applyAxisAngle, quatFromAxisAngle } from "./dthree";

type PersonaResultado = Resultado["personas"][number];
type PersonaSpec = EscenaSpec["personas"][number];

export const MARKER_COLOR = "#5aa9e6";
/** El cuerpo mira a +z; los vehículos y el rumbo, a +x local: giro de 90° sobre y. */
const BODY_TO_HEADING = Math.PI / 2;
const Y = new Vector3(0, 1, 0);
const FRONT_CAB = new Set(["autobus", "camion_unitario", "tractocamion", "microbus_combi", "van"]);

export interface RagdollReport {
  personId: string;
  kind: "peaton" | "jinete";
  target: number;
  band: [number, number];
  distance: number;
  inBand: boolean;
  k: number;
  iterations: number;
  uncalibrated: number;
  /** Cuadros horneados del ragdoll elegido (E8 compara sus bits entre navegadores). */
  frames: Float32Array;
}

export interface PeopleAttachment {
  bodies: number;
  ragdolls: RagdollReport[];
  markers: number;
}

/** Variantes que necesita la escena (para cargar solo esas). */
export function variantsFor(spec: EscenaSpec): BodyVariant[] {
  const ages = spec.personas.map((p) => p.edad_aprox?.valor);
  return [...new Set(ages.map((a) => variantForAge(a)))];
}

function seedFor(spec: EscenaSpec, id: string): number {
  let h = Math.trunc(spec.meta.semilla) >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * Vehículos del evento que proyecta a la persona: su interacción ya está en la velocidad de
 * lanzamiento del solver, así que el ragdoll no vuelve a chocar con ellos (no se cuenta dos veces
 * la transferencia de momento). Con los demás vehículos y objetos sí choca.
 */
export function eventVehicles(
  resultado: Resultado,
  personId: string,
  ownVehicle?: string,
): Set<string> {
  const out = new Set<string>(ownVehicle ? [ownVehicle] : []);
  for (const e of resultado.eventos) {
    const mine = e.actores.includes(personId);
    const viaVehicle =
      ownVehicle !== undefined && e.actores.includes(ownVehicle) && e.tipo.startsWith("impacto");
    if (mine || viaVehicle) for (const a of e.actores) out.add(a);
  }
  return out;
}

function kinematicVehicles(resultado: Resultado, exclude: Set<string>): KinematicBox[] {
  return resultado.vehiculos
    .filter((v) => !exclude.has(v.id))
    .map((v) => ({
      half: [v.dimensiones.largo_m / 2, v.dimensiones.alto_m / 2, v.dimensiones.ancho_m / 2] as [
        number,
        number,
        number,
      ],
      poseAt(time: number) {
        const s = sampleVehicle(v.trayectoria, time);
        return {
          position: new Vector3(...toThree(s.x, s.y, v.dimensiones.alto_m / 2)),
          yaw: s.yaw,
        };
      },
    }));
}

/** Colisionadores fijos con la geometría que entrega el solver (`resultado.objetos`). */
export function staticColliders(resultado: Resultado): StaticCollider[] {
  const out: StaticCollider[] = [];
  for (const o of resultado.objetos ?? []) {
    const yaw = (o.rumbo_deg * Math.PI) / 180;
    if (o.forma === "arbol" || o.forma === "cilindro") {
      const h = o.forma === "arbol" ? (o.copa?.tronco_alto_m ?? o.alto_m) : o.alto_m;
      out.push({
        kind: "cilindro",
        position: new Vector3(...toThree(o.x, o.y, h / 2)),
        size: [o.radio_m ?? 0.15, h / 2, 0],
        yaw,
      });
    } else if (o.forma === "caja") {
      out.push({
        kind: "caja",
        position: new Vector3(...toThree(o.x, o.y, o.alto_m / 2)),
        size: [o.largo_m / 2, o.alto_m / 2, o.ancho_m / 2],
        yaw,
      });
    }
  }
  return out;
}

/** Un indicador de contacto: su marco local en un vehículo y su escala en el tiempo. */
interface MarkerSpec {
  parent: Object3D;
  position: Vector3;
  normal: Vector3;
  radius: number;
  scaleAt(t: number): number;
}

/**
 * Todos los aros neutros de la escena en una sola `InstancedMesh` (una llamada de dibujo): el
 * renderer está limitado por CPU por objeto (E6). Cada aro sigue a su vehículo; los que todavía
 * no aparecen quedan con escala cero.
 */
function markerBatch(specs: MarkerSpec[], root: Object3D, mats: Material[]): (t: number) => void {
  const mat = new MeshBasicMaterial({
    color: MARKER_COLOR,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  mats.push(mat);
  const mesh = new InstancedMesh(new TorusGeometry(1, 0.16, 8, 32), mat, Math.max(1, specs.length));
  mesh.name = "indicadores_contacto";
  mesh.count = specs.length;
  mesh.frustumCulled = false;
  root.add(mesh);
  const locals = specs.map((sp) => {
    const q = new Quaternion().setFromUnitVectors(
      new Vector3(0, 0, 1),
      sp.normal.clone().normalize(),
    );
    return { q, p: sp.position.clone() };
  });
  const m = new Matrix4();
  const local = new Matrix4();
  const inv = new Matrix4();
  const scale = new Vector3();
  return (t) => {
    root.updateWorldMatrix(true, false);
    inv.copy(root.matrixWorld).invert();
    specs.forEach((sp, i) => {
      const k = sp.scaleAt(t) * sp.radius;
      sp.parent.updateWorldMatrix(true, false);
      local.compose(locals[i]!.p, locals[i]!.q, scale.setScalar(Math.max(k, 0)));
      m.multiplyMatrices(inv, sp.parent.matrixWorld).multiply(local);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
}

interface SeatPlacement {
  /** H-point en el marco local del vehículo de three.js (x adelante, y arriba, z a la derecha). */
  hip: Vector3;
  driver: boolean;
}

export function seatPlacement(seat: string, v: Resultado["vehiculos"][number]): SeatPlacement {
  const L = v.dimensiones.largo_m;
  const W = v.dimensiones.ancho_m;
  const dims = {
    length: L,
    width: W,
    height: v.dimensiones.alto_m,
    wheelbase: v.dimensiones.distancia_entre_ejes_m,
  };
  // Cabina adelantada (autobús, camión, combi, van): la primera fila va casi al frente.
  const front = FRONT_CAB.has(v.clase) ? 0.5 * L - 1.3 : -0.05 * L - 0.15;
  const y = Math.max(0.35, seatHeight(v.clase, dims) - 0.1);
  const side = Math.max(0.2, W / 2 - 0.5);
  const rows: Record<string, [number, number]> = {
    conductor: [front, -side],
    copiloto: [front, side],
    trasero_izquierdo: [front - 0.9, -side],
    trasero_centro: [front - 0.9, 0],
    trasero_derecho: [front - 0.9, side],
    tercera_fila: [front - 1.8, 0],
    otro: [front - 0.9, 0],
  };
  const [x, z] = rows[seat] ?? rows.otro!;
  return { hip: new Vector3(x, y, z), driver: seat === "conductor" };
}

/** Lugar del interior que alcanza el ocupante (marco local del vehículo de three.js). */
export function contactZonePosition(zona: string, hip: Vector3, width: number): Vector3 {
  const p = hip.clone();
  if (zona.startsWith("volante") || zona === "tablero" || zona === "interior de adelante") {
    p.x += 0.55;
    p.y += 0.42;
  } else if (zona.startsWith("respaldo del asiento")) {
    p.x += 0.65;
    p.y += 0.5;
  } else if (zona.startsWith("puerta")) {
    p.z = (zona.includes("izquierdo") ? -1 : 1) * (width / 2 - 0.08);
    p.x += 0.1;
    p.y += 0.55;
  } else if (zona === "respaldo y cabecera") {
    p.x -= 0.22;
    p.y += 0.75;
  } else {
    p.z += hip.z > 0 ? -0.35 : hip.z < 0 ? 0.35 : zona.includes("izquierdo") ? -0.35 : 0.35;
    p.x += 0.15;
    p.y += 0.3;
  }
  return p;
}

function sampleSeries(t: readonly number[], v: readonly number[], x: number): number {
  if (t.length === 0) return 0;
  if (x <= t[0]!) return v[0] ?? 0;
  if (x >= t[t.length - 1]!) return v[v.length - 1] ?? 0;
  let lo = 0;
  let hi = t.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const f = (x - t[lo]!) / (t[hi]! - t[lo]!);
  return v[lo]! + (v[hi]! - v[lo]!) * f;
}

/** Distancia acumulada a lo largo de la trayectoria (para la fase de la marcha). */
function cumulative(tr: PersonaResultado["trayectoria"]): number[] {
  const out = [0];
  for (let i = 1; i < tr.t.length; i++) {
    out.push(out[i - 1]! + dmath.hypot(tr.x[i]! - tr.x[i - 1]!, tr.y[i]! - tr.y[i - 1]!));
  }
  return out;
}

/** Direcciones de los segmentos según la fase del solver en t (marcha, de pie o montado). */
function directionsForPhase(
  data: PersonaResultado,
  dist: number[],
  t: number,
): Partial<Record<BoneName, Vector3>> {
  const fase = phaseAt(data.fases, t)?.fase ?? "de_pie";
  if (fase === "caminando") {
    const d = sampleSeries(data.trayectoria.t, dist, t);
    const stride = 2 * STEP_LENGTH_FACTOR * data.estatura_m;
    return walkingDirections(d / stride);
  }
  if (fase === "montado") return ridingDirections();
  return standingDirections();
}

function poseForPhase(
  bones: readonly BoneSpec[],
  data: PersonaResultado,
  dist: number[],
  t: number,
): Pose {
  return poseFromDirections(bones, directionsForPhase(data, dist, t));
}

/** Lugar y orientación del contenedor del cuerpo en t (marco de three.js), o null sin datos. */
export function placementAt(
  data: PersonaResultado,
  veh: Resultado["vehiculos"][number] | undefined,
  bones: readonly BoneSpec[],
  stature: number,
  t: number,
): { position: Vector3; yaw: number } | null {
  const pose = samplePerson(data.trayectoria, t);
  if (!pose) return null;
  const [x, , z] = toThree(pose.x, pose.y, 0);
  const fase = phaseAt(data.fases, t)?.fase;
  const seatY =
    fase === "montado" && veh
      ? Math.max(
          0.3,
          seatHeight(veh.clase, {
            length: veh.dimensiones.largo_m,
            width: veh.dimensiones.ancho_m,
            height: veh.dimensiones.alto_m,
            wheelbase: veh.dimensiones.distancia_entre_ejes_m,
          }) -
            bones[0]!.cabeza[1] * stature,
        )
      : 0;
  return { position: new Vector3(x, seatY, z), yaw: pose.yaw + BODY_TO_HEADING };
}

export interface RagdollSetup {
  input: RagdollInput;
  target: number;
  band: [number, number];
  kind: "peaton" | "jinete";
}

/** Variaciones con semilla del arranque del ragdoll (postura, dirección y giro). */
export const SEED_POSE_JITTER_DEG = 6;
export const SEED_HEADING_JITTER_DEG = 3;
export const SEED_SPIN_JITTER = 0.25;

/**
 * Entrada del ragdoll de una persona proyectada: pose en t = 0, velocidad de lanzamiento del
 * solver, fricción cuerpo–suelo, vehículos y objetos con los que puede chocar, y objetivo y banda
 * de Searle. Con `seed`, varía la postura (±6° por segmento), la dirección (±3°) y el giro
 * inicial (±25 %); sin ella, la semilla sale de la escena y la persona.
 */
export function ragdollSetup(
  spec: EscenaSpec,
  resultado: Resultado,
  data: PersonaResultado,
  entry: BodyManifestEntry,
  opts: { massKg: number; statics?: StaticCollider[]; seed?: number },
): RagdollSetup {
  const proj = data.proyeccion;
  if (!proj) throw new Error(`La persona ${data.id} no tiene proyección`);
  const bones = entry.huesos;
  const stature = data.estatura_m;
  const veh = data.vehiculo_id
    ? resultado.vehiculos.find((v) => v.id === data.vehiculo_id)
    : undefined;
  const twoWheel = veh ? profileFor(veh.clase).kind === "two_wheel" : false;
  const seed = opts.seed ?? seedFor(spec, data.id);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const jitter = (a: number): number => (2 * rng() - 1) * a;
  const placement = placementAt(data, veh, bones, stature, 0)!;
  const dist = cumulative(data.trayectoria);
  const dirs = directionsForPhase(data, dist, 0);
  const DEGR = Math.PI / 180;
  for (const key of Object.keys(dirs) as (keyof typeof dirs)[]) {
    const d = dirs[key];
    if (!d) continue;
    const axis = new Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    dirs[key] = applyAxisAngle(d.clone(), axis, jitter(SEED_POSE_JITTER_DEG) * DEGR);
  }
  const joints = posedJoints(bones, poseFromDirections(bones, dirs));
  const rot = quatFromAxisAngle(Y, placement.yaw);
  const initial = new Map<string, { head: Vector3; world: Quaternion }>();
  for (const [name, j] of joints) {
    initial.set(name, {
      head: j.head.clone().multiplyScalar(stature).applyQuaternion(rot).add(placement.position),
      world: rot.clone().multiply(j.world),
    });
  }
  const h = (proj.rumbo_deg + jitter(SEED_HEADING_JITTER_DEG)) * DEGR;
  const th = proj.angulo_lanzamiento_deg * DEGR;
  const v = proj.velocidad_lanzamiento_kmh / 3.6;
  const dir = new Vector3(
    dmath.cos(h) * dmath.cos(th),
    dmath.sin(th),
    -dmath.sin(h) * dmath.cos(th),
  );
  const horiz = new Vector3(dmath.cos(h), 0, -dmath.sin(h));
  const omega = horiz
    .clone()
    .cross(Y)
    .multiplyScalar(((0.8 * v) / stature) * (1 + jitter(SEED_SPIN_JITTER)));
  return {
    input: {
      bones,
      stature,
      massKg: opts.massKg,
      initial,
      velocity: dir.multiplyScalar(v),
      angularVelocity: omega,
      mu: proj.friccion_cuerpo.valor,
      vehicles: kinematicVehicles(resultado, eventVehicles(resultado, data.id, veh?.id)),
      statics: opts.statics ?? staticColliders(resultado),
      t0: 0,
      tEnd: resultado.t_fin,
      seed,
    },
    target: proj.distancia_m,
    band: [proj.banda_searle_m[0], proj.banda_searle_m[1]],
    kind: twoWheel ? "jinete" : "peaton",
  };
}

const tmpQ = new Quaternion();

/** Coloca los huesos con las poses del ragdoll (mundo) bajo un contenedor en el origen. */
function applyRagdoll(
  inst: BodyInstance,
  bones: readonly BoneSpec[],
  result: RagdollResult,
  t: number,
  stature: number,
): void {
  const world = new Map<string, Quaternion>();
  bones.forEach((b, i) => {
    const bone = inst.bones.get(b.nombre);
    if (!bone) return;
    const head = new Vector3();
    const q = new Quaternion();
    ragdollPoseAt(result.bake, i, t, head, q);
    world.set(b.nombre, q);
    if (!b.padre) {
      bone.position.copy(head).multiplyScalar(1 / stature);
      bone.quaternion.copy(q);
    } else {
      const pq = world.get(b.padre) ?? new Quaternion();
      bone.quaternion.copy(tmpQ.copy(pq).invert().multiply(q));
    }
  });
}

/**
 * Agrega los cuerpos a la escena y hornea los ragdolls. Oculta los maniquíes del grafo de las
 * personas que reemplaza. `templates` trae las variantes ya cargadas.
 */
export async function attachPeople(
  spec: EscenaSpec,
  resultado: Resultado,
  graph: SceneGraph,
  templates: Map<BodyVariant, BodyTemplate>,
): Promise<PeopleAttachment> {
  const specById = new Map<string, PersonaSpec>(spec.personas.map((p) => [p.id, p]));
  const vehicleById = new Map(resultado.vehiculos.map((v) => [v.id, v]));
  const nodeById = new Map(graph.vehicles.map((n) => [n.id, n]));
  const group = new Group();
  group.name = "personas_articuladas";
  graph.root.add(group);
  const mats: Material[] = [];
  const reports: RagdollReport[] = [];
  const markerSpecs: MarkerSpec[] = [];
  const statics = staticColliders(resultado);
  const updaters: ((t: number) => void)[] = [];

  for (const data of resultado.personas) {
    const ps = specById.get(data.id);
    const variant = variantForAge(ps?.edad_aprox?.valor);
    const template = templates.get(variant);
    if (!template) continue;
    const stature = data.estatura_m;
    const massDecl = ps?.masa
      ? ps.masa.valor * (ps.masa.unidad === "lb" ? 0.45359237 : ps.masa.unidad === "t" ? 1000 : 1)
      : undefined;
    const inst = instantiateBody(
      template,
      paletteFor(data.id, variant),
      complexionInfluences(massDecl, stature, variant),
    );
    const bones = template.entry.huesos;
    const container = new Group();
    container.name = `cuerpo_${data.id}`;
    container.scale.setScalar(stature);
    container.add(inst.root);
    const mannequin = graph.persons.find((n) => n.id === data.id);
    const veh = data.vehiculo_id ? vehicleById.get(data.vehiculo_id) : undefined;
    const twoWheel = veh ? profileFor(veh.clase).kind === "two_wheel" : false;

    if (data.ocupante && veh) {
      // Ocupante: dentro del vehículo, con su desplazamiento relativo al habitáculo.
      const node = nodeById.get(veh.id);
      if (!node) continue;
      const seat = seatPlacement(data.ocupante.asiento, veh);
      const base = seat.driver ? drivingDirections() : passengerDirections();
      container.rotation.y = BODY_TO_HEADING;
      const hipBody = applyAxisAngle(
        new Vector3(...bones[0]!.cabeza).multiplyScalar(stature),
        Y,
        BODY_TO_HEADING,
      );
      container.position.copy(seat.hip).sub(hipBody);
      // Dentro de un vehículo cerrado la sombra la da la carrocería: el cuerpo no la proyecta
      // (ahorra un pase de sombras con piel por ocupante sin cambio visible).
      inst.mesh.castShadow = false;
      node.group.add(container);
      const variantData =
        data.ocupante.variantes.find(
          (v) => v.cinturon === (data.ocupante?.cinturon_declarado ?? true),
        ) ?? data.ocupante.variantes[0]!;
      const torso = 0.3 * stature;
      const tContactOcc = variantData.contacto?.t_s ?? Infinity;
      if (variantData.contacto) {
        markerSpecs.push({
          parent: node.group,
          position: contactZonePosition(
            variantData.contacto.zona,
            seat.hip,
            veh.dimensiones.ancho_m,
          ),
          normal: new Vector3(-1, 0, 0),
          radius: 0.08,
          scaleAt: (t) => {
            const since = t - tContactOcc;
            return since < 0 ? 0 : since < 0.6 ? 1 + 0.15 * dmath.sin(8 * since) : 1;
          },
        });
      }
      const tLast = variantData.t[variantData.t.length - 1] ?? 0;
      // La postura solo cambia durante el pulso: se recalcula cuando cambia el instante (1 ms).
      let lastKey = NaN;
      updaters.push((t) => {
        const key = t < 0 ? -1 : Math.round(Math.min(t, tLast) * 1000);
        if (key !== lastKey) {
          lastKey = key;
          const tau = Math.min(Math.max(0, t), tLast);
          const dx = t < 0 ? 0 : sampleSeries(variantData.t, variantData.dx, tau);
          const dy = t < 0 ? 0 : sampleSeries(variantData.t, variantData.dy, tau);
          applyPose(inst.bones, poseFromDirections(bones, occupantLean(base, dx, dy, torso)));
        }
      });
    } else if (data.proyeccion) {
      // Peatón golpeado o jinete proyectado: camina o va montado hasta el impacto; después,
      // ragdoll calibrado contra la banda de Searle.
      group.add(container);
      const dist = cumulative(data.trayectoria);
      const setup = ragdollSetup(spec, resultado, data, template.entry, {
        massKg: massDecl ?? defaultMass(variant, stature),
        statics,
      });
      const result = await calibrateRagdoll(setup.input, setup.target, setup.band);
      reports.push({
        personId: data.id,
        kind: setup.kind,
        target: result.target,
        band: result.band,
        distance: result.distance,
        inBand: result.inBand,
        k: result.k,
        iterations: result.iterations,
        uncalibrated: result.uncalibrated,
        frames: result.bake.frames,
      });
      // Después del reposo del ragdoll la pose ya no cambia.
      const tHold = result.bake.t0 + (result.bake.steps - 1) * result.bake.dt;
      let lastRagKey = NaN;
      updaters.push((t) => {
        if (t >= 0) {
          const key = Math.round(Math.min(t, tHold) * 1000);
          if (key === lastRagKey) return;
          lastRagKey = key;
        } else lastRagKey = NaN;
        if (t < 0) {
          const pl = placementAt(data, veh, bones, stature, t);
          if (pl) {
            container.position.copy(pl.position);
            container.rotation.set(0, pl.yaw, 0);
          }
          inst.bones.get(bones[0]!.nombre)?.position.set(...bones[0]!.cabeza);
          applyPose(inst.bones, poseForPhase(bones, data, dist, t));
        } else {
          container.position.set(0, 0, 0);
          container.rotation.set(0, 0, 0);
          applyRagdoll(inst, bones, result, t, stature);
        }
      });
      // Indicadores de contacto en el frente del vehículo que golpea a la persona peatona.
      if (setup.kind === "peaton") markerSpecs.push(...pedestrianMarkers(resultado, data, graph));
    } else if (veh && twoWheel) {
      // Jinete que no sale proyectado: montado toda la escena.
      group.add(container);
      const seatTop = seatHeight(veh.clase, {
        length: veh.dimensiones.largo_m,
        width: veh.dimensiones.ancho_m,
        height: veh.dimensiones.alto_m,
        wheelbase: veh.dimensiones.distancia_entre_ejes_m,
      });
      const riding = poseFromDirections(bones, ridingDirections());
      updaters.push((t) => {
        const p = sampleVehicle(veh.trayectoria, t);
        const [x, , z] = toThree(p.x, p.y, 0);
        container.position.set(x, Math.max(0.3, seatTop - bones[0]!.cabeza[1] * stature), z);
        container.rotation.set(0, p.yaw + BODY_TO_HEADING, 0);
        applyPose(inst.bones, riding);
      });
    } else if (data.trayectoria.t.length > 0) {
      // Persona a pie que no participa en el impacto.
      group.add(container);
      const dist = cumulative(data.trayectoria);
      updaters.push((t) => {
        const pose = samplePerson(data.trayectoria, t);
        if (!pose) return;
        const [x, , z] = toThree(pose.x, pose.y, 0);
        container.position.set(x, 0, z);
        container.rotation.set(0, pose.yaw + BODY_TO_HEADING, 0);
        applyPose(inst.bones, poseForPhase(bones, data, dist, t));
      });
    } else {
      continue;
    }
    if (mannequin) {
      mannequin.group.visible = false;
      mannequin.mode = "a_bordo_oculto";
    }
  }
  graph.addUpdater((t) => {
    for (const fn of updaters) fn(t);
  });
  // Los aros siguen a los vehículos ya colocados: actualización posterior.
  if (markerSpecs.length > 0)
    graph.addUpdater(markerBatch(markerSpecs, graph.root, mats), { after: true });
  const markers = markerSpecs.length;
  return { bodies: group.children.length + markers, ragdolls: reports, markers };
}

/** Aros neutros donde la defensa, el borde del cofre y la cabeza tocan a la persona peatona. */
function pedestrianMarkers(
  resultado: Resultado,
  data: PersonaResultado,
  graph: SceneGraph,
): MarkerSpec[] {
  const ev = resultado.eventos.find(
    (e) => e.tipo === "impacto_vehiculo_persona" && e.actores.includes(data.id),
  );
  const vid = ev?.actores.find((a) => a !== data.id);
  const v = vid ? resultado.vehiculos.find((x) => x.id === vid) : undefined;
  const node = vid ? graph.vehicles.find((n) => n.id === vid) : undefined;
  if (!v || !node || !data.proyeccion) return [];
  const c = data.proyeccion.contacto;
  const L = v.dimensiones.largo_m;
  const H = v.dimensiones.alto_m;
  // Desplazamiento lateral de la persona respecto al eje del vehículo en el impacto.
  const pv = sampleVehicle(v.trayectoria, 0);
  const pp = samplePerson(data.trayectoria, 0);
  const lateral = pp ? (pp.x - pv.x) * dmath.sin(pv.yaw) - (pp.y - pv.y) * dmath.cos(pv.yaw) : 0;
  const z = Math.max(
    -v.dimensiones.ancho_m / 2 + 0.1,
    Math.min(v.dimensiones.ancho_m / 2 - 0.1, lateral),
  );
  const spots: { pos: Vector3; normal: Vector3 }[] = [];
  if (c.defensa)
    spots.push({ pos: new Vector3(L / 2 + 0.01, 0.32 * H, z), normal: new Vector3(1, 0, 0) });
  if (c.borde_cofre)
    spots.push({ pos: new Vector3(L / 2 - 0.03, 0.55 * H, z), normal: new Vector3(1, 0.5, 0) });
  if (c.cabeza === "cofre")
    spots.push({ pos: new Vector3(L / 2 - 0.45, 0.6 * H, z), normal: Y.clone() });
  else if (c.cabeza === "parabrisas")
    spots.push({ pos: new Vector3(L / 2 - 0.3 * L, 0.78 * H, z), normal: new Vector3(0.6, 1, 0) });
  else if (c.cabeza === "techo")
    spots.push({ pos: new Vector3(0, H + 0.01, z), normal: Y.clone() });
  return spots.map((sp) => ({
    parent: node.group,
    position: sp.pos,
    normal: sp.normal,
    radius: 0.1,
    scaleAt: (t: number) => (t >= 0 ? 1 : 0),
  }));
}
