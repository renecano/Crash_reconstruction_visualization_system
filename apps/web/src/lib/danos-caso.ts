/**
 * Lo que el paso «Los daños» dice de cada vehículo (René, 2026-11-04, prompt del rediseño §0.1: en
 * AXA, C1–C6, la energía y el Δv salían en 0). Dos lecturas, cada una con su origen:
 *
 * - **Del reporte**: el perfil de deformación medido (C1–Cn y L) en la cara del daño. Sin medida,
 *   «sin dato» con el motivo; nunca 0.
 * - **De la reconstrucción**: energía, Δv y perfil que calcula el solver con las velocidades que
 *   reconstruyó Croquis (el resultado ajustado, el mismo del 3D). El resultado de partida de la
 *   reconstrucción va con las velocidades supuestas de la narración y en AXA no tenía choque
 *   (velocidad de cierre 0): de ahí los ceros.
 */
import type { Expediente } from "@croquis/cesvi";

type Json = Record<string, unknown>;

export const CARA_EN_PALABRAS: Record<string, string> = {
  frontal: "frente",
  posterior: "parte trasera",
  lateral_izquierdo: "costado izquierdo",
  lateral_derecho: "costado derecho",
};

export type Medicion =
  | { tipo: "medido"; cara: string; cCm: number[]; lM: number | null }
  | { tipo: "sin_dato"; motivo: string };

export type Calculo =
  | {
      tipo: "calculado";
      energiaKj: number;
      deltaVKmh: number | null;
      perfilCm: number[];
      rigidez: string;
    }
  | { tipo: "sin_dato"; motivo: string };

export interface FilaDano {
  vehiculo: string;
  medido: Medicion;
  calculado: Calculo;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Las filas de daño de cada vehículo del expediente. `ajustado` es el resultado del solver con las
 * velocidades reconstruidas (`resultadoAjustado`); `ids` lleva del id de la escena al del caso.
 */
export function filasDano(
  e: Expediente,
  ajustado: Json | null,
  ids: Record<string, string>,
): FilaDano[] {
  const calculados = ((ajustado?.vehiculos ?? []) as Json[]).map((v) => ({
    id: String(v.id),
    deltaV: typeof v.delta_v_kmh === "number" ? v.delta_v_kmh : null,
    dano: v.dano as
      { perfil_m?: number[]; energia_j?: number; origen_rigidez?: string } | undefined,
  }));
  return e.vehiculos.map((v) => {
    const conMedida = (e.danos ?? []).filter(
      (d) => d.vehiculo === v.id && !d.dano_previo && (d.magnitud?.c_m?.length ?? 0) > 0,
    );
    const d = conMedida[0];
    const medido: Medicion = d
      ? {
          tipo: "medido",
          cara: CARA_EN_PALABRAS[d.zona.cara] ?? d.zona.cara,
          cCm: d.magnitud!.c_m!.map((c) => Math.round(c * 100)),
          lM: d.magnitud?.l_m ?? null,
        }
      : {
          tipo: "sin_dato",
          motivo: `el reporte no trae la medida de la deformación de ${v.id}`,
        };
    const c = calculados.find((x) => ids[x.id] === v.id);
    const energia = c?.dano?.energia_j;
    const calculado: Calculo = !ajustado
      ? { tipo: "sin_dato", motivo: "falta reconstruir" }
      : !c || energia === undefined
        ? { tipo: "sin_dato", motivo: `la reconstrucción no tiene un impacto de ${v.id}` }
        : energia <= 0
          ? {
              tipo: "sin_dato",
              motivo: `en la reconstrucción ${v.id} no absorbe energía en el impacto`,
            }
          : {
              tipo: "calculado",
              energiaKj: r1(energia / 1000),
              deltaVKmh: c.deltaV === null ? null : r1(c.deltaV),
              perfilCm: (c.dano?.perfil_m ?? []).map((x) => Math.round(x * 100)),
              rigidez:
                c.dano?.origen_rigidez === "nhtsa"
                  ? "rigidez típica de la clase (NHTSA)"
                  : "rigidez del reporte",
            };
    return { vehiculo: v.id, medido, calculado };
  });
}
