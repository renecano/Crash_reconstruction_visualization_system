/**
 * R12a en el paso 6 (PLAN-CESVI, ADR 0088): el perito prueba una hipótesis sobre un conductor
 * («¿y si V2 frenaba 1 s antes del impacto?») y ve el contacto que da la física contra la
 * reconstrucción.
 *
 * La escena es la del 3D (`especReconstruida`, con las velocidades que fija la evidencia) con el
 * `conductor` que eligió el perito. El solver simula a todos los conductores como agentes: el que
 * eligió decide lo que dijo el perito y cuándo; los demás hacen lo que reconstruyó la evidencia o
 * reaccionan al de adelante con su tiempo de reacción (`agentes` del resultado). Aquí solo se arma
 * la escena y se lee el resultado en términos del expediente: ningún número sale de aquí.
 */
import type { Expediente } from "./corpus";
import { especReconstruida, type Reconstruccion } from "./reconstruccion";

type Json = Record<string, unknown>;
type Id = Expediente["vehiculos"][number]["id"];

export const DECISIONES_CONDUCTOR = [
  "frenar",
  "volantear_izquierda",
  "volantear_derecha",
  "seguir",
] as const;
export type DecisionConductor = (typeof DECISIONES_CONDUCTOR)[number];

/** Cómo se dice cada decisión en la interfaz y en el dictamen. */
export const DECISION_EN_PALABRAS: Record<DecisionConductor, string> = {
  frenar: "frena",
  volantear_izquierda: "volantea a la izquierda",
  volantear_derecha: "volantea a la derecha",
  seguir: "sigue sin frenar",
};

/** La hipótesis del perito sobre un conductor. */
export interface HipotesisConductor {
  vehiculo: Id;
  decision: DecisionConductor;
  /** Cuántos segundos antes del impacto reconstruido decide (0 a 10). */
  segundosAntes: number;
  /** Su tiempo de reacción, si el perito lo da (s); si no, el típico con su rango. */
  tiempoReaccionS?: number | null;
}

/** Los límites de lo que el perito puede escribir. */
export const SEGUNDOS_ANTES_MAX = 10;
export const TIEMPO_REACCION_S = [0.3, 3.0] as const;

/** Qué falta o está fuera de rango en la hipótesis, en palabras; vacío si se puede probar. */
export function problemasHipotesis(r: Reconstruccion, h: HipotesisConductor): string[] {
  const out: string[] = [];
  if (!Object.values(r.ids).includes(h.vehiculo)) out.push(`${h.vehiculo} no está en el caso.`);
  if (!Number.isFinite(h.segundosAntes) || h.segundosAntes < 0)
    out.push("El instante va en segundos antes del impacto: 0 o más.");
  else if (h.segundosAntes > SEGUNDOS_ANTES_MAX)
    out.push(`El instante va hasta ${SEGUNDOS_ANTES_MAX} s antes del impacto.`);
  const tr = h.tiempoReaccionS;
  if (
    tr !== null &&
    tr !== undefined &&
    (!Number.isFinite(tr) || tr < TIEMPO_REACCION_S[0] || tr > TIEMPO_REACCION_S[1])
  )
    out.push(
      `El tiempo de reacción va de ${TIEMPO_REACCION_S[0]} a ${TIEMPO_REACCION_S[1]} s (o vacío para el típico).`,
    );
  return out;
}

/**
 * La escena del 3D con el conductor del perito: su decisión y su instante (y su tiempo de reacción
 * si lo dio), con fuente «usuario». Los demás vehículos no llevan `conductor`: el solver los simula
 * igual, con el tiempo de reacción típico.
 */
