/**
 * Los nombres de calle, para comparar lo que narra el perito con lo que dice OpenStreetMap (René,
 * 2026-11-27: 40 de 99 cruces quedaban en «márcalo tú» porque «Lerdo de Tejada» no se reconocía en
 * «Avenida Sebastián Lerdo de Tejada»).
 *
 * - `normalizarNombreCalle`: la clave de comparación (sin acentos ni mayúsculas, abreviaturas
 *   desarrolladas, sin «Calle»/«Avenida», sin títulos como «Gral.» y con los números escritos en cifra).
 * - `nombresDeVia`: todos los nombres que OSM le da a una vía (`name`, `alt_name`, `old_name`…).
 * - `coincideCalle`: si un nombre narrado es esa vía, cómo coincide, con qué seguridad y la explicación
 *   para el perito.
 */

/** Minúsculas y sin acentos. */
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Abreviaturas comunes en México, desarrolladas (con o sin punto). */
const ABREVIATURAS: [RegExp, string][] = [
  [/\bavda\b\.?/g, "avenida"],
  [/\bav\b\.?/g, "avenida"],
  [/\bblvd?\b\.?/g, "boulevard"],
  [/\bbulevard?\b/g, "boulevard"],
  [/\bcalz\b\.?/g, "calzada"],
  [/\bprol\b\.?/g, "prolongacion"],
  [/\bpriv\b\.?/g, "privada"],
  [/\bcda\b\.?/g, "cerrada"],
  [/\bgral\b\.?/g, "general"],
  [/\blic\b\.?/g, "licenciado"],
  [/\bing\b\.?/g, "ingeniero"],
  [/\bgob\b\.?/g, "gobernador"],
  [/\bdr\b\.?/g, "doctor"],
  [/\bpdte\b\.?/g, "presidente"],
  [/\bsto\b\.?/g, "santo"],
  [/\bsta\b\.?/g, "santa"],
  [/\bc\.(?=\s)/g, "calle"],
];

/** Lo genérico del tipo de vía: «Calle Nicolás Bravo» y «Nicolás Bravo» son la misma. */
const TIPOS_GENERICOS = new Set(["calle", "avenida", "boulevard", "calzada", "paseo"]);
/** Los títulos antes del nombre de una persona: «Gral. Lázaro Cárdenas» es «Lázaro Cárdenas». */
const TITULOS = new Set([
  "general",
  "licenciado",
  "ingeniero",
  "gobernador",
  "doctor",
  "presidente",
  "profesor",
  "profr",
  "coronel",
  "maestro",
]);
const ARTICULOS = new Set(["de", "del", "la", "las", "los", "el"]);
/**
 * Palabras que hacen de un nombre otra vía: «Ciclovía Tollocan» no es Paseo Tollocan ni «Privada
 * Morelos» es Morelos. Si la parte larga trae una que la corta no, no es la misma calle.
 */
const OTRA_VIA = new Set([
  "privada",
  "cerrada",
  "prolongacion",
  "ciclovia",
  "andador",
  "callejon",
  "retorno",
  "lateral",
  "puente",
  "primer",
  "primera",
  "segundo",
  "segunda",
  "tercer",
  "tercera",
]);

/** Los números escritos con letra (las fechas: «Cinco de Mayo», «Dieciséis de Septiembre»). */
const NUMEROS: Record<string, number> = {
  primero: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
};
const MESES =
  "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";

/** Las palabras de la clave de comparación de un nombre de calle. */
function palabras(nombre: string): string[] {
  let t = plano(nombre);
  for (const [re, por] of ABREVIATURAS) t = t.replace(re, por);
  // «1o. de Mayo», «1º de Mayo» y «Primero de Mayo» son «1 de mayo»; «treinta y uno» es 31.
  t = t.replace(/\b(\d{1,2})\s*(?:o|º|°|er)\.?(?=\s+de\b)/g, "$1");
  t = t.replace(/\btreinta y uno\b/g, "31");
  t = t.replace(new RegExp(`\\b([a-z]+)(?=\\s+de\\s+(?:${MESES})\\b)`, "g"), (p) =>
    NUMEROS[p] !== undefined ? String(NUMEROS[p]) : p,
  );
  t = t.replace(/\bsetiembre\b/g, "septiembre");
  const ps = t
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  // Fuera lo genérico del principio («Calle», «Avenida de la», «Av. Gral.»).
  let i = 0;
  while (i < ps.length - 1 && (TIPOS_GENERICOS.has(ps[i]!) || ARTICULOS.has(ps[i]!))) i++;
  return ps.slice(i).filter((p, k, xs) => !(TITULOS.has(p) && k < xs.length - 1));
}

