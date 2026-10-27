/**
 * Inversión (port de `croquis_solver/inversion.py`, PLAN §6.1.10, ADR 0027): de la evidencia a
 * velocidades, con distribución y no un solo número.
 *
 * 1. ΔV desde el daño (CRASH3) con la rigidez de la clase muestreada (bootstrap de NHTSA).
 * 2. Velocidades y rumbos no declarados ajustados con mínimos cuadrados robustos (`lsq.ts`) para
 *    que el solver reproduzca la evidencia declarada; Laplace para ver qué fija la evidencia;
 *    reestimaciones con entradas perturbadas con semilla para los percentiles.
 * 3. Multiarranque determinista (ADR 0091): arranques fijos con pocas iteraciones, agrupados por
 *    modo; se afinan los mejores y se queda el de menor costo. Los modos dentro de `MODE_MARGIN`
 *    van como alternativas. La evidencia usa semilla fija (`EVIDENCE_SEED`).
 *
 * Traducción función por función de la referencia: mismos nombres, mismo orden de sorteos
 * (`Map` conserva el orden de inserción como los dict de Python), `round` y `%` de CPython
 * (`pymath`). La paridad se mide en E7.
 */
import { deltaVBarrier, deltaVPair, crushEnergy, uniformCrushEnergy, Stiffness } from "./crash3";
import { DOWNED_SLIDE_CLASSES, downedMotorcycleFriction, tireFriction } from "./friction";
import { lstsq, matmul, pinv, transpose } from "./linalg";
import { leastSquaresSoftL1, softL1Cost } from "./lsq";
import { median, pyMod, pyRound, quantilesInclusive, str } from "./pymath";
import { PyRandom } from "./pyrandom";
import { reconstruct, vehicleClasses, type Reconstruction } from "./reconstruct";
import { sampleStiffness, stiffnessFor, zonaFromCdcSide } from "./stiffness";
import calibration from "./data/inversion_calibration.json";
import * as dmath from "./dmath";

type Json = Record<string, unknown>;

const KMH = 3.6;
export const MASS_SPREAD = 0.05;
const RESTITUTION_RIGID: readonly [number, number] = [0.0, 0.2];
export const SIGMA_POSITION_M = 1.0;
/**
 * Factor entre niveles de evidencia (ADR 0091): la deformación medida, restricción, pesa PRIORIDAD
 * veces su σ fuera de su banda; un reposo supuesto tiene PRIORIDAD veces la σ de uno declarado.
 * Global, no por caso.
 */
export const PRIORIDAD = 10.0;
/** Un reposo supuesto a más de esto del de la reconstrucción con la deformación no cabe con ella. */
export const ASSUMED_REST_MISS_M = 3.0 * SIGMA_POSITION_M;
const SIGMA_THROW_M = 1.5;
const SIGMA_SLIDE_M = 1.5;
const SPEED_BOUNDS_KMH: readonly [number, number] = [0.0, 200.0];
const STATED = ["relato", "usuario"];

/** Dispersión del error del modelo de daño (log ΔV), calibrada con CISS dev (E3). */
export function modelSigma(): number {
  return Number((calibration as { sigma_log_dv?: number }).sigma_log_dv ?? 0);
}

// --- 1. ΔV desde el daño ----------------------------------------------------------------------

export interface Damage {
  clase: string;
  masaKg: number;
  /** F, B, L o R */
  plano: string;
  pdofDeg: number;
  perfilM: readonly number[];
  anchoM: number;
  /** Rigidez A (N/m) y B (N/m²) declarada (la del reporte); sin ella, la de la clase, muestreada. */
  rigidez?: readonly [number, number] | null;
}

/** La rigidez declarada (la del reporte) en cada muestra, o la de la clase muestreada. */
function stiffnessSamples(d: Damage, rng: PyRandom, n: number): Stiffness[] {
  if (d.rigidez)
    return Array.from({ length: n }, () => new Stiffness(d.rigidez![0], d.rigidez![1]));
  return sampleStiffness(stiffnessFor(d.clase, zonaFromCdcSide(d.plano)), rng, n);
}

export function pdofOffset(plano: string, pdofDeg: number): number {
  const normal = ({ F: 0.0, R: 90.0, B: 180.0, L: 270.0 } as Record<string, number>)[plano]!;
  const d = pyMod(pdofDeg - normal + 180.0, 360.0) - 180.0;
  return d !== -180.0 ? d : 180.0;
}

function energy(d: Damage, a: number, b: number): number {
  const k = new Stiffness(a, b);
  const off = pdofOffset(d.plano, d.pdofDeg);
  const profile = [...d.perfilM];
  if (profile.length === 0) throw new Error("El daño necesita al menos una profundidad");
  if (profile.length >= 2) return crushEnergy(profile, d.anchoM, k, off);
  return uniformCrushEnergy(profile[0]!, d.anchoM, k);
}

export class Distribution {
  constructor(
    readonly p10: number,
    readonly p50: number,
    readonly p90: number,
    readonly muestras: number,
  ) {}

  toDict(nd = 3): Json {
    return {
      p10: pyRound(this.p10, nd),
      p50: pyRound(this.p50, nd),
      p90: pyRound(this.p90, nd),
      muestras: this.muestras,
    };
  }

  contains(x: number): boolean {
    return this.p10 <= x && x <= this.p90;
  }
}

export function distribution(values: readonly number[]): Distribution {
  const vals = [...values].sort((a, b) => a - b);
  if (vals.length === 0) throw new Error("Sin muestras");
  if (vals.length === 1) return new Distribution(vals[0]!, vals[0]!, vals[0]!, 1);
  const q = quantilesInclusive(vals, 10);
  return new Distribution(q[0]!, median(vals), q[q.length - 1]!, vals.length);
}

/** σ (km/h) del residuo de un ΔV por daño: p10–p90 de una normal ≈ 2.563 σ, al menos 1. */
export function damageSigma(dist: Distribution): number {
  return Math.max((dist.p90 - dist.p10) / 2.563, 1.0);
}

/**
 * ΔV (km/h) del vehículo `own` a partir del daño medido, con su distribución. Con `otherMassKg` y
 * sin `other`, el otro no tiene la deformación medida: el ΔV sale solo de la energía de `own`, así
 * que es un mínimo (la del otro solo lo subiría; ADR 0091).
 */
export function deltaVFromDamage(
  own: Damage,
  other: Damage | null = null,
  opts: { rigid?: boolean; otherMassKg?: number; seed?: number; n?: number; sigma?: number } = {},
): Distribution {
  const rigid = opts.rigid ?? false;
  const n = opts.n ?? 200;
  const sModel = opts.sigma ?? modelSigma();
  if (other === null && !rigid && opts.otherMassKg === undefined) {
    throw new Error("Entre dos vehículos hace falta el daño o la masa del otro (o usa rigid=True)");
  }
  const rng = new PyRandom(opts.seed ?? 0);
  const ownK = stiffnessSamples(own, rng, n);
  const othK = other !== null ? stiffnessSamples(other, rng, n) : [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const m1 = own.masaKg * rng.uniform(1 - MASS_SPREAD, 1 + MASS_SPREAD);
    const e1 = energy(own, ownK[i]!.a, ownK[i]!.b);
    let dv: number;
    if (other !== null) {
      const m2 = other.masaKg * rng.uniform(1 - MASS_SPREAD, 1 + MASS_SPREAD);
      const e2 = energy(other, othK[i]!.a, othK[i]!.b);
      dv = deltaVPair(e1 + e2, m1, m2)[0];
    } else if (opts.otherMassKg !== undefined) {
      const m2 = opts.otherMassKg * rng.uniform(1 - MASS_SPREAD, 1 + MASS_SPREAD);
      dv = deltaVPair(e1, m1, m2)[0];
    } else {
      dv = deltaVBarrier(e1, m1, rng.uniform(RESTITUTION_RIGID[0], RESTITUTION_RIGID[1]));
    }
    if (sModel > 0) dv *= dmath.exp(rng.gauss(0.0, sModel));
    out.push(dv * KMH);
  }
  return distribution(out);
}

