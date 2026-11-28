/**
 * Los cruces reales de dos calles narradas (René, 2026-11-27; issue #388: «Lerdo de Tejada y Nicolás
 * Bravo», en el centro de Toluca, caía a 1,446 m del cruce real). Nominatim da a lo más 10 tramos de
 * cada calle y en una avenida larga el del cruce no viene; aquí se pregunta a Overpass por los nodos que
 * comparten las dos calles dentro de la caja del municipio: esos son sus cruces, todos. Una avenida de
 * dos cuerpos da dos o cuatro nodos por cruce: se juntan los que quedan a menos de `JUNTAR_M`.
 */
import { overpassConRelevo } from "./overpass-relevo";

/** Cuántos cruces se ofrecen al perito como mucho (los más cercanos al centro del municipio). */
export const CRUCES_A_OFRECER = 5;
/** m: los nodos de un mismo cruce (los cuerpos de una avenida) quedan a menos de esto. */
export const JUNTAR_M = 40;
/**
 * El tiempo total para las dos consultas de un cruce (s), con sus réplicas y su reintento: un solo tope,
 * dentro de los 60 s de la función. «El mapa no respondió» detiene la búsqueda (René, 2026-11-28), así
 * que el cruce puede usar casi todo el tiempo.
 */
const ESPERA_TOTAL_S = 45;
/** Lo que se le pide a Overpass por consulta (su `[timeout:]`, en el servidor de Overpass). */
const TIMEOUT_CONSULTA_S = 30;

const TIPOS = String.raw`(?:avenida|avda\.?|av\.?|calle|c\.|calzada|calz\.?|boulevard|blvd\.?|bulevar|paseo|prolongaci[oó]n|prol\.?|privada|priv\.?|andador|cerrada|cda\.?|circuito|carretera|camino|libramiento|glorieta|callej[oó]n|retorno)`;

/** Las letras con y sin acento, para el patrón de Overpass. */
const LETRA: Record<string, string> = {
  a: "[aáÁA]",
  e: "[eéÉE]",
  i: "[iíÍI]",
  o: "[oóÓO]",
  u: "[uúüÚÜU]",
  n: "[nñÑN]",
};

/** Títulos y abreviaturas que OSM puede tener escritos completos, abreviados o sin ellos. */
const TITULOS: [RegExp, string][] = [
  [/^(?:gral\.?|general)$/, "(?:gral[.]?|general)"],
  [/^(?:lic\.?|licenciado|licenciada)$/, "(?:lic[.]?|licenciad[oa])"],
  [/^(?:ing\.?|ingeniero)$/, "(?:ing[.]?|ingeniero)"],
  [/^(?:gob\.?|gobernador)$/, "(?:gob[.]?|gobernador)"],
  [/^(?:dr\.?|doctor|dra\.?|doctora)$/, "(?:dra?[.]?|doctora?)"],
  [/^(?:pdte\.?|presidente|pres\.?)$/, "(?:pdte[.]?|pres[.]?|presidente)"],
  [/^(?:prof\.?|profr\.?|profra\.?|profesor|profesora)$/, "(?:prof(?:r|ra)?[.]?|profesora?)"],
  [/^(?:mtro\.?|maestro|mtra\.?|maestra)$/, "(?:mtr[oa][.]?|maestr[oa])"],
  [/^(?:cap\.?|capit[aá]n)$/, "(?:cap[.]?|capit[aáÁA]n)"],
  [/^(?:cnel\.?|coronel)$/, "(?:cnel[.]?|coronel)"],
  [/^(?:tte\.?|teniente)$/, "(?:tte[.]?|teniente)"],
  [/^(?:fray|fr\.?)$/, "(?:fray|fr[.]?)"],
];
/** Lo que no es un título pero se abrevia: va con sus dos formas, no es opcional. */
const ABREVIADAS: [RegExp, string][] = [
  [/^(?:sta\.?|santa)$/, "(?:sta[.]?|santa)"],
  [/^(?:sto\.?|santo)$/, "(?:sto[.]?|santo)"],
  [/^(?:sn\.?|san)$/, "(?:sn[.]?|san)"],
  [/^(?:ote\.?|oriente)$/, "(?:ote[.]?|oriente)"],
  [/^(?:pte\.?|poniente)$/, "(?:pte[.]?|poniente)"],
  [/^(?:nte\.?|norte)$/, "(?:nte[.]?|norte)"],
];
/** Los números que se escriben de las dos formas en los nombres de calles («5 de Mayo», «Cinco de Mayo»). */
const NUMEROS = [
  "cero",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiuno",
  "veintidós",
  "veintitrés",
  "veinticuatro",
  "veinticinco",
  "veintiséis",
  "veintisiete",
  "veintiocho",
  "veintinueve",
  "treinta",
  "treinta y uno",
];
const ARTICULOS = /^(?:de|del|la|las|los|el|y)$/;

const sinAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Una palabra como patrón de Overpass: las vocales con o sin acento, los signos entre corchetes. */
function letras(t: string): string {
  return [...t]
    .map((ch) => {
      const base = sinAcento(ch);
      if (LETRA[base]) return LETRA[base];
      if (/[.*+?^${}()|[\]\\]/.test(ch)) return `[${ch}]`;
      return ch;
    })
    .join("");
}

