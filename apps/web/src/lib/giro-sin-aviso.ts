/**
 * Un vehículo atravesado en el choque sin que La escena lo diga (René, 2026-11-25): «una comprobación
 * que falle si un vehículo queda a más de 30° de su calle narrada sin aviso, excepto en maniobras
 * narradas (vuelta, salida del camino, volcadura)». La usan la revisión de la cadena y las pruebas.
 *
 * Un vehículo está bien si en su pose de impacto hay una calle a menos de su medio ancho y 4 m cuyo eje
 * va a ±30° de su frente: la calle por la que la narración dice que llegaba, si lo dice; si no, cualquiera.
 * Si no lo está, cuenta solo si su renglón de La escena no trae un aviso y la narración no le da una
 * maniobra.
 */
import type { Expediente } from "@croquis/cesvi";

type Vehiculo = Expediente["vehiculos"][number];
import {
  calleDeLlegadaNarrada,
  nombresDe,
  poseDe,
  sinAcentos,
  sobreCalle,
  type Calle,
} from "./escena-facil";
import { esLaCalleNarradaAprox, palabrasDeMas } from "./lugar-claro";

/** Grados entre el frente del vehículo y el eje de su calle a partir de los cuales está atravesado. */
export const GIRO_MAX_DEG = 30;

/** Lo que La escena escribe en el renglón del vehículo cuando su llegada no cuadra con la calle. */
const AVISOS = [
  "la calle de llegada no coincide con la narración",
  "la calle de llegada no pasa por el punto del choque",
  "no hay una calle en ese sentido",
];

/** Lo que hace que un vehículo, a propósito, no vaya alineado con su calle en el choque. */
const MANIOBRA =
  /\b(?:dio\s+(?:la\s+)?vuelta|da\s+vuelta|vuelta\s+(?:a\s+la|en\s+u|hacia)|giro|giraba|viro|viraba|incorpor\w*|sali[oa]\s+del\s+camino|salida\s+del\s+camino|se\s+salio|volc\w*|volte\w*|derrap\w*|perdio\s+el\s+control|invadi\w*|cambio\s+de\s+carril|se\s+abrio|cruzaba|atraves\w*|en\s+reversa|de\s+reversa)\b/;

const difEje = (a: number, b: number) => {
  const d = Math.abs(((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
};

/** ¿La narración le da a este vehículo una maniobra que lo saca del eje de su calle? */
export function maniobraNarrada(
  narracion: string,
  v: Vehiculo,
  todos: readonly Vehiculo[],
): boolean {
  // Con un solo vehículo, «el vehículo» de cada oración es él.
  if (todos.length === 1) return MANIOBRA.test(sinAcentos(narracion));
  const nombres = nombresDe(v, todos).map((n) => sinAcentos(n));
  return narracion
    .split(/(?<=[.;])\s+/)
    .map(sinAcentos)
    .some(
      (o) =>
        nombres.some(
          (n) =>
            n.trim() && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(o),
        ) && MANIOBRA.test(o),
    );
}

export interface GiroSinAviso {
  vehiculo: string;
  /** El frente del vehículo en el choque (rumbo). */
  frente: number;
  /** La calle narrada, si la hay. */
  narrada: string | null;
  /** Grados al eje de la calle más alineada cerca (null si no hay calles cerca). */
  dif: number | null;
}

/** Los vehículos atravesados en el choque sin aviso ni maniobra narrada. */
export function girosSinAviso(o: {
  expediente: Expediente;
  calles: readonly Calle[];
  /** Los renglones de La escena (`propuestos[].texto`). */
  propuestos: readonly string[];
  narracion: string | null;
  nombreDe: (id: string) => string;
}): GiroSinAviso[] {
  const vs = o.expediente.vehiculos;
  const out: GiroSinAviso[] = [];
  for (const v of vs) {
    const pose = poseDe(o.expediente, v.id, "impacto");
    if (!pose) continue;
    const narrada = o.narracion ? calleDeLlegadaNarrada(o.narracion, v, vs) : null;
    // Bajo el vehículo (a menos de su medio ancho y 4 m), una calle alineada con él; y si la narración
    // dice por cuál llegaba, alineado también con ella (a menos de 25 m: puede ir por su lateral).
    const bajo = o.calles
      .map((c) => ({ c, s: sobreCalle(c, pose.punto) }))
      .filter((x) => x.s.distancia <= x.c.ancho / 2 + 4);
    const difBajo = bajo.length
      ? Math.min(...bajo.map((x) => difEje(x.s.rumbo, pose.rumbo)))
      : null;
    const coinciden = narrada
      ? o.calles.filter((c) => c.nombre && esLaCalleNarradaAprox(narrada, c.nombre))
      : [];
    const deMas = Math.min(...coinciden.map((c) => palabrasDeMas(narrada!, c.nombre!)));
    const suyas = narrada
      ? coinciden
          .filter((c) => palabrasDeMas(narrada, c.nombre!) === deMas)
          .map((c) => sobreCalle(c, pose.punto))
          .filter((x) => x.distancia <= 25)
      : null;
    const difSuya =
      suyas === null
        ? difBajo
        : suyas.length
          ? Math.min(...suyas.map((x) => difEje(x.rumbo, pose.rumbo)))
          : null;
    const dif = difBajo === null || difSuya === null ? null : Math.max(difBajo, difSuya);
    if (dif !== null && dif <= GIRO_MAX_DEG) continue;
    // Sin calles del mapa no hay contra qué medir (La escena no inventa flechas).
    if (!o.calles.length) continue;
    const nombre = o.nombreDe(v.id);
    const renglon = o.propuestos.filter((t) => t.startsWith(`${nombre}:`));
    if (renglon.some((t) => AVISOS.some((a) => t.includes(a)))) continue;
    // El objeto en la orilla: «… Mazda3 sale de su carril para alcanzarlo».
    if (o.propuestos.some((t) => t.includes(`${nombre} sale de su carril`))) continue;
    if (o.narracion && maniobraNarrada(o.narracion, v, vs)) continue;
    out.push({
      vehiculo: v.id,
      frente: Math.round(pose.rumbo),
      narrada,
      dif: dif === null ? null : Math.round(dif),
    });
  }
  return out;
}
