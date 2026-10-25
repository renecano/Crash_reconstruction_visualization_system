/**
 * Port de `croquis_solver.agents`: los conductores como agentes (R12a, ADR 0088). Percibir →
 * decidir → actuar antes del impacto, con paso fijo, hasta que dos vehículos se tocan o hasta
 * `HORIZON_AFTER_S` después del impacto reconstruido. La paridad con Python está en
 * `agents.test.ts` (escenas de `packages/scene-schema/fixtures/agentes`).
 *
 * - **Percibir:** con el estado del inicio del paso, cada conductor busca al vehículo de adelante
 *   y lo ve si nada tapa la línea de vista y está dentro de la visibilidad del clima. Las luces de
 *   freno se ven.
 * - **Decidir:** lo que diga el perito (`conductor.decision` en `conductor.instante_decision`); si
 *   no, lo que reconstruyó la evidencia; si tampoco, reaccionar: frenar cuando pasa su tiempo de
 *   reacción desde que vio frenar al de adelante.
 * - **Actuar:** frenar con la desaceleración de la reconstrucción; volantear un carril con μ·g;
 *   seguir a la misma velocidad.
 */
import * as dmath from "./dmath";
import { perceptionReactionTime } from "./friction";
import { distribution } from "./inversion";
import { G } from "./models";
import { travelHeading } from "./preimpact";
import { pyRound, str } from "./pymath";
import { PyRandom } from "./pyrandom";
import { poseAt, type PlanPrevio, type Reconstruction } from "./reconstruct";
import { Actor, analyzePair, objectOccluders, Observer } from "./visibility";

type Json = Record<string, unknown>;

export const DT = 0.02;
const HORIZON_AFTER_S = 3.0;
const BISECTION_STEPS = 30;
const SENSITIVITY_SAMPLES = 64;
export const DECISIONES = ["frenar", "volantear_izquierda", "volantear_derecha", "seguir"] as const;
const TIME: Record<string, number> = { s: 1.0, ms: 0.001, min: 60.0 };

type Rect = [number, number][];
/** x, y, rumbo del cuerpo, vx, vy */
type Estado = [number, number, number, number, number];

/** `round(x, 6)` sin −0.0 (como `_r` de la reconstrucción). */
function r6(x: number, nd = 6): number {
  const v = pyRound(x, nd);
  return v === 0 ? 0.0 : v;
}

interface Decision {
  tipo: string;
  t: number;
  /** "perito" | "reconstruccion" | "reaccion" */
  origen: string;
  ante?: string;
  percibioT?: number;
}

class Agent {
  decision: Decision | null = null;
  /** Lo que dijo el perito sin instante: se ejecuta al reaccionar. */
  pending: string | null = null;

  constructor(
    readonly plan: PlanPrevio,
    readonly t0: number,
    readonly s0: number,
    readonly v0: number,
    readonly lights: boolean,
  ) {}

  get id(): string {
    return this.plan.id;
  }

  braking(t: number): boolean {
    const d = this.decision;
    return d !== null && d.tipo === "frenar" && t >= d.t && this.v0 > 0;
  }

  /** (s, v) en t: crucero a v0 y, si frena, desaceleración constante hasta parar. */
  longitudinal(t: number): [number, number] {
    const d = this.decision;
    if (d === null || d.tipo !== "frenar" || t <= d.t || this.plan.decel <= 0) {
      return [this.s0 + this.v0 * (t - this.t0), this.v0];
    }
    const tOn = Math.max(d.t, this.t0);
    const sOn = this.s0 + this.v0 * (tOn - this.t0);
    const tau = t - tOn;
    const tStop = this.v0 / this.plan.decel;
    const tc = Math.min(tau, tStop);
    return [
      sOn + this.v0 * tc - 0.5 * this.plan.decel * tc * tc,
      Math.max(this.v0 - this.plan.decel * tau, 0.0),
    ];
  }

