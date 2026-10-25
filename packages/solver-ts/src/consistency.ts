/**
 * Banderas de consistencia que no muestrean (port de una parte de `croquis_solver.consistency`;
 * PLAN §6.1.12): un vehículo "detenido" con velocidad, marcas de frenado más largas de lo que
 * permite la velocidad declarada y una proyección fuera de la banda de Searle. Las de daño, reposo
 * y velocidad contra evidencia necesitan Monte Carlo o la inversión, que llegan al port en F9.
 * Los mensajes son en lenguaje llano y nunca atribuyen culpa.
 */
import { outsideRedVialM, RED_VIAL_DEFAULTS } from "@croquis/scene-schema";
import { pedestrianFriction, tireFriction } from "./friction";
import { G } from "./models";
import { vehicleSpeedRangeFromThrow } from "./pedestrian";
import { pyFixed } from "./reconstruct";
import { pyRound, str } from "./pymath";
import {
  Evidence,
  damageSigma,
  evidenceFromSpec,
  fitEvidence,
  invert,
  type Inversion,
} from "./inversion";
import { monteCarlo } from "./montecarlo";
import * as dmath from "./dmath";

type Json = Record<string, unknown>;

const STATED = new Set(["relato", "usuario"]);
const STOPPED_KMH = 5.0;
const PROJECTION_FACTOR = [0.8, 1.0] as const;
const CG_HEIGHT_M = 1.0;
const SPEED_SPREAD: Readonly<Record<string, number>> = { usuario: 0.05, relato: 0.15 };
const SPEED_SPREAD_DEFAULT = 0.3;

export interface Inconsistency {
  codigo: string;
  mensaje: string;
  datos: Record<string, unknown>;
}

/** Números a 2 decimales (km/h y m) para el resultado; listas y textos tal cual. */
function rounded(x: unknown): unknown {
  if (typeof x === "number") return Number.isInteger(x) ? x : pyRound(x, 2);
  if (Array.isArray(x)) return x.map(rounded);
  if (x !== null && typeof x === "object") {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, rounded(v)]));
  }
  return x;
}

export function inconsistencyToDict(f: Inconsistency): Json {
  return { codigo: f.codigo, mensaje: f.mensaje, datos: rounded(f.datos) };
}

function stated(campo: unknown): boolean {
  return campo !== null && campo !== undefined && STATED.has(str((campo as Json).fuente));
}

function kmh(campo: Json): number {
  return Number(campo.valor) * (campo.unidad === "m/s" ? 3.6 : 1.0);
}

function lenM(campo: Json): number {
  const v = Number(campo.valor);
  return (
    v *
    (({ m: 1.0, cm: 0.01, mm: 0.001, km: 1000.0 } as Record<string, number>)[
      str(campo.unidad, "m")
    ] ?? 1.0)
  );
}

function name(v: Json): string {
  return `el vehículo ${str(v.rol)}`;
}

/** Rango de la velocidad declarada (el mismo con el que Monte Carlo la muestrea). */
export function speedRange(spec: Json, idx: number): [number, number] | null {
  const v = (spec.vehiculos as Json[])[idx]!;
  const quieto = ["detenido", "estacionado"].includes(str((v.maniobra as Json).valor));
  const vp = v.velocidad_previa as Json | undefined;
  if (!vp || quieto) return null;
  const val = Number(vp.valor);
  if (vp.rango) {
    const [lo, hi] = vp.rango as [number, number];
    return [Number(lo), Number(hi)];
  }
  const s = SPEED_SPREAD[str(vp.fuente, "default")] ?? SPEED_SPREAD_DEFAULT;
  return [Math.max(0.0, val * (1 - s)), val * (1 + s)];
}

export function checkStopped(spec: Json): Inconsistency[] {
  const out: Inconsistency[] = [];
  for (const v of spec.vehiculos as Json[]) {
    const vp = v.velocidad_previa as Json | undefined;
    const man = v.maniobra as Json;
    const valor = str(man.valor);
    if (
      (valor === "detenido" || valor === "estacionado") &&
      stated(man) &&
      stated(vp) &&
      vp &&
      kmh(vp) > STOPPED_KMH
    ) {
      out.push({
        codigo: "detenido_con_velocidad",
        mensaje:
          `Se dijo que ${name(v)} estaba ${valor} y también que iba ` +
          `a unos ${pyFixed(kmh(vp), 0)} km/h. ¿Cuál de los dos datos es el correcto?`,
        datos: { vehiculo: v.id, velocidad_kmh: kmh(vp) },
      });
    }
  }
  return out;
}

