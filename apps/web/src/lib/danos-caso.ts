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
      /** De dónde salen A y B, en palabras (`dano.rigidez.nota`). */
      rigidezNota: string | null;
      /** Lo medido, C1–C6 en cm, para ponerlo junto a lo calculado (`dano.medido_m`). */
      medidoCm: number[] | null;
      /** La energía que implica lo medido con la misma rigidez (`dano.energia_medida_j`). */
      energiaMedidaKj: number | null;
      /** Lo más que puede disipar el choque a las velocidades reconstruidas (plástico total). */
      maxDisipableKj: number | null;
      /** El aviso neutral si lo medido pide más energía de la que el choque puede dar. */
      aviso: string | null;
      /**
       * Un roce bajo el umbral de CRASH3 (René, 2026-11-26, la reversa): la energía que absorbe y la
       * que necesita esa zona para deformarse (A²/2B por el ancho dañado). Con menos, 0 cm es lo
       * correcto: no se inventa daño.
       */
      roce: { energiaKj: number; umbralKj: number; anchoM: number } | null;
    }
  | { tipo: "sin_dato"; motivo: string };

export interface FilaDano {
  vehiculo: string;
  medido: Medicion;
  calculado: Calculo;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Lo más que puede disipar el primer choque entre dos vehículos: la energía cinética relativa con la
 * masa reducida, ½·m₁m₂/(m₁+m₂)·|v₁ − v₂|², con las velocidades justo antes del impacto. Es el
 * límite de un choque totalmente plástico; null si no hay un choque entre dos vehículos.
 */
export function energiaMaximaDisipable(res: Json | null): number | null {
  const ev = ((res?.eventos ?? []) as Json[]).find((e) => e.tipo === "impacto_vehiculo_vehiculo");
  const actores = (ev?.actores ?? []) as string[];
  if (actores.length !== 2) return null;
  const vs = ((res?.vehiculos ?? []) as Json[]).filter((v) => actores.includes(String(v.id)));
  if (vs.length !== 2) return null;
  const estado = (v: Json) => {
    const tr = v.trayectoria as { t: number[]; vx: number[]; vy: number[] } | undefined;
    const m = (v.dimensiones as { masa_kg?: number } | undefined)?.masa_kg;
    if (!tr || !m) return null;
    let k = 0;
    for (let i = 0; i < tr.t.length; i++) if (tr.t[i]! < 0) k = i;
    return { m, vx: tr.vx[k]!, vy: tr.vy[k]! };
  };
  const a = estado(vs[0]!);
  const b = estado(vs[1]!);
  if (!a || !b) return null;
  const mu = (a.m * b.m) / (a.m + b.m);
  return 0.5 * mu * ((a.vx - b.vx) ** 2 + (a.vy - b.vy) ** 2);
}

/**
 * Las filas de daño de cada vehículo del expediente. `ajustado` es el resultado del solver con las
 * velocidades reconstruidas (`resultadoAjustado`); `ids` lleva del id de la escena al del caso.
 */
/**
 * Si el choque es un roce bajo el umbral de deformación de CRASH3: el perfil es cero en todo el ancho
 * y la energía que absorbe no pasa A²/(2B)·L, la energía con la que esa zona empieza a deformarse.
 */
export function roceBajoElUmbral(
  energiaJ: number,
  dano:
    | { perfil_m?: number[]; ancho_m?: number; rigidez?: { a_n_m?: number; b_n_m2?: number } }
    | undefined,
): { energiaKj: number; umbralKj: number; anchoM: number } | null {
  const a = dano?.rigidez?.a_n_m;
  const b = dano?.rigidez?.b_n_m2;
  const l = dano?.ancho_m;
  if (!dano?.perfil_m?.every((c) => c === 0) || !a || !b || !l) return null;
  const umbral = ((a * a) / (2 * b)) * l;
  return energiaJ <= umbral
    ? { energiaKj: r1(energiaJ / 1000), umbralKj: r1(umbral / 1000), anchoM: r1(l) }
    : null;
}

export function filasDano(
  e: Expediente,
  ajustado: Json | null,
  ids: Record<string, string>,
): FilaDano[] {
  const calculados = ((ajustado?.vehiculos ?? []) as Json[]).map((v) => ({
    id: String(v.id),
    deltaV: typeof v.delta_v_kmh === "number" ? v.delta_v_kmh : null,
    dano: v.dano as
      | {
          perfil_m?: number[];
          energia_j?: number;
          origen_rigidez?: string;
          medido_m?: number[];
          energia_medida_j?: number;
          ancho_m?: number;
          rigidez?: { fuente?: string; nota?: string; a_n_m?: number; b_n_m2?: number };
        }
      | undefined,
  }));
  const maximo = energiaMaximaDisipable(ajustado);
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
          motivo: "el texto no trae la medida de la deformación",
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
                  : c.dano?.origen_rigidez === "reporte"
                    ? "rigidez del reporte"
                    : "rigidez supuesta (respaldo genérico)",
              rigidezNota: c.dano?.rigidez?.nota ?? null,
              medidoCm: c.dano?.medido_m ? c.dano.medido_m.map((x) => Math.round(x * 100)) : null,
              energiaMedidaKj:
                c.dano?.energia_medida_j !== undefined ? r1(c.dano.energia_medida_j / 1000) : null,
              maxDisipableKj: maximo === null ? null : r1(maximo / 1000),
              aviso:
                c.dano?.energia_medida_j !== undefined &&
                maximo !== null &&
                c.dano.energia_medida_j > maximo
                  ? `La deformación medida, con la ${c.dano?.origen_rigidez === "reporte" ? "rigidez del reporte" : "rigidez usada"}, equivale a ${Math.round(c.dano.energia_medida_j / 1000)} kJ; un choque a estas velocidades puede disipar a lo más ${Math.round(maximo / 1000)} kJ: revisa la rigidez o las medidas.`
                  : null,
              roce: roceBajoElUmbral(energia, c.dano),
            };
    return { vehiculo: v.id, medido, calculado };
  });
}
