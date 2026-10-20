/**
 * Cómo se dicen en palabras llanas los resultados del solver. Los usan los paneles del visor y el
 * informe PDF, para que digan lo mismo. Nunca asignan culpa (PLAN §10).
 *
 * Cada función recibe el idioma (`lang`, español por omisión). El español es el texto de siempre;
 * el inglés es su traducción para el sitio bajo `/en` (PLAN §11.5, ADR 0045).
 */
import { LEGEND_TEXT, type LegendInfo, type Resultado } from "@croquis/scene-schema";
import { dict, type Lang } from "@/i18n";
import {
  CLASE as VOCAB_CLASE,
  FUENTE,
  PARAM as VOCAB_PARAM,
  palabra,
  soloEs,
  TIPO_PARAM,
  VALOR,
} from "@/i18n/vocabulario";
import { fmtNumber } from "./format-number";

type Vocab = Record<string, { es: string; en: string }>;

/** Un valor del vocabulario en el idioma pedido; si no está, el valor tal cual. */
function de(vocab: Vocab, valor: string, lang: Lang): string {
  return vocab[valor]?.[lang] ?? valor;
}

/** Clase de vehículo, parámetro y tipo de fuente en español (los mapas de siempre). */
export const CLASE: Record<string, string> = soloEs(VOCAB_CLASE);
export const PARAM: Record<string, string> = soloEs(VOCAB_PARAM);
export const TIPO: Record<string, string> = soloEs(TIPO_PARAM);

/** Clase de vehículo en el idioma pedido. */
export function claseTexto(clase: string, lang: Lang = "es"): string {
  return de(VOCAB_CLASE, clase, lang);
}

/** Nombre de un parámetro del solver en el idioma pedido. */
export function paramTexto(clave: string, lang: Lang = "es"): string {
  return de(VOCAB_PARAM, clave, lang);
}

/** Tipo de fuente de un parámetro en el idioma pedido. */
export function tipoTexto(tipo: string, lang: Lang = "es"): string {
  return de(TIPO_PARAM, tipo, lang);
}

/** Dirección de la fuerza en horas de reloj, como se dice en reconstrucción ("a las 3"). */
export function clockHour(hours: number, lang: Lang = "es"): string {
  const h = Math.round(hours) % 12;
  const hora = h === 0 ? 12 : h;
  return lang === "en" ? `at ${hora} o'clock` : `a las ${hora}`;
}

/** De dónde sale la rigidez del vehículo. */
export function rigidezTexto(origen: string | undefined, lang: Lang = "es"): string {
  if (origen === "nhtsa")
    return lang === "en" ? "measured (NHTSA tests)" : "medida (pruebas de NHTSA)";
  if (origen === "supuesto") return lang === "en" ? "assumed" : "supuesto";
  return "—";
}

/** Evidencia de la inversión en palabras llanas. */
const EVIDENCIA: Vocab = {
  reposo: { es: "dónde quedó", en: "where it came to rest" },
  rumbo_final: { es: "hacia dónde quedó orientado", en: "which way it ended up facing" },
  marcas_frenado: { es: "marcas de frenado", en: "skid marks" },
  proyeccion: { es: "distancia a la que quedó la persona", en: "how far the person ended up" },
  dano: { es: "daño descrito", en: "damage described" },
};

export function evidenceLabel(
  label: string,
  roles: Map<string, string>,
  lang: Lang = "es",
): string {
  const [kind = "", id = ""] = label.split(":");
  const en = lang === "en";
  const who = roles.has(id)
    ? `${en ? "vehicle" : "vehículo"} ${roles.get(id)}`
    : en
      ? "person"
      : "persona";
  return `${de(EVIDENCIA, kind, lang)} (${who})`;
}

type Parametro = NonNullable<Resultado["inversion"]>["parametros"][number];

export function parametroInversion(p: Parametro, lang: Lang = "es"): string {
  if (lang === "en") {
    return p.parametro === "velocidad_previa"
      ? "Initial speed (before braking, if it braked)"
      : "Direction of approach";
  }
  return p.parametro === "velocidad_previa"
    ? "Velocidad previa (antes de frenar, si frenó)"
    : "Dirección de llegada";
}

export function unidadInversion(p: Parametro): string {
  return p.unidad === "deg" ? "°" : " km/h";
}

/** Si el valor de partida se dijo o se supuso. */
export function inicialTexto(declarado: boolean, lang: Lang = "es"): string {
  if (lang === "en") return declarado ? "stated" : "assumed";
  return declarado ? "dicho" : "supuesto";
}