// --- 2. Velocidades y ángulos desde la evidencia ----------------------------------------------

const SIGMA_HEADING_DEG = 20.0;
export const ANGLE_BOUND_DEG = 20.0;
const JAC_STEP: Record<string, number> = { velocidad: 1.0, rumbo: 1.0 };
const BOUND_TOL: Record<string, number> = { velocidad: 0.1, rumbo: 0.1 };
export const SCALE: Record<string, number> = { velocidad: 10.0, rumbo: 10.0 };
const IDENT_MAX: Record<string, number> = { velocidad: 30.0, rumbo: 15.0 };
const CHORD_ITER = 4;
const CHORD_TRUST = 1.0;
// Multiarranque (ADR 0091): arranques fijos, pocas iteraciones en cada uno y se afinan los mejores.
export const EVIDENCE_SEED = 0;
export const N_DAMAGE = 2000;
const SCATTER_STARTS = 8;
const SCATTER_SPEED_KMH = [5.0, 150.0] as const;
const SCREEN_NFEV = 6;
const REFINE_MODES = 3;
const MODE_TOL_KMH = 5.0;
/** Puntos de la recta entre dos ajustes donde se busca una loma, y su tolerancia de costo. */
const HILL_POINTS = [0.25, 0.5, 0.75];
const HILL_TOL = 0.05;
/** Margen de costo (½ Δχ²) para presentar otro modo como hipótesis. */
export const MODE_MARGIN = 0.5;
/** Pulido del mejor ajuste (ADR 0091): rondas de la cuerda hasta que el costo deja de bajar. */
const POLISH_ROUNDS = 3;
/** p10–p90 de una normal: el rango lineal cuando las muestras no se apartan de la solución. */
const Z_P90 = 1.2815515655446004;
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71];

function stated(campo: unknown): boolean {
  return campo !== null && campo !== undefined && STATED.includes(String((campo as Json).fuente));
}

function statedPose(pose: unknown): boolean {
  if (pose === null || pose === undefined) return false;
  const proc = ((pose as Json).procedencia ?? {}) as Json;
  return STATED.includes(String(proc.fuente));
}

/** Lo declarado que el solver debe reproducir. */
export class Evidence {
  constructor(
    readonly rest: Map<string, [number, number]>,
    readonly throwM: Map<string, number>,
    readonly damageDv: Map<string, Distribution>,
    readonly restHeading: Map<string, number> = new Map(),
    readonly skid: Map<string, number> = new Map(),
    readonly slide: Map<string, number> = new Map(),
    /** Vehículo → ΔV mínimo que implica su daño cuando el otro no tiene el suyo medido. */
    readonly damageMin: Map<string, Distribution> = new Map(),
    /** Vehículo → posición y rumbo finales supuestos a propósito (evidencia blanda, ADR 0091). */
    readonly restAssumed: Map<string, [number, number]> = new Map(),
    readonly headingAssumed: Map<string, number> = new Map(),
    /** La hipótesis «cuadra con el reposo supuesto»: el supuesto pesa como dato. */
    readonly assumedAsData = false,
  ) {}

  empty(): boolean {
    return !(
      this.rest.size ||
      this.throwM.size ||
      this.damageDv.size ||
      this.damageMin.size ||
      this.restHeading.size ||
      this.slide.size ||
      this.restAssumed.size
    );
  }

  /** Cuánto más incierto es un reposo supuesto (y cuánto pesa la restricción del daño). */
  weight(): number {
    return this.assumedAsData ? 1.0 : PRIORIDAD;
  }

  /** La misma evidencia en la hipótesis «cuadra con el reposo supuesto». */
  asAssumedData(): Evidence {
    return new Evidence(
      this.rest,
      this.throwM,
      this.damageDv,
      this.restHeading,
      this.skid,
      this.slide,
      this.damageMin,
      this.restAssumed,
      this.headingAssumed,
      true,
    );
  }

  labels(): string[] {
    const sorted = (m: Map<string, unknown>) => [...m.keys()].sort();
    return [
      ...sorted(this.rest).map((k) => `reposo:${k}`),
      ...sorted(this.restHeading).map((k) => `rumbo_final:${k}`),
      ...sorted(this.skid).map((k) => `marcas_frenado:${k}`),
      ...sorted(this.slide).map((k) => `marcas_despues:${k}`),
      ...sorted(this.throwM).map((k) => `proyeccion:${k}`),
      ...sorted(this.damageDv).map((k) => `dano:${k}`),
      ...sorted(this.damageMin).map((k) => `dano_minimo:${k}`),
      ...sorted(this.restAssumed).map((k) => `reposo_supuesto:${k}`),
      ...sorted(this.headingAssumed).map((k) => `rumbo_final_supuesto:${k}`),
    ];
  }
}

function lenM(campo: Json): number {
  const v = Number(campo.valor);
  const f = ({ m: 1.0, cm: 0.01, mm: 0.001, km: 1000.0 } as Record<string, number>)[
    str(campo.unidad, "m")
  ];
  return v * (f ?? 1.0);
}

function classMass(clase: string): number {
  const tip = ((vehicleClasses()[clase] ?? {}).tipico ?? {}) as Json;
  return Number(tip.masa_kg ?? 1200.0);
}