/** Una palabra del nombre: sus formas (título, abreviatura, número en letra o en cifra) y si puede faltar. */
function palabra(t: string): { re: string; opcional: boolean } {
  const s = sinAcento(t.toLowerCase());
  for (const [r, re] of TITULOS) if (r.test(s)) return { re, opcional: true };
  for (const [r, re] of ABREVIADAS) if (r.test(s)) return { re, opcional: false };
  if (ARTICULOS.test(s)) return { re: letras(s), opcional: true };
  const n = /^\d{1,2}$/.test(s) ? Number(s) : NUMEROS.findIndex((x) => sinAcento(x) === s);
  if (n >= 0 && n < NUMEROS.length && (/^\d/.test(s) || n > 0))
    return { re: `(?:${n}|${letras(NUMEROS[n]!)})`, opcional: false };
  return { re: letras(s), opcional: false };
}

/**
 * El patrón de Overpass para el nombre de una calle (René, 2026-11-27: los nombres que no empataban
 * daban «márcalo tú»). Sin su tipo («Avenida», «Av.», «Calle», «Calz.», «Blvd.», «Prol.»…); los
 * títulos («Gral.», «Lic.», «Ing.», «Gob.», «Dr.», «Pdte.»…) con sus dos formas o sin ellos; los
 * artículos de en medio pueden faltar («Glorieta de las Cibeles» es «Glorieta de Cibeles»); los
 * números, en cifra o en letra («5 de Mayo», «Cinco de Mayo»); las vocales con o sin acento, sin
 * importar mayúsculas (la consulta va con `,i`). Se busca dentro del nombre de OSM («Lerdo de Tejada»
 * en «Avenida Sebastián Lerdo de Tejada»). Un nombre que es solo un número o una letra («Calle 5»,
 * «Avenida 9», «Calle C») se busca completo, para no empatar con «5 de Mayo». Null si no queda nombre.
 */
