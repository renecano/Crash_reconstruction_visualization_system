/**
 * Orquestador (port de `croquis_solver.reconstruct`): de una EscenaSpec validada a una
 * reconstrucción determinista.
 *
 * Pasos: modelos de vehículo desde el contrato y la tabla de clases; punto de contacto común
 * según las zonas CDC; fase previa sobre la geometría declarada en una rejilla alineada a t = 0;
 * impacto principal (impulso planar, objeto fijo o proyección de Searle); perfiles CRASH3;
 * movimiento posterior hasta el reposo; trayectorias de personas; banderas; volcadura y
 * visibilidad. La salida sigue `resultado.schema.json` (sin los bloques de Monte Carlo,
 * inversión y consistencia, que llegan al port en F9).
 */
import { VEHICLE_CLASSES } from "@croquis/scene-schema";
import { type ContactSolution, contactOffset, Locus, resolveContact } from "./contact";
import { profileForEnergy, TRIANGULAR_SHAPES } from "./crash3";
import { narrowObject } from "./fixed-object";
import { absPeakFactor, pedestrianFriction, tireFriction } from "./friction";
import { planarImpact, pdofHours, type ImpactResult } from "./impact";
import {
  Body2D,
  rot,
  type State2D,
  Trajectory,
  type Vec,
  withVelocity,
  speed as stateSpeed,
  wrapAngle,
} from "./models";
import { occupantMotions, maxDisplacement, peakG, pulseFor } from "./occupant";
import {
  contactZones,
  searleDistanceBand,
  searleRange,
  searleThrow,
  vehicleSpeedRangeFromThrow,
} from "./pedestrian";
import {
  approachTrack,
  PersonTrack,
  restTrack,
  rideTrack,
  straightWalkTrack,
  throwTrack,
} from "./person-motion";
import { fourWheels, integrate, ROLLING_RESISTANCE } from "./postimpact";
import {
  ArcPath,
  brakingDeceleration,
  CompositePath,
  LaneChangePath,
  type Path as KinPath,
  SpeedProfile,
  StraightPath,
} from "./preimpact";
import { degrees, pyRound, pySum, radians, str } from "./pymath";
import { laneFollowingPath, roadAxis, type RoadAxis } from "./road";
import { CG_HEIGHT_FRACTION, type RolloverCheck, rolloverToDict, tripCheck } from "./rollover";
import { type SceneObject, sceneObjects, sceneObjectToDict } from "./scene-objects";
import { stiffnessFor, zonaFromCdcSide } from "./stiffness";
import { msToKmh } from "./units";
import {
  Actor,
  analyzePair,
  EYE_HEIGHT_M,
  NIGHT_DETECTION_M,
  NIGHT_DETECTION_RANGE_M,
  objectOccluders,
  Observer,
  pairSummary,
  SAMPLE_DT,
} from "./visibility";

type Json = Record<string, unknown>;

export const RESULT_VERSION = "1.4.0";
export const DT_OUT = 0.02;
const T_PRE_MAX = 6.0;
const T_PRE_MIN = 3.0;
const T_HOLD_AFTER_REST = 2.0;
const T_POST_MAX = 30.0;
const RESTITUTION_VV = 0.1;
const IMPULSE_RATIO = 0.4;
const POST_IMPACT_DRAG_FRACTION = 0.35;
const TURN_RADIUS_M = 8.0;
const LANE_CHANGE_LENGTH_M = 40.0;
const LANE_WIDTH_DEFAULT = 3.5;
const DEFAULT_BRAKE_BEFORE_IMPACT_S = 0.6;
const SEARCH_LENGTH_M = 400.0;
const CONTACT_GAP_FLAG_M = 0.5;
const SEEK_CONTACT_FRACTION = 0.75;
const PATH_TIE_M = 0.05;
export const PEDESTRIAN_LAUNCH_ANGLE_DEG = 10.0;
export const PEDESTRIAN_CG_HEIGHT_FACTOR = 0.57;
export const PEDESTRIAN_PROJECTION_FACTOR = 0.9;
const PEDESTRIAN_CRUSH_ENERGY_FRACTION = 0.1;
const WALKING_SPEED_MS = 1.4;
const DEFAULT_STATURE_M = 1.7;
const DEFAULT_PERSON_MASS_KG = 75.0;
const TRACK_WIDTH_FRACTION = 0.84;
const TWO_WHEEL_CLASSES = new Set(["motocicleta", "scooter", "bicicleta"]);
const RIDER_ROLES = new Set(["motociclista", "ciclista"]);
const RIDER_CG_HEIGHT_M: Readonly<Record<string, number>> = {
  motocicleta: 1.05,
  scooter: 1.0,
  bicicleta: 1.15,
};
const RIDER_PROJECTION_FACTOR = 0.9;

const MASS: Readonly<Record<string, number>> = { kg: 1.0, t: 1000.0, lb: 0.45359237 };
const LEN: Readonly<Record<string, number>> = { m: 1.0, cm: 0.01, mm: 0.001, km: 1000.0 };
const SPEED: Readonly<Record<string, number>> = { "km/h": 1 / 3.6, "m/s": 1.0 };
const ANGLE: Readonly<Record<string, number>> = { deg: 1.0, rad: 180.0 / Math.PI };

/** `f"{x:.{nd}f}"` de Python: redondeo al par en empates exactos y "-0.0" para negativos. */
export function pyFixed(x: number, nd: number): string {
  const neg = x < 0 || Object.is(x, -0);
  return (neg ? "-" : "") + pyRound(Math.abs(x), nd).toFixed(nd);
}

