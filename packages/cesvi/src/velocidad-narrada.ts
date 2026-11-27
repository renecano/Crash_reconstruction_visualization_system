/**
 * La velocidad que dice o describe la narración del perito (ronda 4; René, 2026-11-18: «lo que dice
 * la narración no llega a la física»). Determinista y con su cita: no llama al modelo ni gasta API.
 *
 * - **Una cifra** («a 80 km/h», «como a 60 kilómetros por hora», «entre 60 y 70 km/h») va con su
 *   rango, de un ±10 % en la cifra dicha a un ±15 % en la aproximada.
 * - **Una cota** («a más de 90 km/h», «a menos de 40 km/h»): la cifra es el mínimo o el máximo, no un
 *   valor (René, 2026-11-20). El perito ve «al menos 90 km/h» y el solver solo la hace cumplir.
 * - **Una descripción** («a exceso de velocidad», «a alta velocidad», «muy rápido», «despacio», «a
 *   vuelta de rueda») va relativa al límite de la vía: el de su `maxspeed` o su tipo en el mapa
 *   (`conLimiteDeLaVia`) y, mientras no se ubica, el que da el texto del lugar («autopista»,
 *   «carretera», «avenida», «calle»; `limiteDelLugarNarrado`). Sin nada de eso, el de una avenida
 *   primaria. «Exceso» nunca queda por debajo del límite: su rango empieza en él.
 * - **Un límite del lugar** («velocidad máxima de 50 km/h», «restrictivo de 40 km/h») no es la
 *   velocidad del hecho, y tampoco lo es «el carril de baja velocidad».
 *
 * Todo entra a la reconstrucción como **supuesto declarado con su rango**: solo pesa si la evidencia
 * no fija la velocidad, y el resultado lo dice (`fijada_por: "declarada"`).
 *
 * Los límites por tipo de vía salen de la Ley General de Movilidad y Seguridad Vial, art. 49
 * fr. III (DOF 17-05-2022, última reforma DOF 29-12-2023; texto verificado el 2026-11-20 en
 * diputados.gob.mx; `data/SOURCES.md`). El rango alrededor de
 * un límite es un supuesto de Croquis, dicho en su descripción: un límite es un máximo legal, no
 * una medición.
 */
import type { Expediente } from "./corpus";

type Id = string;
export type VelocidadNarrada = NonNullable<Expediente["vehiculos"][number]["velocidad_narrada"]>;

/** LGMSV, art. 49 fr. III: el límite de una vía según su tipo de OpenStreetMap (`highway`). */
export const LIMITES_LGMSV: readonly { tipos: readonly string[]; kmh: number; inciso: string }[] = [
  {
    tipos: ["motorway", "motorway_link"],
    kmh: 80,
    inciso: "e) carriles centrales de acceso controlado",
  },
  {
    tipos: ["trunk", "trunk_link", "primary", "primary_link"],
    kmh: 50,
    inciso: "d) avenidas primarias sin acceso controlado",
  },
  {
    tipos: [
      "secondary",
      "secondary_link",
      "tertiary",
      "tertiary_link",
      "residential",
      "unclassified",
      "living_street",
      "service",
    ],
    kmh: 30,
    inciso: "c) calles secundarias y terciarias",
  },
];

/**
 * El límite por lo que dice el texto del lugar (LGMSV, art. 49 fr. III), mientras la vía no se ubica
 * en el mapa. El orden importa: «carretera federal» antes que «carretera», «autopista» antes que
 * «avenida». null si el texto no nombra un tipo de vía.
 */
const LUGAR_LGMSV: readonly { rx: RegExp; kmh: number; inciso: string }[] = [
  {
    rx: /\b(?:carretera|autopista)s?\s+federal/iu,
    kmh: 110,
    inciso: "g) carreteras y autopistas de jurisdicción federal (automóviles)",
  },
  {
    rx: /\b(?:autopista|circuito\s+exterior|perif[eé]rico|viaducto|libramiento|v[ií]a\s+r[aá]pida|acceso\s+controlado)/iu,
    kmh: 80,
    inciso: "e) carriles centrales de avenidas de acceso controlado",
  },
  {
    rx: /\bcarretera/iu,
    kmh: 80,
    inciso: "f) carreteras estatales fuera de zonas urbanas",
  },
  {
    rx: /\b(?:avenida|av\.|calzada|paseo|boulevard|bulevar|blvd\.?|eje\s+vial|circuito|prolongaci[oó]n)/iu,
    kmh: 50,
    inciso: "d) avenidas primarias sin acceso controlado",
  },
  {
    rx: /\b(?:calle|privada|cerrada|andador|callej[oó]n)/iu,
    kmh: 30,
    inciso: "c) calles secundarias y calles terciarias",
  },
];