/** Evidencia declarada de la escena (solo lo que dice el relato o la persona usuaria). */
/** La evidencia de la escena; el ΔV por daño, con semilla fija por omisión (ADR 0091). */
export function evidenceFromSpec(spec: Json, seed = EVIDENCE_SEED, nDamage = N_DAMAGE): Evidence {
  const vehiculos = spec.vehiculos as Json[];
  const personas = spec.personas as Json[];
  const rest = new Map<string, [number, number]>();
  const restHeading = new Map<string, number>();
  const restAssumed = new Map<string, [number, number]>();
  const headingAssumed = new Map<string, number>();
  for (const v of vehiculos) {
    const pf = v.posicion_final as Json | undefined;
    if (statedPose(pf) && pf) {
      rest.set(String(v.id), [Number(pf.x), Number(pf.y)]);
      if (pf.rumbo_deg !== undefined && pf.rumbo_deg !== null) {
        restHeading.set(String(v.id), Number(pf.rumbo_deg));
      }
    } else if (pf && v.posicion_final_supuesta === true) {
      restAssumed.set(String(v.id), [Number(pf.x), Number(pf.y)]);
      if (pf.rumbo_deg !== undefined && pf.rumbo_deg !== null) {
        headingAssumed.set(String(v.id), Number(pf.rumbo_deg));
      }
    }
  }
  const throwM = new Map<string, number>();
  const skid = new Map<string, number>();
  const slide = new Map<string, number>();
  for (const e of (spec.evidencias ?? []) as Json[]) {
    const isStated = STATED.includes(String(((e.procedencia ?? {}) as Json).fuente));
    const puntos = e.puntos as Json[] | undefined;
    if (e.tipo === "posicion_final" && e.vehiculo_id && puntos && puntos.length && isStated) {
      const p = puntos[puntos.length - 1]!;
      rest.set(str(e.vehiculo_id), [Number(p.x), Number(p.y)]);
    } else if (e.tipo === "distancia_proyeccion" && stated(e.longitud)) {
      const pid =
        (e.persona_id as string | undefined) ||
        (personas.find((p) => !p.vehiculo_id)?.id as string | undefined);
      if (pid) throwM.set(pid, lenM(e.longitud as Json));
    } else if (
      (e.tipo === "marcas_frenado" || e.tipo === "marcas_derrape") &&
      e.vehiculo_id &&
      stated(e.longitud)
    ) {
      const fase =
        (e.fase as string | undefined) || (e.tipo === "marcas_frenado" ? "antes_impacto" : null);
      if (fase === "despues_impacto") slide.set(str(e.vehiculo_id), lenM(e.longitud as Json));
      else if (fase === "antes_impacto" && e.tipo === "marcas_frenado") {
        skid.set(str(e.vehiculo_id), lenM(e.longitud as Json));
      }
    }
  }
  const damageDv = new Map<string, Distribution>();
  const byId = new Map(vehiculos.map((v) => [String(v.id), v]));
  const declared = ((spec.danos_declarados ?? []) as Json[]).filter(
    (d) => stated(d.profundidad_aplastamiento) && stated(d.ancho_danado),
  );
  const event = ((spec.eventos ?? []) as Json[]).find((e) => String(e.tipo).startsWith("impacto"));
  // La cara con que tocó cada vehículo en el primer impacto (su CDC), si se dice.
  const contacto = new Map<string, string>();
  for (const z of (event?.zonas_impacto ?? []) as Json[])
    contacto.set(String(z.vehiculo_id), str(((z.cdc ?? {}) as Json).lado, ""));
  const dmg = new Map<string, Damage>();
  for (const d of declared) {
    const v = byId.get(String(d.vehiculo_id));
    if (!v) continue;
    const lado = str(((d.zona ?? {}) as Json).lado, "F");
    if (!["F", "B", "L", "R"].includes(lado)) continue;
    // Con varios daños medidos, el de la cara del contacto; si no se sabe, el primero.
    const previo = dmg.get(String(v.id));
    if (
      previo !== undefined &&
      (previo.plano === contacto.get(String(v.id)) || lado !== contacto.get(String(v.id)))
    )
      continue;
    const masa = v.masa
      ? Number((v.masa as Json).valor)
      : classMass(String((v.clase as Json).valor));
    const perfil = d.perfil_aplastamiento as Json | undefined;
    const rig = d.rigidez as Json | undefined;
    dmg.set(String(v.id), {
      clase: String((v.clase as Json).valor),
      masaKg: masa,
      plano: lado,
      pdofDeg: ({ F: 0.0, R: 90.0, B: 180.0, L: 270.0 } as Record<string, number>)[lado]!,
      perfilM: stated(perfil)
        ? (perfil!.valor as number[]).map((c) => lenM({ valor: c, unidad: perfil!.unidad }))
        : [lenM(d.profundidad_aplastamiento as Json)],
      anchoM: lenM(d.ancho_danado as Json),
      rigidez: stated(rig) ? [Number(rig!.a), Number(rig!.b)] : null,
    });
  }
  const damageMin = new Map<string, Distribution>();
  if (event) {
    const actors = ((event.actores ?? []) as string[]).filter((a) => byId.has(a));
    const rigid = event.tipo === "impacto_vehiculo_objeto";
    actors.forEach((vid, k) => {
      const own = dmg.get(vid);
      if (!own) return;
      if (rigid) {
        damageDv.set(vid, deltaVFromDamage(own, null, { rigid: true, seed: seed + k, n: nDamage }));
      } else {
        const otherId = actors.find((o) => o !== vid);
        if (otherId === undefined) return;
        const other = dmg.get(otherId);
        if (other !== undefined) {
          damageDv.set(vid, deltaVFromDamage(own, other, { seed: seed + k, n: nDamage }));
        } else {
          // El otro sin su deformación medida: la energía de este es una cota inferior.
          const o = byId.get(otherId)!;
          const masaO = o.masa
            ? Number((o.masa as Json).valor)
            : classMass(String((o.clase as Json).valor));
          damageMin.set(
            vid,
            deltaVFromDamage(own, null, { otherMassKg: masaO, seed: seed + k, n: nDamage }),
          );
        }
      }
    });
  }
  return new Evidence(
    rest,
    throwM,
    damageDv,
    restHeading,
    skid,
    slide,
    damageMin,
    restAssumed,
    headingAssumed,
  );
}

export function movingVehicles(spec: Json): string[] {
  return (spec.vehiculos as Json[])
    .filter((v) => !["detenido", "estacionado"].includes(String((v.maniobra as Json).valor)))
    .map((v) => String(v.id));
}

/** Las marcas de frenado declaradas fijan la distancia de frenado antes del impacto. */
export function withMarks(spec: Json, ev: Evidence): Json {
  if (ev.skid.size === 0) return spec;
  const s = structuredClone(spec);
  for (const v of s.vehiculos as Json[]) {
    const length = ev.skid.get(String(v.id));
    if (length === undefined) continue;
    const fr = (v.frenado ?? {}) as Json;
    const prev = (fr.distancia_antes_impacto ?? {}) as Json;
    if (prev.fuente === "usuario") continue;
    fr.aplico = { valor: true, fuente: "relato", confianza: 0.8 };
    fr.distancia_antes_impacto = { valor: length, unidad: "m", fuente: "relato", confianza: 0.8 };
    v.frenado = fr;
  }
  return s;
}

/** Incógnita del ajuste: velocidad previa (km/h) o rumbo inicial (°) de un vehículo. */
export class Param {
  constructor(
    readonly kind: "velocidad" | "rumbo",
    readonly vehicle: string,
    readonly start: number,
    readonly lo: number,
    readonly hi: number,
    readonly declared: boolean,
  ) {}

  get name(): string {
    return `${this.kind}:${this.vehicle}`;
  }
}

export function parameters(spec: Json, ev: Evidence): Param[] {
  const out: Param[] = [];
  const byId = new Map((spec.vehiculos as Json[]).map((v) => [String(v.id), v]));
  const ids = movingVehicles(spec);
  for (const vid of ids) {
    const vp = (byId.get(vid)!.velocidad_previa ?? {}) as Json;
    const val = Number(vp.valor ?? 40.0) * (vp.unidad === "m/s" ? 3.6 : 1.0);
    const start = Math.min(Math.max(val, 5.0), SPEED_BOUNDS_KMH[1] - 1);
    const declared = Object.keys(vp).length > 0 && stated(vp);
    out.push(
      new Param("velocidad", vid, start, SPEED_BOUNDS_KMH[0], SPEED_BOUNDS_KMH[1], declared),
    );
  }
  if (ev.rest.size || ev.restHeading.size) {
    for (const vid of ids) {
      const pose = byId.get(vid)!.posicion_inicial as Json;
      if (statedPose(pose)) continue;
      const h = Number(pose.rumbo_deg);
      out.push(new Param("rumbo", vid, h, h - ANGLE_BOUND_DEG, h + ANGLE_BOUND_DEG, false));
    }
  }
  return out;
}

