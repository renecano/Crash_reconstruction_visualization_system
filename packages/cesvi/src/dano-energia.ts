/**
 * La deformación medida contra la reconstrucción (auditoría del 2026-11-15, C5; punto 10 del plan).
 *
 * La pantalla decía «Alcanza la deformación medida» con que el ajuste cayera dentro de la banda del
 * daño, aunque quedara en su borde bajo. En AXA la reconstrucción visible da a B un cambio de
 * velocidad de 30 km/h y su deformación pide de 30 a 90 (mediana 51): está dentro, pero explica un
 * tercio de la energía de la mediana. Aquí se dice cuánto, con sus números.
 *
 * - **La banda** es el cambio de velocidad (ΔV) que pide la deformación medida de un vehículo, con
 *   su p10–p50–p90 (CRASH3 con la rigidez de su clase sorteada). Si solo ese vehículo trae
 *   deformación medida, es un **mínimo**: el otro también absorbió energía.
 * - **La reconstrucción** es el ΔV de ese vehículo con las velocidades de la hipótesis.
 * - **La energía** va con el cuadrado del ΔV: `(ΔV reconstruido / ΔV mediano)²`.
 *
 * No cambia ningún número del solver: lee su evidencia y vuelve a integrar la escena una vez.
 */
import { evidenceFromSpec, reconstruct } from "@croquis/solver-ts";
import { kmhConUnidad, rangoKmh } from "./formato";
import {
  especReconstruida,
  hipotesisVisible,
  type HipotesisReconstruccion,
  type Reconstruccion,
} from "./reconstruccion";

type Json = Record<string, unknown>;

export type EstadoDano = "debajo" | "borde_bajo" | "dentro" | "arriba";

export interface LecturaDano {
  /** El id del expediente (V1, V2…). */
  vehiculo: string;
  /** Solo este vehículo trae deformación medida: su banda es un mínimo. */
  minimo: boolean;
  /** El ΔV que pide la deformación medida, en km/h. */
  banda: { p10: number; p50: number; p90: number };
  /** El ΔV de ese vehículo en la reconstrucción, en km/h. */
  reconstruccionKmh: number;
  /** La energía de la reconstrucción como porcentaje de la de la mediana de la banda. */
  energiaPct: number;
  estado: EstadoDano;
}

/** Por debajo de este porcentaje de la energía mediana, estar «dentro de la banda» es estar en su borde. */
export const ENERGIA_BORDE_PCT = 50;
/** Holgura para decir «debajo» o «arriba» de la banda, en km/h (el redondeo del ajuste). */
const HOLGURA_KMH = 0.5;

/** La escena del solver con las velocidades de una hipótesis (la visible si no se dice cuál). */
function especDeHipotesis(r: Reconstruccion, h: HipotesisReconstruccion | null): Json {
  const visible = hipotesisVisible(r);
  if (!h || h === visible) return especReconstruida(r);
  const spec = structuredClone(r.spec) as Json & { vehiculos: Json[] };
  for (const sv of spec.vehiculos) {
    const v = h.velocidades.find((x) => x.vehiculo === r.ids[String(sv.id)]);
    if (!v || v.kmh === null) continue;
    sv.velocidad_previa = {
      valor: v.kmh,
      unidad: "km/h",
      fuente: "supuesto",
      confianza: v.fijada ? 0.7 : 0.3,
    };
  }
  return spec;
}

function estadoDe(dv: number, banda: LecturaDano["banda"], energiaPct: number): EstadoDano {
  if (dv < banda.p10 - HOLGURA_KMH) return "debajo";
  if (dv > banda.p90 + HOLGURA_KMH) return "arriba";
  return energiaPct < ENERGIA_BORDE_PCT ? "borde_bajo" : "dentro";
}

/**
 * Por cada vehículo con deformación medida: lo que pide su deformación contra lo que da la
 * reconstrucción de la hipótesis `clave` (la visible si no se dice). Vacío si ningún vehículo trae
 * deformación medida o la escena no se pudo integrar.
 */
export function lecturasDeDano(r: Reconstruccion, clave?: string): LecturaDano[] {
  const ev = evidenceFromSpec(r.spec);
  if (!ev.damageDv.size && !ev.damageMin.size) return [];
  const h = clave ? (r.hipotesis?.find((x) => x.clave === clave) ?? null) : hipotesisVisible(r);
  let dv: Map<string, number>;
  try {
    const rec = reconstruct(especDeHipotesis(r, h));
    dv = new Map(rec.vehiculos.map((v) => [v.id, v.deltaVKmh]));
  } catch {
    return [];
  }
  const out: LecturaDano[] = [];
  const agrega = (sid: string, d: { p10: number; p50: number; p90: number }, minimo: boolean) => {
    const reconstruccionKmh = dv.get(sid);
    const vehiculo = r.ids[sid];
    if (reconstruccionKmh === undefined || !vehiculo || !(d.p50 > 0)) return;
    const banda = { p10: d.p10, p50: d.p50, p90: d.p90 };
    const energiaPct = 100 * (reconstruccionKmh / d.p50) ** 2;
    out.push({
      vehiculo: String(vehiculo),
      minimo,
      banda,
      reconstruccionKmh,
      energiaPct,
      estado: estadoDe(reconstruccionKmh, banda, energiaPct),
    });
  };
  for (const sid of [...ev.damageDv.keys()].sort()) agrega(sid, ev.damageDv.get(sid)!, false);
  for (const sid of [...ev.damageMin.keys()].sort()) agrega(sid, ev.damageMin.get(sid)!, true);
  return out.sort((a, b) => a.vehiculo.localeCompare(b.vehiculo, "en", { numeric: true }));
}

/** En pocas palabras, para una celda: «En el borde bajo (34 % de la energía)». */
export function danoEnCorto(l: LecturaDano): string {
  const pct = `${Math.round(l.energiaPct)} % de la energía`;
  if (l.estado === "debajo") return `No la alcanza (${pct})`;
  if (l.estado === "borde_bajo") return `En el borde bajo (${pct})`;
  if (l.estado === "arriba") return `La rebasa (${pct})`;
  return `La alcanza (${pct})`;
}

/**
 * La frase completa, con sus números. `nombre` es cómo se le dice al vehículo en esa pantalla.
 * Las velocidades van en enteros: son de la reconstrucción (ADR 0138).
 */
export function danoEnTexto(l: LecturaDano, nombre: string = l.vehiculo): string {
  const pide = `${l.minimo ? "al menos " : ""}${rangoKmh(l.banda.p10, l.banda.p90, "reconstruccion")} km/h (mediana ${kmhConUnidad(l.banda.p50, "reconstruccion")})`;
  const da = kmhConUnidad(l.reconstruccionKmh, "reconstruccion");
  const energia = `${Math.round(l.energiaPct)} % de la energía de la mediana`;
  if (l.estado === "debajo")
    return `No alcanza la deformación medida de ${nombre}: su cambio de velocidad es de ${da} y la deformación pide ${pide}. Es el ${energia}.`;
  if (l.estado === "borde_bajo")
    return `Queda en el borde bajo de la deformación medida de ${nombre}: su cambio de velocidad es de ${da} y la deformación pide ${pide}. Es el ${energia}.`;
  if (l.estado === "arriba")
    return `Rebasa la deformación medida de ${nombre}: su cambio de velocidad es de ${da} y la deformación pide ${pide}. Es el ${energia}.`;
  return `Alcanza la deformación medida de ${nombre}: su cambio de velocidad es de ${da} y la deformación pide ${pide}. Es el ${energia}.`;
}