/** El límite que da el texto del lugar («la autopista…», «la carretera…»), o null. */
export function limiteDelLugarNarrado(
  texto: string | null | undefined,
): { kmh: number; fuente: string } | null {
  if (!texto) return null;
  for (const f of LUGAR_LGMSV) {
    const m = texto.match(f.rx);
    if (m)
      return {
        kmh: f.kmh,
        fuente: `LGMSV, art. 49 fr. III ${f.inciso}; por «${m[0].trim()}» en el lugar narrado, mientras la vía no se ubica en el mapa`,
      };
  }
  return null;
}

/** El límite para las descripciones de un expediente: el del texto de su lugar o el de omisión. */
export function limiteDelExpediente(
  e: Expediente,
  narracion?: string,
): { kmh: number; fuente: string } {
  return (
    limiteDelLugarNarrado(e.caso?.lugar?.descripcion?.valor) ??
    limiteDelLugarNarrado(narracion) ??
    LIMITE_SIN_VIA
  );
}

/** El límite de una avenida primaria (LGMSV, art. 49 fr. III d): mientras no se conoce la vía. */
export const LIMITE_SIN_VIA = {
  kmh: 50,
  fuente: "LGMSV, art. 49 fr. III d) (avenida primaria; la vía aún no se conoce)",
};

/** El límite de la vía: su `maxspeed` de OpenStreetMap o, si no lo tiene, el de su tipo (LGMSV). */
export function limiteDeLaVia(
  tipo: string | undefined,
  maxspeed?: string | number | null,
): { kmh: number; fuente: string } | null {
  const m =
    typeof maxspeed === "number"
      ? maxspeed
      : Number(String(maxspeed ?? "").match(/^\s*(\d{1,3})\s*(?:km\/h)?\s*$/)?.[1]);
  if (Number.isFinite(m) && m >= 5 && m <= 200)
    return { kmh: m, fuente: "maxspeed de OpenStreetMap" };
  const fila = LIMITES_LGMSV.find((f) => f.tipos.includes(tipo ?? ""));
  return fila ? { kmh: fila.kmh, fuente: `LGMSV, art. 49 fr. III ${fila.inciso}` } : null;
}

/** El valor y el rango de una velocidad relativa al límite (supuestos de Croquis, ronda 4). */
export function respectoAlLimite(
  r: NonNullable<VelocidadNarrada["respecto_al_limite"]>,
  limite: number,
): { kmh: number; rango_kmh: [number, number] } {
  const red = (x: number) => Math.round(x);
  if (r === "arriba")
    return { kmh: red(limite * 1.3), rango_kmh: [red(limite), red(limite * 1.6)] };
  if (r === "abajo") return { kmh: red(limite * 0.4), rango_kmh: [5, red(limite * 0.7)] };
  return { kmh: red(limite * 0.9), rango_kmh: [red(limite * 0.6), red(limite * 1.2)] };
}

/** Una palabra completa: `\b` de JS no ve las letras con acento. */
const palabra = (cuerpo: string, banderas = "giu") =>
  new RegExp(`(?<![\\p{L}\\d])(?:${cuerpo})(?![\\p{L}\\d])`, banderas);

const UNIDAD = String.raw`(?:km\s*/\s*h(?:r|rs)?|kph|k\.?p\.?h\.?|kil[oó]metros\s+(?:por|x)\s+hora|km\s+por\s+hora)`;
const NUM = String.raw`(\d{1,3}(?:[.,]\d+)?)`;
/** Lo que va antes de una cifra que la vuelve un límite del lugar, no la velocidad del hecho. */
const LIMITE =
  /(?:m[aá]xim|l[ií]mit|restrictiv|señal|permitid|reductor|SR\s*-?\s*\d|SP\s*-?\s*\d)\S*\s*(?:\S+\s+){0,3}$/iu;
const APROX =
  /(?:como|aproximadamente|aprox\.?|unos|cerca de|alrededor de|m[aá]s o menos)\s+(?:a\s+)?(?:unos\s+)?$/iu;