  /** (d, w): desplazamiento a la izquierda del sentido de marcha y su velocidad. */
  lateral(t: number): [number, number] {
    const d = this.decision;
    if (d === null || !d.tipo.startsWith("volantear") || t <= d.t) return [0.0, 0.0];
    const sign = d.tipo === "volantear_izquierda" ? 1.0 : -1.0;
    const span = this.plan.laneWidth;
    const a = this.plan.mu * G;
    const half = Math.sqrt(span / a); // cubre la mitad del carril acelerando: span/2 = a·T²/2
    const tau = t - Math.max(d.t, this.t0);
    if (tau <= half) return [sign * 0.5 * a * tau * tau, sign * a * tau];
    if (tau <= 2 * half) {
      const u = tau - half;
      return [sign * (0.5 * span + a * half * u - 0.5 * a * u * u), sign * (a * half - a * u)];
    }
    return [sign * span, 0.0];
  }

  /** (x, y, rumbo del cuerpo, vx, vy) en t. */
  state(t: number): Estado {
    const [s, v] = this.longitudinal(t);
    const [d, w] = this.lateral(t);
    const [x, y, yaw] = poseAt(this.plan.path, s);
    const h = travelHeading(this.plan.path, yaw);
    const nx = -dmath.sin(h);
    const ny = dmath.cos(h);
    const steer = v > 0 ? dmath.atan2(w, v) : 0.0;
    return [
      x + nx * d,
      y + ny * d,
      yaw + steer,
      v * dmath.cos(h) + w * nx,
      v * dmath.sin(h) + w * ny,
    ];
  }
}

interface Contacto {
  t: number;
  vehiculos: [string, string];
  velocidadesKmh: Map<string, number>;
  velocidadRelativaKmh: number;
}

interface Simulacion {
  decisiones: Map<string, Decision | null>;
  contacto: Contacto | null;
  distanciaMinimaM: number;
}

type Reaccion = [number, [number, number], string];

export class AgentsResult {
  constructor(
    readonly simulacion: Simulacion,
    readonly lineaBase: Simulacion,
    readonly reaccion: Map<string, Reaccion>,
    readonly tInicio: number,
    readonly tFin: number,
    readonly semilla: number,
    readonly sensibilidad: Json | null = null,
    readonly supuestos: string[] = [],
  ) {}

  toDict(): Json {
    const out: Json = {
      dt: DT,
      t_inicio: r6(this.tInicio),
      t_fin: r6(this.tFin),
      conductores: [...this.simulacion.decisiones.keys()]
        .sort()
        .map((vid) =>
          conductorDoc(vid, this.reaccion.get(vid)!, this.simulacion.decisiones.get(vid) ?? null),
        ),
      resultado: simDoc(this.simulacion),
      linea_base: simDoc(this.lineaBase),
    };
    if (this.sensibilidad !== null) out.sensibilidad = this.sensibilidad;
    if (this.supuestos.length) out.supuestos = this.supuestos;
    return out;
  }
}

function conductorDoc(vid: string, reaccion: Reaccion, d: Decision | null): Json {
  const out: Json = {
    vehiculo: vid,
    tiempo_reaccion_s: {
      valor: r6(reaccion[0]),
      rango: [r6(reaccion[1][0]), r6(reaccion[1][1])],
      fuente: reaccion[2],
    },
  };
  if (d !== null) {
    const dec: Json = { tipo: d.tipo, t: r6(d.t), origen: d.origen };
    if (d.ante !== undefined) dec.ante = d.ante;
    if (d.percibioT !== undefined) dec.percibio_t = r6(d.percibioT);
    out.decision = dec;
  }
  return out;
}

function simDoc(sim: Simulacion): Json {
  if (sim.contacto === null)
    return { contacto: false, distancia_minima_m: r6(sim.distanciaMinimaM) };
  const c = sim.contacto;
  return {
    contacto: true,
    t: r6(c.t),
    vehiculos: [...c.vehiculos],
    velocidades_kmh: [...c.velocidadesKmh.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => ({ vehiculo: k, valor: r6(v) })),
    velocidad_relativa_kmh: r6(c.velocidadRelativaKmh),
  };
}

// ---- geometría ----------------------------------------------------------------------------------

function rect(x: number, y: number, yaw: number, length: number, width: number): Rect {
  const c = dmath.cos(yaw);
  const s = dmath.sin(yaw);
  const out: Rect = [];
  for (const [fx, fy] of [
    [0.5, 0.5],
    [-0.5, 0.5],
    [-0.5, -0.5],
    [0.5, -0.5],
  ] as const) {
    const lx = fx * length;
    const ly = fy * width;
    out.push([x + c * lx - s * ly, y + s * lx + c * ly]);
  }
  return out;
}

