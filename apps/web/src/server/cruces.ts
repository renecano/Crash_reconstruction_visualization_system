/**
 * Los cruces reales de dos calles narradas (René, 2026-11-27; issue #388: «Lerdo de Tejada y Nicolás
 * Bravo», en el centro de Toluca, caía a 1,446 m del cruce real). Nominatim da a lo más 10 tramos de
 * cada calle y en una avenida larga el del cruce no viene; aquí se pregunta a Overpass por los nodos que
 * comparten las dos calles dentro de la caja del municipio: esos son sus cruces, todos. Una avenida de
 * dos cuerpos da dos o cuatro nodos por cruce: se juntan los que quedan a menos de `JUNTAR_M`.
 */
import { OVERPASS_INSTANCES, USER_AGENT } from "./osm";

/** Cuántos cruces se ofrecen al perito como mucho (los más cercanos al centro del municipio). */
export const CRUCES_A_OFRECER = 5;
/** m: los nodos de un mismo cruce (los cuerpos de una avenida) quedan a menos de esto. */
export const JUNTAR_M = 40;
/** El tiempo total que se le da a Overpass (s). */
const ESPERA_TOTAL_S = 30;

const TIPOS = String.raw`(?:avenida|av\.?|calle|c\.|calzada|calz\.?|boulevard|blvd\.?|bulevar|paseo|prolongaci[oó]n|prol\.?|privada|priv\.?|andador|cerrada|circuito|carretera|camino|libramiento)`;

/** Las letras con y sin acento, para el patrón de Overpass. */
const LETRA: Record<string, string> = {
  a: "[aáÁA]",
  e: "[eéÉE]",
  i: "[iíÍI]",
  o: "[oóÓO]",
  u: "[uúüÚÜU]",
  n: "[nñÑN]",
};

/**
 * El patrón de Overpass para el nombre de una calle: sin su tipo («avenida», «calle»), sin artículos al
 * principio, con las vocales con o sin acento; se busca dentro del nombre de OSM («Lerdo de Tejada» en
 * «Avenida Sebastián Lerdo de Tejada»). Null si no queda un nombre de al menos 3 letras.
 */
export function patronDeCalle(nombre: string): string | null {
  const limpio = nombre
    .trim()
    .replace(new RegExp(`^${TIPOS}\\s+`, "i"), "")
    .replace(/^(?:de\s+)?(?:la|el|los|las)\s+/i, "")
    .replace(/["'«»]/g, "")
    .trim();
  if (limpio.replace(/\s/g, "").length < 3) return null;
  return [...limpio.toLowerCase()]
    .map((ch) => {
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (LETRA[base]) return LETRA[base];
      // Sin barras invertidas: dentro de una cadena de Overpass QL la barra se escapa y `\s` no llega.
      if (/\s/.test(ch)) return " +";
      if (/[.*+?^${}()|[\]\\]/.test(ch)) return `[${ch}]`;
      return ch;
    })
    .join("");
}

/**
 * Los nombres con que OSM puede tener una calle narrada: el narrado; lo que va entre paréntesis; y en un
 * eje, sus dos partes («Eje Central Lázaro Cárdenas» es «Avenida Lázaro Cárdenas», con `alt_name` «Eje
 * Central», en OSM; René, 2026-11-27).
 */
export function nombresDeCalle(nombre: string): string[] {
  const entre = /\(([^)]+)\)/.exec(nombre)?.[1]?.trim();
  const base = nombre
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const eje =
    /^(?:el\s+)?(eje\s+(?:central|\d+|[a-záéíóú]+)(?:\s+(?:sur|norte|oriente|poniente|ote\.?|pte\.?))?)\s+(.{3,})$/i.exec(
      base,
    );
  return [
    ...new Set([base, entre, eje?.[1], eje?.[2]].filter((x): x is string => Boolean(x?.trim()))),
  ];
}

/** El patrón de todos los nombres de una calle, o null si ninguno sirve. */
export function patronDeNombres(nombre: string): string | null {
  const ps = nombresDeCalle(nombre)
    .map(patronDeCalle)
    .filter((x): x is string => Boolean(x));
  return ps.length ? ps.join("|") : null;
}

/** Las etiquetas de OSM donde puede estar el nombre de una vía. */
const CLAVES_NOMBRE = "^(name|alt_name|official_name|old_name|short_name|ref)$";

/** La consulta de Overpass: las vías de cada nombre en la caja y los nodos que comparten. */
export function consultaCruces(
  a: string,
  b: string,
  caja: { sur: number; oeste: number; norte: number; este: number },
): string {
  const bb = `${caja.sur},${caja.oeste},${caja.norte},${caja.este}`;
  return [
    `[out:json][timeout:${ESPERA_TOTAL_S}];`,
    `way["highway"][~"${CLAVES_NOMBRE}"~"${a}",i](${bb})->.a;`,
    `way["highway"][~"${CLAVES_NOMBRE}"~"${b}",i](${bb})->.b;`,
    `node(w.a)(w.b);`,
    `out;`,
  ].join("\n");
}

function metros(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 111320);
}