export function especConConductor(r: Reconstruccion, h: HipotesisConductor): Json {
  const spec = especReconstruida(r) as Json & { vehiculos: Json[] };
  const sid = Object.keys(r.ids).find((k) => r.ids[k] === h.vehiculo);
  const v = spec.vehiculos.find((x) => x.id === sid);
  if (!v) throw new Error(`${h.vehiculo} no está en la escena.`);
  const deUsuario = { fuente: "usuario", confianza: 0.9 };
  v.conductor = {
    decision: { valor: h.decision, ...deUsuario, nota: "Hipótesis del perito (R12a)." },
    instante_decision: {
      valor: -Math.abs(h.segundosAntes),
      unidad: "s",
      ...deUsuario,
      nota: "Respecto del impacto reconstruido.",
    },
    ...(h.tiempoReaccionS !== null && h.tiempoReaccionS !== undefined
      ? { tiempo_reaccion: { valor: h.tiempoReaccionS, unidad: "s", ...deUsuario } }
      : {}),
  };
  return spec;
}

/** El contacto de una simulación de los conductores, en términos del expediente. */
export interface ContactoConductores {
  contacto: boolean;
  /** Cuándo (s respecto del impacto reconstruido); null sin contacto. */
  t: number | null;
  vehiculos: Id[];
  velocidades: { vehiculo: Id; kmh: number }[];
  relativaKmh: number | null;
  /** Sin contacto: a cuántos metros quedaron como mucho. */
  distanciaMinimaM: number | null;
}

export interface DecisionLeida {
  vehiculo: Id;
  tipo: DecisionConductor;
  t: number;
  /** «perito», «reconstruccion» o «reaccion». */
  origen: string;
  /** Si reacciona: a quién vio frenar y cuándo. */
  ante: Id | null;
  percibioT: number | null;
}