const DESCRIPCIONES: readonly {
  rx: RegExp;
  r: "arriba" | "abajo";
  texto: string;
  fijo?: [number, number, number];
}[] = [
  {
    rx: palabra(
      String.raw`(?:a\s+)?(?:exceso\s+de\s+velocidad|velocidad\s+(?:excesiva|inmoderada)|excesiva\s+velocidad)`,
    ),
    r: "arriba",
    texto: "a exceso de velocidad",
  },
  {
    rx: palabra(String.raw`(?:a\s+)?(?:alta|gran|toda|mucha)\s+velocidad`),
    r: "arriba",
    texto: "a alta velocidad",
  },
  { rx: palabra(String.raw`(?:muy\s+)?r[aá]pid(?:o|a|amente)`), r: "arriba", texto: "rápido" },
  {
    rx: palabra(String.raw`(?:a\s+)?vuelta\s+de\s+rueda`),
    r: "abajo",
    texto: "a vuelta de rueda",
    fijo: [8, 3, 15],
  },
  {
    rx: palabra(String.raw`(?:muy\s+)?despacio|lentamente|(?:a\s+)?(?:baja|poca)\s+velocidad`),
    r: "abajo",
    texto: "despacio",
  },
];

/** Las menciones de cada vehículo en el texto («vehículo A», «unidad B», «V1»), por posición. */
function menciones(texto: string, ids: readonly Id[]): { i: number; id: Id }[] {
  const out: { i: number; id: Id }[] = [];
  const rx = palabra(
    String.raw`(?:veh[ií]culo|unidad|auto(?:m[oó]vil)?|cami[oó]n|motocicleta|carro)\s+(?:marcado\s+(?:como|con\s+la\s+letra)\s+)?(?:«|")?([A-H])(?:»|")?|V([1-8])`,
    "gu",
  );
  for (const m of texto.matchAll(rx)) {
    const id = m[1] ? `V${m[1].toUpperCase().charCodeAt(0) - 64}` : `V${m[2]}`;
    if (ids.includes(id)) out.push({ i: m.index, id });
  }
  return out;
}

/** La oración que contiene la posición `i` (para la cita y para buscar de quién se habla). */
function oracion(texto: string, i: number): { ini: number; fin: number } {
  const antes = texto.slice(0, i);
  const ini =
    Math.max(antes.lastIndexOf(". "), antes.lastIndexOf(".\n"), antes.lastIndexOf("\n")) + 1;
  const resto = texto.slice(i).search(/\.(?:\s|$)|\n/);
  return { ini, fin: resto < 0 ? texto.length : i + resto };
}

/** De qué vehículo habla la frase en `i`: la última mención antes, en la oración o en la anterior. */
function deQuien(
  texto: string,
  i: number,
  ids: readonly Id[],
  ms: readonly { i: number; id: Id }[],
): Id | null {
  if (ids.length === 1) return ids[0]!;
  const o = oracion(texto, i);
  const enOracion = ms.filter((m) => m.i >= o.ini && m.i < i);
  if (enOracion.length) return enOracion.at(-1)!.id;
  const previa = oracion(texto, Math.max(0, o.ini - 2));
  const antes = ms.filter((m) => m.i >= previa.ini && m.i < o.ini);
  return antes.length ? antes.at(-1)!.id : null;
}

const cita = (texto: string, i: number, largo: number) => {
  const o = oracion(texto, i);
  const ini = Math.max(o.ini, i - 80);
  const fin = Math.min(o.fin, i + largo + 60);
  return texto.slice(ini, fin).trim().slice(0, 400);
};

/**
 * La velocidad de cada vehículo que dice o describe la narración (la primera que lo nombra). Sin
 * vehículo claro (varios y ninguno nombrado en la frase), no se asigna: la pregunta al perito lo
 * resuelve.
 */