/** Los nodos de un mismo cruce juntos (su centro), del más cercano a `centro` al más lejano. */
export function crucesDeNodos(
  nodos: readonly { lat: number; lon: number }[],
  centro: { lat: number; lon: number } | null,
): { lat: number; lon: number }[] {
  const grupos: { lat: number; lon: number; n: number }[] = [];
  for (const p of nodos) {
    const g = grupos.find((x) => metros(x, p) <= JUNTAR_M);
    if (g) {
      g.lat = (g.lat * g.n + p.lat) / (g.n + 1);
      g.lon = (g.lon * g.n + p.lon) / (g.n + 1);
      g.n += 1;
    } else grupos.push({ lat: p.lat, lon: p.lon, n: 1 });
  }
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
  return grupos
    .map((g) => ({ lat: r6(g.lat), lon: r6(g.lon) }))
    .sort((x, y) => (centro ? metros(x, centro) - metros(y, centro) : 0));
}

/**
 * Los cruces de dos calles dentro de la caja del municipio, o null si Overpass no respondió (entonces
 * se intenta como antes). Una lista vacía quiere decir que las dos calles no se cruzan ahí.
 */
export async function crucesPorNombre(
  calles: readonly [string, string],
  caja: { sur: number; oeste: number; norte: number; este: number },
  centro: { lat: number; lon: number } | null,
  fetcher: typeof fetch,
  /** Cuántos se devuelven (la medición de `eval/cruces_narrados.mts` los pide todos). */
  tope = CRUCES_A_OFRECER,
): Promise<{ lat: number; lon: number }[] | null> {
  const a = patronDeNombres(calles[0]);
  const b = patronDeNombres(calles[1]);
  if (!a || !b) return null;
  const body = new URLSearchParams({ data: consultaCruces(a, b, caja) });
  const fin = Date.now() + ESPERA_TOTAL_S * 1000;
  for (const { url, esperaS } of OVERPASS_INSTANCES) {
    const queda = fin - Date.now();
    if (queda <= 1000) break;
    try {
      const res = await fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
        body,
        signal: AbortSignal.timeout(Math.min(esperaS * 1000, queda)),
      });
      if (!res.ok) continue;
      const d = (await res.json()) as {
        elements?: { type: string; lat?: number; lon?: number }[];
        remark?: string;
      };
      // Sin `elements` no es una respuesta de Overpass (un error, una página): la siguiente instancia.
      if (!Array.isArray(d?.elements)) continue;
      // Tiempo agotado o memoria: Overpass responde `elements: []` con su `remark`; no es «no se cruzan».
      if (d.remark && /error|timed out|out of memory/i.test(d.remark)) continue;
      const nodos = d.elements.flatMap((e) =>
        e.type === "node" && e.lat !== undefined && e.lon !== undefined
          ? [{ lat: e.lat, lon: e.lon }]
          : [],
      );
      return crucesDeNodos(nodos, centro).slice(0, tope);
    } catch {
      // La siguiente instancia.
    }
  }
  return null;
}