/** Escena con las velocidades y rumbos de `values` ("velocidad:veh-a" → km/h, etc.). */
export function applyValues(spec: Json, values: Map<string, number>): Json {
  const s = structuredClone(spec);
  const byId = new Map((s.vehiculos as Json[]).map((v) => [String(v.id), v]));
  for (const [name, x] of values) {
    const i = name.indexOf(":");
    const kind = name.slice(0, i);
    const vid = name.slice(i + 1);
    if (kind === "velocidad") {
      byId.get(vid)!.velocidad_previa = {
        valor: x,
        unidad: "km/h",
        fuente: "supuesto",
        confianza: 0.5,
      };
    } else if (kind === "rumbo") {
      (byId.get(vid)!.posicion_inicial as Json).rumbo_deg = Math.max(-360.0, Math.min(360.0, x));
    }
  }
  return s;
}

function wrapDeg(a: number): number {
  return pyMod(a + 180.0, 360.0) - 180.0;
}

export interface Fit {
  /** parámetro → valor (km/h o grados), en orden de inserción */
  values: Map<string, number>;
  /** nombre del residuo → valor en sigmas (con signo) */
  residuals: Map<string, number>;
  cost: number;
  success: boolean;
}

function tryReconstruct(spec: Json, dt: number, downedMu: number | null): Reconstruction | null {
  try {
    return reconstruct(spec, { dt, ...(downedMu === null ? {} : { downedMu }) });
  } catch {
    return null;
  }
}

function residuals(
  spec: Json,
  ev: Evidence,
  dt: number,
  downedMu: number | null = null,
  active: Map<string, number> | null = null,
): Map<string, number> | null {
  const r = tryReconstruct(spec, dt, downedMu);
  if (r === null) return null;
  const out = new Map<string, number>();
  const byV = new Map(r.vehiculos.map((v) => [v.id, v]));
  const sortedEntries = <T>(m: Map<string, T>) =>
    [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [vid, [x, y]] of sortedEntries(ev.rest)) {
    const v = byV.get(vid);
    if (!v) continue;
    out.set(`reposo:${vid}:x`, (v.restPose[0] - x) / SIGMA_POSITION_M);
    out.set(`reposo:${vid}:y`, (v.restPose[1] - y) / SIGMA_POSITION_M);
  }
  for (const [vid, h] of sortedEntries(ev.restHeading)) {
    const v = byV.get(vid);
    if (!v) continue;
    out.set(`rumbo_final:${vid}`, wrapDeg(v.restPose[2] - h) / SIGMA_HEADING_DEG);
  }
  const byP = new Map(r.personas.map((p) => [p.id, p]));
  for (const [pid, d] of sortedEntries(ev.throwM)) {
    const p = byP.get(pid);
    if (!p || p.throw === null) continue;
    out.set(`proyeccion:${pid}`, (p.throw.throwDistanceM - d) / SIGMA_THROW_M);
  }
  for (const [vid, d] of sortedEntries(ev.slide)) {
    const v = byV.get(vid);
    if (!v) continue;
    out.set(`marcas_despues:${vid}`, (v.distancePostM - d) / SIGMA_SLIDE_M);
  }
  const w = ev.weight();
  for (const [vid, dist] of sortedEntries(ev.damageDv)) {
    const v = byV.get(vid);
    if (!v) continue;
    const name = `dano:${vid}`;
    out.set(name, damageBand(v.deltaVKmh, dist, w, false, active?.get(name) ?? null));
  }
  for (const [vid, dist] of sortedEntries(ev.damageMin)) {
    const v = byV.get(vid);
    if (!v) continue;
    // Un mínimo: solo cuenta si la reconstrucción queda por debajo de su p10.
    const name = `dano_minimo:${vid}`;
    out.set(name, damageBand(v.deltaVKmh, dist, w, true, active?.get(name) ?? null));
  }
  for (const [vid, [x, y]] of sortedEntries(ev.restAssumed)) {
    const v = byV.get(vid);
    if (!v) continue;
    out.set(`reposo_supuesto:${vid}:x`, (v.restPose[0] - x) / (SIGMA_POSITION_M * w));
    out.set(`reposo_supuesto:${vid}:y`, (v.restPose[1] - y) / (SIGMA_POSITION_M * w));
  }
  for (const [vid, h] of sortedEntries(ev.headingAssumed)) {
    const v = byV.get(vid);
    if (!v) continue;
    out.set(`rumbo_final_supuesto:${vid}`, wrapDeg(v.restPose[2] - h) / (SIGMA_HEADING_DEG * w));
  }
  return out;
}

/**
 * Residuo del ΔV de la reconstrucción contra el de la deformación medida: cero dentro de la banda
 * p10–p90 (en un mínimo, desde p10); fuera, la distancia al borde en σ por `w`. Con `edge` (el signo
 * del lado que viola el mejor ajuste), la restricción activa es una igualdad local (ADR 0091).
 */
export function damageBand(
  dv: number,
  dist: Distribution,
  w: number,
  minimum = false,
  edge: number | null = null,
): number {
  if (edge !== null) return ((dv - (edge < 0 ? dist.p10 : dist.p90)) / damageSigma(dist)) * w;
  if (dv < dist.p10) return ((dv - dist.p10) / damageSigma(dist)) * w;
  if (!minimum && dv > dist.p90) return ((dv - dist.p90) / damageSigma(dist)) * w;
  return 0.0;
}

/** Vehículo → a cuántos metros de su reposo supuesto lo deja el ajuste. */
export function assumedRestMiss(ev: Evidence, fit: Fit): Map<string, number> {
  const s = SIGMA_POSITION_M * ev.weight();
  return new Map(
    [...ev.restAssumed.keys()]
      .sort()
      .map((vid) => [
        vid,
        dmath.hypot(
          fit.residuals.get(`reposo_supuesto:${vid}:x`) ?? 0,
          fit.residuals.get(`reposo_supuesto:${vid}:y`) ?? 0,
        ) * s,
      ]),
  );
}

/** Residuos en función de los parámetros libres, con caché por punto. */
class Problem {
  readonly names: string[] = [];
  private readonly cache = new Map<string, number[]>();
  active: Map<string, number> = new Map();

  constructor(
    readonly spec: Json,
    readonly ev: Evidence,
    readonly params: Param[],
    readonly fixed: Map<string, number>,
    readonly dt: number,
    readonly downedMu: number | null = null,
  ) {}

  values(x: readonly number[]): Map<string, number> {
    const out = new Map(this.fixed);
    this.params.forEach((p, k) => out.set(p.name, x[k]!));
    return out;
  }

