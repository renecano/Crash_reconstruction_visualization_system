/**
 * ¿El lugar que encontró el buscador es el de la narración? (René, 2026-11-25: «Croquis nunca pone
 * el choque en un lugar equivocado sin avisar. Si la coincidencia no es clara, pregunta “¿Dónde
 * fue?” con las opciones».) En la revisión de la cadena, 10 de los 205 reportes de CESVI caían en
 * otro lugar: el buscador dio una calle de otro municipio, o solo encontró parte del lugar, y La
 * escena proponía el choque ahí.
 *
 * No es clara si:
 * - el buscador avisa que no lo encontró en el municipio del caso (las opciones son de otros);
 * - la narración nombra calles y ninguna está entre las calles del mapa alrededor del lugar;
 * - la narración no nombra calles y el buscador solo encontró parte del lugar.
 */
import { callesNarradas } from "./escena-facil";

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Las palabras que no distinguen una calle («avenida», «calle», los artículos). */
const GENERICAS = new Set(
  "avenida av avda calle calzada calz paseo boulevard blvd bulevar eje circuito carretera prolongacion prol privada priv andador cerrada callejon del de la las los el y".split(
    " ",
  ),
);

/**
 * Las palabras que distinguen una calle, con sus números: «Avenida 9ª Poniente» → 9, poniente;
 * «calle 2-A» → 2a. Las palabras de una o dos letras no cuentan.
 */
export function palabrasDeCalle(nombre: string): string[] {
  return sinAcentos(nombre)
    .replace(/(\d+)\s*[ªº°]/g, "$1")
    .replace(/(\d+)-([a-z])\b/g, "$1$2")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => (/\d/.test(w) ? w.length > 0 : w.length > 2) && !GENERICAS.has(w));
}

/**
 * ¿La calle del mapa es la narrada? Coinciden dos de sus palabras (o la única que tiene), o todas
 * las del nombre más corto están en el otro («Av. Central Hank González» es «Avenida Central»).
 */
export function esLaCalleNarrada(narrada: string, delMapa: string): boolean {
  const pa = palabrasDeCalle(narrada);
  const pb = palabrasDeCalle(delMapa);
  if (!pa.length || !pb.length) return false;
  const enB = new Set(pb);
  const comunes = pa.filter((w) => enB.has(w)).length;
  return comunes >= Math.min(2, pa.length) || comunes === pb.length;
}

/** ¿Dos palabras largas (7 letras o más) difieren en una sola letra? («matlatzincas», «matlazincas»). */
function casiIgual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 7 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return a.length - i - j <= 1 && b.length - i - j <= 1;
}

/**
 * Como `esLaCalleNarrada`, pero una palabra larga puede diferir en una letra (la ortografía del mapa:
 * «Paseo Matlazincas» en OpenStreetMap, «Paseo de los Matlatzincas» en la narración). Solo para la
 * calle por la que llegaba un vehículo; la búsqueda del lugar sigue con la comparación exacta.
 */
export function esLaCalleNarradaAprox(narrada: string, delMapa: string): boolean {
  if (esLaCalleNarrada(narrada, delMapa)) return true;
  const pa = palabrasDeCalle(narrada);
  const pb = palabrasDeCalle(delMapa);
  if (!pa.length || !pb.length) return false;
  const comunes = pa.filter((w) => pb.some((x) => casiIgual(w, x))).length;
  return comunes >= Math.min(2, pa.length) || comunes === pb.length;
}

/**
 * Una carretera que no coincide por su nombre no hace dudar: en OpenStreetMap la «carretera 57» es
 * «Carretera Querétaro - San Luis Potosí». La busca su propio camino (clave, tramo y kilómetro), y si
 * falta el kilómetro La escena pide mover el punto. Si coincide, sí confirma el lugar.
 */
const CARRETERA = /^(?:carretera|autopista|libramiento|tramo|v[ií]a\s+corta)/i;

/** Las calles que nombran el lugar del caso y la narración, sin repetir. */
export function callesDelCaso(narracion: string | null, descripcionLugar: string | null): string[] {
  const out: string[] = [];
  for (const t of [descripcionLugar, narracion])
    for (const c of t ? callesNarradas(t) : [])
      if (!out.some((x) => palabrasDeCalle(x).join(" ") === palabrasDeCalle(c.nombre).join(" ")))
        out.push(c.nombre);
  // «calzada de 7.3 metros» es una medida, no una calle.
  return out.filter((c) => palabrasDeCalle(c).length > 0 && !/\d[.,]\d/.test(c));
}

/** El buscador no lo encontró en el municipio del caso: las opciones son de otros. */
const OTRO_MUNICIPIO = /No apareci[oó] en .*estas opciones son de/i;
/** El buscador solo encontró parte del lugar. */
const SOLO_PARTE = /No se encontr[oó] el lugar completo/i;

export interface Claridad {
  clara: boolean;
  /** Por qué no es clara, para el perito; null si es clara. */
  motivo: string | null;
}

export function lugarClaro(o: {
  /** Las calles que nombran el lugar y la narración (`callesDelCaso`). */
  narradas: readonly string[];
  /** Las calles del mapa alrededor del lugar encontrado (con su nombre de OpenStreetMap). */
  calles: readonly { nombre?: string | null }[];
  /** El aviso del buscador para el lugar encontrado. */
  aviso: string | null | undefined;
  /** El nombre del lugar encontrado («Eje 3 Oriente y Atanasio Sarabia»): también está ahí. */
  encontrado?: string | null;
}): Claridad {
  if (o.aviso && OTRO_MUNICIPIO.test(o.aviso))
    return { clara: false, motivo: "el buscador no lo encontró en el municipio del caso" };
  if (o.narradas.length) {
    const nombres = [
      ...o.calles.map((c) => c.nombre),
      // «Eje 3 Oriente y Atanasio Sarabia, Colonia …»: cada calle del nombre, sin la colonia.
      ...(o.encontrado?.split(",")[0]?.split(/\s+y\s+/) ?? []),
    ].filter((x): x is string => Boolean(x));
    const cerca = o.narradas.some((n) => nombres.some((m) => esLaCalleNarrada(n, m)));
    if (cerca) return { clara: true, motivo: null };
    const calles = o.narradas.filter((n) => !CARRETERA.test(n));
    if (calles.length) {
      const dichas = calles.slice(0, 2).join(" ni ");
      return {
        clara: false,
        motivo: `ahí no está ${dichas}${calles.length > 2 ? " (ni las otras calles que nombra la narración)" : ""}`,
      };
    }
  }
  if (o.aviso && SOLO_PARTE.test(o.aviso))
    return { clara: false, motivo: "el buscador solo encontró parte del lugar" };
  return { clara: true, motivo: null };
}