/** Lo que la evidencia dice de un parámetro, en una frase (versión de texto del panel). */
export function estimacionTexto(p: Parametro, lang: Lang = "es"): string {
  const unit = unidadInversion(p);
  const en = lang === "en";
  if (!p.identificable || !p.estimacion) {
    return en
      ? "The evidence is not enough to estimate it."
      : "La evidencia no basta para estimarlo.";
  }
  const e = p.estimacion;
  if (p.en_limite) {
    return en
      ? `The evidence pushes this value to the limit of the model (${fmtNumber(e.mejor)}${unit}), so it does not fit well with the rest. It is worth checking the data.`
      : `La evidencia lleva este dato hasta el límite del modelo (${fmtNumber(e.mejor)}${unit}), así que no cabe bien con lo demás. Conviene revisar los datos.`;
  }
  const mejor = en ? "best fit" : "mejor ajuste";
  return `${fmtNumber(e.p10)}–${fmtNumber(e.p90)}${unit} (${mejor} ${fmtNumber(e.mejor)}${unit})`;
}

/** Datos inciertos del Monte Carlo en palabras: qué dato, de quién, unidad y decimales. */
const CAMPO_INCIERTO: Record<
  string,
  { texto: { es: string; en: string }; unidad: string; decimales: number }
> = {
  velocidad_previa: {
    texto: { es: "velocidad previa", en: "initial speed" },
    unidad: "km/h",
    decimales: 0,
  },
  masa: { texto: { es: "masa", en: "mass" }, unidad: "kg", decimales: 0 },
  "frenado.distancia_antes_impacto": {
    texto: {
      es: "distancia de frenado antes del impacto",
      en: "braking distance before the impact",
    },
    unidad: "m",
    decimales: 1,
  },
};

/** La nota de un dato incierto (la escribe el solver en español) en inglés. */
function notaIncierta(nota: string, lang: Lang): string {
  if (lang === "es") return nota;
  if (nota === "rango declarado") return "stated range";
  if (nota === "rango de la clase") return "range for the vehicle class";
  const pct = /^±(\d+(?:\.\d+)?%) \((.+)\)$/.exec(nota);
  if (pct) return `±${pct[1]} (${FUENTE[pct[2]!] ? palabra(FUENTE, pct[2], "en") : pct[2]})`;
  const tabla = /^tabla de fricción \((.+)\)$/.exec(nota);
  if (tabla) return `friction table (${tabla[1]!.replace("según edad", "by age")})`;
  const moto = /^arrastre de la moto caída \((.+)\)$/.exec(nota);
  if (moto) return `downed motorcycle drag (${moto[1]})`;
  return nota;
}

type CampoIncierto = NonNullable<Resultado["incertidumbre"]>["campos"][number];

export function campoIncierto(c: CampoIncierto, resultado: Resultado, lang: Lang = "es"): string {
  const en = lang === "en";
  const veh = /^vehiculos\.(\d+)\.(.+)$/.exec(c.ruta);
  let quien: string;
  let def = { texto: c.ruta, unidad: "", decimales: 2 };
  if (veh) {
    const v = resultado.vehiculos[Number(veh[1])];
    quien = `${en ? "Vehicle" : "Vehículo"} ${v?.rol ?? Number(veh[1]) + 1}`;
    const conocido = CAMPO_INCIERTO[veh[2]!];
    def = conocido
      ? { texto: conocido.texto[lang], unidad: conocido.unidad, decimales: conocido.decimales }
      : { ...def, texto: veh[2]! };
  } else if (c.ruta === "lugar.friccion") {
    quien = en ? "Road surface" : "Pavimento";
    def = {
      texto: en ? "tire–road friction" : "fricción llanta–pavimento",
      unidad: "",
      decimales: 2,
    };
  } else if (c.ruta.startsWith("parametros.")) {
    const k = c.ruta.slice("parametros.".length);
    quien = en ? "Parameter" : "Parámetro";
    def = { texto: paramTexto(k, lang).toLowerCase(), unidad: "", decimales: 2 };
  } else {
    quien = en ? "Value" : "Dato";
  }
  const u = def.unidad ? ` ${def.unidad}` : "";
  const min = fmtNumber(c.min, def.decimales);
  const max = fmtNumber(c.max, def.decimales);
  const nota = notaIncierta(c.nota, lang);
  return en
    ? `${quien}: ${def.texto}, between ${min} and ${max}${u} (${nota})`
    : `${quien}: ${def.texto}, entre ${min} y ${max}${u} (${nota})`;
}

/** Nombre de un evento de la línea de tiempo (las etiquetas en español vienen del visor). */
const EVENTO: Vocab = {
  inicio_frenado: { es: "Inicio de frenado", en: "Braking starts" },
  impacto_vehiculo_vehiculo: { es: "Impacto", en: "Impact" },
  impacto_vehiculo_objeto: { es: "Impacto", en: "Impact" },
  impacto_vehiculo_persona: { es: "Impacto", en: "Impact" },
  reposo: { es: "Reposo", en: "Comes to rest" },
};

/**
 * Etiqueta de un marcador de la línea de tiempo (`eventMarkers` de @croquis/viewer) en el idioma
 * pedido. En español es la etiqueta del visor tal cual; en inglés se arma con el tipo y quién.
 */
export function eventoEtiqueta(
  m: { tipo: string; etiqueta: string },
  quien: string | undefined,
  lang: Lang = "es",
): string {
  if (lang === "es") return m.etiqueta;
  const base = de(EVENTO, m.tipo, "en");
  const named = m.tipo === "inicio_frenado" || m.tipo === "reposo";
  return named && quien ? `${base} (${quien})` : base;
}

