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
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
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
  type BodyTemplate,
  type BodyVariant,
} from "./body-assets";
import { toThree } from "./coords";
import type { KinematicBox, StaticCollider } from "./debris";
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
  type BoneSpec,
  type Pose,
} from "./person-pose";
import { calibrateRagdoll, ragdollPoseAt, type RagdollResult } from "./person-ragdoll";
import { phaseAt, samplePerson, sampleVehicle } from "./sample";
import type { SceneGraph } from "./scene-graph";
import { profileFor, seatHeight } from "./vehicle-geometry";

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

function markerMesh(mats: Material[], radius = 0.09): Group {
  const g = new Group();
  g.name = "indicador_contacto";
  const ringMat = new MeshBasicMaterial({ color: MARKER_COLOR, transparent: true, opacity: 0.85 });
  const discMat = new MeshBasicMaterial({
    color: MARKER_COLOR,
    transparent: true,
    opacity: 0.25,
    side: DoubleSide,
    depthWrite: false,
  });
  mats.push(ringMat, discMat);
  const ring = new Mesh(new TorusGeometry(radius, radius * 0.13, 8, 32), ringMat);
  const disc = new Mesh(new RingGeometry(0, radius, 32), discMat);
  g.add(ring, disc);
  return g;
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
    out.push(out[i - 1]! + Math.hypot(tr.x[i]! - tr.x[i - 1]!, tr.y[i]! - tr.y[i - 1]!));
  }
  return out;
}

function poseForPhase(
  bones: readonly BoneSpec[],
  data: PersonaResultado,
  dist: number[],
  t: number,
): Pose {
  const fase = phaseAt(data.fases, t)?.fase ?? "de_pie";
  if (fase === "caminando") {
    const d = sampleSeries(data.trayectoria.t, dist, t);
    const stride = 2 * 0.415 * data.estatura_m;
    return poseFromDirections(bones, walkingDirections(d / stride));
  }
  if (fase === "montado") return poseFromDirections(bones, ridingDirections());
  return poseFromDirections(bones, standingDirections());
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
  let markers = 0;
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
      const hipBody = new Vector3(...bones[0]!.cabeza)
        .multiplyScalar(stature)
        .applyAxisAngle(Y, BODY_TO_HEADING);
      container.position.copy(seat.hip).sub(hipBody);
      node.group.add(container);
      const variantData =
        data.ocupante.variantes.find(
          (v) => v.cinturon === (data.ocupante?.cinturon_declarado ?? true),
        ) ?? data.ocupante.variantes[0]!;
      const torso = 0.3 * stature;
      let marker: Group | undefined;
      if (variantData.contacto) {
        marker = markerMesh(mats, 0.08);
        marker.position.copy(
          contactZonePosition(variantData.contacto.zona, seat.hip, veh.dimensiones.ancho_m),
        );
        marker.lookAt(marker.position.clone().add(new Vector3(-1, 0, 0)));
        marker.scale.setScalar(1e-4);
        node.group.add(marker);
        markers++;
      }
      const tContact = variantData.contacto?.t_s ?? Infinity;
      updaters.push((t) => {
        const tau = Math.max(0, t);
        const dx = t < 0 ? 0 : sampleSeries(variantData.t, variantData.dx, tau);
        const dy = t < 0 ? 0 : sampleSeries(variantData.t, variantData.dy, tau);
        applyPose(inst.bones, poseFromDirections(bones, occupantLean(base, dx, dy, torso)));
        if (marker) {
          const on = t >= tContact;
          const pulse = on ? 1 + 0.15 * Math.sin(8 * (t - tContact)) : 1e-4;
          marker.scale.setScalar(pulse);
        }
      });
    } else if (data.proyeccion) {
      // Peatón golpeado o jinete proyectado: camina o va montado hasta el impacto; después,
      // ragdoll calibrado contra la banda de Searle.
      group.add(container);
      const proj = data.proyeccion;
      const dist = cumulative(data.trayectoria);
      const placeAt = (t: number): void => {
        const pose = samplePerson(data.trayectoria, t);
        if (!pose) return;
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
        container.position.set(x, seatY, z);
        container.rotation.set(0, pose.yaw + BODY_TO_HEADING, 0);
      };
      // Pose inicial del ragdoll: la de t = 0.
      placeAt(0);
      const pose0 = poseForPhase(bones, data, dist, 0);
      const joints = posedJoints(bones, pose0);
      const rot = new Quaternion().setFromAxisAngle(Y, container.rotation.y);
      const initial = new Map<string, { head: Vector3; world: Quaternion }>();
      for (const [name, j] of joints) {
        initial.set(name, {
          head: j.head.clone().multiplyScalar(stature).applyQuaternion(rot).add(container.position),
          world: rot.clone().multiply(j.world),
        });
      }
      const h = (proj.rumbo_deg * Math.PI) / 180;
      const th = (proj.angulo_lanzamiento_deg * Math.PI) / 180;
      const v = proj.velocidad_lanzamiento_kmh / 3.6;
      const dir = new Vector3(
        Math.cos(h) * Math.cos(th),
        Math.sin(th),
        -Math.sin(h) * Math.cos(th),
      );
      const horiz = new Vector3(Math.cos(h), 0, -Math.sin(h));
      const omega = horiz
        .clone()
        .cross(Y)
        .multiplyScalar((0.8 * v) / stature);
      const kind = twoWheel ? "jinete" : "peaton";
      const result = await calibrateRagdoll(
        {
          bones,
          stature,
          massKg: massDecl ?? defaultMass(variant, stature),
          initial,
          velocity: dir.multiplyScalar(v),
          angularVelocity: omega,
          mu: proj.friccion_cuerpo.valor,
          vehicles: kinematicVehicles(resultado, eventVehicles(resultado, data.id, veh?.id)),
          statics,
          t0: 0,
          tEnd: resultado.t_fin,
          seed: seedFor(spec, data.id),
        },
        proj.distancia_m,
        [proj.banda_searle_m[0], proj.banda_searle_m[1]],
      );
      reports.push({
        personId: data.id,
        kind,
        target: result.target,
        band: result.band,
        distance: result.distance,
        inBand: result.inBand,
        k: result.k,
        iterations: result.iterations,
        uncalibrated: result.uncalibrated,
      });
      updaters.push((t) => {
        if (t < 0) {
          placeAt(t);
          inst.bones.get(bones[0]!.nombre)?.position.set(...bones[0]!.cabeza);
          applyPose(inst.bones, poseForPhase(bones, data, dist, t));
        } else {
          container.position.set(0, 0, 0);
          container.rotation.set(0, 0, 0);
          applyRagdoll(inst, bones, result, t, stature);
        }
      });
      // Indicadores de contacto en el frente del vehículo que golpea a la persona peatona.
      if (kind === "peaton") markers += addPedestrianMarkers(resultado, data, graph, mats);
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
  return { bodies: group.children.length + markers, ragdolls: reports, markers };
}