  raw(x: readonly number[]): Map<string, number> | null {
    return residuals(
      applyValues(this.spec, this.values(x)),
      this.ev,
      this.dt,
      this.downedMu,
      this.active,
    );
  }

  /** Las restricciones del daño que el ajuste en `x` viola quedan activas para el jacobiano. */
  activate(x: readonly number[]): void {
    const res = this.raw(x) ?? new Map<string, number>();
    this.active = new Map(
      [...res].filter(
        ([k, r]) => (k.startsWith("dano:") || k.startsWith("dano_minimo:")) && r !== 0.0,
      ),
    );
    this.cache.clear();
  }

  call(x: readonly number[]): number[] {
    const key = x.map((v) => String(pyRound(v, 9))).join(",");
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const res = this.raw(x);
    let out: number[];
    if (res === null) {
      out = new Array<number>(Math.max(this.names.length, 1)).fill(1e3);
    } else {
      if (this.names.length === 0) this.names.push(...[...res.keys()].sort());
      out = this.names.map((k) => res.get(k) ?? 1e3);
    }
    this.cache.set(key, out);
    return out;
  }

  /** Jacobiano (filas: residuos; columnas: parámetros) por diferencias hacia adelante. */
  jac(x: readonly number[]): number[][] {
    const f0 = this.call(x);
    const cols: number[][] = [];
    this.params.forEach((p, k) => {
      let h = JAC_STEP[p.kind]!;
      if (x[k]! + h > p.hi) h = -h;
      const xk = [...x];
      xk[k]! += h;
      const fk = this.call(xk);
      cols.push(f0.map((v, i) => (fk[i]! - v) / h));
    });
    return f0.map((_, i) => cols.map((c) => c[i]!));
  }
}

export function fitEvidence(
  spec: Json,
  ev: Evidence,
  opts: {
    dt?: number;
    maxNfev?: number;
    start?: Map<string, number> | null;
    free?: Set<string> | null;
    downedMu?: number | null;
  } = {},
): Fit {
  const dt = opts.dt ?? 0.1;
  const maxNfev = opts.maxNfev ?? 40;
  const base = withMarks(spec, ev);
  const params = parameters(base, ev);
  const xStart = new Map(params.map((p) => [p.name, p.start] as [string, number]));
  for (const [k, v] of opts.start ?? []) xStart.set(k, v);
  const free = opts.free ?? null;
  const freeParams = params.filter((p) => free === null || free.has(p.name));
  const fixed = new Map([...xStart].filter(([n]) => freeParams.every((p) => p.name !== n)));
  const prob = new Problem(base, ev, freeParams, fixed, dt, opts.downedMu ?? null);
  const x0 = freeParams.map((p) => Math.min(Math.max(xStart.get(p.name)!, p.lo), p.hi));
  if (freeParams.length === 0 || ev.empty()) {
    const res0 =
      residuals(applyValues(base, xStart), ev, dt, opts.downedMu ?? null) ??
      new Map<string, number>();
    return { values: xStart, residuals: res0, cost: 0.0, success: true };
  }
  prob.call(x0);
  if (prob.names.length === 0)
    return { values: xStart, residuals: new Map(), cost: 0, success: true };
  const sol = leastSquaresSoftL1(
    (x) => prob.call(x),
    (x) => prob.jac(x),
    x0,
    freeParams.map((p) => p.lo),
    freeParams.map((p) => p.hi),
    freeParams.map((p) => SCALE[p.kind]!),
    maxNfev,
  );
  const best = prob.call(sol.x);
  return {
    values: prob.values(sol.x),
    residuals: new Map(prob.names.map((k, i) => [k, best[i]!])),
    cost: sol.cost,
    success: sol.success,
  };
}

/** Desviación local de cada parámetro en el mejor ajuste (aproximación de Laplace). */
export function localSigma(spec: Json, ev: Evidence, fit: Fit, dt = 0.1): Map<string, number> {
  const base = withMarks(spec, ev);
  const params = parameters(base, ev);
  if (params.length === 0) return new Map();
  const prob = new Problem(base, ev, params, new Map(), dt);
  const x = params.map((p) => Math.min(Math.max(fit.values.get(p.name) ?? p.start, p.lo), p.hi));
  prob.activate(x);
  const j = prob.jac(x);
  if (j.length === 0 || prob.names.length === 0) {
    return new Map(params.map((p) => [p.name, Infinity]));
  }
  return laplace(j, params);
}

function laplace(j: number[][], params: Param[]): Map<string, number> {
  const jtj = matmul(transpose(j), j);
  const cov = pinv(jtj, 1e-10);
  const out = new Map<string, number>();
  params.forEach((p, k) => {
    let acc = 0;
    for (const row of j) acc += row[k]! * row[k]!;
    const col = Math.sqrt(acc);
    const v = cov[k]![k]!;
    out.set(p.name, col < 1e-6 || v <= 0 ? Infinity : Math.sqrt(v));
  });
  return out;
}

function chordRefit(prob: Problem, xBest: readonly number[], j: number[][]): Fit | null {
  const lo = prob.params.map((p) => p.lo);
  const hi = prob.params.map((p) => p.hi);
  let x = [...xBest];
  let r = prob.call(x);
  const loss = (v: readonly number[]) => {
    let acc = 0;
    for (const e of v) {
      const z = e * e;
      acc += z / (Math.sqrt(1.0 + z) + 1.0);
    }
    return acc;
  };
  let accepted = 0;
  for (let it = 0; it < CHORD_ITER; it++) {
    const w = r.map((e) => 1.0 / Math.sqrt(Math.sqrt(1.0 + e * e)));
    const a = r.map((_, i) => j[i]!.map((v) => w[i]! * v));
    const rhs = r.map((ri, i) => -(ri * w[i]!));
    let step = lstsq(a, rhs);
    // Conjunto activo: un parámetro en su límite cuyo paso apunta hacia afuera se queda fijo y el
    // paso se recalcula con los demás.
    const keep = x
      .map((_, k) => k)
      .filter((k) => !((x[k]! <= lo[k]! && step[k]! < 0) || (x[k]! >= hi[k]! && step[k]! > 0)));
    if (keep.length < x.length) {
      const sub = keep.length
        ? lstsq(
            a.map((row) => keep.map((k) => row[k]!)),
            rhs,
          )
        : [];
      step = x.map(() => 0.0);
      keep.forEach((k, i) => {
        step[k] = sub[i]!;
      });
    }
    // Región de confianza: a lo más `CHORD_TRUST` escalas por paso (ADR 0091).
    let bigScaled = 0.0;
    prob.params.forEach((p, k) => {
      bigScaled = Math.max(bigScaled, Math.abs(step[k]!) / SCALE[p.kind]!);
    });
    if (bigScaled > CHORD_TRUST) step = step.map((v) => (v * CHORD_TRUST) / bigScaled);
    let moved = false;
    for (const frac of [1.0, 0.5, 0.25]) {
      const xNew = x.map((xk, k) => Math.min(Math.max(xk + frac * step[k]!, lo[k]!), hi[k]!));
      const rNew = prob.call(xNew);
      if (loss(rNew) < loss(r)) {
        x = xNew;
        r = rNew;
        moved = true;
        break;
      }
    }
    if (!moved) break;
    accepted += 1;
    let big = 0;
    for (const v of step) big = Math.max(big, Math.abs(v));
    if (big < 0.05) break;
  }
  if (accepted === 0) return null;
  return {
    values: prob.values(x),
    residuals: new Map(prob.names.map((k, i) => [k, r[i]!])),
    cost: loss(r),
    success: true,
  };
}

