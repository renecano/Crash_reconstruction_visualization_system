/**
 * Reproducción de un caso de E5 en Croquis (F10, ADR 0032): la misma etapa de daño de la
 * reconstrucción del solver TS de producción y la misma deformación de malla del visor.
 *
 * 1. Energía de deformación del vehículo según el obstáculo (barrera rígida o desplazada con
 *    `planarImpact`; poste con `narrowObject`; barrera móvil con el criterio de E2; otro vehículo u
 *    objeto de CISS con la energía del ΔV del EDR, repartida por rigidez como en la reconstrucción).
 * 2. Forma, ancho y centro con las reglas de Croquis (`crushShapeAndWidth`, `crushCenter`) desde la
 *    cara y la zona horizontal del CDC. No se usan el L ni el D medidos.
 * 3. Malla deformada por el visor y medida en las estaciones del vehículo real.
 *
 * Las líneas base usan la misma energía, ancho y centro; solo cambia la forma.
 */
import {
  bodyFor,
  crushCenter,
  crushShapeAndWidth,
  IMPULSE_RATIO,
  narrowObject,
  planarImpact,
  profileForEnergy,
  RESTITUTION_VV,
  state,
  stiffnessFor,
  zonaFromCdcSide,
  type Stiffness,
} from "@croquis/solver-ts";
import { VEHICLE_CLASSES } from "@croquis/scene-schema";
import {
  applyVehicleDamage,
  buildVehicle,
  measureCrushAt,
  measureDamagedWidth,
  type DamageInput,
  type DamageSide,
} from "@croquis/viewer";
import type { Group } from "three";

/** Un caso exportado por `croquis-eval e5-casos`. */
export interface Caso {
  fuente: "nhtsa" | "ciss";
  id: string;
  tipo: string;
  lado: DamageSide;
  clase: string;
  masa_kg: number;
  largo_m: number | null;
  ancho_m: number | null;
  perfil_m: number[];
  ancho_dano_m: number;
  centro_dano_m: number | null;
  velocidad_kmh: number | null;
  dv_kmh: number | null;
  zona: string;
  c1_extremo: string;
  batalla_m: number | null;
  pdof_deg: number | null;
  obstaculo: string;
  poste_diametro_m: number | null;
  otro_masa_kg: number | null;
  otro_velocidad_kmh: number | null;
  otro_clase: string;
  otro_plano: string;
  test: boolean;
}

/** Fracción de la energía que se lleva la cara de la barrera móvil deformable (Johnson 2011; E2). */
export const MDB_ENERGY_FRACTION = 0.136;
/** Umbral del ancho dañado (ADR 0032). */
export const WIDTH_THRESHOLD_M = 0.02;
/** Forma triangular de la línea base «lineal simple» en las seis estaciones (máximo al centro). */
export const TENT = [0, 0.4, 0.8, 0.8, 0.4, 0];
const KMH = 1 / 3.6;

export interface Prediccion {
  energiaJ: number;
  perfil: number[];
  ancho: number;
  centro: number;
  k: Stiffness;
}

export type Exclusion =
  | "sin_velocidad"
  | "sin_otro_vehiculo"
  | "sin_barrera_movil"
  | "sin_dv"
  | "obstaculo_desconocido"
  | "sin_posicion_del_dano"
  | "clase_sin_malla"
  | "datos_invalidos"
  | "sin_barrera"
  | "barrera_movil_no_calibrada"
  | "error_inesperado";

const inRange = (x: number | null, lo: number, hi: number) => x !== null && x >= lo && x <= hi;

/**
 * Dimensiones del vehículo: las medidas del caso o las típicas de su clase. Los centinelas y
 * valores imposibles de la fuente (ancho −10 mm, largo de 1.6 m en un auto) no son medidas: se usa
 * la típica (ADR 0032).
 */
export function dimensions(c: Caso) {
  const t = (VEHICLE_CLASSES as Record<string, { tipico: Record<string, number> }>)[c.clase]
    ?.tipico;
  if (!t) return null;
  const length = inRange(c.largo_m, 2.5, 20) ? c.largo_m! : t.largo_m!;
  return {
    length,
    width: inRange(c.ancho_m, 1.2, 3) ? c.ancho_m! : t.ancho_m!,
    height: t.alto_m!,
    wheelbase: inRange(c.batalla_m, 1.5, 7)
      ? c.batalla_m!
      : (t.distancia_entre_ejes_m! * length) / t.largo_m!,
  };
}

