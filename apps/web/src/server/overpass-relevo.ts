/**
 * Overpass con relevo (René, 2026-11-28: el mismo caso daba una vez la esquina y otra «el mapa no
 * respondió», según qué réplica estaba lenta). Antes se probaban las réplicas una tras otra y una que
 * no contestaba retenía la búsqueda 15 s (overpass-api.de, hasta 45 s) antes de pasar a la siguiente.
 *
 * Ahora la siguiente réplica arranca en cuanto la anterior falla o, si sigue sin contestar, a los
 * `RELEVO_MS`; gana la primera respuesta válida y las demás se cancelan. Si ninguna responde, una
 * segunda vuelta tras una pausa (lo que pide Overpass cuando está saturado), dentro del mismo tope.
 * Con réplicas sanas sale una sola consulta, como antes.
 */
import { OVERPASS_INSTANCES, USER_AGENT } from "./osm";

/** ms: cuánto se espera a una réplica que no contesta antes de pedirle también a la siguiente. */
export const RELEVO_MS = 6000;
/** ms: la pausa entre la primera vuelta y la segunda. */
const PAUSA_MS = 2000;

/** Lo que hace válida una respuesta: trae `elements` y no es un error ni un tiempo agotado. */
export function respuestaValida(d: unknown): boolean {
  const x = d as { elements?: unknown; remark?: string } | null;
  if (!x || !Array.isArray(x.elements)) return false;
  return !(x.remark && /error|timed out|out of memory/i.test(x.remark));
}

type Instancia = { url: string; esperaS: number };

/** Una vuelta por las réplicas, con relevo: la primera respuesta válida, o null. */
function unaVuelta<T>(
  consulta: string,
  fetcher: typeof fetch,
  fin: number,
  instancias: readonly Instancia[],
  relevoMs: number,
): Promise<T | null> {
  const body = new URLSearchParams({ data: consulta }).toString();
  return new Promise((resolver) => {
    let lanzadas = 0;
    let pendientes = 0;
    let hecho = false;
    let relevo: ReturnType<typeof setTimeout> | null = null;
    const controles: AbortController[] = [];
    const terminar = (d: T | null) => {
      if (hecho) return;
      hecho = true;
      if (relevo) clearTimeout(relevo);
      for (const c of controles) c.abort();
      resolver(d);
    };
    const lanzar = () => {
      if (hecho) return;
      if (relevo) {
        clearTimeout(relevo);
        relevo = null;
      }
      const queda = fin - Date.now();
      if (lanzadas >= instancias.length || queda <= 1000) {
        if (pendientes === 0) terminar(null);
        return;
      }
      const { url, esperaS } = instancias[lanzadas++]!;
      const control = new AbortController();
      controles.push(control);
      const tope = setTimeout(() => control.abort(), Math.min(esperaS * 1000, queda));
      pendientes++;
      fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
        body,
        signal: control.signal,
      })
        .then(async (r) => (r.ok ? ((await r.json()) as unknown) : null))
        .catch(() => null)
        .then((d) => {
          clearTimeout(tope);
          pendientes--;
          if (hecho) return;
          if (respuestaValida(d)) terminar(d as T);
          // Falló: la siguiente ya (o, si no quedan, la vuelta termina cuando acaben las demás).
          else lanzar();
        });
      if (lanzadas < instancias.length) relevo = setTimeout(lanzar, relevoMs);
    };
    lanzar();
  });
}

/**
 * La consulta por las réplicas de `OVERPASS_INSTANCES`, con relevo y dos vueltas, hasta `fin` (ms de
 * reloj). La respuesta válida, o null si el mapa no respondió.
 */
export async function overpassConRelevo<T>(
  consulta: string,
  fetcher: typeof fetch,
  fin: number,
  o: {
    pausa?: (ms: number) => Promise<void>;
    instancias?: readonly Instancia[];
    relevoMs?: number;
  } = {},
): Promise<T | null> {
  const instancias = o.instancias ?? OVERPASS_INSTANCES;
  const relevoMs = o.relevoMs ?? RELEVO_MS;
  const pausa = o.pausa ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const primera = await unaVuelta<T>(consulta, fetcher, fin, instancias, relevoMs);
  if (primera) return primera;
  if (fin - Date.now() <= PAUSA_MS + 2000) return null;
  await pausa(PAUSA_MS);
  return unaVuelta<T>(consulta, fetcher, fin, instancias, relevoMs);
}