export interface PruebaConductores {
  conHipotesis: ContactoConductores;
  /**
   * Los mismos agentes sin la hipótesis. En AXA da el impacto de la reconstrucción; en una carambola
   * colocada a mano puede dar otro primer contacto (pendiente en PROGRESS).
   */
  sinHipotesis: ContactoConductores;
  decisiones: DecisionLeida[];
  tiemposReaccion: { vehiculo: Id; s: number; rango: [number, number]; fuente: string }[];
  /**
   * La velocidad relativa al contacto contra la de la reconstrucción, si las dos tienen contacto y es
   * entre los mismos vehículos (comparar el de otro par no dice nada).
   */
  diferenciaRelativa: { kmh: number; pct: number | null } | null;
  /** Con la hipótesis, el primer contacto es entre otros vehículos que en la reconstrucción. */
  cambiaElPar: boolean;
  /** Con el tiempo de reacción de los que reaccionan sorteado en su rango. */
  sensibilidad: { muestras: number; sinContacto: number; p10: number; p90: number } | null;
  /**
   * Sin la hipótesis, el primer contacto de los conductores no es el primer impacto de la
   * reconstrucción (otro par, u otro instante): se dice, con los dos (ADR 0088).
   */
  lineaBaseDistinta: { sinHipotesis: string; reconstruccion: string } | null;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
/** Diferencia de instante con la que el primer contacto ya no es el impacto reconstruido (s). */
const TOLERANCIA_CONTACTO_S = 0.1;
const enSegundos = (t: number) => `${t < 0 ? "−" : "+"}${Math.abs(t).toFixed(2)} s`;
const par = (vs: readonly string[]) => [...vs].sort().join("|");

/** El primer contacto sin la hipótesis contra el primer impacto de la reconstrucción. */
function contraLaReconstruccion(
  r: Reconstruccion,
  sin: ContactoConductores,
): PruebaConductores["lineaBaseDistinta"] {
  const primero = r.impactos?.[0];
  if (!primero) return null;
  const igual =
    sin.contacto &&
    par(sin.vehiculos) === par(primero.vehiculos) &&
    Math.abs(sin.t! - primero.t) <= TOLERANCIA_CONTACTO_S;
  if (igual) return null;
  return {
    sinHipotesis: sin.contacto
      ? `${sin.vehiculos.join(" con ")} en ${enSegundos(sin.t!)}`
      : `ningún contacto (quedan a ${(sin.distanciaMinimaM ?? 0).toFixed(2)} m)`,
    reconstruccion: `${primero.vehiculos.join(" con ")} en ${enSegundos(primero.t)}`,
  };
}

/** Lee el bloque `agentes` del resultado en términos del expediente. */
export function leerPruebaConductores(r: Reconstruccion, agentes: Json): PruebaConductores {
  const id = (sid: unknown) => r.ids[String(sid)] ?? String(sid);
  const contacto = (s: Json): ContactoConductores =>
    s.contacto
      ? {
          contacto: true,
          t: Number(s.t),
          vehiculos: (s.vehiculos as string[]).map(id),
          velocidades: (s.velocidades_kmh as { vehiculo: string; valor: number }[]).map((x) => ({
            vehiculo: id(x.vehiculo),
            kmh: x.valor,
          })),
          relativaKmh: Number(s.velocidad_relativa_kmh),
          distanciaMinimaM: null,
        }
      : {
          contacto: false,
          t: null,
          vehiculos: [],
          velocidades: [],
          relativaKmh: null,
          distanciaMinimaM: Number(s.distancia_minima_m),
        };
  const con = contacto(agentes.resultado as Json);
  const sin = contacto(agentes.linea_base as Json);
  const cambiaElPar = con.contacto && sin.contacto && par(con.vehiculos) !== par(sin.vehiculos);
  const conductores = agentes.conductores as {
    vehiculo: string;
    tiempo_reaccion_s: { valor: number; rango: [number, number]; fuente: string };
    decision?: {
      tipo: DecisionConductor;
      t: number;
      origen: string;
      ante?: string;
      percibio_t?: number;
    };
  }[];
  const sens = agentes.sensibilidad as
    | {
        muestras: number;
        sin_contacto: number;
        velocidad_relativa_kmh?: { p10: number; p90: number };
      }
    | undefined;
  return {
    conHipotesis: con,
    sinHipotesis: sin,
    decisiones: conductores
      .filter((c) => c.decision)
      .map((c) => ({
        vehiculo: id(c.vehiculo),
        tipo: c.decision!.tipo,
        t: c.decision!.t,
        origen: c.decision!.origen,
        ante: c.decision!.ante ? id(c.decision!.ante) : null,
        percibioT: c.decision!.percibio_t ?? null,
      }))
      .sort((a, b) => a.t - b.t),
    tiemposReaccion: conductores.map((c) => ({
      vehiculo: id(c.vehiculo),
      s: c.tiempo_reaccion_s.valor,
      rango: c.tiempo_reaccion_s.rango,
      fuente: c.tiempo_reaccion_s.fuente,
    })),
    diferenciaRelativa:
      con.relativaKmh !== null && sin.relativaKmh !== null && !cambiaElPar
        ? {
            kmh: r2(con.relativaKmh - sin.relativaKmh),
            pct:
              sin.relativaKmh > 0
                ? r2(((con.relativaKmh - sin.relativaKmh) / sin.relativaKmh) * 100)
                : null,
          }
        : null,
    cambiaElPar,
    lineaBaseDistinta: contraLaReconstruccion(r, sin),
    sensibilidad:
      sens?.velocidad_relativa_kmh !== undefined
        ? {
            muestras: sens.muestras,
            sinContacto: sens.sin_contacto,
            p10: sens.velocidad_relativa_kmh.p10,
            p90: sens.velocidad_relativa_kmh.p90,
          }
        : null,
  };
}

/** Una decisión en palabras: «V1 frena en −1.40 s, 1.10 s después de ver frenar a V2 (−2.50 s)». */
export function decisionEnPalabras(d: DecisionLeida): string {
  const cuando = `en ${d.t < 0 ? "−" : "+"}${Math.abs(d.t).toFixed(2)} s`;
  const que = `${d.vehiculo} ${DECISION_EN_PALABRAS[d.tipo]} ${cuando}`;
  if (d.origen === "perito") return `${que} (la hipótesis del perito)`;
  if (d.origen === "reconstruccion") return `${que} (como en la reconstrucción)`;
  if (d.ante && d.percibioT !== null)
    return `${que}, ${(d.t - d.percibioT).toFixed(2)} s después de ver frenar a ${d.ante} (${d.percibioT < 0 ? "−" : "+"}${Math.abs(d.percibioT).toFixed(2)} s)`;
  return que;
}
