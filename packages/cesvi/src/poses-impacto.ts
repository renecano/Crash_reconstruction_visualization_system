/**
 * Las poses de impacto a partir del punto que marca el perito (V2, ADR 0080): como
 * `proponerVersiones` del recorrido de AXA, pero para cualquier caso de expediente.
 *
 * El primer vehículo del impacto apunta hacia donde el perito gira su flecha. El segundo se orienta
 * por las caras de contacto: frente contra parte posterior, el mismo rumbo; frente contra frente,
 * el contrario; frente contra un costado, perpendicular (hacia la derecha o la izquierda según el
 * costado). Cada uno queda con su cara de contacto en el punto: a medio largo (frente o parte
 * posterior) o a medio ancho (costados). Es una propuesta (fuente «perito», porque sale de su punto
 * y de su flecha); el perito la ajusta colocando cada vehículo otra vez.
 */
import { VEHICLE_CLASSES } from "@croquis/scene-schema";
import type { Expediente } from "./corpus";
import { avanzar, type LonLat } from "./geo";

type Id = Expediente["vehiculos"][number]["id"];
type Cara = "frontal" | "posterior" | "lateral_izquierdo" | "lateral_derecho";

/** Hacia dónde mira (rumbo, grados) la cara de un vehículo con rumbo h. */
const NORMAL: Record<Cara, number> = {
  frontal: 0,
  posterior: 180,
  lateral_derecho: 90,
  lateral_izquierdo: -90,
};

const norm = (g: number) => ((g % 360) + 360) % 360;

/** El largo y el ancho típicos de la clase del vehículo (sedán mediano si no la da). */
export function medidasDe(v: Expediente["vehiculos"][number]): { largo: number; ancho: number } {
  const t =
    VEHICLE_CLASSES[v.clase ?? "sedan_mediano"]?.tipico ?? VEHICLE_CLASSES.sedan_mediano!.tipico;
  return { largo: t.largo_m, ancho: t.ancho_m };
}

/** El impacto de ese orden (el primero si no se dice). */
const impactoDe = (e: Expediente, orden: number) =>
  [...(e.impactos ?? [])].sort((a, b) => a.orden - b.orden).find((i) => i.orden === orden) ??
  [...(e.impactos ?? [])].sort((a, b) => a.orden - b.orden)[0];

/** La cara de contacto de un vehículo en un impacto (la de la zona, o la de más daños). */
function caraDe(e: Expediente, v: Id, orden: number): Cara | null {
  const imp = impactoDe(e, orden);
  const z = imp?.zonas?.find((x) => x.vehiculo === v)?.zona.cara;
  const deDanos = (e.danos ?? []).find((d) => d.vehiculo === v && !d.dano_previo)?.zona.cara;
  const c = z ?? deDanos;
  return c && c in NORMAL ? (c as Cara) : null;
}

export interface PoseImpacto {
  vehiculo: Id;
  punto: { lat: number; lon: number };
  rumbo: number;
}

/**
 * Las poses de los vehículos de un impacto (el primero, si no se dice el orden). `rumbo` es hacia
 * dónde apunta el frente del primero de ese impacto (0° = norte). Sin cara de contacto conocida, el
 * vehículo queda en el punto con el mismo rumbo que el primero. En una carambola, el primero de un
 * impacto posterior ya tiene su pose: se pasa su rumbo y solo se usa la del que entra.
 */
export function posesDeImpacto(
  e: Expediente,
  punto: { lat: number; lon: number },
  rumbo: number,
  orden = 1,
): PoseImpacto[] {
  const imp = impactoDe(e, orden);
  const ids = (imp?.vehiculos?.length ? imp.vehiculos : e.vehiculos.slice(0, 2).map((v) => v.id))
    .filter((v): v is Id => e.vehiculos.some((x) => x.id === v))
    .slice(0, 2);
  const [a, b] = ids;
  if (!a) return [];
  const caraA = caraDe(e, a, orden);
  const hA = norm(rumbo);
  // La cara de A apunta (en el mundo) hacia B; la de B debe apuntar de regreso, hacia A.
  const haciaB = caraA ? norm(hA + NORMAL[caraA]) : hA;
  const caraB = b ? caraDe(e, b, orden) : null;
  const hB = caraB ? norm(haciaB + 180 - NORMAL[caraB]) : hA;
  const pose = (v: Id, h: number, cara: Cara | null): PoseImpacto => {
    const m = medidasDe(e.vehiculos.find((x) => x.id === v)!);
    if (!cara) return { vehiculo: v, punto, rumbo: h };
    const media = cara === "frontal" || cara === "posterior" ? m.largo / 2 : m.ancho / 2;
    // El centro queda detrás de su cara de contacto, a la mitad de su medida.
    const [lon, lat] = avanzar(
      [punto.lon, punto.lat] as LonLat,
      norm(h + NORMAL[cara] + 180),
      media,
    );
    return { vehiculo: v, punto: { lat, lon }, rumbo: h };
  };
  return [pose(a, hA, caraA), ...(b ? [pose(b, hB, caraB)] : [])];
}