/** Una reestimación: la escena y la evidencia sorteadas, y el arrastre de la moto caída. */
export interface Perturbed {
  spec: Json;
  evidence: Evidence;
  downedMu: number | null;
}

export function perturbed(spec: Json, ev: Evidence, rng: PyRandom): Perturbed {
  const s = structuredClone(spec);
  const lugar = s.lugar as Json;
  const sup = String((lugar.superficie as Json).valor);
  const mu = tireFriction(sup, String((lugar.estado_superficie as Json).valor));
  lugar.friccion = { valor: rng.uniform(mu.low, mu.high), fuente: "supuesto", confianza: 0.5 };
  for (const v of s.vehiculos as Json[]) {
    const base = v.masa
      ? Number((v.masa as Json).valor)
      : classMass(String((v.clase as Json).valor));
    v.masa = {
      valor: pyRound(base * rng.uniform(1 - MASS_SPREAD, 1 + MASS_SPREAD), 1),
      unidad: "kg",
      fuente: "supuesto",
      confianza: 0.5,
    };
  }
  const rest = new Map<string, [number, number]>();
  for (const [k, [x, y]] of ev.rest) {
    const nx = x + rng.gauss(0, SIGMA_POSITION_M);
    const ny = y + rng.gauss(0, SIGMA_POSITION_M);
    rest.set(k, [nx, ny]);
  }
  const heading = new Map<string, number>();
  for (const [k, h] of ev.restHeading) heading.set(k, h + rng.gauss(0, SIGMA_HEADING_DEG));
  const throwM = new Map<string, number>();
  for (const [k, d] of ev.throwM) throwM.set(k, Math.max(0.5, d + rng.gauss(0, SIGMA_THROW_M)));
  const damage = new Map<string, Distribution>();
  for (const [k, d] of ev.damageDv) {
    const shift = rng.gauss(0, (d.p90 - d.p10) / 2.563);
    damage.set(k, new Distribution(d.p10 + shift, d.p50 + shift, d.p90 + shift, d.muestras));
  }
  const damageMin = new Map<string, Distribution>();
  for (const [k, d] of ev.damageMin) {
    const shift = rng.gauss(0, (d.p90 - d.p10) / 2.563);
    damageMin.set(k, new Distribution(d.p10 + shift, d.p50 + shift, d.p90 + shift, d.muestras));
  }
  const slide = new Map<string, number>();
  for (const [k, d] of ev.slide) slide.set(k, Math.max(0.5, d + rng.gauss(0, SIGMA_SLIDE_M)));
  const sPos = SIGMA_POSITION_M * ev.weight();
  const restAssumed = new Map<string, [number, number]>();
  for (const [k, [x, y]] of ev.restAssumed) {
    const nx = x + rng.gauss(0, sPos);
    const ny = y + rng.gauss(0, sPos);
    restAssumed.set(k, [nx, ny]);
  }
  const headingAssumed = new Map<string, number>();
  for (const [k, h] of ev.headingAssumed)
    headingAssumed.set(k, h + rng.gauss(0, SIGMA_HEADING_DEG * ev.weight()));
  const e = new Evidence(
    rest,
    throwM,
    damage,
    heading,
    new Map(ev.skid),
    slide,
    damageMin,
    restAssumed,
    headingAssumed,
    ev.assumedAsData,
  );
  let downedMu: number | null = null;
  if (
    (s.vehiculos as Json[]).some((v) => DOWNED_SLIDE_CLASSES.has(String((v.clase as Json).valor)))
  ) {
    const md = downedMotorcycleFriction(sup);
    downedMu = rng.uniform(md.low, md.high);
  }
  return { spec: s, evidence: e, downedMu };
}

export class Estimate {
  constructor(
    readonly param: Param,
    readonly sigmaLocal: number,
    readonly identifiable: boolean,
    readonly best: number | null,
    readonly dist: Distribution | null,
    /** «laplace» si las muestras no se apartaron de la solución y el rango es el lineal. */
    readonly rangeBy: string = "muestras",
  ) {}

  get atBound(): boolean {
    const p = this.param;
    return this.best !== null && Math.min(this.best - p.lo, p.hi - this.best) < BOUND_TOL[p.kind]!;
  }

  toDict(): Json {
    const p = this.param;
    const out: Json = {
      parametro: p.kind === "velocidad" ? "velocidad_previa" : "rumbo_inicial",
      vehiculo: p.vehicle,
      unidad: p.kind === "velocidad" ? "km/h" : "deg",
      inicial: pyRound(p.start, 2),
      inicial_declarado: p.declared,
      identificable: this.identifiable,
    };
    if (Number.isFinite(this.sigmaLocal)) out.sigma_local = pyRound(this.sigmaLocal, 2);
    if (this.identifiable && this.best !== null && this.dist !== null) {
      out.estimacion = {
        mejor: pyRound(this.best, 2),
        ...this.dist.toDict(2),
        ...(this.rangeBy !== "muestras" ? { rango_por: this.rangeBy } : {}),
      };
      out.en_limite = this.atBound;
    }
    return out;
  }
}

export class Inversion {
  constructor(
    readonly evidence: string[],
    readonly estimates: Estimate[],
    readonly best: Fit,
    readonly impactSpeeds: Map<string, Distribution>,
    readonly fits: Fit[] = [],
    readonly seed = 0,
    /** La hipótesis «cuadra con el reposo supuesto» (ADR 0091). */
    readonly assumedAsData = false,
    /** El ajuste conjunto con todo libre, si algo no quedó fijado. */
    readonly full: Fit | null = null,
  ) {}

  /** Los modos del multiarranque, del menor costo al mayor (ADR 0091). */
  modes: Mode[] = [];
  /** Los otros modos dentro de `MODE_MARGIN` del mejor, cada uno con su estimación. */
  alternatives: Inversion[] = [];

  /** Velocidad previa estimada de cada vehículo que la evidencia fija. */
  get speeds(): Map<string, Distribution> {
    const out = new Map<string, Distribution>();
    for (const e of this.estimates) {
      if (e.param.kind === "velocidad" && e.dist !== null) out.set(e.param.vehicle, e.dist);
    }
    return out;
  }

  toDict(): Json {
    const byKey = <T>(m: Map<string, T>) =>
      [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return {
      semilla: this.seed,
      muestras: this.fits.length,
      evidencia: this.evidence,
      parametros: this.estimates.map((e) => e.toDict()),
      velocidad_impacto: byKey(this.impactSpeeds).map(([k, d]) => ({
        vehiculo: k,
        ...d.toDict(2),
      })),
      residuos: byKey(this.best.residuals).map(([k, v]) => ({ nombre: k, sigma: pyRound(v, 3) })),
      convergio: this.best.success,
      ...(this.full !== null
        ? {
            ajuste_completo: {
              valores: byKey(this.full.values).map(([k, v]) => ({
                nombre: k,
                valor: pyRound(v, 2),
              })),
              residuos: byKey(this.full.residuals).map(([k, v]) => ({
                nombre: k,
                sigma: pyRound(v, 3),
              })),
            },
          }
        : {}),
      ...(this.modes.length > 0
        ? {
            multiarranque: {
              margen_costo: MODE_MARGIN,
              modos: this.modes.map((m, k) =>
                m.toDict(k === 0, k > 0 && m.fit.cost <= this.modes[0]!.fit.cost + MODE_MARGIN),
              ),
            },
          }
        : {}),
      ...(this.alternatives.length
        ? { alternativas: this.alternatives.map((a) => a.toDict()) }
        : {}),
    };
  }
}

/** Un mínimo del costo: su ajuste y cuántos arranques llegaron a él. */
export class Mode {
  constructor(
    readonly fit: Fit,
    readonly starts: number,
  ) {}

