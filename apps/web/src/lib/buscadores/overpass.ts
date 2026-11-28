/**
 * Overpass para los buscadores, con sus réplicas y un reintento (René, 2026-11-28): con una sola
 * instancia, el km y la referencia decían «Overpass respondió 502» cada vez que estaba saturada. Igual
 * que `/api/osm` y los cruces: las réplicas con relevo (`overpass-relevo`), dos vueltas con una
 * pausa (lo que pide Overpass cuando está saturado), y un tope de tiempo. Una respuesta sin
 * `elements`, o con un `remark` de error o de tiempo agotado, no cuenta como respuesta.
 */
import { overpassConRelevo } from "../../server/overpass-relevo";
import type { RedLugar } from "../buscadores-lugar";

/** s: lo más que se le da a Overpass por consulta, contando el reintento. */
const TOPE_S = 40;

export async function consultarOverpass<T extends { elements?: unknown[] }>(
  consulta: string,
  red: RedLugar,
): Promise<T> {
  // Con relevo entre las réplicas y dos vueltas (René, 2026-11-28): ver `overpass-relevo`.
  const d = await overpassConRelevo<T>(consulta, red.fetch, Date.now() + TOPE_S * 1000, {
    ...(red.pausa ? { pausa: red.pausa } : {}),
  });
  if (!d) throw new Error("Overpass no respondió (se probaron sus réplicas dos veces)");
  return d;
}