/** Bolsas de aire: el motivo que escribe la regla ilustrativa del visor, en el idioma pedido. */
export function airbagTexto(motivo: string, lang: Lang = "es"): string {
  if (lang === "es") return motivo;
  if (motivo === "Sin bolsas de aire (vehículo de dos ruedas).") {
    return "No airbags (two-wheeled vehicle).";
  }
  if (motivo === "Sin impacto.") return "No impact.";
  if (motivo === "Impacto trasero: no aplica.") return "Rear impact: does not apply.";
  const estado = (s: string) => (s === "desplegada" ? "deployed" : "not deployed");
  const frontal =
    /^Frontal (desplegada|sin desplegar): ΔV (\d+) km\/h ([≥<]) (\d+) km\/h( \(cinturón no declarado: se usa el umbral con cinturón\))?\.$/.exec(
      motivo,
    );
  if (frontal) {
    const nota = frontal[5] ? " (seat belt not stated: the belted threshold is used)" : "";
    return `Frontal ${estado(frontal[1]!)}: ΔV ${frontal[2]} km/h ${frontal[3]} ${frontal[4]} km/h${nota}.`;
  }
  const lateral =
    /^Lateral (izquierda|derecha) (desplegada|sin desplegar): ΔV (\d+) km\/h ([≥<]) (\d+) km\/h\.$/.exec(
      motivo,
    );
  if (lateral) {
    const lado = lateral[1] === "izquierda" ? "Left" : "Right";
    return `${lado} side ${estado(lateral[2]!)}: ΔV ${lateral[3]} km/h ${lateral[4]} ${lateral[5]} km/h.`;
  }
  return motivo;
}

/** La fuente de los umbrales de bolsas de aire (`AIRBAG_SOURCE` del visor) en inglés. */
export const AIRBAG_SOURCE_EN =
  "IIHS, Airbags (accessed 2026-10-13): frontal at 10–12 mph into a rigid wall without a seat belt and ~16 mph with one; side from 8 mph (narrow object) and 18 mph (distributed impact).";

/** Los supuestos de entorno que escribe el visor (en español), en el idioma pedido. */
export function supuestoEntorno(
  es: string,
  lang: Lang = "es",
): { texto: string; lang: "es-MX" | "en" } {
  if (lang === "es") return { texto: es, lang: "es-MX" };
  const s = es.trim();
  const fecha = /^Fecha no declarada: se usa (\S+)\.$/.exec(s);
  if (fecha) return { texto: `Date not stated: ${fecha[1]} is used.`, lang: "en" };
  const hora =
    /^Hora no declarada: se usan las (\S+) según la iluminación \((.+)\) del (\S+)\.$/.exec(s);
  if (hora) {
    return {
      texto: `Time not stated: ${hora[1]} on ${hora[3]} is used, based on the light (${palabra(VALOR, hora[2], "en")}).`,
      lang: "en",
    };
  }
  if (s === "Ubicación no declarada: el sol se calcula para el centro de Toluca.") {
    return { texto: "Location not stated: the sun is computed for downtown Toluca.", lang: "en" };
  }
  const piso = /^Estado del piso no declarado: se dibuja (mojado|encharcado) por la lluvia\.$/.exec(
    s,
  );
  if (piso) {
    return {
      texto: `Road surface condition not stated: it is drawn ${palabra(VALOR, piso[1], "en")} because of the rain.`,
      lang: "en",
    };
  }
  return { texto: es, lang: "es-MX" };
}

/** Atribución estándar de OpenStreetMap (la que trae la escena) y su versión en inglés. */
const OSM_ES = "Contiene información de OpenStreetMap";
const OSM_EN =
  "Contains information from OpenStreetMap, available at openstreetmap.org under the Open Database License (ODbL)";

/**
 * La marca de las exportaciones en el idioma pedido. En español es la de siempre (`LEGEND_TEXT`);
 * en inglés cambia el texto y la atribución estándar de OpenStreetMap, y conserva semilla y hash.
 */
export function leyendaIdioma(legend: LegendInfo, lang: Lang = "es"): LegendInfo {
  if (lang === "es") return legend;
  const texto = legend.texto === LEGEND_TEXT ? dict("en").leyenda.texto : legend.texto;
  const atribucion = legend.atribucion?.startsWith(OSM_ES) ? OSM_EN : legend.atribucion;
  return { ...legend, texto, ...(atribucion ? { atribucion } : {}) };
}

/** Renglones de la marca para documentos: texto, semilla y hash, y atribución. */
export function lineasLeyenda(legend: LegendInfo, lang: Lang = "es"): string[] {
  const l = leyendaIdioma(legend, lang);
  const semilla = lang === "en" ? "seed" : "semilla";
  const ids = [`${semilla} ${l.semilla}`, ...(l.hash ? [`hash ${l.hash}`] : [])].join(" · ");
  return [l.texto, ids, ...(l.atribucion ? [l.atribucion] : [])];
}
