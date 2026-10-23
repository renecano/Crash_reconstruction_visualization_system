/**
 * Lo obligatorio de cada paso del recorrido (V2, ADR 0080): «Siguiente» se desactiva diciendo qué
 * falta y los pasos futuros no se abren hasta completar lo obligatorio de los anteriores. Lo
 * opcional (masas, restos, huellas, posiciones iniciales, la declaración) nunca bloquea.
 */
import type { Expediente } from "@croquis/cesvi";

export type ClavePaso =
  "caso" | "hecho" | "lugar" | "reconstruccion" | "danos" | "numeros" | "reporte" | "dictamen";

export const CLAVES_PASOS: readonly ClavePaso[] = [
  "caso",
  "hecho",
  "lugar",
  "reconstruccion",
  "danos",
  "numeros",
  "reporte",
  "dictamen",
];

export interface EstadoRecorrido {
  /** Un caso importado necesita su reporte cargado antes de seguir. */
  esperaReporte: boolean;
  expediente: Expediente | null;
  reconstruido: boolean;
}

/** Une nombres como se dicen: «V1», «V1 y V2», «V1, V2 y V3». */
export function enLista(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/** Los vehículos del primer impacto (o los dos primeros, si la escena no dice el impacto). */
export function vehiculosDelImpacto(e: Expediente): string[] {
  const primero = [...(e.impactos ?? [])].sort((a, b) => a.orden - b.orden)[0];
  const vs = (primero?.vehiculos ?? []).filter((v) => typeof v === "string");
  return vs.length ? vs : e.vehiculos.slice(0, 2).map((v) => v.id);
}

/**
 * Los impactos que se marcan en el mapa: los que son entre vehículos (en una carambola, cada uno
 * con su punto). Sin impactos en la escena, uno entre los dos primeros vehículos.
 */
export function impactosAColocar(e: Expediente): { orden: number; vehiculos: string[] }[] {
  const entre = [...(e.impactos ?? [])]
    .sort((a, b) => a.orden - b.orden)
    .map((i) => ({ orden: i.orden, vehiculos: (i.vehiculos ?? []).map(String) }))
    .filter((i) => i.vehiculos.length >= 2);
  return entre.length ? entre : [{ orden: 1, vehiculos: vehiculosDelImpacto(e) }];
}

/** Lo que falta del lugar: el punto de cada impacto y dónde quedó cada vehículo. */
export function faltaDelLugar(e: Expediente): { impactos: number[]; finales: string[] } {
  const pos = e.versiones?.find((v) => v.tipo === "evidencia")?.posiciones ?? [];
  const tiene = (v: string, fase: string) => pos.some((p) => p.vehiculo === v && p.fase === fase);
  return {
    impactos: impactosAColocar(e)
      .filter((i) => i.vehiculos.some((v) => !tiene(v, "impacto")))
      .map((i) => i.orden),
    finales: e.vehiculos.map((v) => v.id).filter((v) => !tiene(v, "final")),
  };
}

/** Cómo se nombra el punto de un impacto: «el punto de impacto», o con su número en carambolas. */
export const nombrePunto = (orden: number, total: number) =>
  total > 1 ? `el punto del impacto ${orden}` : "el punto de impacto";

/** Lo que falta para salir de un paso, dicho para el perito (vacío si puede seguir). */
export function faltaEnPaso(paso: ClavePaso, s: EstadoRecorrido): string[] {
  if (paso === "caso") return s.esperaReporte ? ["cargar el reporte de CESVI"] : [];
  if (paso === "hecho") return s.expediente ? [] : ["leer la narración del hecho"];
  if (!s.expediente) return [];
  if (paso === "lugar") {
    const f = faltaDelLugar(s.expediente);
    const total = impactosAColocar(s.expediente).length;
    return [
      ...f.impactos.map((o) => nombrePunto(o, total)),
      ...(f.finales.length
        ? [`${enLista(f.finales)}, dónde ${f.finales.length === 1 ? "quedó" : "quedaron"}`]
        : []),
    ];
  }
  if (paso === "reconstruccion") return s.reconstruido ? [] : ["reconstruir"];
  return [];
}

/**
 * Si un paso se puede abrir: lo está si todo lo obligatorio de los pasos anteriores (de la lista de
 * pasos del caso) está completo.
 */
export function pasoAbierto(
  pasos: readonly ClavePaso[],
  indice: number,
  s: EstadoRecorrido,
): boolean {
  return pasos.slice(0, indice).every((p) => faltaEnPaso(p, s).length === 0);
}
