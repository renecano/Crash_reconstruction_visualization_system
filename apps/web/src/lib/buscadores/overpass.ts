/**
 * Overpass para los buscadores, con sus réplicas y un reintento (René, 2026-11-28): con una sola
 * instancia, el km y la referencia decían «Overpass respondió 502» cada vez que estaba saturada. Igual
 * que `/api/osm` y los cruces: las instancias de `OVERPASS_INSTANCES` en orden, dos vueltas con una
 * pausa (lo que pide Overpass cuando está saturado), y un tope de tiempo. Una respuesta sin
 * `elements`, o con un `remark` de error o de tiempo agotado, no cuenta como respuesta.
 */
import { OVERPASS_INSTANCES, USER_AGENT } from "../../server/osm";
import type { RedLugar } from "../buscadores-lugar";

/** s: lo más que se le da a Overpass por consulta, contando el reintento. */
const TOPE_S = 40;

export async function consultarOverpass<T extends { elements?: unknown[] }>(
  consulta: string,
  red: RedLugar,
): Promise<T> {
  const fin = Date.now() + TOPE_S * 1000;
  const intentos = [...OVERPASS_INSTANCES, ...OVERPASS_INSTANCES];
  let ultimo = "sin respuesta";
  for (let k = 0; k < intentos.length; k++) {
    const { url, esperaS } = intentos[k]!;
    if (k === OVERPASS_INSTANCES.length && fin - Date.now() > 4000)
      await (red.pausa ?? ((ms: number) => new Promise((r) => setTimeout(r, ms))))(2000);
    const queda = fin - Date.now();
    if (queda <= 1000) break;
    try {
      const r = await red.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
        body: new URLSearchParams({ data: consulta }).toString(),
        signal: AbortSignal.timeout(Math.min(esperaS * 1000, queda)),
      });
      if (!r.ok) {
        ultimo = `Overpass respondió ${r.status}`;
        continue;
      }
      const d = (await r.json()) as T & { remark?: string };
      if (!Array.isArray(d?.elements)) continue;
      if (d.remark && /error|timed out|out of memory/i.test(d.remark)) {
        ultimo = "Overpass agotó su tiempo";
        continue;
      }
      return d;
    } catch {
      ultimo = "Overpass no respondió";
    }
  }
  throw new Error(`${ultimo} (se probaron sus réplicas dos veces)`);
}