/** Teorema del eje separador para dos rectángulos (se tocan o se traslapan). */
function overlap(a: Rect, b: Rect): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % 4]!;
      const ax = q[1] - p[1];
      const ay = p[0] - q[0];
      const pa = a.map((u) => ax * u[0] + ay * u[1]);
      const pb = b.map((u) => ax * u[0] + ay * u[1]);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  }
  return true;
}

function pointSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const den = dx * dx + dy * dy;
  const u =
    den === 0 ? 0.0 : Math.max(0.0, Math.min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den));
  return dmath.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dy));
}

function distance(a: Rect, b: Rect): number {
  if (overlap(a, b)) return 0.0;
  let best = Infinity;
  for (const [poly, other] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const p of poly) {
      for (let i = 0; i < 4; i++) {
        best = Math.min(best, pointSegment(p, other[i]!, other[(i + 1) % 4]!));
      }
    }
  }
  return best;
}

// ---- simulación ---------------------------------------------------------------------------------

function seconds(f: Json | null | undefined): number | null {
  if (!f || !("valor" in f)) return null;
  return Number(f.valor) * (TIME[str(f.unidad, "s")] ?? 1.0);
}

function secondsRange(f: Json | null | undefined): [number, number] | null {
  if (!f || !f.rango) return null;
  const k = TIME[str(f.unidad, "s")] ?? 1.0;
  const [lo, hi] = f.rango as [number, number];
  return [Number(lo) * k, Number(hi) * k];
}

/** Si algún vehículo trae `conductor`: solo entonces se simulan los agentes. */
export function hasDrivers(spec: Json): boolean {
  return (spec.vehiculos as Json[]).some((v) => "conductor" in v);
}

const sortedKeys = (m: Map<string, unknown>) => [...m.keys()].sort();

/** El vehículo de adelante: el más cercano en el sentido de marcha cuyo ancho se traslapa. */
function leader(me: Agent, states: Map<string, Estado>, byId: Map<string, Agent>): string | null {
  const [x, y, , vx, vy] = states.get(me.id)!;
  const h = dmath.atan2(vy, vx);
  const c = dmath.cos(h);
  const sn = dmath.sin(h);
  let best: [number, string] | null = null;
  for (const oid of sortedKeys(states)) {
    if (oid === me.id) continue;
    const o = states.get(oid)!;
    const ox = o[0] - x;
    const oy = o[1] - y;
    const ahead = c * ox + sn * oy;
    const side = -sn * ox + c * oy;
    if (
      ahead > 0 &&
      Math.abs(side) < 0.5 * (me.plan.width + byId.get(oid)!.plan.width) &&
      (best === null || ahead < best[0])
    ) {
      best = [ahead, oid];
    }
  }
  return best ? best[1] : null;
}

type Ve = (a: Agent, lead: Agent, t: number, states: Map<string, Estado>) => boolean;