export function velocidadesNarradas(
  narracion: string,
  ids: readonly Id[],
  limite: { kmh: number; fuente: string } = LIMITE_SIN_VIA,
): Map<Id, VelocidadNarrada> {
  const out = new Map<Id, VelocidadNarrada>();
  const ms = menciones(narracion, ids);
  const poner = (i: number, v: VelocidadNarrada) => {
    const id = deQuien(narracion, i, ids, ms);
    if (id && !out.has(id)) out.set(id, v);
  };
  // 1) Las cifras.
  const rxCifra = palabra(
    String.raw`(?:entre\s+${NUM}\s+y\s+)?(?:(m[aá]s|menos)\s+de\s+)?${NUM}\s*${UNIDAD}`,
  );
  const usados: [number, number][] = [];
  for (const m of narracion.matchAll(rxCifra)) {
    const i = m.index;
    const antes = narracion.slice(Math.max(0, i - 60), i);
    if (LIMITE.test(antes)) continue;
    const n = (x: string) => Number(x.replace(",", "."));
    const x = n(m[3]!);
    if (!(x >= 3 && x <= 250)) continue;
    let rango: [number, number];
    let kmh = x;
    // «Más de X» y «menos de X» son cotas: X es el mínimo o el máximo, no un valor con su rango.
    const cota = m[2] ? (/^m[aá]s/i.test(m[2]) ? ("minimo" as const) : ("maximo" as const)) : null;
    if (m[1]) {
      rango = [n(m[1]), x];
      kmh = (rango[0] + rango[1]) / 2;
    } else if (cota) rango = [x, x];
    else if (APROX.test(antes)) rango = [x * 0.85, x * 1.15];
    else rango = [x * 0.9, x * 1.1];
    const r1 = (v: number) => Math.round(v * 10) / 10;
    usados.push([i, i + m[0].length]);
    poner(i, {
      kmh: r1(kmh),
      rango_kmh: [r1(rango[0]), r1(rango[1])],
      origen: "narración",
      descripcion: m[0].trim(),
      cita: cita(narracion, i, m[0].length),
      ...(cota ? { cota } : {}),
    });
  }
  // 2) Las descripciones, relativas al límite de la vía.
  for (const d of DESCRIPCIONES)
    for (const m of narracion.matchAll(d.rx)) {
      const i = m.index;
      if (usados.some(([a, b]) => i >= a && i < b)) continue;
      // «El carril de baja velocidad» es el nombre de un carril, no cómo venía.
      if (/carril\s+(?:de\s+)?$/iu.test(narracion.slice(Math.max(0, i - 20), i))) continue;
      const v: VelocidadNarrada = d.fijo
        ? {
            kmh: d.fijo[0],
            rango_kmh: [d.fijo[1], d.fijo[2]],
            origen: "narración",
            descripcion: d.texto,
            cita: cita(narracion, i, m[0].length),
          }
        : {
            ...respectoAlLimite(d.r, limite.kmh),
            origen: "narración",
            descripcion: d.texto,
            cita: cita(narracion, i, m[0].length),
            respecto_al_limite: d.r,
            limite_kmh: limite.kmh,
            limite_fuente: limite.fuente,
          };
      poner(i, v);
    }
  return out;
}

/** El expediente con la velocidad narrada de cada vehículo que no la tenga ya. */
export function conVelocidadesNarradas(e: Expediente, narracion: string): Expediente {
  const vs = velocidadesNarradas(
    narracion,
    e.vehiculos.map((v) => v.id),
    limiteDelExpediente(e, narracion),
  );
  if (!vs.size) return e;
  return {
    ...e,
    vehiculos: e.vehiculos.map((v) =>
      v.velocidad_narrada || !vs.has(v.id) ? v : { ...v, velocidad_narrada: vs.get(v.id)! },
    ),
  };
}

/** De dónde sale la velocidad que da el perito («¿cómo lo sabes?», René 2026-11-27). */
export type MedioVelocidad = NonNullable<VelocidadNarrada["medio"]>;
/** Cámara, GPS o tacógrafo: medida por un instrumento. Conductor o testigo: declarada. */
export const MEDIOS_MEDIDA: readonly MedioVelocidad[] = ["camara", "gps", "tacografo"];
export const MEDIO_EN_PALABRAS: Record<MedioVelocidad, string> = {
  camara: "la cámara",
  gps: "el GPS",
  tacografo: "el tacógrafo",
  conductor: "el conductor",
  testigo: "un testigo",
};

/**
 * La velocidad que contestó el perito (km/h) y cómo la sabe, o la típica de la vía si dijo «No sé».
 * Medida (cámara, GPS, tacógrafo): restricción dura. Declarada (conductor, testigo, la de omisión):
 * se compara con la física.
 */