/** Aros neutros donde la defensa, el borde del cofre y la cabeza tocan a la persona peatona. */
function addPedestrianMarkers(
  resultado: Resultado,
  data: PersonaResultado,
  graph: SceneGraph,
  mats: Material[],
): number {
  const ev = resultado.eventos.find(
    (e) => e.tipo === "impacto_vehiculo_persona" && e.actores.includes(data.id),
  );
  const vid = ev?.actores.find((a) => a !== data.id);
  const v = vid ? resultado.vehiculos.find((x) => x.id === vid) : undefined;
  const node = vid ? graph.vehicles.find((n) => n.id === vid) : undefined;
  if (!v || !node || !data.proyeccion) return 0;
  const c = data.proyeccion.contacto;
  const L = v.dimensiones.largo_m;
  const H = v.dimensiones.alto_m;
  // Desplazamiento lateral de la persona respecto al eje del vehículo en el impacto.
  const pv = sampleVehicle(v.trayectoria, 0);
  const pp = samplePerson(data.trayectoria, 0);
  const lateral = pp ? -(-(pp.x - pv.x) * Math.sin(pv.yaw) + (pp.y - pv.y) * Math.cos(pv.yaw)) : 0;
  const z = Math.max(
    -v.dimensiones.ancho_m / 2 + 0.1,
    Math.min(v.dimensiones.ancho_m / 2 - 0.1, lateral),
  );
  const spots: { pos: Vector3; normal: Vector3 }[] = [];
  if (c.defensa)
    spots.push({ pos: new Vector3(L / 2 + 0.01, 0.32 * H, z), normal: new Vector3(1, 0, 0) });
  if (c.borde_cofre)
    spots.push({
      pos: new Vector3(L / 2 - 0.03, 0.55 * H, z),
      normal: new Vector3(1, 0.5, 0).normalize(),
    });
  if (c.cabeza === "cofre")
    spots.push({ pos: new Vector3(L / 2 - 0.45, 0.6 * H, z), normal: Y.clone() });
  else if (c.cabeza === "parabrisas")
    spots.push({
      pos: new Vector3(L / 2 - 0.3 * L, 0.78 * H, z),
      normal: new Vector3(0.6, 1, 0).normalize(),
    });
  else if (c.cabeza === "techo")
    spots.push({ pos: new Vector3(0, H + 0.01, z), normal: Y.clone() });
  for (const s of spots) {
    const m = markerMesh(mats, 0.1);
    m.position.copy(s.pos);
    m.lookAt(s.pos.clone().add(s.normal));
    m.scale.setScalar(1e-4);
    node.group.add(m);
    graph.addUpdater((t) => m.scale.setScalar(t >= 0 ? 1 : 1e-4));
  }
  return spots.length;
}
