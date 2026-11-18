/**
 * Las condiciones del lugar que narra el perito (René, 2026-11-18): la superficie de rodamiento, su
 * estado, el clima y la luz. Se leen del texto de la narración con el vocabulario de los dictámenes de
 * CESVI («carpeta asfáltica mojada», «se registraba lluvia ligera», «de concreto hidráulico»,
 * «iluminación artificial funcionando»), sin IA, y cada una lleva la frase literal de donde sale.
 *
 * Solo se lee lo que describe la vía: «acotamiento de terracería», «poste de concreto» o «muro de
 * concreto» no son la superficie del arroyo. Si la narración no lo dice, no hay condición: el cálculo
 * usa sus valores por omisión (asfalto seco, despejado) y la luz sale de la hora (`iluminacion.ts`).
 *
 * El estado de la superficie entra a la fricción del cálculo; el clima y la luz, a la vista del 3D y a
 * lo que alcanza a ver un conductor (solo «noche sin alumbrado» acorta la vista, y solo si se dice).
 */
import type { Expediente } from "./corpus";

type Caso = NonNullable<Expediente["caso"]>;
export type Condiciones = NonNullable<Caso["condiciones"]>;
type Clave = keyof Condiciones;

/** Una condición leída: el valor del contrato y la frase literal donde se dice. */
export interface CondicionLeida<V extends string = string> {
  valor: V;
  cita: string;
}

export type CondicionesLeidas = {
  [K in Clave]?: CondicionLeida<NonNullable<Condiciones[K]>["valor"]>;
};

/** Lo que nombra la vía en un dictamen. */
const VIA =
  "(?:carpeta|superficie(?: de rodamiento)?|pavimento|arroyo(?: vehicular)?|calzada|vialidad|v[ií]a|camino|calle|avenida|carretera|cuerpo)";
/** Lo que no es la vía aunque diga «de concreto» o «de terracería». */
const NO_VIA =
  /(?:acotamiento|poste|muro|barda|guarnici[oó]n|banqueta|camell[oó]n|registro|columna|base|bloque|cuneta|tubo|estructura|restos|fragmentos|escombros?|trozos|pedazos|parapeto|pretil|defensa|se[nñ]al|letrero|rampa)(?:\s+\p{L}+){0,2}\s*$/iu;

interface Regla<V extends string> {
  valor: V;
  re: RegExp;
}

const SUPERFICIE: Regla<"asfalto" | "concreto" | "adoquin" | "empedrado" | "terraceria">[] = [
  {
    valor: "asfalto",
    re: /carpeta asf[aá]ltica|concreto asf[aá]ltico|pavimento asf[aá]ltico|mezcla asf[aá]ltica|de asfalto|asfaltad[oa]/i,
  },
  {
    valor: "concreto",
    re: /concreto hidr[aá]ulico|losas? de concreto|pavimento de concreto|de concreto(?! asf[aá]ltico)/i,
  },
  { valor: "adoquin", re: /adoqu[ií]n|adoquinad[oa]/i },
  { valor: "empedrado", re: /empedrad[oa]/i },
  { valor: "terraceria", re: /terracer[ií]a|camino de tierra|brecha/i },
];

// Sin «aceite»: en los dictámenes es la mancha que dejó el choque, no el estado de la carpeta antes.
const ESTADO: Regla<"seco" | "mojado" | "encharcado" | "grava_suelta" | "lodo">[] = [
  { valor: "encharcado", re: /encharcad[oa]s?|charcos?\b|tirante de agua/i },
  { valor: "lodo", re: /\blodo\b|lodos[oa]/i },
  { valor: "grava_suelta", re: /grava suelta|material suelto|gravilla/i },
  { valor: "mojado", re: /mojad[oa]s?|h[uú]med[oa]s?/i },
  { valor: "seco", re: /\bsec[oa]s?\b/i },
];

const CLIMA: Regla<
  "despejado" | "nublado" | "lluvia_ligera" | "lluvia_fuerte" | "niebla" | "granizo"
>[] = [
  { valor: "granizo", re: /graniz/i },
  {
    valor: "lluvia_fuerte",
    re: /lluvia (?:fuerte|intensa|torrencial|abundante)|aguacero|tormenta|llov[ií]a (?:fuerte|intensamente|con intensidad)/i,
  },
  {
    valor: "lluvia_ligera",
    re: /lluvia (?:ligera|leve|moderada)|llovizna|lloviznaba|\blluvia\b|\bllov[ií]a\b/i,
  },
  { valor: "niebla", re: /niebla|neblina|bruma/i },
  { valor: "nublado", re: /nublad[oa]|cielo cubierto/i },
  { valor: "despejado", re: /despejad[oa]|cielo claro|buen tiempo/i },
];

const SIN_ALUMBRADO =
  /sin (?:alumbrado|iluminaci[oó]n)(?: (?:p[uú]blico|artificial))?|carec[ií]a de (?:alumbrado|iluminaci[oó]n)|no (?:hab[ií]a|contaba con|exist[ií]a) (?:alumbrado|iluminaci[oó]n)|alumbrado (?:p[uú]blico )?(?:apagado|sin funcionar|no funcionaba)/i;