function simulate(
  agents: Agent[],
  tEnd: number,
  sees: Ve,
  reaction: Map<string, number>,
): Simulacion {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const t0 = agents[0]!.t0;
  const n = Math.ceil((tEnd - t0) / DT - 1e-9);
  let minGap = Infinity;
  const decisiones = () => new Map(agents.map((a) => [a.id, a.decision]));

  const rects = (t: number) => {
    const out = new Map<string, Rect>();
    for (const a of agents) {
      const [x, y, yaw] = a.state(t);
      out.set(a.id, rect(x, y, yaw, a.plan.length, a.plan.width));
    }
    return out;
  };
  const touching = (t: number): [string, string] | null => {
    const rs = rects(t);
    const ids = sortedKeys(rs);
    for (let i = 0; i < ids.length; i++) {
      for (const b of ids.slice(i + 1)) {
        if (overlap(rs.get(ids[i]!)!, rs.get(b)!)) return [ids[i]!, b];
      }
    }
    return null;
  };

  let prevT = t0;
  for (let k = 0; k <= n; k++) {
    const t = t0 + k * DT;
    // Percibir y decidir con el estado del inicio del paso.
    const states = new Map(agents.map((a) => [a.id, a.state(t)]));
    for (const a of agents) {
      if (a.decision !== null || a.v0 <= 0) continue;
      const lead = leader(a, states, byId);
      if (lead === null || !byId.get(lead)!.braking(t) || !sees(a, byId.get(lead)!, t, states))
        continue;
      a.decision = {
        tipo: a.pending ?? "frenar",
        t: t + reaction.get(a.id)!,
        origen: "reaccion",
        ante: lead,
        percibioT: t,
      };
    }
    // Actuar ya está en la posición cerrada de cada agente: se busca el contacto en t.
    let pair = touching(t);
    if (pair !== null) {
      let lo = prevT;
      let hi = t;
      if (k === 0) lo = hi;
      for (let i = 0; i < BISECTION_STEPS; i++) {
        if (hi - lo <= 1e-9) break;
        const mid = 0.5 * (lo + hi);
        if (touching(mid) !== null) hi = mid;
        else lo = mid;
      }
      pair = touching(hi) ?? pair;
      const sa = byId.get(pair[0])!.state(hi);
      const sb = byId.get(pair[1])!.state(hi);
      const speeds = new Map([
        [pair[0], 3.6 * dmath.hypot(sa[3], sa[4])],
        [pair[1], 3.6 * dmath.hypot(sb[3], sb[4])],
      ]);
      const rel = 3.6 * dmath.hypot(sa[3] - sb[3], sa[4] - sb[4]);
      return {
        decisiones: decisiones(),
        contacto: { t: hi, vehiculos: pair, velocidadesKmh: speeds, velocidadRelativaKmh: rel },
        distanciaMinimaM: 0.0,
      };
    }
    const rs = rects(t);
    const ids = sortedKeys(rs);
    for (let i = 0; i < ids.length; i++) {
      for (const b of ids.slice(i + 1)) {
        if (byId.get(ids[i]!)!.v0 > 0 || byId.get(b)!.v0 > 0) {
          minGap = Math.min(minGap, distance(rs.get(ids[i]!)!, rs.get(b)!));
        }
      }
    }
    prevT = t;
  }
  return { decisiones: decisiones(), contacto: null, distanciaMinimaM: minGap };
}

function makeAgents(spec: Json, rec: Reconstruction, withDrivers: boolean): Agent[] {
  const bySpec = new Map((spec.vehiculos as Json[]).map((v) => [String(v.id), v]));
  const t0 = rec.tInicio;
  const agents: Agent[] = [];
  for (const vid of sortedKeys(rec.previa)) {
    const plan = rec.previa.get(vid)!;
    const prof = plan.profile;
    const tau = t0 - plan.tRef;
    const s0 = tau >= 0 ? prof.distance(tau) : prof.v0 * tau;
    const v = bySpec.get(vid)!;
    const luces = v.luces_encendidas as Json | undefined;
    const agent = new Agent(
      plan,
      t0,
      s0,
      prof.v0,
      luces && "valor" in luces ? Boolean(luces.valor) : true,
    );
    let evidence: Decision | null = null;
    if (prof.v0 > 0 && prof.decel > 0 && Number.isFinite(prof.tBrake)) {
      evidence = { tipo: "frenar", t: plan.tRef + prof.tBrake, origen: "reconstruccion" };
    }
    const c: Json = withDrivers ? ((v.conductor as Json | undefined) ?? {}) : {};
    const dec = c.decision as Json | undefined;
    const tDec = seconds(c.instante_decision as Json | undefined);
    if (dec && tDec !== null) {
      agent.decision = { tipo: String(dec.valor), t: tDec, origen: "perito" };
    } else if (dec && evidence !== null) {
      agent.decision = { tipo: String(dec.valor), t: evidence.t, origen: "perito" };
    } else if (dec) {
      agent.pending = String(dec.valor);
    } else {
      agent.decision = evidence;
    }
    agents.push(agent);
  }
  return agents;
}

