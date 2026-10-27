/**
 * Monte Carlo (port de `croquis_solver/montecarlo.py`, PLAN §6.1.11): cada campo incierto se
 * muestrea (uniforme, con semilla) y la escena se reconstruye con cada muestra; salen los
 * percentiles p10–p50–p90 de las salidas principales y la lista de campos muestreados con su rango.
 * Mismo orden de sorteos que la referencia.
 */
import {
  DOWNED_SLIDE_CLASSES,
  DRAG_FRACTION_RANGE,
  downedMotorcycleFriction,
  tireFriction,
} from "./friction";
import { distribution, type Distribution } from "./inversion";
import { pyRound, str } from "./pymath";
import { PyRandom } from "./pyrandom";
import { reconstruct, vehicleClasses, type Reconstruction } from "./reconstruct";

type Json = Record<string, unknown>;

export const DEFAULT_SAMPLES = 64;
const SAMPLE_DT = 0.1;
const SPEED_SPREAD: Record<string, number> = { usuario: 0.05, relato: 0.15 };
const SPEED_SPREAD_DEFAULT = 0.3;
const MASS_USER_SPREAD = 0.03;
const BRAKE_SPREAD: Record<string, number> = { usuario: 0.1, relato: 0.2 };
const BRAKE_SPREAD_DEFAULT = 0.4;
const DOWNED_RUTA = "parametros.friccion_moto_caida";
const DRAG_RUTA = "parametros.arrastre_post_impacto";

export interface Sampled {
  ruta: string;
  minimo: number;
  maximo: number;
  nota: string;
}

function sampledToDict(s: Sampled): Json {
  return {
    ruta: s.ruta,
    distribucion: "uniforme",
    min: pyRound(s.minimo, 6),
    max: pyRound(s.maximo, 6),
    nota: s.nota,
  };
}

/** Porcentaje como `f"{s:.0%}"` de Python para los diferenciales de este módulo. */
function pct0(s: number): string {
  return `${Math.round(s * 100)}%`;
}

export class Uncertainty {
  constructor(
    readonly semilla: number,
    readonly muestras: number,
    readonly validas: number,
    readonly campos: Sampled[],
    readonly vehiculos: Map<string, Map<string, Distribution>> = new Map(),
    readonly personas: Map<string, Map<string, Distribution>> = new Map(),
  ) {}