const CON_ALUMBRADO =
  /(?:alumbrado|iluminaci[oó]n)(?: (?:p[uú]blico|artificial))? (?:funcionando|encendid[oa]|en funcionamiento)|con (?:alumbrado|iluminaci[oó]n)(?: (?:p[uú]blico|artificial))?|luminarias encendidas/i;

/** Las oraciones de la narración, con su posición, para citar la frase literal. */
function oraciones(texto: string): string[] {
  return texto
    .split(/(?<=[.;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** El fragmento literal (≤ 200 caracteres) alrededor de una coincidencia, sin cortar palabras. */
function fragmento(oracion: string, inicio: number, fin: number): string {
  if (oracion.length <= 200) return oracion.replace(/[.;]$/, "");
  let a = Math.max(0, inicio - 80);
  let b = Math.min(oracion.length, fin + 80);
  while (a > 0 && /\S/.test(oracion[a - 1]!)) a--;
  while (b < oracion.length && /\S/.test(oracion[b]!)) b++;
  return oracion.slice(a, b).trim();
}

/** ¿Habla de la vía? La oración la nombra antes, y lo de justo antes no es otra cosa (un poste). */
function deLaVia(oracion: string, inicio: number): boolean {
  const antes = oracion.slice(0, inicio);
  if (NO_VIA.test(antes.replace(/\s+de\s*$/i, "").replace(/\s+$/, ""))) return false;
  return new RegExp(VIA, "i").test(antes);
}

/** «sin lluvia», «no llovía»: una negación justo antes. */
const negado = (oracion: string, inicio: number) =>
  /(?<!\p{L})(?:sin|no|ni)\s+(?:\p{L}+\s+)?$/iu.test(
    oracion.slice(Math.max(0, inicio - 25), inicio),
  );

function primera<V extends string>(
  texto: string,
  reglas: readonly Regla<V>[],
  filtro: (oracion: string, inicio: number, regla: Regla<V>) => boolean = () => true,
): CondicionLeida<V> | undefined {
  for (const o of oraciones(texto)) {
    let mejor: { r: Regla<V>; i: number; f: number } | null = null;
    for (const r of reglas) {
      const g = new RegExp(r.re.source, r.re.flags.includes("g") ? r.re.flags : r.re.flags + "g");
      let m: RegExpExecArray | null;
      while ((m = g.exec(o))) {
        if (!filtro(o, m.index, r)) continue;
        if (!mejor || m.index < mejor.i) mejor = { r, i: m.index, f: m.index + m[0].length };
        break;
      }
    }
    if (mejor) return { valor: mejor.r.valor, cita: fragmento(o, mejor.i, mejor.f) };
  }
  return undefined;
}

/** Las condiciones del lugar que dice la narración. Lo que no dice, no aparece. */
export function condicionesDeTexto(texto: string | null | undefined): CondicionesLeidas {
  if (!texto) return {};
  const out: CondicionesLeidas = {};
  const superficie = primera(texto, SUPERFICIE, (o, i) => deLaVia(o, i));
  if (superficie) out.superficie = superficie;
  // El estado: «mojada», «seca»… dicho de la vía («la carpeta se encontraba mojada»), no de otra cosa.
  const estado = primera(texto, ESTADO, (o, i) => {
    const antes = o.slice(Math.max(0, i - 60), i);
    return new RegExp(VIA, "i").test(antes) && !/(llanta|neum[aá]tic|ropa|conductor)/i.test(antes);
  });
  if (estado) out.estado_superficie = estado;
  const clima = primera(
    texto,
    CLIMA,
    (o, i) =>
      !negado(o, i) && !/(?:faro|luz|luces|l[aá]mpara|anti)/i.test(o.slice(Math.max(0, i - 22), i)),
  );
  if (clima) out.clima = clima;
  const sin = primera(texto, [{ valor: "noche_sin_alumbrado" as const, re: SIN_ALUMBRADO }]);
  const con = primera(texto, [{ valor: "noche_con_alumbrado" as const, re: CON_ALUMBRADO }]);
  if (sin) out.iluminacion = sin;
  else if (con) out.iluminacion = con;
  return out;
}

type FuenteCondicion = NonNullable<Condiciones["clima"]>["fuente"];

/**
 * Las condiciones para el expediente, con su fuente: «perito» si las dice su narración,
 * «dictamen_importado» si salen del dictamen. La luz «con alumbrado» solo dice que había alumbrado;
 * de día no cambia nada (la hora manda, `iluminacion.ts`).
 */
export function condicionesParaExpediente(
  texto: string | null | undefined,
  fuente: FuenteCondicion = "perito",
): Condiciones | undefined {
  const leidas = condicionesDeTexto(texto);
  const claves = Object.keys(leidas) as Clave[];
  if (!claves.length) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of claves) {
    const c = leidas[k]!;
    out[k] = { valor: c.valor, fuente, cita: { texto: c.cita } };
  }
  return out;
}