export function conVelocidadDelPerito(
  e: Expediente,
  vehiculo: Id,
  kmh: number | null,
  medio: MedioVelocidad = "conductor",
): Expediente {
  const limite = limiteDelExpediente(e);
  const medida = MEDIOS_MEDIDA.includes(medio);
  const v: VelocidadNarrada =
    kmh !== null
      ? {
          kmh,
          rango_kmh: [Math.round(kmh * 0.9 * 10) / 10, Math.round(kmh * 1.1 * 10) / 10],
          origen: "perito",
          como_se_sabe: medida ? "medida" : "declarada",
          medio,
          descripcion: medida
            ? `${kmh} km/h, medida por ${MEDIO_EN_PALABRAS[medio]}`
            : `${kmh} km/h, la que declaró ${MEDIO_EN_PALABRAS[medio]}`,
        }
      : {
          ...respectoAlLimite("alrededor", limite.kmh),
          origen: "via",
          descripcion: "la típica de la vía (el perito no la sabe)",
          respecto_al_limite: "alrededor",
          limite_kmh: limite.kmh,
          limite_fuente: limite.fuente,
        };
  return {
    ...e,
    vehiculos: e.vehiculos.map((x) => (x.id === vehiculo ? { ...x, velocidad_narrada: v } : x)),
  };
}

/**
 * Con la vía del choque ya conocida: las velocidades relativas al límite se recalculan con el suyo
 * (su `maxspeed` o su tipo). Las cifras no cambian.
 */
export function conLimiteDeLaVia(
  e: Expediente,
  limite: { kmh: number; fuente: string },
): Expediente {
  let cambio = false;
  const vehiculos = e.vehiculos.map((v) => {
    const vn = v.velocidad_narrada;
    if (
      !vn?.respecto_al_limite ||
      (vn.limite_kmh === limite.kmh && vn.limite_fuente === limite.fuente)
    )
      return v;
    cambio = true;
    return {
      ...v,
      velocidad_narrada: {
        ...vn,
        ...respectoAlLimite(vn.respecto_al_limite, limite.kmh),
        limite_kmh: limite.kmh,
        limite_fuente: limite.fuente,
      },
    };
  });
  return cambio ? { ...e, vehiculos } : e;
}

/** Si la velocidad del perito la midió un instrumento (restricción dura). */
export const esVelocidadMedida = (v: VelocidadNarrada | undefined | null): boolean =>
  v?.origen === "perito" && v.como_se_sabe === "medida";

/**
 * La velocidad narrada como `velocidad_previa` del solver: un supuesto con su rango. La medida por
 * un instrumento va como restricción dura (`medida`): el solver no la ajusta.
 */
export function velocidadPreviaDeclarada(v: VelocidadNarrada): Record<string, unknown> {
  if (esVelocidadMedida(v))
    return {
      valor: v.kmh,
      unidad: "km/h",
      fuente: "usuario",
      confianza: 0.9,
      nota: `Medida por ${MEDIO_EN_PALABRAS[v.medio ?? "camara"]}: restricción dura, el solver no la ajusta.`,
      medida: true,
    };
  const deDonde =
    v.origen === "perito"
      ? "La dio el perito"
      : v.origen === "via"
        ? `La típica de la vía (límite de ${v.limite_kmh} km/h: ${v.limite_fuente}); el perito no la sabe`
        : v.respecto_al_limite
          ? `La narración dice «${v.descripcion}»; respecto al límite de ${v.limite_kmh} km/h (${v.limite_fuente})`
          : v.cota
            ? `La narración dice «${v.descripcion}»: ${enCota(v)}, una cota y no un valor`
            : `La narración dice «${v.descripcion}»`;
  return {
    valor: v.kmh,
    unidad: "km/h",
    rango: v.rango_kmh,
    fuente: v.origen === "narración" ? "relato" : v.origen === "perito" ? "usuario" : "supuesto",
    confianza: v.origen === "via" ? 0.3 : 0.6,
    nota: `${deDonde}. Supuesto declarado con su rango: solo pesa si la evidencia no fija la velocidad.`.slice(
      0,
      300,
    ),
    a_priori: true,
    ...(v.cota ? { cota: v.cota } : {}),
  };
}

/** «al menos 90 km/h» o «a lo más 40 km/h»: lo que ve el perito de una cota. */
export function enCota(v: Pick<VelocidadNarrada, "cota" | "kmh">): string {
  return `${v.cota === "maximo" ? "a lo más" : "al menos"} ${Math.round(v.kmh)} km/h`;
}