/** `str(x)` de Python para un flotante en un mensaje. */
function pyFloatStr(x: number): string {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

/** `round(x, nd)` sin −0.0. */
function r6(x: number, nd = 6): number {
  const v = pyRound(x, nd);
  return v === 0 ? 0.0 : v;
}

interface VehicleModel {
  id: string;
  rol: string;
  clase: string;
  body: Body2D;
  height: number;
  wheelbase: number;
  cgFromFront: number;
  track: number;
  v0: number;
  pose0: readonly [number, number, number];
  maniobra: string;
  braking: boolean;
  brakeDistance: number | null;
  abs: boolean;
}

export interface VehicleOutcome {
  id: string;
  rol: string;
  clase: string;
  involucrado: boolean;
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  mass: number;
  trajectory: Trajectory;
  vImpactKmh: number;
  deltaVKmh: number;
  pdofHours: number | null;
  crushProfileM: number[];
  crushWidthM: number;
  crushEnergyJ: number;
  crushCenterM: number;
  stiffnessOrigen: string;
  cdc: Json | null;
  stopped: boolean;
  restPose: readonly [number, number, number];
  distancePostM: number;
  rollover: RolloverCheck | null;
}

export interface ThrowOutcome {
  launchSpeedKmh: number;
  throwDistanceM: number;
  throwRangeM: readonly [number, number];
  restPosition: Vec;
  contact: Record<string, string>;
  bandM: readonly [number, number];
  muBody: readonly [number, number, number];
  launchAngleDeg: number;
  cgHeightM: number;
  headingRad: number;
}

interface ThrowInfo {
  personId: string;
  outcome: ThrowOutcome;
  origin: Vec;
  launch: number;
  mu: number;
  kind: "peaton" | "jinete";
  vehicleId: string | null;
}

export interface PersonOutcome {
  id: string;
  rol: string;
  statureM: number;
  vehiculoId: string | null;
  track: PersonTrack;
  throw: ThrowOutcome | null;
  occupant: Json | null;
}

/** Bandera estructurada: código estable y datos para convertirla en pregunta. */
export interface Aviso {
  codigo: string;
  mensaje: string;
  datos: Record<string, unknown>;
}

export interface EventOutcome {
  id: string;
  tipo: string;
  t: number;
  actores: string[];
  detalle: Record<string, unknown>;
}

export interface Reconstruction {
  escenaId: string;
  semilla: number;
  dt: number;
  tInicio: number;
  tFin: number;
  puntoImpacto: Vec | null;
  vehiculos: VehicleOutcome[];
  personas: PersonOutcome[];
  eventos: EventOutcome[];
  banderas: string[];
  parametros: Json;
  objetos: SceneObject[];
  visibilidad: Json[];
  avisos: Aviso[];
}

// ----------------------------------------------------------------------------------------------
// Salida (resultado.schema.json)
// ----------------------------------------------------------------------------------------------

export function reconstructionToDict(rec: Reconstruction): Json {
  const out: Json = {
    version_resultado: RESULT_VERSION,
    escena_id: rec.escenaId,
    semilla: rec.semilla,
    dt: rec.dt,
    t_inicio: r6(rec.tInicio),
    t_fin: r6(rec.tFin),
  };
  if (rec.puntoImpacto !== null) {
    out.punto_impacto = { x: r6(rec.puntoImpacto[0]), y: r6(rec.puntoImpacto[1]) };
  }
  out.vehiculos = rec.vehiculos.map(vehicleDict);
  out.personas = rec.personas.map(personDict);
  out.objetos = rec.objetos.map(sceneObjectToDict);
  out.visibilidad = [...rec.visibilidad];
  out.eventos = rec.eventos.map(eventDict);
  out.banderas = [...rec.banderas];
  out.parametros = rec.parametros;
  return out;
}

function vehicleDict(v: VehicleOutcome): Json {
  const tr = v.trajectory;
  const dano: Json = {
    perfil_m: v.crushProfileM.map((c) => r6(c)),
    ancho_m: r6(v.crushWidthM),
    centro_m: r6(v.crushCenterM),
    energia_j: r6(v.crushEnergyJ, 3),
    origen_rigidez: v.stiffnessOrigen,
  };
  if (v.cdc) {
    const cdc: Json = {};
    for (const k of ["lado", "zona_horizontal", "zona_vertical", "extension"]) {
      if (k in v.cdc) cdc[k] = v.cdc[k];
    }
    dano.cdc = cdc;
  }
  const d: Json = {
    id: v.id,
    rol: v.rol,
    clase: v.clase,
    involucrado: v.involucrado,
    dimensiones: {
      largo_m: r6(v.length),
      ancho_m: r6(v.width),
      alto_m: r6(v.height),
      distancia_entre_ejes_m: r6(v.wheelbase),
      masa_kg: r6(v.mass, 3),
    },
    trayectoria: {
      t: tr.t.map((x) => r6(x)),
      x: tr.x.map((x) => r6(x)),
      y: tr.y.map((x) => r6(x)),
      rumbo: tr.yaw.map((x) => r6(x)),
      vx: tr.vx.map((x) => r6(x)),
      vy: tr.vy.map((x) => r6(x)),
      vel_angular: tr.yawRate.map((x) => r6(x)),
    },
    v_impacto_kmh: r6(v.vImpactKmh),
    delta_v_kmh: r6(v.deltaVKmh),
  };
  if (v.pdofHours !== null) d.pdof_horas = r6(v.pdofHours);
  d.dano = dano;
  d.en_reposo = v.stopped;
  d.pose_final = { x: r6(v.restPose[0]), y: r6(v.restPose[1]), rumbo_deg: r6(v.restPose[2]) };
  d.distancia_post_m = r6(v.distancePostM);
  if (v.rollover !== null) d.volcadura = rolloverToDict(v.rollover);
  return d;
}

function personDict(p: PersonOutcome): Json {
  const tr = p.track;
  const d: Json = { id: p.id, rol: p.rol, estatura_m: r6(p.statureM) };
  if (p.vehiculoId !== null) d.vehiculo_id = p.vehiculoId;
  d.trayectoria = {
    t: tr.t.map((x) => r6(x)),
    x: tr.x.map((x) => r6(x)),
    y: tr.y.map((x) => r6(x)),
    z: tr.z.map((x) => r6(x)),
    rumbo: tr.yaw.map((x) => r6(x)),
  };
  d.fases = tr.fases.map((f) => ({ fase: f.fase, t_inicio: r6(f.tInicio), t_fin: r6(f.tFin) }));
  if (p.throw !== null) {
    const th = p.throw;
    d.proyeccion = {
      velocidad_lanzamiento_kmh: r6(th.launchSpeedKmh),
      distancia_m: r6(th.throwDistanceM),
      rango_m: [r6(th.throwRangeM[0]), r6(th.throwRangeM[1])],
      posicion_reposo: { x: r6(th.restPosition[0]), y: r6(th.restPosition[1]) },
      contacto: { ...th.contact },
      banda_searle_m: [r6(th.bandM[0]), r6(th.bandM[1])],
      friccion_cuerpo: { valor: r6(th.muBody[0]), rango: [r6(th.muBody[1]), r6(th.muBody[2])] },
      angulo_lanzamiento_deg: r6(th.launchAngleDeg),
      altura_cg_m: r6(th.cgHeightM),
      rumbo_deg: r6(degrees(th.headingRad)),
    };
  }
  if (p.occupant !== null) d.ocupante = p.occupant;
  return d;
}

function eventDict(e: EventOutcome): Json {
  const d: Json = { id: e.id, tipo: e.tipo, t: r6(e.t), actores: [...e.actores] };
  const keys = Object.keys(e.detalle);
  if (keys.length > 0) {
    const det: Json = {};
    for (const k of keys) {
      const val = e.detalle[k];
      if (typeof val === "boolean" || typeof val === "string") det[k] = val;
      else if (Array.isArray(val)) det[k] = val.map((x) => r6(Number(x)));
      else det[k] = r6(Number(val));
    }
    d.detalle = det;
  }
  return d;
}

// ----------------------------------------------------------------------------------------------
// Lectura del contrato (SI)
// ----------------------------------------------------------------------------------------------

function num(campo: unknown, table: Readonly<Record<string, number>>, dflt: number): number {
  if (!campo) return dflt;
  const c = campo as Json;
  return Number(c.valor) * (table[str(c.unidad)] ?? 1.0);
}

function classes(): Record<string, Json> {
  return VEHICLE_CLASSES as unknown as Record<string, Json>;
}

type Flag = (codigo: string, datos: Record<string, unknown>, mensaje: string) => void;

function vehicleModel(v: Json, clases: Record<string, Json>, flag: Flag): VehicleModel {
  const clase = String((v.clase as Json).valor);
  const tip = ((clases[clase] ?? {}).tipico ?? {}) as Record<string, number>;
  const mass = num(v.masa, MASS, Number(tip.masa_kg ?? 1200.0));
  const length = num(v.largo, LEN, Number(tip.largo_m ?? 4.4));
  const width = num(v.ancho, LEN, Number(tip.ancho_m ?? 1.75));
  const height = num(v.alto, LEN, Number(tip.alto_m ?? 1.5));
  const wbDefault = Number(tip.distancia_entre_ejes_m ?? 0.58 * length);
  const wheelbase = Math.min(num(v.distancia_entre_ejes, LEN, wbDefault), 0.9 * length);
  const pose = v.posicion_inicial as Json;
  const frenado = (v.frenado ?? {}) as Json;
  const aplico = (frenado.aplico ?? {}) as Json;
  const absCampo = (frenado.abs ?? {}) as Json;
  const braking = Boolean(aplico.valor ?? false);
  const dist = frenado.distancia_antes_impacto as Json | undefined;
  const maniobra = String((v.maniobra as Json).valor);
  let v0 = num(v.velocidad_previa, SPEED, 0.0);
  if (maniobra === "detenido" || maniobra === "estacionado") v0 = 0.0;
  if (!clases[clase] && (v.masa === undefined || v.masa === null)) {
    flag(
      "clase_sin_tabla",
      { vehiculo: v.id },
      `Vehículo ${String(v.rol)}: sin tabla de clase ni masa; se usa 1200 kg.`,
    );
  }
  return {
    id: String(v.id),
    rol: String(v.rol),
    clase,
    body: Body2D.fromDimensions(mass, length, width),
    height,
    wheelbase,
    cgFromFront: 0.45 * wheelbase,
    track: Math.max(TRACK_WIDTH_FRACTION * width, 0.4),
    v0,
    pose0: [Number(pose.x), Number(pose.y), radians(Number(pose.rumbo_deg))],
    maniobra,
    braking,
    brakeDistance: dist ? num(dist, LEN, 0.0) : null,
    abs: Boolean(absCampo.valor ?? false),
  };
}

/** La maniobra y, al terminarla, un tramo recto en el rumbo final. */
function thenStraight(part: KinPath, extra = 400.0): CompositePath {
  const end = part.pose(part.length);
  return new CompositePath([part, new StraightPath([end.x, end.y], end.heading, extra)]);
}

function pathFor(m: VehicleModel, laneWidth: number): KinPath {
  const [x, y, yaw] = m.pose0;
  const quarter = 0.5 * Math.PI * TURN_RADIUS_M;
  if (m.maniobra === "vuelta_izquierda") {
    return thenStraight(new ArcPath([x, y], yaw, TURN_RADIUS_M, quarter, true));
  }
  if (m.maniobra === "vuelta_derecha") {
    return thenStraight(new ArcPath([x, y], yaw, TURN_RADIUS_M, quarter, false));
  }
  if (m.maniobra === "vuelta_u") {
    const r = 0.75 * TURN_RADIUS_M;
    return thenStraight(new ArcPath([x, y], yaw, r, Math.PI * r, true));
  }
  if (m.maniobra === "cambio_carril_izquierda") {
    return thenStraight(new LaneChangePath([x, y], yaw, LANE_CHANGE_LENGTH_M, laneWidth));
  }
  if (m.maniobra === "cambio_carril_derecha") {
    return thenStraight(new LaneChangePath([x, y], yaw, LANE_CHANGE_LENGTH_M, -laneWidth));
  }
  if (m.maniobra === "reversa") return new StraightPath([x, y], wrapAngle(yaw + Math.PI), 500.0);
  return new StraightPath([x, y], yaw, 500.0);
}

/** Normal de una superficie fija, del vehículo hacia la superficie. */
function barrierNormal(obj: Json | null, point: Vec, axis: RoadAxis, st: State2D): Vec {
  let n: Vec;
  if (obj !== null && obj.rumbo_deg !== undefined && obj.rumbo_deg !== null) {
    const r = radians(Number(obj.rumbo_deg));
    n = [-Math.sin(r), Math.cos(r)];
  } else if (axis.kind === "recta") {
    n = [0.0, point[1] >= 0 ? 1.0 : -1.0];
  } else {
    const dx = point[0] - axis.center[0];
    const dy = point[1] - axis.center[1];
    const d = Math.hypot(dx, dy) || 1.0;
    const outward = d >= axis.radius;
    n = outward ? [dx / d, dy / d] : [-dx / d, -dy / d];
  }
  if (n[0] * st.vx + n[1] * st.vy < 0) n = [-n[0], -n[1]];
  return n;
}

/** Desvío suave que lleva el punto de contacto al objetivo (cuando nada más lo alcanza). */
function targetPath(m: VehicleModel, target: Vec, offset: Vec): CompositePath | null {
  const [x, y, yaw] = m.pose0;
  const dx = target[0] - x;
  const dy = target[1] - y;
  const fwd = dx * Math.cos(yaw) + dy * Math.sin(yaw);
  const left = -dx * Math.sin(yaw) + dy * Math.cos(yaw);
  const lateral = left - offset[1];
  const reach = fwd - offset[0];
  if (reach < 15.0 || Math.abs(lateral) < 0.3) return null;
  const uHit = SEEK_CONTACT_FRACTION;
  const change = reach / uHit;
  const total = lateral / (0.5 * (1.0 - Math.cos(Math.PI * uHit)));
  return thenStraight(new LaneChangePath([x, y], yaw, change, total));
}

/** Primero la trayectoria que sigue el carril (vía curva o glorieta), luego la literal. */
function pathCandidates(m: VehicleModel, laneWidth: number, axis: RoadAxis): KinPath[] {
  const literal = pathFor(m, laneWidth);
  let lateral: number | undefined = (
    { recto: 0.0, cambio_carril_izquierda: laneWidth } as Record<string, number>
  )[m.maniobra];
  if (m.maniobra === "cambio_carril_derecha") lateral = -laneWidth;
  if (lateral === undefined) return [literal];
  const follow = laneFollowingPath(axis, m.pose0, {
    lateral,
    changeLength: LANE_CHANGE_LENGTH_M,
  });
  return follow !== null ? [follow, literal] : [literal];
}

/** (x, y, rumbo, curvatura) para cualquier s; antes de s = 0 se extrapola en línea recta. */
function poseAt(path: KinPath, s: number): [number, number, number, number] {
  if (s >= 0) {
    const p = path.pose(Math.min(s, path.length));
    return [p.x, p.y, p.heading, p.curvature];
  }
  const p = path.pose(0.0);
  return [p.x + s * Math.cos(p.heading), p.y + s * Math.sin(p.heading), p.heading, 0.0];
}

function primaryEvent(spec: Json): Json | null {
  const eventos = [...(spec.eventos as Json[])].sort(
    (a, b) => Math.trunc(Number(a.orden)) - Math.trunc(Number(b.orden)),
  );
  return eventos.find((e) => String(e.tipo).startsWith("impacto_")) ?? null;
}

function crushShapeAndWidth(
  cdc: Json | null | undefined,
  body: Body2D,
): [readonly number[], number] {
  const lado = (cdc ?? {}).lado ?? "F";
  const zonaH = (cdc ?? {}).zona_horizontal ?? "D";
  const sideLen = lado === "F" || lado === "B" ? body.width : body.length;
  if (zonaH === "D") return [TRIANGULAR_SHAPES.uniforme!, sideLen];
  if (zonaH === "Y" || zonaH === "Z") {
    return [
      zonaH === "Y" ? TRIANGULAR_SHAPES.izquierda! : TRIANGULAR_SHAPES.derecha!,
      0.66 * sideLen,
    ];
  }
  if (zonaH === "L" || zonaH === "F") return [TRIANGULAR_SHAPES.izquierda!, 0.4 * sideLen];
  if (zonaH === "R" || zonaH === "B") return [TRIANGULAR_SHAPES.derecha!, 0.4 * sideLen];
  return [TRIANGULAR_SHAPES.centro!, 0.4 * sideLen];
}

const ALONG_FRONT_BACK: Readonly<Record<string, number>> = {
  L: 1 / 3,
  C: 0.0,
  R: -1 / 3,
  Y: 1 / 6,
  Z: -1 / 6,
  D: 0.0,
};
const ALONG_SIDE: Readonly<Record<string, number>> = {
  F: 1 / 3,
  P: 0.0,
  B: -1 / 3,
  Y: 1 / 6,
  Z: -1 / 6,
  D: 0.0,
};

/** Centro del ancho dañado a lo largo de la cara (+ = izquierda en F/B, adelante en L/R). */
function crushCenter(cdc: Json | null | undefined, body: Body2D, width: number): number {
  const lado = str((cdc ?? {}).lado, "F");
  const zona = str((cdc ?? {}).zona_horizontal, "D");
  let side: number;
  let frac: number;
  if (lado === "L" || lado === "R") {
    side = body.length;
    frac = ALONG_SIDE[zona] ?? 0.0;
  } else {
    side = body.width;
    frac = ALONG_FRONT_BACK[zona] ?? 0.0;
  }
  const limit = Math.max(0.0, (side - width) / 2);
  return Math.max(-limit, Math.min(limit, frac * side));
}

function normalFromCdc(cdc: Json | null | undefined, st: State2D): Vec | null {
  const lado = String((cdc ?? {}).lado);
  const local = (
    { F: [1.0, 0.0], B: [-1.0, 0.0], L: [0.0, 1.0], R: [0.0, -1.0] } as Record<string, Vec>
  )[lado];
  return local ? rot(local, st.yaw) : null;
}

/** Tiempos k·dt entre t0 y t1 (ambos múltiplos de dt), incluidos. */
function grid(t0: number, t1: number, dt: number): number[] {
  const k0 = pyRound(t0 / dt);
  const k1 = pyRound(t1 / dt);
  const out: number[] = [];
  for (let k = k0; k <= k1; k++) out.push(pyRound(k * dt, 9));
  return out;
}

/** Estados en `times`; el perfil arranca en t = tRef y antes se va a v0 constante. */
function samplePath(
  path: KinPath,
  prof: SpeedProfile,
  tRef: number,
  times: readonly number[],
): Trajectory {
  const traj = new Trajectory();
  for (const t of times) {
    const tau = t - tRef;
    let s: number;
    let v: number;
    if (tau >= 0) {
      s = prof.distance(tau);
      v = prof.speed(tau);
    } else {
      s = prof.v0 * tau;
      v = prof.v0;
    }
    const [x, y, yaw, kappa] = poseAt(path, s);
    traj.append({ x, y, yaw, vx: v * Math.cos(yaw), vy: v * Math.sin(yaw), yawRate: v * kappa, t });
  }
  return traj;
}

/** `itertools.product(*options)`: el último índice varía más rápido. */
function* product<T>(options: readonly (readonly T[])[]): Generator<T[]> {
  if (options.length === 0) {
    yield [];
    return;
  }
  const [head, ...tail] = options;
  for (const h of head!) for (const rest of product(tail)) yield [h, ...rest];
}

// ----------------------------------------------------------------------------------------------
// Reconstrucción
// ----------------------------------------------------------------------------------------------

/** Reconstruye la escena. `spec` debe haber pasado la validación del contrato. */
export function reconstruct(spec: Json, opts: { dt?: number } = {}): Reconstruction {
  const dt = opts.dt ?? DT_OUT;
  const banderas: string[] = [];
  const avisos: Aviso[] = [];
  const flag: Flag = (codigo, datos, mensaje) => {
    banderas.push(mensaje);
    avisos.push({ codigo, mensaje, datos });
  };
  const meta = spec.meta as Json;
  const seed = Math.trunc(Number(meta.semilla));
  const lugar = spec.lugar as Json;
  const clases = classes();
  const muTire = tireFriction(
    String((lugar.superficie as Json).valor),
    String((lugar.estado_superficie as Json).valor),
  );
  const mu = lugar.friccion ? Number((lugar.friccion as Json).valor) : muTire.nominal;
  const laneWidth = num(lugar.ancho_carril, LEN, LANE_WIDTH_DEFAULT);
  const grade = lugar.pendiente ? Number((lugar.pendiente as Json).valor) : 0.0;
  const absFactor = absPeakFactor().nominal;
  const params: Json = {
    friccion_llanta: {
      valor: mu,
      rango: [muTire.low, muTire.high],
      fuente: muTire.fuente,
      tipo: muTire.tipo,
    },
    restitucion_vehiculo_vehiculo: { valor: RESTITUTION_VV, tipo: "supuesto" },
    relacion_impulso_tangencial: { valor: IMPULSE_RATIO, tipo: "supuesto" },
    arrastre_post_impacto: { valor: POST_IMPACT_DRAG_FRACTION, tipo: "supuesto" },
    factor_abs: { valor: absFactor, tipo: absPeakFactor().tipo },
  };

  const specVehicles = spec.vehiculos as Json[];
  const specPersons = spec.personas as Json[];
  const models = specVehicles.map((v) => vehicleModel(v, clases, flag));
  const byId = new Map(models.map((m) => [m.id, m]));
  const personasSpec = new Map(specPersons.map((p) => [String(p.id), p]));
  const entorno = spec.entorno as Json;
  const objetos = new Map(((entorno.objetos ?? []) as Json[]).map((o) => [String(o.id), o]));
  const event = primaryEvent(spec);
  const actores: string[] = event ? (event.actores as string[]).map(String) : [];
  const involved = actores.flatMap((a) => (byId.has(a) ? [byId.get(a)!] : []));
  const tipoEvento = event ? String(event.tipo) : "";
  const zonas = new Map<string, Json | null>();
  for (const z of ((event ?? {}).zonas_impacto ?? []) as Json[]) {
    zonas.set(String(z.vehiculo_id), (z.cdc as Json | undefined) ?? null);
  }
  const axis = roadAxis(lugar);
  const candidates = new Map(models.map((m) => [m.id, pathCandidates(m, laneWidth, axis)]));
  const paths = new Map(models.map((m) => [m.id, candidates.get(m.id)![0]!]));

  // ---- punto de contacto ---------------------------------------------------------------
  let declared: Vec | null = null;
  if (event && event.punto_impacto) {
    const pi = event.punto_impacto as Json;
    declared = [Number(pi.x), Number(pi.y)];
  } else if (involved.length > 0) {
    declared = [
      pySum(involved.map((m) => m.pose0[0])) / involved.length,
      pySum(involved.map((m) => m.pose0[1])) / involved.length,
    ];
  }
  const objId = actores.find((x) => objetos.has(x));
  const obj = objId !== undefined ? objetos.get(objId)! : null;
  const pedId = actores.find((x) => personasSpec.has(x));
  const ped = pedId !== undefined ? personasSpec.get(pedId)! : null;
  let impactPoint: Vec | null = null;
  const sContact = new Map<string, number>();
  if (declared !== null && involved.length > 0) {
    let standoff = 0.0;
    if (tipoEvento === "impacto_vehiculo_objeto" && obj !== null) {
      if (obj.diametro_tronco) standoff = 0.5 * num(obj.diametro_tronco, LEN, 0.3);
      const pos = (obj.posicion ?? {}) as Json;
      if ("x" in pos) declared = [Number(pos.x), Number(pos.y)];
    }
    const decl = declared;
    const targets =
      tipoEvento === "impacto_vehiculo_vehiculo" ? involved.slice(0, 2) : involved.slice(0, 1);
    const offsets = new Map(
      targets.map((m) => [
        m.id,
        contactOffset(zonas.get(m.id), m.body.length, m.body.width, standoff),
      ]),
    );
    const locusFor = (m: VehicleModel, path: KinPath): Locus => {
      if (m.v0 <= 0) {
        const p0 = m.pose0;
        return new Locus(() => p0, offsets.get(m.id)!, 0.0);
      }
      return new Locus(
        (s) => {
          const [x, y, yaw] = poseAt(path, s);
          return [x, y, yaw];
        },
        offsets.get(m.id)!,
        Math.min(path.length, SEARCH_LENGTH_M),
      );
    };
    const options = targets.map((m) =>
      m.v0 > 0 ? candidates.get(m.id)! : candidates.get(m.id)!.slice(0, 1),
    );
    let seek: CompositePath | null = null;
    if (tipoEvento !== "impacto_vehiculo_vehiculo" && targets[0]!.v0 > 0) {
      seek = targetPath(targets[0]!, decl, offsets.get(targets[0]!.id)!);
      if (seek !== null) options[0] = [...options[0]!, seek];
    }
    let best: [number, number, KinPath[], ContactSolution] | null = null;
    for (const combo of product(options)) {
      const loci = targets.map((m, i) => locusFor(m, combo[i]!));
      if (tipoEvento !== "impacto_vehiculo_vehiculo") {
        const fixed = decl;
        loci.push(new Locus(() => [fixed[0], fixed[1], 0.0], [0.0, 0.0], 0.0));
      }
      const sol = resolveContact(loci, decl);
      const rank = combo.reduce((acc, path, i) => acc + options[i]!.indexOf(path), 0);
      if (
        best === null ||
        sol.gap < best[0] - PATH_TIE_M ||
        (Math.abs(sol.gap - best[0]) <= PATH_TIE_M && rank < best[1])
      ) {
        best = [sol.gap, rank, combo, sol];
      }
    }
    const [, , combo, sol] = best!;
    targets.forEach((m, i) => paths.set(m.id, combo[i]!));
    if (seek !== null && combo[0] === seek) {
      const first = seek.parts[0];
      let lateral = 0.0;
      if (first instanceof LaneChangePath) {
        const u = SEEK_CONTACT_FRACTION;
        lateral = first.lateral * 0.5 * (1.0 - Math.cos(Math.PI * u));
      }
      flag(
        "desvio_lateral",
        { vehiculo: targets[0]!.id, lateral_m: lateral },
        `Vehículo ${targets[0]!.rol}: para alcanzar el punto de impacto declarado se ` +
          `infiere un desvío lateral de ${pyFixed(Math.abs(lateral), 1)} m ` +
          `hacia la ${lateral > 0 ? "izquierda" : "derecha"}.`,
      );
    }
    impactPoint = sol.point;
    targets.forEach((m, i) => {
      if (i < sol.params.length) sContact.set(m.id, sol.params[i]!);
    });
    if (sol.gap > CONTACT_GAP_FLAG_M) {
      flag(
        "zonas_no_se_tocan",
        { separacion_m: sol.gap },
        "Las zonas de impacto declaradas no llegan a tocarse siguiendo las trayectorias; " +
          `se usa el acercamiento máximo (quedan a ${pyFixed(sol.gap, 1)} m).`,
      );
    }
  }

  // ---- fase previa ---------------------------------------------------------------------
  const profiles = new Map<string, SpeedProfile>();
  const tToImpact = new Map<string, number>();
  for (const m of models) {
    const decel = brakingDeceleration(mu, m.abs ? absFactor : 1.0, grade);
    if (m.v0 <= 0 || !sContact.has(m.id)) {
      profiles.set(m.id, new SpeedProfile(m.v0));
      tToImpact.set(m.id, 0.0);
      continue;
    }
    const sImp = sContact.get(m.id)!;
    let prof: SpeedProfile;
    if (m.braking) {
      let dBrake: number;
      if (m.brakeDistance === null) {
        dBrake = m.v0 * DEFAULT_BRAKE_BEFORE_IMPACT_S;
        flag(
          "frenado_sin_distancia",
          { vehiculo: m.id },
          `Vehículo ${m.rol}: frenó pero no dice desde dónde; se asume ` +
            `${pyFloatStr(DEFAULT_BRAKE_BEFORE_IMPACT_S)} s antes del impacto.`,
        );
      } else {
        dBrake = m.brakeDistance;
      }
      dBrake = Math.min(dBrake, sImp);
      prof = new SpeedProfile(m.v0, (sImp - dBrake) / m.v0, decel);
      if (prof.timeToDistance(sImp) === null) {
        flag(
          "frenado_detiene_antes",
          { vehiculo: m.id, v_kmh: msToKmh(m.v0), frenado_m: dBrake },
          `Vehículo ${m.rol}: con ${pyFixed(msToKmh(m.v0), 0)} km/h y ${pyFixed(dBrake, 1)} m de ` +
            "frenado se habría detenido antes del impacto; se recorta el frenado.",
        );
        dBrake = (0.9 * m.v0 * m.v0) / (2 * decel);
        prof = new SpeedProfile(m.v0, (sImp - dBrake) / m.v0, decel);
      }
    } else {
      prof = new SpeedProfile(m.v0);
    }
    profiles.set(m.id, prof);
    const tImp = prof.timeToDistance(sImp);
    tToImpact.set(m.id, tImp !== null ? tImp : sImp / m.v0);
  }

  let tPre = Math.min(T_PRE_MAX, Math.max(T_PRE_MIN, ...tToImpact.values()));
  tPre = Math.ceil(tPre / dt - 1e-9) * dt;
  const preTimes = grid(-tPre, 0.0, dt);
  params.aproximacion_previa_s = {
    valor: tPre,
    fuente:
      "Antes de su posición inicial declarada cada vehículo avanza a velocidad " +
      "constante sobre la prolongación de su trayectoria",
    tipo: "supuesto",
  };
  const pre = new Map<string, Trajectory>();
  const impactStates = new Map<string, State2D>();
  for (const m of models) {
    const traj =
      sContact.has(m.id) && m.v0 > 0
        ? samplePath(paths.get(m.id)!, profiles.get(m.id)!, -tToImpact.get(m.id)!, preTimes)
        : samplePath(paths.get(m.id)!, profiles.get(m.id)!, -tPre, preTimes);
    pre.set(m.id, traj);
    impactStates.set(m.id, traj.last());
  }

  // ---- impacto principal ---------------------------------------------------------------
  const eventosOut: EventOutcome[] = [];
  const postStart = new Map(models.map((m) => [m.id, impactStates.get(m.id)!]));
  const deltaV = new Map<string, number>(models.map((m) => [m.id, 0.0]));
  const pdof = new Map<string, number | null>(models.map((m) => [m.id, null]));
  const crush = new Map<string, [number[], number, number, string]>(
    models.map((m) => [m.id, [[0.0, 0.0, 0.0, 0.0, 0.0, 0.0], m.body.width, 0.0, "sin impacto"]]),
  );
  const throws: ThrowInfo[] = [];
  const muBody = pedestrianFriction(String((lugar.superficie as Json).valor));
  const evidencias = (spec.evidencias ?? []) as Json[];

  const declaredThrowFor = (pid: string): Json | null => {
    const cands = evidencias.filter((e) => e.tipo === "distancia_proyeccion" && e.longitud);
    const own = cands.filter((e) => e.persona_id === pid);
    const rest = own.length > 0 ? own : cands.filter((e) => !e.persona_id);
    return rest[0] ?? null;
  };

  const makeThrow = (
    pid: string,
    launch: number,
    heading: number,
    origin: Vec,
    hCg: number,
    vVehicle: number,
    projection: number,
    contactInfo: Record<string, string>,
    quien: string,
  ): ThrowOutcome => {
    const muP = muBody.nominal;
    const dNom = searleThrow(launch, muP, PEDESTRIAN_LAUNCH_ANGLE_DEG, hCg);
    const thetaMin = searleRange(Math.max(dNom, 0.1), muP, hCg).thetaMinDeg;
    const dLo = searleThrow(launch, muP, thetaMin, hCg);
    const dHi = searleThrow(launch, muP, 0.0, hCg);
    const band = searleDistanceBand(launch, muBody.low, muBody.high, hCg);
    const decl = declaredThrowFor(pid);
    if (decl) {
      const dDecl = num(decl.longitud, LEN, dNom);
      const rng = vehicleSpeedRangeFromThrow(dDecl, muP, hCg, [projection, 1.0]);
      if (!(rng.vMin * 0.85 <= vVehicle && vVehicle <= rng.vMax * 1.15)) {
        flag(
          "proyeccion_vs_velocidad",
          {
            persona: pid,
            distancia_m: dDecl,
            v_min_kmh: msToKmh(rng.vMin),
            v_max_kmh: msToKmh(rng.vMax),
            v_kmh: msToKmh(vVehicle),
          },
          `La distancia de proyección declarada de ${quien} (${pyFixed(dDecl, 0)} m) sugiere ` +
            `entre ${pyFixed(msToKmh(rng.vMin), 0)} y ${pyFixed(msToKmh(rng.vMax), 0)} km/h; la ` +
            `velocidad reconstruida al impacto es ${pyFixed(msToKmh(vVehicle), 0)} km/h.`,
        );
      }
    }
    return {
      launchSpeedKmh: msToKmh(launch),
      throwDistanceM: dNom,
      throwRangeM: [Math.min(dLo, dHi), Math.max(dLo, dHi)],
      restPosition: [origin[0] + dNom * Math.cos(heading), origin[1] + dNom * Math.sin(heading)],
      contact: contactInfo,
      bandM: [band.dMin, band.dMax],
      muBody: [muP, muBody.low, muBody.high],
      launchAngleDeg: PEDESTRIAN_LAUNCH_ANGLE_DEG,
      cgHeightM: hCg,
      headingRad: heading,
    };
  };

  if (event && tipoEvento === "impacto_vehiculo_vehiculo" && involved.length >= 2 && impactPoint) {
    const a = involved[0]!;
    const b = involved[1]!;
    const sa = impactStates.get(a.id)!;
    const sb = impactStates.get(b.id)!;
    let normal = normalFromCdc(zonas.get(a.id), sa);
    if (normal === null) {
      const rel: Vec = [sb.vx - sa.vx, sb.vy - sa.vy];
      normal = rel[0] || rel[1] ? [-rel[0], -rel[1]] : rot([1.0, 0.0], sa.yaw);
    }
    const res: ImpactResult = planarImpact(a.body, sa, b.body, sb, impactPoint, normal, {
      restitution: RESTITUTION_VV,
      friction: IMPULSE_RATIO,
    });
    postStart.set(a.id, res.aAfter);
    postStart.set(b.id, res.bAfter!);
    deltaV.set(a.id, res.deltaVA);
    deltaV.set(b.id, res.deltaVB);
    pdof.set(a.id, pdofHours(res.pdofADeg));
    pdof.set(b.id, pdofHours(res.pdofBDeg));
    // Reparto de la energía disipada entre carrocerías: inversamente a la rigidez B.
    const cdcA = zonas.get(a.id) ?? {};
    const cdcB = zonas.get(b.id) ?? {};
    const ka = stiffnessFor(a.clase, zonaFromCdcSide(str(cdcA.lado, "F")));
    const kb = stiffnessFor(b.clase, zonaFromCdcSide(str(cdcB.lado, "F")));
    const wa = 1.0 / ka.stiffness.b;
    const wb = 1.0 / kb.stiffness.b;
    for (const [m, e, k] of [
      [a, (res.energyLoss * wa) / (wa + wb), ka],
      [b, (res.energyLoss * wb) / (wa + wb), kb],
    ] as const) {
      const [shape, width] = crushShapeAndWidth(zonas.get(m.id), m.body);
      crush.set(m.id, [profileForEnergy(e, width, k.stiffness, shape), width, e, k.origen]);
    }
    eventosOut.push({
      id: String(event.id),
      tipo: tipoEvento,
      t: 0.0,
      actores: [a.id, b.id],
      detalle: {
        impulso_ns: [res.impulse[0], res.impulse[1]],
        adherencia: res.sticking,
        friccion_contacto_usada: res.frictionUsed,
        energia_disipada_j: res.energyLoss,
        velocidad_cierre_kmh: msToKmh(Math.hypot(sa.vx - sb.vx, sa.vy - sb.vy)),
      },
    });
    // Jinetes de moto, scooter o bici: no van sujetos y salen proyectados.
    for (const m of [a, b]) {
      if (!TWO_WHEEL_CLASSES.has(m.clase)) continue;
      const sM = impactStates.get(m.id)!;
      const vM = Math.hypot(sM.vx, sM.vy);
      if (vM < 0.5) continue;
      const headingM = Math.atan2(sM.vy, sM.vx);
      for (const pdoc of specPersons) {
        if (pdoc.vehiculo_id !== m.id || !RIDER_ROLES.has(String((pdoc.rol as Json).valor)))
          continue;
        const rid = String(pdoc.id);
        const launchR = RIDER_PROJECTION_FACTOR * vM;
        const outR = makeThrow(
          rid,
          launchR,
          headingM,
          [sM.x, sM.y],
          RIDER_CG_HEIGHT_M[m.clase] ?? 1.05,
          vM,
          RIDER_PROJECTION_FACTOR,
          { defensa: "", borde_cofre: "", cabeza: "" },
          `la persona que iba en el vehículo ${m.rol}`,
        );
        throws.push({
          personId: rid,
          outcome: outR,
          origin: [sM.x, sM.y],
          launch: launchR,
          mu: muBody.nominal,
          kind: "jinete",
          vehicleId: m.id,
        });
        eventosOut.push({
          id: `proyeccion-${rid}`,
          tipo: "proyeccion",
          t: 0.0,
          actores: [m.id, rid],
          detalle: { distancia_proyeccion_m: outR.throwDistanceM, rango_m: [...outR.throwRangeM] },
        });
      }
    }
  } else if (
    event &&
    tipoEvento === "impacto_vehiculo_objeto" &&
    involved.length > 0 &&
    impactPoint
  ) {
    const a = involved[0]!;
    const sa = impactStates.get(a.id)!;
    const flatTypes = new Set(["muro", "barda", "vehiculo_estacionado", "contenedor", "puesto"]);
    let detalle: Record<string, unknown>;
    if (obj === null || flatTypes.has(String(obj.tipo))) {
      // Superficie plana inmóvil: impulso planar con la normal de la superficie.
      const cdcO = zonas.get(a.id);
      const normal = barrierNormal(obj, impactPoint, axis, sa);
      const resO = planarImpact(a.body, sa, null, null, impactPoint, normal, {
        restitution: RESTITUTION_VV,
        friction: IMPULSE_RATIO,
      });
      const k = stiffnessFor(a.clase, zonaFromCdcSide(str((cdcO ?? {}).lado, "F")));
      const [shape, width] = crushShapeAndWidth(cdcO, a.body);
      deltaV.set(a.id, resO.deltaVA);
      pdof.set(a.id, pdofHours(resO.pdofADeg));
      postStart.set(a.id, resO.aAfter);
      crush.set(a.id, [
        profileForEnergy(resO.energyLoss, width, k.stiffness, shape),
        width,
        resO.energyLoss,
        k.origen,
      ]);
      detalle = {
        objeto: obj ? String(obj.tipo) : "guarnicion",
        rigido: true,
        energia_disipada_j: resO.energyLoss,
      };
    } else {
      const k = stiffnessFor(a.clase, "frontal");
      const diam = num(obj.diametro_tronco, LEN, 0.3);
      const r = narrowObject(a.body, stateSpeed(sa), k.stiffness, {
        diameterM: diam,
        material: str(obj.material, "concreto"),
      });
      deltaV.set(a.id, r.deltaV);
      pdof.set(a.id, 0.0);
      const heading: Vec = [Math.cos(sa.yaw), Math.sin(sa.yaw)];
      const sign = r.rigid ? -1.0 : 1.0;
      postStart.set(
        a.id,
        withVelocity(sa, sign * r.vAfter * heading[0], sign * r.vAfter * heading[1], 0.0),
      );
      crush.set(a.id, [r.profile, r.damageWidth, r.energyAbsorbedVehicle, k.origen]);
      detalle = {
        objeto: String(obj.tipo),
        rigido: r.rigid,
        energia_objeto_j: r.energyAbsorbedObject,
        aplastamiento_max_m: r.maxCrush,
      };
    }
    eventosOut.push({
      id: String(event.id),
      tipo: tipoEvento,
      t: 0.0,
      actores: [a.id, ...(obj ? [String(obj.id)] : [])],
      detalle,
    });
  } else if (
    event &&
    tipoEvento === "impacto_vehiculo_persona" &&
    involved.length > 0 &&
    impactPoint
  ) {
    const a = involved[0]!;
    const sa = impactStates.get(a.id)!;
    const pid = ped ? String(ped.id) : "peaton";
    const vImp = stateSpeed(sa);
    const pedDoc = ped ?? {};
    const stature = num(pedDoc.estatura, LEN, DEFAULT_STATURE_M);
    const mPed = num(pedDoc.masa, MASS, DEFAULT_PERSON_MASS_KG);
    const launch = PEDESTRIAN_PROJECTION_FACTOR * vImp;
    const hCg = PEDESTRIAN_CG_HEIGHT_FACTOR * stature;
    const heading: Vec = [Math.cos(sa.yaw), Math.sin(sa.yaw)];
    const dvA = (mPed * launch) / (a.body.mass + mPed);
    deltaV.set(a.id, dvA);
    pdof.set(a.id, 0.0);
    postStart.set(
      a.id,
      withVelocity(sa, sa.vx - dvA * heading[0], sa.vy - dvA * heading[1], sa.yawRate),
    );
    const k = stiffnessFor(a.clase, "frontal");
    const ePed = PEDESTRIAN_CRUSH_ENERGY_FRACTION * 0.5 * mPed * launch * launch;
    const widthPed = 0.4 * a.body.width;
    crush.set(a.id, [
      profileForEnergy(ePed, widthPed, k.stiffness, TRIANGULAR_SHAPES.centro),
      widthPed,
      ePed,
      k.origen,
    ]);
    const contact = contactZones(stature, 0.32 * a.height, 0.55 * a.height, 0.25 * a.body.length);
    const outP = makeThrow(
      pid,
      launch,
      sa.yaw,
      impactPoint,
      hCg,
      vImp,
      PEDESTRIAN_PROJECTION_FACTOR,
      {
        defensa: contact.bumperOnBody,
        borde_cofre: contact.hoodEdgeOnBody ?? "",
        cabeza: contact.headContact,
      },
      "la persona peatona",
    );
    throws.push({
      personId: pid,
      outcome: outP,
      origin: impactPoint,
      launch,
      mu: muBody.nominal,
      kind: "peaton",
      vehicleId: null,
    });
    eventosOut.push({
      id: String(event.id),
      tipo: tipoEvento,
      t: 0.0,
      actores: [a.id, pid],
      detalle: { distancia_proyeccion_m: outP.throwDistanceM, rango_m: [...outP.throwRangeM] },
    });
  } else if (event) {
    flag(
      "evento_sin_resolver",
      { evento: event.id },
      `Evento ${String(event.id)} (${tipoEvento}) sin actores suficientes o sin punto de ` +
        "impacto: no se resolvió.",
    );
  }

  // ---- fase posterior ------------------------------------------------------------------
  let tFin = dt;
  const post = new Map<string, [Trajectory, boolean, number]>();
  for (const m of models) {
    if (!actores.includes(m.id)) continue;
    const start = postStart.get(m.id)!;
    if (stateSpeed(start) > 0.05 || Math.abs(start.yawRate) > 0.05) {
      const wheels = fourWheels(m.wheelbase, m.track, m.cgFromFront, m.braking);
      const drag = m.braking
        ? ROLLING_RESISTANCE
        : Math.max(ROLLING_RESISTANCE, POST_IMPACT_DRAG_FRACTION * mu);
      const resPost = integrate(m.body, { ...start, t: 0.0 }, wheels, mu, {
        dtOut: dt,
        tMax: T_POST_MAX,
        rollingDrag: drag,
      });
      post.set(m.id, [resPost.trajectory, resPost.stopped, resPost.distance]);
      if (!resPost.stopped) {
        flag(
          "sin_reposo",
          { vehiculo: m.id },
          `Vehículo ${m.rol}: no llegó al reposo en ${pyFixed(T_POST_MAX, 0)} s.`,
        );
      }
    } else {
      post.set(m.id, [new Trajectory(), true, 0.0]);
    }
    const trPost = post.get(m.id)![0];
    tFin = Math.max(tFin, trPost.length > 0 ? trPost.t[trPost.length - 1]! : 0.0);
  }

  // ---- personas ------------------------------------------------------------------------
  const personasOut: PersonOutcome[] = [];
  const pedTracks = new Map<string, PersonTrack>();
  for (const th of throws) {
    const track = new PersonTrack();
    const pdoc2 = personasSpec.get(th.personId) ?? {};
    const out = th.outcome;
    if (th.kind === "peaton") {
      const pose = pdoc2.posicion_inicial as Json | undefined;
      const startXy: Vec = pose ? [Number(pose.x), Number(pose.y)] : th.origin;
      const speedP = num(pdoc2.velocidad, SPEED, WALKING_SPEED_MS);
      approachTrack(track, startXy, th.origin, speedP, out.cgHeightM, -tPre, 0.0, dt);
      params.velocidad_peaton = {
        valor: speedP,
        rango: [1.0, 1.6],
        fuente: "Knoblauch, Pietrucha y Nitzburg 1996, TRR 1538 (medias 1.25–1.51 m/s)",
        tipo: pdoc2.velocidad === undefined || pdoc2.velocidad === null ? "supuesto" : "relato",
      };
    } else {
      rideTrack(track, pre.get(th.vehicleId!)!, out.cgHeightM);
    }
    const kin = throwTrack(
      track,
      th.origin,
      out.headingRad,
      th.launch,
      out.launchAngleDeg,
      out.cgHeightM,
      th.mu,
      0.0,
      dt,
    );
    pedTracks.set(th.personId, track);
    const tRest = kin.totalTime;
    tFin = Math.max(tFin, tRest);
    eventosOut.push({
      id: `reposo-${th.personId}`,
      tipo: "reposo",
      t: tRest,
      actores: [th.personId],
      detalle: {},
    });
  }
  if (throws.length > 0) {
    params.friccion_cuerpo_suelo = {
      valor: muBody.nominal,
      rango: [muBody.low, muBody.high],
      fuente: muBody.fuente,
      tipo: muBody.tipo,
    };
  }
  if (throws.some((th) => th.kind === "jinete")) {
    params.factor_proyeccion_jinete = {
      valor: RIDER_PROJECTION_FACTOR,
      rango: [PEDESTRIAN_PROJECTION_FACTOR - 0.1, 1.0],
      fuente:
        "Searle 1993 (SAE 930659) aplica el mismo modelo a jinetes; el factor es " +
        "un supuesto hasta calibrarlo",
      tipo: "supuesto",
    };
  }
  tFin = Math.ceil((tFin + T_HOLD_AFTER_REST) / dt - 1e-9) * dt;

  for (const p of specPersons) {
    const pid = String(p.id);
    const stature = num(p.estatura, LEN, DEFAULT_STATURE_M);
    const hCg = PEDESTRIAN_CG_HEIGHT_FACTOR * stature;
    const veh = p.vehiculo_id;
    const track = pedTracks.get(pid) ?? new PersonTrack();
    const throwOut = throws.find((th) => th.personId === pid)?.outcome ?? null;
    if (pedTracks.has(pid)) {
      restTrack(track, tFin, dt, true);
    } else if ((veh === undefined || veh === null) && p.posicion_inicial) {
      const pose = p.posicion_inicial as Json;
      const speedP = num(p.velocidad, SPEED, 0.0);
      const dirDeg = num(p.direccion_movimiento, ANGLE, Number(pose.rumbo_deg));
      straightWalkTrack(
        track,
        [Number(pose.x), Number(pose.y)],
        radians(dirDeg),
        speedP,
        hCg,
        -tPre,
        tFin,
        dt,
      );
    } else if (veh === undefined || veh === null) {
      flag(
        "persona_sin_posicion",
        { persona: pid },
        `Persona ${pid}: sin posición inicial ni vehículo; no se muestra en la escena.`,
      );
    }
    let occDoc: Json | null = null;
    if (veh !== undefined && veh !== null && !pedTracks.has(pid) && byId.has(str(veh))) {
      const vid = str(veh);
      occDoc = occupantDoc(p, byId.get(vid)!, deltaV.get(vid)!, crush.get(vid)![0], pdof.get(vid)!);
    }
    personasOut.push({
      id: pid,
      rol: String((p.rol as Json).valor),
      statureM: stature,
      vehiculoId: veh !== undefined && veh !== null ? str(veh) : null,
      track,
      throw: throwOut,
      occupant: occDoc,
    });
  }

  // ---- ensamblado ----------------------------------------------------------------------
  const vehiculosOut: VehicleOutcome[] = [];
  for (const m of models) {
    const full = new Trajectory();
    full.extend(pre.get(m.id)!);
    let stopped: boolean;
    let distPost: number;
    if (actores.includes(m.id)) {
      const [tr, st, dp] = post.get(m.id)!;
      stopped = st;
      distPost = dp;
      for (let i = 1; i < tr.length; i++) full.append(tr.state(i));
      const last = full.last();
      for (const t of grid(0.0, tFin, dt)) {
        if (t > last.t + 1e-9)
          full.append({ x: last.x, y: last.y, yaw: last.yaw, vx: 0.0, vy: 0.0, yawRate: 0.0, t });
      }
    } else {
      // Sigue su camino con el mismo perfil hasta que la escena termina.
      stopped = m.v0 <= 0;
      distPost = 0.0;
      const restT = samplePath(paths.get(m.id)!, profiles.get(m.id)!, -tPre, grid(0.0, tFin, dt));
      for (let i = 1; i < restT.length; i++) full.append(restT.state(i));
    }
    const last = full.last();
    const [prof, width, e, origen] = crush.get(m.id)!;
    vehiculosOut.push({
      id: m.id,
      rol: m.rol,
      clase: m.clase,
      involucrado: actores.includes(m.id),
      length: m.body.length,
      width: m.body.width,
      height: m.height,
      wheelbase: m.wheelbase,
      mass: m.body.mass,
      trajectory: full,
      vImpactKmh: msToKmh(stateSpeed(impactStates.get(m.id)!)),
      deltaVKmh: msToKmh(deltaV.get(m.id)!),
      pdofHours: pdof.get(m.id)!,
      crushProfileM: prof,
      crushWidthM: width,
      crushEnergyJ: e,
      crushCenterM: crushCenter(zonas.get(m.id), m.body, width),
      stiffnessOrigen: origen,
      cdc: zonas.get(m.id) ?? null,
      stopped,
      restPose: [last.x, last.y, degrees(last.yaw)],
      distancePostM: distPost,
      rollover: null,
    });
    if (m.braking && m.v0 > 0 && sContact.has(m.id)) {
      const tb = profiles.get(m.id)!.tBrake;
      if (tb !== Infinity) {
        eventosOut.push({
          id: `frenado-${m.id}`,
          tipo: "inicio_frenado",
          t: pyRound(tb - tToImpact.get(m.id)!, 6),
          actores: [m.id],
          detalle: {},
        });
      }
    }
    if (actores.includes(m.id)) {
      const trPost = post.get(m.id)![0];
      const tStop = trPost.length > 0 ? trPost.t[trPost.length - 1]! : 0.0;
      eventosOut.push({
        id: `reposo-${m.id}`,
        tipo: "reposo",
        t: tStop,
        actores: [m.id],
        detalle: {},
      });
    }
  }
  // ---- volcadura (criterio de tropiezo) -------------------------------------------------
  const declaredRoll = new Set<string>();
  for (const e of spec.eventos as Json[]) {
    if (e.tipo === "volcadura")
      for (const a of (e.actores ?? []) as string[]) declaredRoll.add(String(a));
  }
  if (
    tipoEvento === "impacto_vehiculo_objeto" &&
    involved.length > 0 &&
    impactPoint !== null &&
    (obj === null ||
      obj.tipo === "muro" ||
      obj.tipo === "barda" ||
      declaredRoll.has(involved[0]!.id))
  ) {
    const a = involved[0]!;
    const sa = impactStates.get(a.id)!;
    const n = barrierNormal(obj, impactPoint, axis, sa);
    const vN = sa.vx * n[0] + sa.vy * n[1];
    const left = -Math.sin(sa.yaw) * n[0] + Math.cos(sa.yaw) * n[1];
    const check = tripCheck(
      a.track,
      a.body.width,
      a.height,
      vN,
      left > 0 ? "izquierdo" : "derecho",
    );
    vehiculosOut.find((v) => v.id === a.id)!.rollover = check;
    params.altura_cg_volcadura = {
      valor: CG_HEIGHT_FRACTION,
      fuente: "Fracción del alto del vehículo; SSF típico 1.0–1.5 según la clase (NHTSA)",
      tipo: "supuesto",
    };
    if (declaredRoll.has(a.id) && !check.starts) {
      flag(
        "volcadura_sin_velocidad",
        { vehiculo: a.id },
        `Vehículo ${a.rol}: el relato dice que se volcó, pero llega a la orilla con ` +
          `${pyFixed(msToKmh(check.lateralSpeed), 0)} km/h hacia ella y el tropiezo necesita ` +
          `${pyFixed(msToKmh(check.criticalSpeed), 0)} km/h; probablemente iba derrapando de ` +
          "lado, algo que la fase previa (sin deslizamiento lateral) no reproduce. La " +
          "volcadura del visor es ilustrativa.",
      );
    } else if (check.starts && !declaredRoll.has(a.id)) {
      flag(
        "volcadura_no_mencionada",
        { vehiculo: a.id },
        `Vehículo ${a.rol}: con ${pyFixed(msToKmh(check.lateralSpeed), 0)} km/h hacia la orilla ` +
          "el tropiezo alcanza para iniciar una volcadura, aunque el relato no la menciona.",
      );
    }
    if (declaredRoll.has(a.id)) {
      const ev = (spec.eventos as Json[]).find((e) => e.tipo === "volcadura" && e.t);
      const tRoll = ev ? Number((ev.t as Json).valor) : 0.0;
      eventosOut.push({
        id: `volcadura-${a.id}`,
        tipo: "volcadura",
        t: tRoll,
        actores: [a.id],
        detalle: {},
      });
    }
  }

  // ---- visibilidad ---------------------------------------------------------------------
  const objetosOut = sceneObjects(spec);
  const visibilidadOut = visibilityDocs(
    spec,
    models,
    vehiculosOut,
    personasOut,
    objetosOut,
    actores,
    -tPre,
    params,
  );
  eventosOut.sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

  return {
    escenaId: String(meta.id),
    semilla: seed,
    dt,
    tInicio: -tPre,
    tFin,
    puntoImpacto: impactPoint,
    vehiculos: vehiculosOut,
    personas: personasOut,
    eventos: eventosOut,
    banderas,
    parametros: params,
    objetos: objetosOut,
    visibilidad: visibilidadOut,
    avisos,
  };
}

/** Cinemática del ocupante relativa al habitáculo para el resultado. */
function occupantDoc(
  p: Json,
  m: VehicleModel,
  dv: number,
  profile: number[],
  pdofH: number | null,
): Json | null {
  if (TWO_WHEEL_CLASSES.has(m.clase)) return null;
  const seat = str(((p.asiento ?? {}) as Json).valor, "otro");
  const beltField = p.cinturon as Json | undefined;
  const belted = beltField && "valor" in beltField ? Boolean(beltField.valor) : null;
  const pulse = pulseFor(
    dv,
    profile.length > 0 ? Math.max(...profile) : 0.0,
    pdofH !== null ? pdofH : 12.0,
  );
  if (pulse === null) return null;
  const toward = pulse.toward;
  const doc: Json = {
    asiento: seat,
    pulso: {
      duracion_s: r6(pulse.durationS),
      delta_v_kmh: r6(msToKmh(pulse.deltaV)),
      aceleracion_max_g: r6(peakG(pulse)),
      direccion_deg: r6(degrees(Math.atan2(toward[1], toward[0]))),
    },
    variantes: [] as Json[],
  };
  if (belted !== null) doc.cinturon_declarado = belted;
  for (const mo of occupantMotions(pulse, seat, belted)) {
    const v: Json = {
      cinturon: mo.belted,
      t: mo.t.map((x) => r6(x)),
      dx: mo.dx.map((x) => r6(x)),
      dy: mo.dy.map((x) => r6(x)),
      desplazamiento_max_m: r6(maxDisplacement(mo)),
    };
    if (mo.contact !== null) {
      v.contacto = {
        zona: mo.contact.zona,
        t_s: r6(mo.contact.tS),
        velocidad_relativa_kmh: r6(msToKmh(mo.contact.relativeSpeed)),
      };
    }
    (doc.variantes as Json[]).push(v);
  }
  return doc;
}

/** Pose de una trayectoria muestreada en el instante más cercano a t. */
function poseOn(tr: Trajectory, t: number): readonly [number, number, number] {
  if (tr.length === 0) return [0.0, 0.0, 0.0];
  let k: number;
  if (tr.length < 8) {
    k = 0;
    let best = Math.abs(tr.t[0]! - t);
    for (let i = 1; i < tr.length; i++) {
      const d = Math.abs(tr.t[i]! - t);
      if (d < best) {
        best = d;
        k = i;
      }
    }
  } else {
    let lo = 0;
    let hi = tr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tr.t[mid]! < t) lo = mid + 1;
      else hi = mid;
    }
    k = lo === 0 || Math.abs(tr.t[lo]! - t) <= Math.abs(tr.t[lo - 1]! - t) ? lo : lo - 1;
  }
  return [tr.x[k]!, tr.y[k]!, tr.yaw[k]!];
}