/** Zonas horizontales del CDC que el esquema acepta en cada cara. */
const ZONAS: Record<DamageSide, readonly string[]> = {
  F: ["L", "C", "R", "Y", "Z", "D"],
  B: ["L", "C", "R", "Y", "Z", "D"],
  L: ["F", "P", "B", "Y", "Z", "D"],
  R: ["F", "P", "B", "Y", "Z", "D"],
};

/**
 * CDC que recibiría Croquis. Una zona que el esquema no acepta en esa cara (el «9» de desconocida)
 * no llega al solver: se omite y el solver usa su valor por defecto (D), como en la reconstrucción.
 */
export function cdcFor(c: Caso) {
  return { lado: c.lado, zona_horizontal: ZONAS[c.lado].includes(c.zona) ? c.zona : "D" };
}

/** Energía de cierre con restitución e, dado el ΔV de uno de los cuerpos (momento en 1 D). */
export function energyFromDeltaV(dvMs: number, m1: number, m2: number | null, e: number): number {
  if (m2 === null) {
    const vc = dvMs / (1 + e);
    return 0.5 * m1 * vc * vc * (1 - e * e);
  }
  const mu = (m1 * m2) / (m1 + m2);
  const vc = (dvMs * (m1 + m2)) / (m2 * (1 + e));
  return 0.5 * mu * vc * vc * (1 - e * e);
}

/** Lo que predice Croquis para el caso, o el motivo de exclusión (ADR 0032). */
/** Un perfil o un ancho medido fuera de lo físico es un centinela de la fuente (9999 mm…). */
export function validMeasurement(c: Caso): boolean {
  return (
    c.perfil_m.length === 6 &&
    c.perfil_m.every((x) => x >= 0 && x <= 2) &&
    c.ancho_dano_m > 0 &&
    c.ancho_dano_m <= 20
  );
}

export function predict(c: Caso): Prediccion | Exclusion {
  if (!(c.masa_kg > 0) || !validMeasurement(c)) return "datos_invalidos";
  const d = dimensions(c);
  if (!d) return "clase_sin_malla";
  const body = bodyFor(c.clase, c.masa_kg, d.length, d.width);
  const own = stiffnessFor(c.clase, zonaFromCdcSide(c.lado));
  const [shape, width] = crushShapeAndWidth(cdcFor(c), body);
  const shaped = (energy: number, k = own.stiffness): Prediccion => ({
    energiaJ: energy,
    perfil: profileForEnergy(energy, width, k, shape),
    ancho: width,
    centro: crushCenter(cdcFor(c), body, width),
    k,
  });
  switch (c.obstaculo) {
    case "barrera_rigida":
    case "barrera_desplazada": {
      if (!c.velocidad_kmh) return "sin_velocidad";
      // Como la reconstrucción contra un muro: impulso planar. La normal (del vehículo hacia la
      // barrera) sale de la PDOF del caso: 0° es de frente y crece en sentido horario, así que en el
      // marco del vehículo (x adelante, y a la izquierda) es (cos θ, −sin θ). Así entran las
      // barreras en ángulo.
      const center = crushCenter(cdcFor(c), body, width);
      const th = ((c.pdof_deg ?? 0) * Math.PI) / 180;
      const res = planarImpact(
        body,
        state({ vx: c.velocidad_kmh * KMH }),
        null,
        null,
        [d.length / 2, center],
        [Math.cos(th), -Math.sin(th)],
        { restitution: RESTITUTION_VV, friction: IMPULSE_RATIO },
      );
      return shaped(res.energyLoss);
    }
    case "poste": {
      if (!c.velocidad_kmh) return "sin_velocidad";
      // La reconstrucción usa la rigidez frontal y la forma «poste» para los objetos angostos.
      const k = stiffnessFor(c.clase, "frontal").stiffness;
      const r = narrowObject(body, c.velocidad_kmh * KMH, k, {
        diameterM: c.poste_diametro_m ?? 0.3,
        material: "metal",
      });
      return {
        energiaJ: r.energyAbsorbedVehicle,
        perfil: r.profile,
        ancho: r.damageWidth,
        centro: crushCenter(cdcFor(c), body, r.damageWidth),
        k,
      };
    }
    case "barrera_movil_deformable":
    case "barrera_movil_rigida": {
      if (!c.otro_masa_kg || !c.otro_velocidad_kmh) return "sin_barrera_movil";
      const v = c.otro_velocidad_kmh * KMH;
      const mu = (c.masa_kg * c.otro_masa_kg) / (c.masa_kg + c.otro_masa_kg);
      const f = c.obstaculo === "barrera_movil_deformable" ? MDB_ENERGY_FRACTION : 0;
      return shaped((1 - f) * 0.5 * mu * v * v);
    }
    case "vehiculo": {
      if (!c.dv_kmh) return "sin_dv";
      if (!c.otro_masa_kg || !c.otro_clase) return "sin_otro_vehiculo";
      const total = energyFromDeltaV(c.dv_kmh * KMH, c.masa_kg, c.otro_masa_kg, RESTITUTION_VV);
      const other = stiffnessFor(c.otro_clase, zonaFromCdcSide(c.otro_plano || "F"));
      const wa = 1 / own.stiffness.b;
      const wb = 1 / other.stiffness.b;
      return shaped((total * wa) / (wa + wb));
    }
    case "objeto_rigido": {
      if (!c.dv_kmh) return "sin_dv";
      return shaped(energyFromDeltaV(c.dv_kmh * KMH, c.masa_kg, null, RESTITUTION_VV));
    }
    case "objeto_angosto": {
      if (!c.dv_kmh) return "sin_dv";
      // Velocidad de impacto con la que `narrowObject` da el ΔV del EDR (bisección).
      const k = stiffnessFor(c.clase, "frontal").stiffness;
      const target = c.dv_kmh * KMH;
      const opts = { diameterM: 0.3, material: "concreto" };
      let lo = 0;
      let hi = 2 * target + 5;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (narrowObject(body, mid, k, opts).deltaV < target) lo = mid;
        else hi = mid;
      }
      const r = narrowObject(body, (lo + hi) / 2, k, opts);
      return {
        energiaJ: r.energyAbsorbedVehicle,
        perfil: r.profile,
        ancho: r.damageWidth,
        centro: crushCenter(cdcFor(c), body, r.damageWidth),
        k,
      };
    }
    case "sin_barrera":
    case "barrera_movil_no_calibrada":
      return c.obstaculo;
    default:
      return "obstaculo_desconocido";
  }
}

