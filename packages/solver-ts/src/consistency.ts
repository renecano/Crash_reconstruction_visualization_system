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