function trackPose(track: PersonTrack, t: number): readonly [number, number, number] | null {
  if (track.t.length === 0 || t < track.t[0]! - 1e-9) return null;
  let lo = 0;
  let hi = track.t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (track.t[mid]! < t) lo = mid + 1;
    else hi = mid;
  }
  const k = lo === 0 || Math.abs(track.t[lo]! - t) <= Math.abs(track.t[lo - 1]! - t) ? lo : lo - 1;
  return [track.x[k]!, track.y[k]!, track.yaw[k]!];
}

/** Visibilidad de cada conductor hacia los demás actores antes del impacto. */
function visibilityDocs(
  spec: Json,
  models: VehicleModel[],
  vehicles: VehicleOutcome[],
  persons: PersonOutcome[],
  objects: SceneObject[],
  actores: string[],
  t0: number,
  params: Json,
): Json[] {
  const dtS = SAMPLE_DT;
  const n = Math.floor(-t0 / dtS + 1e-9);
  const times: number[] = [];
  for (let k = n; k >= 0; k--) times.push(pyRound(-dtS * k, 9));
  const env = spec.entorno as Json;
  const nightUnlit = (env.iluminacion as Json).valor === "noche_sin_alumbrado";
  const met = env.visibilidad;
  const metM = met ? num(met, LEN, 0.0) : null;
  const specById = new Map((spec.vehiculos as Json[]).map((v) => [String(v.id), v]));
  const lights = (vid: string): boolean => {
    const f = specById.get(vid)!.luces_encendidas as Json | undefined;
    return f && "valor" in f ? Boolean(f.valor) : true;
  };
  const statics = objects.flatMap((ob) => objectOccluders(ob));
  const vout = new Map(vehicles.map((v) => [v.id, v]));
  const movers = models.map((m) => {
    const tr = vout.get(m.id)!.trajectory;
    return new Actor(
      m.id,
      "vehiculo",
      times.map((t) => poseOn(tr, t)),
      m.body.length,
      m.body.width,
      m.height,
      lights(m.id),
    );
  });
  const walkers: Actor[] = [];
  for (const pr of persons) {
    if (pr.vehiculoId !== null || pr.track.t.length === 0) continue;
    const poses = times.map((t) => trackPose(pr.track, t));
    walkers.push(
      new Actor(
        pr.id,
        "persona",
        poses.map((q) => q ?? [0.0, 0.0, 0.0]),
        0.0,
        0.0,
        pr.statureM,
        false,
        poses.map((q) => q !== null),
      ),
    );
  }
  const impactObjs = objects
    .filter((o) => actores.includes(o.id))
    .map(
      (o) =>
        new Actor(
          o.id,
          "objeto",
          times.map(() => [o.x, o.y, 0.0] as const),
          0.0,
          0.0,
          o.alto,
        ),
    );
  const out: Json[] = [];
  for (const m of models) {
    if (m.v0 <= 0) continue;
    const obs = new Observer(
      m.id,
      m.clase,
      movers.find((a) => a.id === m.id)!.poses,
      m.body.length,
      m.body.width,
      lights(m.id),
    );
    let targets = [...movers.filter((a) => a.id !== m.id), ...walkers];
    if (actores.includes(m.id)) targets = [...targets, ...impactObjs];
    for (const tgt of targets) {
      const res = analyzePair(
        obs,
        tgt,
        statics,
        movers.filter((a) => a.id !== tgt.id),
        times,
        { nightUnlit, metVisibilityM: metM },
      );
      if (res.t.length === 0) continue;
      out.push({
        observador: res.observador,
        objetivo: res.objetivo,
        tipo_objetivo: res.tipoObjetivo,
        altura_ojo_m: r6(obs.eyeHeight),
        t: res.t,
        visible: res.visible,
        fraccion: res.fraccion,
        distancia_m: res.distancia,
        causa: res.causa,
        resumen: pairSummary(res),
      });
    }
  }
  params.altura_ojo = {
    valor: EYE_HEIGHT_M.sedan_compacto,
    fuente: "AASHTO Green Book 2018: 1.08 m autos, 2.33 m camiones; otras clases supuestas",
    tipo: "primaria",
  };
  if (nightUnlit) {
    params.alcance_deteccion_nocturna = {
      valor: NIGHT_DETECTION_M,
      rango: [...NIGHT_DETECTION_RANGE_M],
      fuente:
        "Olson y Sivak (1983), citado por terceros: peatones con ropa oscura se " +
        "detectan a menos de 30 m con luces bajas",
      tipo: "supuesto",
    };
  }
  return out;
}