export function checkMarks(spec: Json): Inconsistency[] {
  const out: Inconsistency[] = [];
  const lugar = spec.lugar as Json;
  const mu = tireFriction(
    str((lugar.superficie as Json).valor),
    str((lugar.estado_superficie as Json).valor),
  );
  const vehicles = spec.vehiculos as Json[];
  const byId = new Map(vehicles.map((v, i) => [str(v.id), [i, v] as const]));
  for (const e of (spec.evidencias ?? []) as Json[]) {
    if (e.tipo !== "marcas_frenado" || !stated(e.longitud)) continue;
    // Marcas de después del impacto: no hablan de la velocidad previa.
    if (e.fase === "despues_impacto") continue;
    const hit = byId.get(str(e.vehiculo_id));
    if (!hit) continue;
    const [idx, v] = hit;
    if (!stated(v.velocidad_previa)) continue;
    const length = lenM(e.longitud as Json);
    const needKmh = Math.sqrt(2 * mu.low * G * length) * 3.6;
    const rng = speedRange(spec, idx);
    const top = rng ? rng[1] : kmh(v.velocidad_previa as Json);
    if (top < needKmh) {
      out.push({
        codigo: "marcas_vs_velocidad",
        mensaje:
          `Para dejar unos ${pyFixed(length, 0)} m de marcas de frenado, ${name(v)} tendría que ` +
          `ir al menos a ${pyFixed(needKmh, 0)} km/h, aun con el piso más resbaloso posible; ` +
          `la velocidad indicada llega a ${pyFixed(top, 0)} km/h. ¿Puedes confirmar el largo de ` +
          "las marcas o la velocidad?",
        datos: { vehiculo: v.id, marcas_m: length, minima_kmh: needKmh, declarada_max_kmh: top },
      });
    }
  }
  return out;
}

export function checkThrow(spec: Json): Inconsistency[] {
  const out: Inconsistency[] = [];
  const event = ((spec.eventos ?? []) as Json[]).find((e) => e.tipo === "impacto_vehiculo_persona");
  if (!event) return out;
  const vehicles = spec.vehiculos as Json[];
  const byId = new Map(vehicles.map((v, i) => [str(v.id), [i, v] as const]));
  const actor = ((event.actores ?? []) as string[]).find((a) => byId.has(a));
  if (actor === undefined) return out;
  const [idx, v] = byId.get(actor)!;
  if (!stated(v.velocidad_previa)) return out;
  const body = pedestrianFriction(str(((spec.lugar as Json).superficie as Json).valor));
  const k = kmh(v.velocidad_previa as Json);
  const rng = speedRange(spec, idx) ?? [k, k];
  for (const e of (spec.evidencias ?? []) as Json[]) {
    if (e.tipo !== "distancia_proyeccion" || !stated(e.longitud)) continue;
    const d = lenM(e.longitud as Json);
    const lo = vehicleSpeedRangeFromThrow(d, body.high, CG_HEIGHT_M, PROJECTION_FACTOR);
    const hi = vehicleSpeedRangeFromThrow(d, body.low, CG_HEIGHT_M, PROJECTION_FACTOR);
    const needLo = Math.min(lo.vMin, hi.vMin) * 3.6;
    const needHi = Math.max(lo.vMax, hi.vMax) * 3.6;
    if (rng[1] < needLo || rng[0] > needHi) {
      out.push({
        codigo: "proyeccion_vs_velocidad",
        mensaje:
          `Que la persona quedara a unos ${pyFixed(d, 0)} m corresponde a velocidades de ` +
          `${pyFixed(needLo, 0)} a ${pyFixed(needHi, 0)} km/h, y la velocidad indicada de ${name(v)} va ` +
          `de ${pyFixed(rng[0], 0)} a ${pyFixed(rng[1], 0)} km/h. ¿Puedes confirmar la distancia o la ` +
          "velocidad?",
        datos: { vehiculo: v.id, distancia_m: d, rango_kmh: [needLo, needHi] },
      });
    }
  }
  return out;
}

/** Las banderas que no muestrean, en el orden de la referencia (`sampled=False`). */
/** Con calles del mapa (ADR 0023): cada vehículo debe arrancar sobre la calzada de OSM. */
export function checkMap(spec: Json): Inconsistency[] {
  const lugar = spec.lugar as Json;
  const red = lugar.red_vial as Json | undefined;
  if (!red) return [];
  const lane = lugar.ancho_carril as Json | undefined;
  const laneM = lane ? lenM(lane) : undefined;
  const vias = red.vias as Parameters<typeof outsideRedVialM>[1];
  const out: Inconsistency[] = [];
  for (const v of spec.vehiculos as Json[]) {
    const pose = v.posicion_inicial as Json | undefined;
    if (!pose) continue;
    const fuera = outsideRedVialM({ x: Number(pose.x), y: Number(pose.y) }, vias, laneM);
    if (fuera > RED_VIAL_DEFAULTS.tolerancia_fuera_m) {
      out.push({
        codigo: "fuera_de_la_via_del_mapa",
        mensaje: `La posición inicial de ${name(v)} queda a unos ${pyFixed(fuera, 0)} m de la calle más cercana del mapa. ¿Puedes revisar dónde estaba?`,
        datos: { vehiculo: str(v.id), distancia_m: fuera },
      });
    }
  }
  return out;
}

