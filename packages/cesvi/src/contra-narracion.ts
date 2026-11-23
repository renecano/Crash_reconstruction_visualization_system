/**
 * Cuando las posiciones dan una velocidad que contradice lo narrado (René, 2026-11-22: el árbol,
 * «a exceso de velocidad» con límite de 50, salía a 39). La velocidad narrada es un supuesto declarado
 * que solo pesa si la evidencia no fija la velocidad; si la fija en otro lado, ninguna de las dos se
 * esconde ni se fuerza: el perito ve las dos cifras, en pantalla y en el dictamen.
 */
import { HOLGURA_FUERA_KMH } from "./mejor-fuera";
import { enCota, type VelocidadNarrada } from "./velocidad-narrada";

interface Estimacion {
  mejor?: number;
  p10?: number;
  p90?: number;
}

const r = (x: number) => Math.round(x);

/** Lo que dice la narración, en km/h: «más de 50 km/h», «al menos 90 km/h», «entre 72 y 88 km/h». */
export function loQueDiceLaNarracion(v: VelocidadNarrada): string {
  if (v.cota) return enCota(v);
  const [a, b] = v.rango_kmh;
  if (v.respecto_al_limite === "arriba") return `más de ${r(a)} km/h`;
  return `entre ${r(a)} y ${r(b)} km/h`;
}

/** La velocidad reconstruida contradice la narrada: todo su p10–p90 queda del otro lado. */
export function contradiceLoNarrado(
  v: VelocidadNarrada,
  e: Estimacion | null | undefined,
): boolean {
  if (!e || e.p10 === undefined || e.p90 === undefined) return false;
  const h = HOLGURA_FUERA_KMH;
  if (v.cota === "minimo") return e.p90 < v.kmh - h;
  if (v.cota === "maximo") return e.p10 > v.kmh + h;
  const [a, b] = v.rango_kmh;
  return e.p90 < a - h || e.p10 > b + h;
}

/** «A: la narración dice más de 50 km/h («…»); las posiciones dan 39 km/h (30–47)…», o null. */
export function limiteContraNarracion(
  vehiculo: string,
  v: VelocidadNarrada | null | undefined,
  e: Estimacion | null | undefined,
): string | null {
  if (!v || v.origen !== "narración" || !e || e.mejor === undefined) return null;
  if (!contradiceLoNarrado(v, e)) return null;
  return (
    `${vehiculo}: la narración dice ${loQueDiceLaNarracion(v)} («${v.descripcion}»); ` +
    `las posiciones dan ${r(e.mejor)} km/h (${r(e.p10!)}–${r(e.p90!)}). ` +
    "No se fuerza ninguna de las dos: revisa las posiciones marcadas y lo que dice la narración."
  );
}