export function patronDeCalle(nombre: string): string | null {
  const limpio = nombre
    .trim()
    .replace(/["'«»]/g, "")
    .replace(new RegExp(`^${TIPOS}\\s+`, "i"), "")
    .replace(/^(?:de\s+)?(?:la|el|los|las)\s+/i, "")
    .trim();
  const tokens = limpio.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  // Solo un número o una letra (con su sufijo: «2-A», «608»): el nombre completo, con o sin su tipo.
  if (/^(?:\d+(?:-?[a-z])?|[a-z]|cero)$/i.test(limpio)) {
    return posix(`^(?:${TIPOS} +)?${palabra(limpio).re}$`);
  }
  if (limpio.replace(/\s/g, "").length < 3) return null;
  const partes = tokens.map(palabra);
  // Las partes que pueden faltar llevan su espacio dentro; las demás, un espacio entre ellas.
  let re = "";
  partes.forEach((p, k) => {
    const ultima = k === partes.length - 1;
    if (p.opcional && !ultima) re += `(?:${p.re} +)?`;
    else re += p.re + (ultima ? "" : " +");
  });
  // Al menos una parte que no puede faltar: si todo es opcional, no hay nombre.
  return partes.some((p) => !p.opcional) ? posix(re) : null;
}

/**
 * Para el motor de Overpass (expresiones POSIX extendidas, dentro de una cadena de Overpass QL): sin
 * `(?:` (grupos simples) y sin barras invertidas (`\.` es `[.]`).
 */
function posix(re: string): string {
  return re.replace(/\(\?:/g, "(").replace(/\\\./g, "[.]");
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
    `[out:json][timeout:${TIMEOUT_CONSULTA_S}];`,
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

/** La consulta de Overpass: las vías de cada nombre en la caja, con su geometría y sus nombres. */
export function consultaGeometria(
  a: string,
  b: string,
  caja: { sur: number; oeste: number; norte: number; este: number },
): string {
  const bb = `${caja.sur},${caja.oeste},${caja.norte},${caja.este}`;
  return [
    `[out:json][timeout:${TIMEOUT_CONSULTA_S}];`,
    `way["highway"][~"${CLAVES_NOMBRE}"~"${a}",i](${bb})->.a;`,
    `way["highway"][~"${CLAVES_NOMBRE}"~"${b}",i](${bb})->.b;`,
    `(.a; .b;);`,
    `out tags geom;`,
  ].join("\n");
}

/** m: dos vías con nombre que pasan a menos de esto sin compartir nodo se cruzan (desnivel, ramales). */
export const CERCANIA_M = 20;

interface ViaGeom {
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

/** Si alguna etiqueta de nombre de la vía empata con el patrón. */
function empata(v: ViaGeom, patron: RegExp): boolean {
  const t = v.tags ?? {};
  return ["name", "alt_name", "official_name", "old_name", "short_name", "ref"].some(
    (k) => t[k] !== undefined && patron.test(t[k]!),
  );
}

/** El punto más cercano entre dos tramos (en metros, en un plano local) y su distancia. */
function cercaniaTramos(
  p: [number, number],
  q: [number, number],
  r: [number, number],
  s: [number, number],
): { m: number; x: number; y: number } {
  const d1 = [q[0] - p[0], q[1] - p[1]];
  const d2 = [s[0] - r[0], s[1] - r[1]];
  const den = d1[0]! * d2[1]! - d1[1]! * d2[0]!;
  if (Math.abs(den) > 1e-9) {
    const t = ((r[0] - p[0]) * d2[1]! - (r[1] - p[1]) * d2[0]!) / den;
    const u = ((r[0] - p[0]) * d1[1]! - (r[1] - p[1]) * d1[0]!) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1)
      return { m: 0, x: p[0] + t * d1[0]!, y: p[1] + t * d1[1]! };
  }
  const aPunto = (o: [number, number], a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((o[0] - a[0]) * dx + (o[1] - a[1]) * dy) / l2)) : 0;
    const x = a[0] + t * dx;
    const y = a[1] + t * dy;
    return { m: Math.hypot(o[0] - x, o[1] - y), x: (x + o[0]) / 2, y: (y + o[1]) / 2 };
  };
  return [aPunto(p, r, s), aPunto(q, r, s), aPunto(r, p, q), aPunto(s, p, q)].reduce((x, y) =>
    y.m < x.m ? y : x,
  );
}

/**
 * Donde pasan a menos de `CERCANIA_M` las vías de una calle y las de la otra, sin compartir nodo (René,
 * 2026-11-27): en los cruces grandes las vías con nombre se unen por ramales sin nombre, o una pasa
 * sobre la otra (Universidad y Miguel Ángel de Quevedo, Viaducto y Universidad).
 */
export function crucesPorCercania(
  vias: readonly ViaGeom[],
  a: string,
  b: string,
): { lat: number; lon: number }[] {
  const ra = new RegExp(a, "i");
  const rb = new RegExp(b, "i");
  const de = (r: RegExp, otra: RegExp) => vias.filter((v) => empata(v, r) && !empata(v, otra));
  const va = de(ra, rb);
  const vb = de(rb, ra);
  const todos = [...va, ...vb].flatMap((v) => v.geometry ?? []);
  if (!va.length || !vb.length || !todos.length) return [];
  const lat0 = todos[0]!.lat;
  const lon0 = todos[0]!.lon;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const xy = (g: { lat: number; lon: number }): [number, number] => [
    (g.lon - lon0) * kx,
    (g.lat - lat0) * 111320,
  ];
  const puntos: { lat: number; lon: number }[] = [];
  for (const x of va)
    for (const y of vb) {
      const gx = (x.geometry ?? []).map(xy);
      const gy = (y.geometry ?? []).map(xy);
      let mejor: { m: number; x: number; y: number } | null = null;
      for (let i = 1; i < gx.length; i++)
        for (let j = 1; j < gy.length; j++) {
          const c = cercaniaTramos(gx[i - 1]!, gx[i]!, gy[j - 1]!, gy[j]!);
          if (!mejor || c.m < mejor.m) mejor = c;
        }
      if (mejor && mejor.m <= CERCANIA_M)
        puntos.push({ lat: lat0 + mejor.y / 111320, lon: lon0 + mejor.x / kx });
    }
  return puntos;
}

/** Una consulta a Overpass por sus instancias: los elementos, o null si ninguna respondió bien. */
async function pedirOverpass(
  consulta: string,
  fetcher: typeof fetch,
  fin: number,
): Promise<
  | {
      type: string;
      lat?: number;
      lon?: number;
      tags?: Record<string, string>;
      geometry?: { lat: number; lon: number }[];
    }[]
  | null
> {
  // Con relevo entre las réplicas y dos vueltas (René, 2026-11-28): ver `overpass-relevo`.
  const d = await overpassConRelevo<{
    elements: {
      type: string;
      lat?: number;
      lon?: number;
      tags?: Record<string, string>;
      geometry?: { lat: number; lon: number }[];
    }[];
  }>(consulta, fetcher, fin);
  return d?.elements ?? null;
}

/**
 * Los cruces de dos calles dentro de la caja del municipio, o null si Overpass no respondió (entonces
 * se intenta como antes). Una lista vacía quiere decir que las dos calles no se cruzan ahí: ni
 * comparten nodo ni pasan a menos de `CERCANIA_M`.
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
  const fin = Date.now() + ESPERA_TOTAL_S * 1000;
  const elementos = await pedirOverpass(consultaCruces(a, b, caja), fetcher, fin);
  if (!elementos) return null;
  const nodos = elementos.flatMap((e) =>
    e.type === "node" && e.lat !== undefined && e.lon !== undefined
      ? [{ lat: e.lat, lon: e.lon }]
      : [],
  );
  if (nodos.length) return crucesDeNodos(nodos, centro).slice(0, tope);
  // Sin nodo común: donde las vías pasan a menos de 20 m, con lo que queda del mismo tope.
  const vias = await pedirOverpass(consultaGeometria(a, b, caja), fetcher, fin);
  if (!vias) return null;
  return crucesDeNodos(crucesPorCercania(vias, a, b), centro).slice(0, tope);
}
