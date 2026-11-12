/**
 * El orden de los impactos de una carambola, declarado a mano (T6.3, W7).
 *
 * La lectura numera los impactos como los encuentra. Si la narración no dice en qué orden
 * ocurrieron, ese orden es un supuesto de Croquis: se le pregunta al perito, y lo que conteste
 * queda como dato suyo. El primer impacto es el origen de la reconstrucción; los demás entran al
 * solver como eventos posteriores en ese orden, y el solver avisa si en la reconstrucción ocurren
 * en otro (`orden_impactos_distinto`).
 *
 * Solo se ordenan los impactos entre vehículos. Un choque contra un objeto (C1) conserva su lugar
 * en la secuencia.
 */
import type { Expediente } from "./corpus";

type Impacto = NonNullable<Expediente["impactos"]>[number];

export const CLAVE_ORDEN_IMPACTOS = "orden-impactos";

/** Con más impactos, las formas de ordenarlos ya no caben en una pregunta (4 dan 24). */
export const MAX_IMPACTOS_A_ORDENAR = 3;

const entreVehiculos = (i: Impacto) => (i.vehiculos?.length ?? 0) >= 2;

/** Los impactos entre vehículos, en orden. Una carambola tiene más de uno. */
export function impactosEntreVehiculos(e: Expediente): Impacto[] {
  return (e.impactos ?? []).filter(entreVehiculos).sort((a, b) => a.orden - b.orden);
}

export const esCarambola = (e: Expediente) => impactosEntreVehiculos(e).length > 1;

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Palabras con las que una narración dice el orden de lo que pasó: de secuencia («primero»,
 * «después», «luego», «enseguida») y de consecuencia («a su vez», «lo proyectó contra», «por el
 * impacto»). Sin ninguna, el orden de los impactos no está dicho.
 */
const MARCAS_DE_ORDEN = [
  /\bprimer[oa]?\b/,
  /\bsegund[oa]\b/,
  /\btercer[oa]?\b/,
  /\bdespues\b/,
  /\bluego\b/,
  /\bposteriormente\b/,
  /\ben\s?seguida\b/,
  /\ba continuacion\b/,
  /\bacto seguido\b/,
  /\bfinalmente\b/,
  /\bpor ultimo\b/,
  /\btras (?:el|la|ese|esa|este|esta|dicho|dicha) (?:impacto|choque|colision|golpe|alcance)\b/,
  /\bantes de (?:chocar|impactar|golpear|pegar)/,
  /\ba su vez\b/,
  /\bpor (?:el|ese|este|dicho) (?:impacto|choque|golpe|alcance)\b/,
  /\b(?:a|como) consecuencia\b/,
  /\b(?:lo|la|los|las) (?:proyecto|proyecta|impulso|impulsa|avento|avienta|lanzo|lanza|empujo|empuja)\b/,
  /\b(?:proyectando|impulsando|aventando|lanzando|empujando)(?:lo|la|los|las)\b/,
  /\b(?:proyectad|impulsad|aventad|lanzad|empujad)[oa]s?\b/,
];

/** Si la narración dice en qué orden ocurrieron las cosas (con palabras de secuencia o de consecuencia). */
export function ordenNarrado(narracion: string): boolean {
  const t = plano(narracion);
  return MARCAS_DE_ORDEN.some((rx) => rx.test(t));
}

function permutaciones<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) =>
    permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((resto) => [x, ...resto]),
  );
}

/**
 * Las formas de ordenar los impactos entre vehículos, cada una como la lista de sus `orden` de
 * ahora; la primera es el orden actual. Vacío si no es una carambola o si tiene más de
 * `MAX_IMPACTOS_A_ORDENAR`.
 */
export function ordenesPosibles(e: Expediente): number[][] {
  const actuales = impactosEntreVehiculos(e).map((i) => i.orden);
  if (actuales.length < 2 || actuales.length > MAX_IMPACTOS_A_ORDENAR) return [];
  return permutaciones(actuales);
}

/** «V1 con V2, luego V2 con V3»: una secuencia de impactos en palabras. */
export function textoOrden(e: Expediente, secuencia: readonly number[]): string {
  const porOrden = new Map((e.impactos ?? []).map((i) => [i.orden, i]));
  return secuencia
    .map((o) => (porOrden.get(o)?.vehiculos ?? []).join(" con "))
    .filter(Boolean)
    .join(", luego ");
}

/**
 * El perito declara el orden: `secuencia` lista los `orden` de ahora de los impactos entre
 * vehículos, en el orden en que ocurrieron. Cada impacto conserva lo suyo (vehículos, zonas, punto
 * en el mapa, cita) y pasa al lugar que le toca; quedan con la fuente del perito. Los choques
 * contra objetos no se mueven. Si `secuencia` no es una reordenación de esos impactos, no cambia nada.
 */
export function conOrdenImpactos(e: Expediente, secuencia: readonly number[]): Expediente {
  const entre = impactosEntreVehiculos(e);
  const lugares = entre.map((i) => i.orden);
  const valida =
    secuencia.length === lugares.length &&
    new Set(secuencia).size === secuencia.length &&
    secuencia.every((o) => lugares.includes(o));
  if (!valida || entre.length < 2) return e;
  const nuevoLugar = new Map(secuencia.map((o, k) => [o, lugares[k]!]));
  return {
    ...e,
    impactos: (e.impactos ?? [])
      .map((i) =>
        nuevoLugar.has(i.orden) && entreVehiculos(i)
          ? { ...i, orden: nuevoLugar.get(i.orden)!, fuente: "perito" as const }
          : i,
      )
      .sort((a, b) => a.orden - b.orden),
  };
}