  toDict(): Json {
    const pct = (d: Distribution) => ({
      p10: pyRound(d.p10, 4),
      p50: pyRound(d.p50, 4),
      p90: pyRound(d.p90, 4),
    });
    const rows = (m: Map<string, Map<string, Distribution>>) =>
      [...m.entries()].map(([id, ds]) => {
        const out: Json = { id };
        for (const [k, d] of [...ds.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
          out[k] = pct(d);
        }
        return out;
      });
    return {
      semilla: this.semilla,
      muestras: this.muestras,
      validas: this.validas,
      campos: this.campos.map(sampledToDict),
      vehiculos: rows(this.vehiculos),
      personas: rows(this.personas),
    };
  }
}

function classMassRange(clase: string): [number, number] | null {
  const rng = (vehicleClasses()[clase] ?? {}).masa_kg as number[] | undefined;
  return rng && rng.length === 2 ? [Number(rng[0]), Number(rng[1])] : null;
}

/** Campos que se muestrean y sus rangos. */
export function ranges(spec: Json): Sampled[] {
  const out: Sampled[] = [];
  (spec.vehiculos as Json[]).forEach((v, i) => {
    const quieto = ["detenido", "estacionado"].includes(String((v.maniobra as Json).valor));
    const vp = v.velocidad_previa as Json | undefined;
    if (vp && !quieto) {
      const val = Number(vp.valor);
      let lo: number;
      let hi: number;
      let nota: string;
      if (vp.rango) {
        [lo, hi] = (vp.rango as number[]).map(Number) as [number, number];
        nota = "rango declarado";
      } else {
        const f = str(vp.fuente, "default");
        const s = SPEED_SPREAD[f] ?? SPEED_SPREAD_DEFAULT;
        lo = Math.max(0.0, val * (1 - s));
        hi = val * (1 + s);
        nota = `±${pct0(s)} (${f})`;
      }
      out.push({ ruta: `vehiculos.${i}.velocidad_previa`, minimo: lo, maximo: hi, nota });
    }
    const masa = v.masa as Json | undefined;
    if (masa && masa.fuente === "usuario") {
      const val = Number(masa.valor);
      out.push({
        ruta: `vehiculos.${i}.masa`,
        minimo: val * (1 - MASS_USER_SPREAD),
        maximo: val * (1 + MASS_USER_SPREAD),
        nota: `±${pct0(MASS_USER_SPREAD)} (usuario)`,
      });
    } else if (masa && masa.rango) {
      const [lo, hi] = (masa.rango as number[]).map(Number) as [number, number];
      out.push({ ruta: `vehiculos.${i}.masa`, minimo: lo, maximo: hi, nota: "rango declarado" });
    } else {
      const cr = classMassRange(String((v.clase as Json).valor));
      if (cr) {
        out.push({
          ruta: `vehiculos.${i}.masa`,
          minimo: cr[0],
          maximo: cr[1],
          nota: "rango de la clase",
        });
      }
    }
    const frenado = (v.frenado ?? {}) as Json;
    const dist = frenado.distancia_antes_impacto as Json | undefined;
    if (dist) {
      const val = Number(dist.valor);
      let lo: number;
      let hi: number;
      let nota: string;
      if (dist.rango) {
        [lo, hi] = (dist.rango as number[]).map(Number) as [number, number];
        nota = "rango declarado";
      } else {
        const f = str(dist.fuente, "default");
        const s = BRAKE_SPREAD[f] ?? BRAKE_SPREAD_DEFAULT;
        lo = Math.max(0.0, val * (1 - s));
        hi = val * (1 + s);
        nota = `±${pct0(s)} (${f})`;
      }
      out.push({
        ruta: `vehiculos.${i}.frenado.distancia_antes_impacto`,
        minimo: lo,
        maximo: hi,
        nota,
      });
    }
  });
  const lugar = spec.lugar as Json;
  const fr = lugar.friccion as Json | undefined;
  const sup = String((lugar.superficie as Json).valor);
  if (fr && fr.fuente === "usuario") {
    const val = Number(fr.valor);
    out.push({
      ruta: "lugar.friccion",
      minimo: val * 0.95,
      maximo: val * 1.05,
      nota: "±5% (usuario)",
    });
  } else {
    const mu = tireFriction(sup, String((lugar.estado_superficie as Json).valor));
    out.push({
      ruta: "lugar.friccion",
      minimo: mu.low,
      maximo: mu.high,
      nota: `tabla de fricción (${mu.fuente})`,
    });
  }
  if (
    (spec.vehiculos as Json[]).some((v) =>
      DOWNED_SLIDE_CLASSES.has(String((v.clase as Json).valor)),
    )
  ) {
    const md = downedMotorcycleFriction(sup);
    out.push({
      ruta: DOWNED_RUTA,
      minimo: md.low,
      maximo: md.high,
      nota: `arrastre de la moto caída (${md.fuente})`,
    });
  }
  // Al final: no mueve los sorteos de lo demás (ADR 0091).
  out.push({
    ruta: DRAG_RUTA,
    minimo: DRAG_FRACTION_RANGE[0],
    maximo: DRAG_FRACTION_RANGE[1],
    nota: "arrastre después del impacto (supuesto)",
  });
  return out;
}

function setPath(spec: Json, ruta: string, value: number): void {
  const parts = ruta.split(".");
  // Un nodo es un objeto o una lista (los índices numéricos de la ruta entran a listas).
  let node: unknown = spec;
  for (const p of parts.slice(0, -1)) {
    if (/^\d+$/.test(p)) node = (node as unknown[])[Number(p)];
    else {
      const obj = node as Json;
      if (obj[p] === undefined) obj[p] = {};
      node = obj[p];
    }
  }
  const leaf = parts[parts.length - 1]!;
  const obj = node as Json;
  if (leaf === "friccion") obj[leaf] = { valor: value, fuente: "supuesto", confianza: 0.5 };
  else if (leaf === "masa")
    obj[leaf] = { valor: value, unidad: "kg", fuente: "supuesto", confianza: 0.5 };
  else {
    const next: Json = { ...(obj[leaf] as Json), valor: value };
    delete next.rango;
    obj[leaf] = next;
  }
}

/** Percentiles de las salidas principales del solver sobre `samples` muestras con semilla. */
export function monteCarlo(
  spec: Json,
  opts: { samples?: number; seed?: number | null; dt?: number } = {},
): Uncertainty {
  const samples = opts.samples ?? DEFAULT_SAMPLES;
  const dt = opts.dt ?? SAMPLE_DT;
  const seed = opts.seed ?? Number((spec.meta as Json).semilla);
  const rng = new PyRandom(seed);
  const campos = ranges(spec);
  const accV = new Map<string, Map<string, number[]>>();
  const accP = new Map<string, Map<string, number[]>>();
  const push = (m: Map<string, Map<string, number[]>>, id: string, key: string, x: number) => {
    if (!m.has(id)) m.set(id, new Map());
    const d = m.get(id)!;
    if (!d.has(key)) d.set(key, []);
    d.get(key)!.push(x);
  };
  let valid = 0;
  for (let i = 0; i < samples; i++) {
    const s = structuredClone(spec);
    let downed: number | null = null;
    let drag: number | null = null;
    for (const c of campos) {
      const value = rng.uniform(c.minimo, c.maximo);
      if (c.ruta === DOWNED_RUTA) downed = value;
      else if (c.ruta === DRAG_RUTA) drag = value;
      else setPath(s, c.ruta, value);
    }
    let r: Reconstruction;
    try {
      r = reconstruct(s, {
        dt,
        ...(downed === null ? {} : { downedMu: downed }),
        ...(drag === null ? {} : { dragFraction: drag }),
      });
    } catch {
      continue;
    }
    valid += 1;
    for (const v of r.vehiculos) {
      push(accV, v.id, "v_impacto_kmh", v.vImpactKmh);
      push(accV, v.id, "delta_v_kmh", v.deltaVKmh);
      push(accV, v.id, "reposo_x_m", v.restPose[0]);
      push(accV, v.id, "reposo_y_m", v.restPose[1]);
      push(accV, v.id, "distancia_post_m", v.distancePostM);
    }
    for (const p of r.personas) {
      if (p.throw !== null) push(accP, p.id, "distancia_proyeccion_m", p.throw.throwDistanceM);
    }
  }
  const toDists = (m: Map<string, Map<string, number[]>>) =>
    new Map(
      [...m.entries()].map(([k, d]) => [
        k,
        new Map([...d.entries()].map(([key, xs]) => [key, distribution(xs)])),
      ]),
    );
  return new Uncertainty(seed, samples, valid, campos, toDists(accV), toDists(accP));
}