/** Los conductores como agentes, o null si ningún vehículo trae `conductor`. */
export function simulateDrivers(spec: Json, rec: Reconstruction): AgentsResult | null {
  if (!hasDrivers(spec) || rec.previa.size === 0) return null;
  const nominal = perceptionReactionTime();
  const reaction = new Map<string, Reaccion>();
  for (const v of spec.vehiculos as Json[]) {
    const cond = (v.conductor as Json | undefined) ?? {};
    const tr = cond.tiempo_reaccion as Json | undefined;
    const val = seconds(tr);
    if (val === null || !tr) {
      reaction.set(String(v.id), [
        nominal.nominal,
        [nominal.low, nominal.high],
        "supuesto: percepción-reacción típica (friction.json: Olson y Sivak 1986; Green 2000)",
      ]);
    } else {
      const rng = secondsRange(tr) ?? [val, val];
      reaction.set(String(v.id), [val, rng, str(tr.fuente, "perito")]);
    }
  }

  const env = spec.entorno as Json;
  const nightUnlit = (env.iluminacion as Json).valor === "noche_sin_alumbrado";
  const met = env.visibilidad as Json | undefined;
  let metM: number | null = null;
  if (met && "valor" in met) {
    metM = Number(met.valor) * ({ m: 1.0, km: 1000.0 }[str(met.unidad, "m")] ?? 1.0);
  }
  const staticOcc = rec.objetos.flatMap((ob) => objectOccluders(ob));

  const sees: Ve = (a, lead, t, states) => {
    const me = states.get(a.id)!;
    const other = states.get(lead.id)!;
    const obs = new Observer(
      a.id,
      a.plan.clase,
      [[me[0], me[1], me[2]]],
      a.plan.length,
      a.plan.width,
      a.lights,
    );
    // Las luces de freno se ven aunque las demás luces vayan apagadas.
    const tgt = new Actor(
      lead.id,
      "vehiculo",
      [[other[0], other[1], other[2]]],
      lead.plan.length,
      lead.plan.width,
      lead.plan.height,
      true,
    );
    const movers = sortedKeys(states)
      .filter((oid) => oid !== a.id && oid !== lead.id)
      .map((oid) => {
        const p = rec.previa.get(oid)!;
        const s = states.get(oid)!;
        return new Actor(oid, "vehiculo", [[s[0], s[1], s[2]]], p.length, p.width, p.height);
      });
    const res = analyzePair(obs, tgt, staticOcc, movers, [t], {
      nightUnlit,
      metVisibilityM: metM,
    });
    return Boolean(res.visible.length && res.visible[0]);
  };

  const tEnd = HORIZON_AFTER_S;
  const nominalRt = new Map([...reaction].map(([k, v]) => [k, v[0]]));
  const sim = simulate(makeAgents(spec, rec, true), tEnd, sees, nominalRt);
  const base = simulate(makeAgents(spec, rec, false), tEnd, sees, nominalRt);

  // Sensibilidad al tiempo de reacción de los que reaccionan (con la semilla de la escena).
  const reactive = [...sim.decisiones.entries()]
    .filter(([, d]) => d !== null && d.origen === "reaccion")
    .map(([vid]) => vid)
    .sort();
  let sens: Json | null = null;
  if (reactive.length) {
    const rng = new PyRandom(rec.semilla);
    const rel: number[] = [];
    let sinContacto = 0;
    for (let i = 0; i < SENSITIVITY_SAMPLES; i++) {
      const rt = new Map(nominalRt);
      for (const vid of reactive) {
        const [lo, hi] = reaction.get(vid)![1];
        rt.set(vid, rng.uniform(lo, hi));
      }
      const s = simulate(makeAgents(spec, rec, true), tEnd, sees, rt);
      if (s.contacto === null) sinContacto += 1;
      else rel.push(s.contacto.velocidadRelativaKmh);
    }
    sens = {
      muestras: SENSITIVITY_SAMPLES,
      semilla: rec.semilla,
      vehiculos: reactive,
      sin_contacto: sinContacto,
    };
    if (rel.length) {
      const dist = distribution(rel);
      sens.velocidad_relativa_kmh = { p10: r6(dist.p10), p50: r6(dist.p50), p90: r6(dist.p90) };
    }
  }

  return new AgentsResult(sim, base, reaction, rec.tInicio, tEnd, rec.semilla, sens, [
    "Los conductores ven el estado del inicio de cada paso y actúan a la vez.",
    "Frenar usa la desaceleración de la reconstrucción; volantear desplaza un carril con μ·g.",
  ]);
}