  toDict(chosen: boolean, inMargin: boolean): Json {
    return {
      valores: [...this.fit.values.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => ({ nombre: k, valor: pyRound(v, 2) })),
      costo: pyRound(this.fit.cost, 4),
      arranques: this.starts,
      elegido: chosen,
      en_margen: inMargin,
    };
  }
}

/** k-ésimo punto de van der Corput en `base` (una coordenada de la sucesión de Halton). */
function radicalInverse(k: number, base: number): number {
  let out = 0.0;
  let f = 1.0;
  while (k > 0) {
    f /= base;
    out += f * (k % base);
    k = Math.floor(k / base);
  }
  return out;
}

/**
 * Arranques fijos (ADR 0091): el inicial, los compatibles con la deformación y `SCATTER_STARTS`
 * puntos de Halton sobre las velocidades (los rumbos arrancan en su valor inicial).
 */
export function multistartStarts(spec: Json, ev: Evidence, params: Param[]): Map<string, number>[] {
  const starts: Map<string, number>[] = [
    new Map<string, number>(),
    ...damageStarts(spec, ev, params),
  ];
  const speeds = params.filter((p) => p.kind === "velocidad");
  const [lo, hi] = SCATTER_SPEED_KMH;
  for (let k = 1; k <= SCATTER_STARTS; k++) {
    starts.push(
      new Map(
        speeds.map((p, d) => [
          p.name,
          lo + (hi - lo) * radicalInverse(k, PRIMES[d % PRIMES.length]!),
        ]),
      ),
    );
  }
  return starts;
}

function speedsOf(f: Fit): Map<string, number> {
  return new Map(
    [...f.values].filter(([k]) => k.startsWith("velocidad:")).map(([k, v]) => [k.slice(10), v]),
  );
}

function sameMode(a: Fit, b: Fit): boolean {
  const sb = speedsOf(b);
  return [...speedsOf(a)].every(([k, v]) => Math.abs(v - (sb.get(k) ?? Infinity)) <= MODE_TOL_KMH);
}

/** ¿Hay una loma entre los dos ajustes? Si no, son el mismo valle. */
function barrier(prob: Problem, a: Fit, b: Fit): boolean {
  const xa = prob.params.map((p) => a.values.get(p.name)!);
  const xb = prob.params.map((p) => b.values.get(p.name)!);
  const top = Math.max(a.cost, b.cost) + HILL_TOL;
  return HILL_POINTS.some(
    (s) => softL1Cost(prob.call(xa.map((u, k) => u + s * (xb[k]! - u)))) > top,
  );
}

/**
 * Agrupa por modo, del menor costo al mayor (cada modo, su ajuste de menor costo). Con `prob`, dos
 * ajustes lejanos sin una loma entre ellos también son el mismo modo.
 */
function group(fits: [Fit, number][], prob: Problem | null = null): Mode[] {
  const modes: Mode[] = [];
  for (const [f, n] of [...fits].sort((a, b) => a[0].cost - b[0].cost)) {
    const i = modes.findIndex(
      (m) => sameMode(m.fit, f) || (prob !== null && !barrier(prob, m.fit, f)),
    );
    if (i >= 0) modes[i] = new Mode(modes[i]!.fit, modes[i]!.starts + n);
    else modes.push(new Mode(f, n));
  }
  return modes;
}

/**
 * Multiarranque determinista (ADR 0091): cada arranque con `SCREEN_NFEV` evaluaciones, agrupados
 * por modo; los `REFINE_MODES` mejores se afinan con el ajuste completo.
 */
export function findModes(spec: Json, ev: Evidence, params: Param[], dt = 0.1): Mode[] {
  if (!params.length || ev.empty()) return [new Mode(fitEvidence(spec, ev, { dt }), 1)];
  const screened = multistartStarts(spec, ev, params).map(
    (start) => [fitEvidence(spec, ev, { dt, start, maxNfev: SCREEN_NFEV }), 1] as [Fit, number],
  );
  const refined = group(screened)
    .slice(0, REFINE_MODES)
    .map((m) => [fitEvidence(spec, ev, { dt, start: m.fit.values }), m.starts] as [Fit, number]);
  return group(refined, new Problem(withMarks(spec, ev), ev, params, new Map(), dt));
}

/**
 * Velocidades (y rumbos no declarados) que reproducen la evidencia, con percentiles sobre `samples`
 * ajustes con entradas perturbadas. Lo que la evidencia no fija se informa así.
 */
/**
 * Arranques compatibles con la deformación medida (ADR 0091): lejos de ella el ΔV casi no cambia
 * con las velocidades y el ajuste se queda donde arranca. Por cada daño medido entre dos vehículos,
 * la velocidad de cierre que implica la mediana de su ΔV, con cada uno como el que alcanza.
 */
export function damageStarts(spec: Json, ev: Evidence, params: Param[]): Map<string, number>[] {
  const starts: Map<string, number>[] = [];
  const event = ((spec.eventos ?? []) as Json[]).find(
    (e) => String(e.tipo) === "impacto_vehiculo_vehiculo",
  );
  if (!event) return starts;
  const byId = new Map((spec.vehiculos as Json[]).map((v) => [String(v.id), v]));
  const first = new Map(params.map((p) => [p.name, p.start]));
  const mass = (vid: string) => {
    const v = byId.get(vid)!;
    return v.masa ? Number((v.masa as Json).valor) : classMass(String((v.clase as Json).valor));
  };
  const actors = ((event.actores ?? []) as string[]).filter((a) => byId.has(a));
  const damages = new Map([...ev.damageDv, ...ev.damageMin]);
  for (const vid of [...damages.keys()].sort()) {
    const dist = damages.get(vid)!;
    const other = actors.find((o) => o !== vid);
    if (other === undefined || !actors.includes(vid)) continue;
    const closing = (dist.p50 * (mass(vid) + mass(other))) / mass(other);
    for (const [a, b] of [
      [vid, other],
      [other, vid],
    ] as const) {
      const ka = `velocidad:${a}`;
      if (!first.has(ka)) continue;
      const speed = (first.get(`velocidad:${b}`) ?? 0.0) + closing;
      starts.push(new Map([[ka, Math.min(speed, SPEED_BOUNDS_KMH[1] - 1)]]));
    }
  }
  return starts;
}

export function invert(
  spec: Json,
  opts: {
    seed?: number | null;
    samples?: number;
    dt?: number;
    assumedAsData?: boolean;
    /** Solo para medir la sensibilidad a la semilla de la evidencia (ADR 0091). */
    evidenceSeed?: number;
  } = {},
): Inversion {
  const dt = opts.dt ?? 0.1;
  const samples = opts.samples ?? 12;
  const seed = opts.seed ?? Number((spec.meta as Json).semilla);
  const assumedAsData = opts.assumedAsData ?? false;
  let ev = evidenceFromSpec(spec, opts.evidenceSeed ?? EVIDENCE_SEED);
  if (assumedAsData) ev = ev.asAssumedData();
  const params = parameters(withMarks(spec, ev), ev);
  const modes = findModes(spec, ev, params, dt);
  const bestCost = modes[0]!.fit.cost;
  const est = (m: Mode) => estimate(spec, ev, params, m.fit, { seed, samples, dt, assumedAsData });
  const out = est(modes[0]!);
  out.modes = modes;
  out.alternatives = modes
    .slice(1)
    .filter((m) => m.fit.cost <= bestCost + MODE_MARGIN)
    .map(est);
  return out;
}

/**
 * Estimación alrededor de un modo: qué fija la evidencia (Laplace), el reajuste de lo que no fija y
 * el rango con entradas perturbadas, cada muestra reajustada desde ese modo.
 */
function estimate(
  spec: Json,
  ev: Evidence,
  params: Param[],
  bestFull: Fit,
  opts: { seed: number; samples: number; dt: number; assumedAsData: boolean },
): Inversion {
  const { seed, samples, dt, assumedAsData } = opts;
  let best = bestFull;
  const sigma = !ev.empty()
    ? localSigma(spec, ev, best, dt)
    : new Map(params.map((p) => [p.name, Infinity]));
  const ident = new Map(
    params.map((p) => [p.name, (sigma.get(p.name) ?? Infinity) <= IDENT_MAX[p.kind]!]),
  );
  const free = new Set([...ident].filter(([, ok]) => ok).map(([n]) => n));
  // El ajuste conjunto, con todo libre: si algo no queda fijado, se guarda (ADR 0091).
  const full = !ev.empty() && free.size < params.length ? best : null;
  if (free.size && free.size < params.length) {
    const start = new Map(
      params.map((p) => [p.name, free.has(p.name) ? best.values.get(p.name)! : p.start]),
    );
    best = fitEvidence(spec, ev, { dt, start, free });
  }
  best = polish(
    spec,
    ev,
    best,
    params.filter((p) => free.has(p.name)),
    dt,
  );
  const rng = new PyRandom(seed);
  const fits: Fit[] = [];
  const impacts = new Map<string, number[]>();
  const freeParams = params.filter((p) => free.has(p.name));
  const xBest = freeParams.map((p) => best.values.get(p.name)!);
  const fixed = new Map([...best.values].filter(([n]) => !free.has(n)));
  let jBest: number[][] = [];
  if (freeParams.length) {
    const probBest = new Problem(withMarks(spec, ev), ev, freeParams, fixed, dt);
    probBest.activate(xBest);
    jBest = probBest.jac(xBest);
  }
  for (let i = 0; i < (freeParams.length ? samples : 0); i++) {
    const pert = perturbed(spec, ev, rng);
    const { spec: s, evidence: e, downedMu } = pert;
    const prob = new Problem(withMarks(s, e), e, freeParams, fixed, dt, downedMu);
    prob.names.push(...[...best.residuals.keys()].sort());
    // El rango sale de las entradas alrededor del modo elegido, sin saltar a otro: la cuerda con el
    // jacobiano del modo; si no mejora, con el de la muestra; si tampoco, el modo ya es el óptimo
    // local de la muestra.
    const f =
      chordRefit(prob, xBest, jBest) ??
      chordRefit(prob, xBest, sampleJac(prob, xBest)) ??
      at(prob, xBest);
    fits.push(f);
    const r = tryReconstruct(applyValues(withMarks(s, e), f.values), dt, downedMu);
    if (r === null) continue;
    for (const v of r.vehiculos) {
      if (!impacts.has(v.id)) impacts.set(v.id, []);
      impacts.get(v.id)!.push(v.vImpactKmh);
    }
  }
  const estimates = params.map((p) =>
    estimateOf(
      p,
      sigma.get(p.name) ?? Infinity,
      ident.get(p.name)!,
      ident.get(p.name) ? (best.values.get(p.name) ?? null) : null,
      ident.get(p.name) ? fits.map((f) => f.values.get(p.name)!) : [],
    ),
  );
  const impactSpeeds = new Map<string, Distribution>();
  for (const [k, v] of impacts) if (v.length) impactSpeeds.set(k, distribution(v));
  return new Inversion(ev.labels(), estimates, best, impactSpeeds, fits, seed, assumedAsData, full);
}

/** Termina de bajar el costo desde el mejor ajuste con la cuerda (hasta `POLISH_ROUNDS`). */
function polish(spec: Json, ev: Evidence, best: Fit, freeParams: Param[], dt: number): Fit {
  if (!freeParams.length || !best.residuals.size) return best;
  const fixed = new Map([...best.values].filter(([n]) => freeParams.every((p) => p.name !== n)));
  const prob = new Problem(withMarks(spec, ev), ev, freeParams, fixed, dt);
  prob.names.push(...[...best.residuals.keys()].sort());
  let x = freeParams.map((p) => best.values.get(p.name)!);
  let f = at(prob, x);
  for (let k = 0; k < POLISH_ROUNDS; k++) {
    const g = chordRefit(prob, x, sampleJac(prob, x));
    if (g === null || g.cost >= f.cost) break;
    f = g;
    x = freeParams.map((p) => g.values.get(p.name)!);
  }
  return f.cost < best.cost ? f : best;
}

/** La estimación de un parámetro: el p10–p90 de las muestras o, con ancho cero, el lineal. */
function estimateOf(
  p: Param,
  sigma: number,
  identifiable: boolean,
  best: number | null,
  samples: number[],
): Estimate {
  if (!identifiable || best === null || !samples.length)
    return new Estimate(p, sigma, identifiable, best, null);
  const dist = distribution(samples);
  if (dist.p90 - dist.p10 > 1e-9 || !Number.isFinite(sigma) || sigma <= 0)
    return new Estimate(p, sigma, identifiable, best, dist);
  const lo = Math.max(p.lo, best - Z_P90 * sigma);
  const hi = Math.min(p.hi, best + Z_P90 * sigma);
  return new Estimate(
    p,
    sigma,
    identifiable,
    best,
    new Distribution(lo, best, hi, dist.muestras),
    "laplace",
  );
}

/** El jacobiano de la muestra en `x`, con sus restricciones activas, sin tocar `prob`. */
function sampleJac(prob: Problem, x: number[]): number[][] {
  const p = new Problem(prob.spec, prob.ev, prob.params, prob.fixed, prob.dt, prob.downedMu);
  p.names.push(...prob.names);
  p.activate(x);
  return p.jac(x);
}

/** El ajuste en `x` tal cual, con los residuos del problema. */
function at(prob: Problem, x: number[]): Fit {
  const r = prob.call(x);
  return {
    values: prob.values(x),
    residuals: new Map(prob.names.map((k, i) => [k, r[i]!])),
    cost: softL1Cost(r),
    success: true,
  };
}