/** Estaciones (u, marco del visor) donde se midió el vehículo real, en orden de Croquis (C1 en +u). */
export function measuredStations(c: Caso, pred: Prediccion, group: Group): number[] | Exclusion {
  let center: number;
  if (c.fuente === "nhtsa") {
    // La convención de D de NHTSA no se pudo verificar: se centra en el centro predicho (ADR 0032).
    center = pred.centro;
  } else {
    if (c.centro_dano_m === null) return "sin_posicion_del_dano";
    if (c.lado === "F" || c.lado === "B") {
      center = -c.centro_dano_m; // CISS: + derecha; Croquis: + izquierda
    } else {
      // CISS: desde la mitad de la batalla, + adelante. La mitad de la batalla de la malla sale de
      // la posición de sus llantas.
      const xs: number[] = [];
      group.traverse((o) => {
        if (o.name.startsWith("wheel_")) xs.push(o.position.x);
      });
      if (xs.length < 2) return "sin_posicion_del_dano";
      center = (Math.min(...xs) + Math.max(...xs)) / 2 + c.centro_dano_m;
    }
  }
  return Array.from({ length: 6 }, (_, k) => center + (0.5 - k / 5) * c.ancho_dano_m);
}

/** Perfil medido en orden de Croquis, o null si no se sabe dónde está C1 (ADR 0032). */
export function measuredInCroquisOrder(c: Caso): number[] | null {
  const croquisFirst = c.lado === "F" || c.lado === "B" ? "izquierda" : "adelante";
  const opposite = c.lado === "F" || c.lado === "B" ? "derecha" : "atras";
  if (c.c1_extremo === croquisFirst) return [...c.perfil_m];
  if (c.c1_extremo === opposite) return [...c.perfil_m].reverse();
  return null;
}

/** Perfil de seis puntos sobre [centro ± ancho/2] en u (lineal entre estaciones; 0 fuera). */
export function profileAt(
  perfil: readonly number[],
  centro: number,
  ancho: number,
  u: number,
): number {
  const s = (centro + ancho / 2 - u) / ancho; // 0 en C1 (+u), 1 en C6
  if (s < 0 || s > 1) return 0;
  const x = s * 5;
  const i = Math.min(4, Math.floor(x));
  return perfil[i]! + (perfil[i + 1]! - perfil[i]!) * (x - i);
}