/** La clave para comparar nombres de calle: «Av. Gral. Lázaro Cárdenas» → «lazaro cardenas». */
export function normalizarNombreCalle(nombre: string): string {
  return palabras(nombre).join(" ");
}

/** Las etiquetas de OSM que dan un nombre a la vía, en orden de preferencia. */
export const ETIQUETAS_DE_NOMBRE = [
  "name",
  "official_name",
  "alt_name",
  "short_name",
  "old_name",
  "loc_name",
  "name:es",
] as const;

/** Todos los nombres de una vía de OSM (`alt_name` puede traer varios separados por «;»). */
export function nombresDeVia(
  tags: Readonly<Record<string, string | undefined>>,
): { nombre: string; etiqueta: string }[] {
  const out: { nombre: string; etiqueta: string }[] = [];
  for (const k of ETIQUETAS_DE_NOMBRE)
    for (const n of (tags[k] ?? "").split(";").map((x) => x.trim()))
      if (n && !out.some((o) => o.nombre === n)) out.push({ nombre: n, etiqueta: k });
  return out;
}

export interface CoincidenciaCalle {
  /** El nombre de OSM con que coincidió y su etiqueta (`name`, `alt_name`…). */
  nombre: string;
  etiqueta: string;
  /** «igual»: el mismo nombre; «parte»: uno contiene al otro («Lerdo de Tejada» en «Sebastián…»). */
  como: "igual" | "parte";
  seguridad: "alta" | "media" | "baja";
  /** Para el perito: por qué Croquis dice que es esa calle. */
  explicacion: string;
}

/** ¿`corta` aparece completa y en orden dentro de `larga`? */
function contenida(corta: readonly string[], larga: readonly string[]): boolean {
  for (let i = 0; i + corta.length <= larga.length; i++)
    if (corta.every((p, k) => larga[i + k] === p)) return true;
  return false;
}

/** Si lo que queda en la parte corta alcanza para no confundir calles («de» o «5» solos no). */
function suficiente(ps: readonly string[]): boolean {
  const utiles = ps.filter((p) => !ARTICULOS.has(p));
  return utiles.length >= 2 || utiles.some((p) => p.length >= 5);
}

/**
 * Si el nombre narrado es esta vía de OSM. `null` si no. La seguridad es alta con el mismo nombre en
 * `name`; media con un nombre alterno o si uno contiene al otro; baja si lo que coincide es una sola
 * palabra.
 */
export function coincideCalle(
  narrada: string,
  tags: Readonly<Record<string, string | undefined>>,
): CoincidenciaCalle | null {
  const n = palabras(narrada);
  if (!n.length) return null;
  let mejor: CoincidenciaCalle | null = null;
  const rango = { alta: 3, media: 2, baja: 1 } as const;
  for (const { nombre, etiqueta } of nombresDeVia(tags)) {
    const o = palabras(nombre);
    if (!o.length) continue;
    const alterno = etiqueta !== "name";
    let c: CoincidenciaCalle | null = null;
    if (n.join(" ") === o.join(" ")) {
      c = {
        nombre,
        etiqueta,
        como: "igual",
        seguridad: alterno ? "media" : "alta",
        explicacion: alterno
          ? `«${narrada}» es otro nombre de «${tags.name ?? nombre}» en el mapa (${etiqueta}: «${nombre}»).`
          : `«${narrada}» es «${nombre}» en el mapa.`,
      };
    } else {
      const [corta, larga] = n.length <= o.length ? [n, o] : [o, n];
      const otra = larga.some((p) => OTRA_VIA.has(p) && !corta.includes(p));
      if (!otra && contenida(corta, larga) && suficiente(corta)) {
        const una = corta.filter((p) => !ARTICULOS.has(p)).length === 1;
        c = {
          nombre,
          etiqueta,
          como: "parte",
          seguridad: una ? "baja" : "media",
          explicacion:
            n.length <= o.length
              ? `«${narrada}» es parte del nombre de «${nombre}» en el mapa${alterno ? ` (${etiqueta})` : ""}.`
              : `«${nombre}» (en el mapa${alterno ? `, ${etiqueta}` : ""}) es parte de «${narrada}».`,
        };
      }
    }
    if (c && (!mejor || rango[c.seguridad] > rango[mejor.seguridad])) mejor = c;
  }
  return mejor;
}