export function checkConsistencyBasic(spec: Json): Inconsistency[] {
  return [...checkStopped(spec), ...checkMarks(spec), ...checkThrow(spec), ...checkMap(spec)];
}

// --- Banderas que muestrean (Monte Carlo e inversión, F9) -------------------------------------

const REST_SIGMAS = 3.0;
const SIGMA_POSITION_M = 1.0;

export function checkDamage(spec: Json, seed: number, samples: number): Inconsistency[] {
  const out: Inconsistency[] = [];
  const ev = evidenceFromSpec(spec, seed);
  if (ev.damageDv.size === 0) return out;
  if (!(spec.vehiculos as Json[]).every((v) => stated(v.velocidad_previa))) return out;
  const mc = monteCarlo(spec, { samples, seed });
  const byId = new Map((spec.vehiculos as Json[]).map((v) => [str(v.id), v]));
  for (const [vid, dmg] of ev.damageDv) {
    const sol = mc.vehiculos.get(vid)?.get("delta_v_kmh");
    if (sol === undefined) continue;
    if (sol.p90 < dmg.p10 || sol.p10 > dmg.p90) {
      out.push({
        codigo: "dano_vs_velocidad",
        mensaje:
          `El daño descrito en ${name(byId.get(vid)!)} corresponde a un cambio de velocidad ` +
          `de ${pyFixed(dmg.p10, 0)} a ${pyFixed(dmg.p90, 0)} km/h, y con las velocidades indicadas sale ` +
          `de ${pyFixed(sol.p10, 0)} a ${pyFixed(sol.p90, 0)} km/h. ¿Puedes revisar las velocidades o ` +
          "describir de nuevo el daño?",
        datos: {
          vehiculo: vid,
          dano_kmh: [dmg.p10, dmg.p90],
          velocidades_kmh: [sol.p10, sol.p90],
        },
      });
    }
  }
  return out;
}

export function checkRest(spec: Json, seed: number): Inconsistency[] {
  const out: Inconsistency[] = [];
  const ev = evidenceFromSpec(spec, seed);
  if (ev.rest.size === 0) return out;
  const fit = fitEvidence(spec, new Evidence(ev.rest, new Map(), new Map()));
  const byId = new Map((spec.vehiculos as Json[]).map((v) => [str(v.id), v]));
  for (const vid of ev.rest.keys()) {
    const rx = fit.residuals.get(`reposo:${vid}:x`) ?? 0.0;
    const ry = fit.residuals.get(`reposo:${vid}:y`) ?? 0.0;
    const miss = dmath.hypot(rx, ry) * SIGMA_POSITION_M;
    if (miss > REST_SIGMAS * SIGMA_POSITION_M) {
      out.push({
        codigo: "reposo_inalcanzable",
        mensaje:
          `Con ninguna velocidad entre 0 y 200 km/h ${name(byId.get(vid)!)} termina donde ` +
          `se indicó, aun llegando con otro ángulo: lo más cerca que llega queda a unos ` +
          `${pyFixed(miss, 0)} m. ¿La posición final es correcta, o el vehículo pegó con algo ` +
          "más o cambió de dirección antes?",
        datos: { vehiculo: vid, distancia_minima_m: miss },
      });
    }
  }
  return out;
}

const EVIDENCE_WORDS: Readonly<Record<string, string>> = {
  reposo: "dónde quedó",
  rumbo_final: "hacia dónde quedó orientado",
  marcas_frenado: "las marcas de frenado",
  proyeccion: "la distancia a la que quedó la persona",
  dano: "el daño descrito",
  dano_minimo: "el daño medido",
};