/** Extensión donde el perfil pasa el umbral (resuelto cada milímetro). */
export function profileWidth(
  perfil: readonly number[],
  ancho: number,
  threshold = WIDTH_THRESHOLD_M,
) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= 1000; i++) {
    const u = -ancho / 2 + (ancho * i) / 1000;
    if (profileAt(perfil, 0, ancho, u) >= threshold) {
      lo = Math.min(lo, u);
      hi = Math.max(hi, u);
    }
  }
  return hi >= lo ? hi - lo : 0;
}

export interface Metricas {
  /** Error medio por punto (m), solo si se conoce el orden de C1–C6 y la fuente lo permite. */
  punto: number | null;
  maximo: number;
  ancho: number;
  area: number;
}

/** Área del perfil de seis estaciones (regla del trapecio, separación L/5). */
export function area(values: readonly number[], largo: number): number {
  const h = largo / 5;
  let s = 0;
  for (let i = 0; i < 5; i++) s += ((values[i]! + values[i + 1]!) / 2) * h;
  return s;
}

export function metrics(
  pred: readonly number[],
  predWidth: number,
  c: Caso,
  ordered: readonly number[] | null,
): Metricas {
  const meas = c.perfil_m;
  return {
    punto:
      ordered && c.fuente === "ciss"
        ? pred.reduce((s, v, i) => s + Math.abs(v - ordered[i]!), 0) / 6
        : null,
    maximo: Math.abs(Math.max(...pred) - Math.max(...meas)),
    ancho: Math.abs(predWidth - c.ancho_dano_m),
    // El orden no cambia el área: se compara con el medido tal cual.
    area: Math.abs(area(pred, c.ancho_dano_m) - area(meas, c.ancho_dano_m)),
  };
}

/** Semilla de las arrugas de la malla de cada caso (FNV-1a del id). */
export function seedFor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export interface Resultado {
  id: string;
  fuente: string;
  tipo: string;
  test: boolean;
  energiaJ: number;
  croquis: Metricas;
  uniforme: Metricas;
  lineal: Metricas;
  /** Para depurar, ajustar en desarrollo y la galería. */
  medido: number[];
  predichoMalla: number[];
  /** La malla en las estaciones del propio solver: fidelidad de la malla al perfil del solver. */
  mallaEnEstacionesSolver: number[];
  perfilSolver: number[];
  anchoSolver: number;
  anchoMalla: number;
  anchoMedido: number;
  obstaculo: string;
  clase: string;
  lado: string;
  zona: string;
}

/** Reproduce y mide un caso completo. */
export function evaluate(c: Caso): Resultado | Exclusion {
  const pred = predict(c);
  if (typeof pred === "string") return pred;
  const d = dimensions(c);
  if (!d) return "clase_sin_malla";
  const group = buildVehicle(c.clase, d);
  const input: DamageInput = {
    lado: c.lado,
    perfil: pred.perfil,
    ancho: pred.ancho,
    centro: pred.centro,
    seed: seedFor(c.id),
  };
  const dmg = applyVehicleDamage(group, c.clase, d, input);
  const stations = measuredStations(c, pred, group);
  if (typeof stations === "string") return stations;
  const ordered = measuredInCroquisOrder(c);
  const onMesh = measureCrushAt(group, dmg.field, stations);
  const ownStations = Array.from({ length: 6 }, (_, k) => pred.centro + (0.5 - k / 5) * pred.ancho);
  const onOwnStations = measureCrushAt(group, dmg.field, ownStations);
  const meshWidth = measureDamagedWidth(group, dmg.field, WIDTH_THRESHOLD_M);
  const baseline = (shape: readonly number[]) => {
    const p = profileForEnergy(pred.energiaJ, pred.ancho, pred.k, shape);
    return {
      at: stations.map((u) => profileAt(p, pred.centro, pred.ancho, u)),
      width: profileWidth(p, pred.ancho),
    };
  };
  const uni = baseline([1, 1, 1, 1, 1, 1]);
  const lin = baseline(TENT);
  return {
    id: c.id,
    fuente: c.fuente,
    tipo: c.tipo,
    test: c.test,
    energiaJ: pred.energiaJ,
    croquis: metrics(onMesh, meshWidth, c, ordered),
    uniforme: metrics(uni.at, uni.width, c, ordered),
    lineal: metrics(lin.at, lin.width, c, ordered),
    medido: ordered ?? c.perfil_m,
    predichoMalla: onMesh,
    mallaEnEstacionesSolver: onOwnStations,
    perfilSolver: pred.perfil,
    anchoSolver: pred.ancho,
    anchoMalla: meshWidth,
    anchoMedido: c.ancho_dano_m,
    obstaculo: c.obstaculo,
    clase: c.clase,
    lado: c.lado,
    zona: c.zona,
  };
}