/** Velocidad declarada fuera del intervalo que fija la evidencia física (inversión). */
export function checkSpeedEvidence(spec: Json, inv: Inversion): Inconsistency[] {
  const out: Inconsistency[] = [];
  const byId = new Map(
    (spec.vehiculos as Json[]).map((v, i) => [str(v.id), [i, v] as [number, Json]]),
  );
  const kinds: string[] = [];
  for (const label of inv.evidence) {
    const k = label.split(":", 1)[0]!;
    if (!kinds.includes(k)) kinds.push(k);
  }
  const words = kinds.filter((k) => k in EVIDENCE_WORDS).map((k) => EVIDENCE_WORDS[k]!);
  if (words.length === 0) return out;
  const said =
    words.length === 1
      ? words[0]!
      : `${words.slice(0, -1).join(", ")} y ${words[words.length - 1]!}`;
  for (const e of inv.estimates) {
    if (e.param.kind !== "velocidad" || e.dist === null || !e.identifiable || e.atBound) continue;
    const hit = byId.get(e.param.vehicle);
    if (hit === undefined || !stated(hit[1].velocidad_previa)) continue;
    const [idx, v] = hit;
    const rng = speedRange(spec, idx);
    if (rng === null || !(rng[1] < e.dist.p10 || rng[0] > e.dist.p90)) continue;
    const frenado = (v.frenado ?? {}) as Json;
    const aplico = (frenado.aplico ?? {}) as Json;
    const braked = Boolean(aplico.valor) || inv.evidence.includes(`marcas_frenado:${str(v.id)}`);
    const when = braked ? "antes de frenar" : "antes del choque";
    out.push({
      codigo: "velocidad_vs_evidencia",
      mensaje:
        `Por ${said}, ${name(v)} iría a unos ${pyFixed(e.dist.p10, 0)}–${pyFixed(e.dist.p90, 0)} km/h ` +
        `${when}, y la velocidad indicada va de ${pyFixed(rng[0], 0)} a ${pyFixed(rng[1], 0)} km/h. ` +
        "¿Puedes confirmar la velocidad, o alguno de esos datos?",
      datos: {
        vehiculo: str(v.id),
        evidencia_kmh: [e.dist.p10, e.dist.p90],
        declarada_kmh: [rng[0], rng[1]],
        evidencia: [...inv.evidence],
      },
    });
  }
  return out;
}

/** El daño medido pide más cambio de velocidad del que da la reconstrucción (ADR 0091). */
export function checkDamageReach(spec: Json, inv: Inversion, seed: number): Inconsistency[] {
  const out: Inconsistency[] = [];
  const ev = evidenceFromSpec(spec, seed);
  if (ev.damageMin.size === 0) return out;
  const fixed = new Set(
    inv.estimates
      .filter(
        (e) => e.param.kind === "velocidad" && e.dist !== null && e.identifiable && !e.atBound,
      )
      .map((e) => e.param.vehicle),
  );
  const byId = new Map((spec.vehiculos as Json[]).map((v) => [str(v.id), v]));
  for (const vid of [...ev.damageMin.keys()].sort()) {
    const dmg = ev.damageMin.get(vid)!;
    const r = inv.best.residuals.get(`dano_minimo:${vid}`);
    if (r === undefined || !fixed.has(vid)) continue;
    // El residuo es (ΔV − p50)/σ cuando queda por debajo: de él sale el ΔV de la reconstrucción.
    const dv = dmg.p50 + r * damageSigma(dmg);
    if (dv >= dmg.p10) continue;
    out.push({
      codigo: "dano_no_alcanzado",
      mensaje:
        `Solo con su deformación, el daño medido en ${name(byId.get(vid)!)} pide un cambio ` +
        `de velocidad mínimo de ${pyFixed(dmg.p10, 0)} a ${pyFixed(dmg.p90, 0)} km/h; en la reconstrucción ` +
        `que reproduce dónde quedaron los vehículos es de ${pyFixed(dv, 0)} km/h. ¿Son correctas ` +
        "las posiciones finales? Si alguna es un supuesto, con ella la reconstrucción no " +
        "alcanza ese daño.",
      datos: { vehiculo: vid, dano_minimo_kmh: [dmg.p10, dmg.p90], reconstruccion_kmh: dv },
    });
  }
  return out;
}

/**
 * Todas las banderas de consistencia de la escena, en orden fijo (port de `check_consistency`).
 * `inversion` evita repetir la inversión si ya se calculó con la misma semilla.
 */
export function checkConsistency(
  spec: Json,
  opts: { seed?: number | null; samples?: number; inversion?: Inversion | null } = {},
): Inconsistency[] {
  const seed = opts.seed ?? Number((spec.meta as Json).semilla);
  const samples = opts.samples ?? 32;
  const basic = checkConsistencyBasic(spec);
  let inversion = opts.inversion ?? null;
  if (inversion === null && !evidenceFromSpec(spec, seed).empty()) {
    inversion = invert(spec, { seed });
  }
  return [
    ...basic,
    ...checkDamage(spec, seed, samples),
    ...checkRest(spec, seed),
    ...(inversion !== null ? checkSpeedEvidence(spec, inversion) : []),
    ...(inversion !== null ? checkDamageReach(spec, inversion, seed) : []),
  ];
}
