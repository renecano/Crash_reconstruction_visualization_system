/**
 * Línea base de reglas para E1 (port de `extraction/croquis_extraction/baseline.py`).
 *
 * Sin modelo de lenguaje: glosario de español mexicano, diccionario de modelos de vehículo y reglas
 * sobre la persona gramatical ("frené" es de quien narra; "frenó", del otro). Cada hecho lleva el
 * fragmento literal como evidencia. Las expresiones regulares se compilan con la semántica de
 * Python (`pyre`), y las posiciones son UTF-16 sobre el texto plegado, que mide lo mismo que el
 * original.
 */
import modelos from "../data/modelos.json";
import { emptyFacts, fact, type Fact, type Facts, type FactValue } from "./facts";
import { findTerms, type Term } from "./glossary";
import { PyRe, pyre, rfindBefore, type PyMatch } from "./pyre";
import { buildSpec } from "./spec-builder";
import { escapeRegExp, fold } from "./text";

const NUM_WORDS: Readonly<Record<string, number>> = {
  un: 1,
  uno: 1,
  una: 1,
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
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
};
// `sorted(NUM_WORDS, key=len, reverse=True)`: estable, así que los empates quedan en orden de
// inserción.
const WORDS_BY_LENGTH = Object.keys(NUM_WORDS)
  .map((w, i) => [w, i] as const)
  .sort((a, b) => b[0].length - a[0].length || a[1] - b[1])
  .map(([w]) => w);
const NUM =
  String.raw`(\d{1,3}(?:[.,]\d)?|(?:` + WORDS_BY_LENGTH.join("|") + String.raw`)(?![a-z]))`;
const SPEED = new PyRe(
  String.raw`(?<![a-z0-9])(?:como a|a unos|a eso de|iba a|venia a|ibamos a|a mas de|a menos de|` +
    String.raw`aproximadamente|de aproximadamente|a)\s+` +
    NUM +
    String.raw`(?:\s*(?:km/h|km|kms|kilometros(?: por hora)?|por hora|kph))?(?![\d:])(?!\s*(?:metros|m\b|mts|horas|hrs|de la|cuadras|minutos|segundos|anos|am|pm|vueltas))`,
);
const MARKS = new PyRe(
  String.raw`(?:como\s+|unos\s+)?` +
    NUM +
    String.raw`\s*(?:metros|mts|m)\s+de\s+(?:marca|marcas|frenado|rayon|raspadura)`,
);
const MARKS2 = new PyRe(
  String.raw`marcas?\s+(?:de\s+frenado\s+)?(?:de\s+)?(?:como\s+|unos\s+)?` +
    NUM +
    String.raw`\s*(?:metros|mts|m)\b`,
);
const THROW = new PyRe(
  String.raw`(?:cayo|quedo|salio volando|lo avento|la avento|lo aventaron|la aventaron|lo lanzo|la lanzo|termino|fue a dar)\s+(?:tirad[oa]\s+)?(?:como\s+|unos\s+)?(?:a\s+)?(?:unos\s+|como\s+)?` +
    NUM +
    String.raw`\s*(?:metros|mts|m)\b`,
);
const DRIVING = new PyRe(
  String.raw`(?<![a-z])(?:choque|me estrelle|me sali|me fui contra|me volque|me voltee|derrape|frene|` +
    String.raw`iba a \d|iba manejando|venia manejando|iba conduciendo|maneje)(?![a-z])`,
);
const FIRST_STRONG = new PyRe(
  String.raw`(?<![a-z])(?:yo|mi|me|choque|frene|meti|di|doble|gire|voltee|pise|clave|maneje|traigo)(?![a-z])`,
);
const FIRST = new PyRe(
  String.raw`(?<![a-z])(?:yo|mi|me|iba|venia|circulaba|manejaba|traia|choque|frene|meti|di|doble|gire|voltee|pise|clave|estaba)(?![a-z])`,
);
const NARRATOR_VEH = new PyRe(
  String.raw`(?<![a-z])(?:(?:mi|mis)\s+(?:carro|coche|auto|automovil|vehiculo|camioneta|camion|moto|motocicleta|bici|bicicleta|combi|taxi|unidad|troca|nave|vocho|tsuru)|vehiculo de mi propiedad)(?![a-z])`,
);
const BRANDS =
  String.raw`(?:(?:nissan|chevrolet|chevy|kia|toyota|honda|volkswagen|vw|ford|mazda|hyundai|seat|` +
  String.raw`renault|dodge|jeep|suzuki|mitsubishi|peugeot|audi|bmw|mercedes|gmc|italika|fiat|` +
  String.raw`buick|chrysler|mg|byd|jac)\s+)`;
const OWN_VERB =
  String.raw`(?<![a-z])(?:manejando|manejaba|traia|traigo|conduciendo|conducia|iba en|venia en|` +
  String.raw`iba manejando|venia manejando|circulaba en|andaba en|iba montado en|iba montada en)`;
const PASSENGER = new PyRe(
  String.raw`(?<![a-z])(?:mi|mis)\s+(esposa|esposo|hijo|hija|hijos|mama|papa|hermano|hermana|amigo|amiga|novio|novia|suegra|suegro|` +
    String.raw`companero|companera|abuelo|abuela)\s+(?:iba|venia|iban|venian)\s+(?:de copiloto|atras|adelante|conmigo|en el asiento)`,
);
const REL =
  String.raw`esposa|esposo|hijo|hija|hijos|hijas|mama|papa|hermano|hermana|hermanos|amigo|amiga|amigos|` +
  String.raw`novio|novia|suegra|suegro|companero|companera|abuelo|abuela|primo|prima|tio|tia|sobrino|` +
  String.raw`sobrina|nieto|nieta|bebe|nino|nina|ninos`;
const PASSENGER_WITH = new PyRe(
  String.raw`(?<![a-z])(?:con|y)\s+(?:mi|mis)\s+(?:(dos|tres|cuatro)\s+)?(?:` +
    REL +
    String.raw`)(?![a-z])` +
    String.raw`(?:\s+(?:de copiloto|atras|adelante))?`,
);
const NARRATOR_PASSENGER = new PyRe(
  String.raw`(?<![a-z])(?:(?:yo\s+)?(?:iba|venia|ibamos|veniamos)\s+(?:de\s+)?(?:copiloto|parrillera|` +
    String.raw`parrillero|pasajer[oa]|atras)|yo\s+de\s+copiloto|(?:iba|venia)\s+(?:sentad[oa]\s+)?en\s+` +
    String.raw`(?:el|la)\s+(?:pesero|camion|combi|micro|microbus|taxi|autobus|uber|colectivo|ruta))(?![a-z])`,
);
const DECLARANT = new PyRe(
  String.raw`(?<![a-z])(?:el|la)\s+(?:asegurad[oa]|suscrit[oa]|que suscribe|declarante|reportante)(?![a-z])`,
);
const DECLARANT_VEH = new PyRe(
  String.raw`(?<![a-z])(?:(?:circulaba|conducia|manejaba|iba)\s+(?:a bordo de\s+|en\s+)?` +
    String.raw`(?:su|el)\s+(?:vehiculo|camioneta|carro|automovil|auto|moto|motocicleta|coche)|` +
    String.raw`vehiculo de su propiedad)(?![a-z])`,
);
const COLORS =
  "blanco|blanca|negro|negra|gris|plata|plateado|plateada|rojo|roja|azul|verde|amarillo|" +
  "amarilla|naranja|cafe|vino|dorado|dorada|beige|morado|morada|guinda";
const COLOR_AFTER = new PyRe(
  String.raw`^[\s,]*(?:de\s+)?(?:color\s+)?(` + COLORS + String.raw`)(?![a-z])`,
);
const HOUR = new PyRe(
  String.raw`(?<![\d:])(\d{1,2})(?::(\d{2}))?\s*(de la manana|de la tarde|de la noche|de la madrugada|` +
    String.raw`am|a\.m\.|pm|p\.m\.|horas|hrs|h\b)`,
);
const GENERIC_NOUN = new PyRe(
  String.raw`(?<![a-z])(?:un|una|el|la|ese|esa|otro|otra|este|esta|dicho|dicha)\s+` +
    String.raw`(carro|coche|auto|automovil|vehiculo|carrito|unidad|particular)(?![a-z])`,
);
const DEFINITE = new PyRe(
  String.raw`(?:^|[^a-z])(?:el|la|ese|esa|este|esta|dicho|dicha|aquel|aquella)\s+$`,
);
const CARS = [
  "sedan_compacto",
  "sedan_mediano",
  "hatchback",
  "suv_compacta",
  "suv_grande",
  "pickup",
  "van",
];
/** Clases genéricas y las clases concretas que pueden nombrar ("camioneta" puede ser una Ranger). */
const GENERIC_CLASSES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["", new Set([...CARS, "suv_o_pickup"])],
  ["suv_o_pickup", new Set(["suv_compacta", "suv_grande", "pickup", "van"])],
  ["camion_o_autobus", new Set(["autobus", "camion_unitario"])],
]);
const HIT_ME = new PyRe(
  String.raw`(?<![a-z])(?:me pego|me pegaron|me choco|me chocaron|me dio|me dieron|me impacto|` +
    String.raw`me alcanzo|le pegue|le di|chocamos|me golpeo|me echo|me aviento)(?![a-z])`,
);
const WITNESS = new PyRe(
  String.raw`(?<![a-z])(?:observe|vi que|vi como|presencie|me toco ver|` +
    String.raw`a mi (?:hermano|hermana|hijo|hija|esposo|esposa|papa|mama|primo|prima|amigo|amiga|tio|tia)` +
    String.raw` (?:lo|la) (?:chocaron|atropellaron|golpearon|aventaron))(?![a-z])`,
);
const PART_SIDE: Readonly<Record<string, string>> = { f: "F", b: "B", l: "L", r: "R" };
const PARTS = new PyRe(
  String.raw`(?<![a-z])(?:` +
    String.raw`(?P<f>defensa (?:delantera|de adelante|de enfrente)|parte (?:de adelante|delantera|frontal)|` +
    String.raw`esquina (?:de adelante|delantera)|el frente|su frente|frente de|cofre|parrilla|trompa|` +
    String.raw`faros?|llanta de adelante|llanta delantera)|` +
    String.raw`(?P<b>defensa (?:trasera|de atras)|parte (?:de atras|trasera|posterior)|cajuela|calaveras?|` +
    String.raw`llanta de atras|llanta trasera|medallon)|` +
    String.raw`(?P<l>(?:costado|lado|lateral|parte lateral) izquierd[oa]|puerta del (?:chofer|conductor)|` +
    String.raw`lado del (?:chofer|conductor)|puerta izquierda)|` +
    String.raw`(?P<r>(?:costado|lado|lateral|parte lateral) derech[oa]|puerta del copiloto|` +
    String.raw`lado del copiloto|puerta derecha)` +
    String.raw`)(?![a-z])`,
);

/** ¿Dos clases pueden nombrar al mismo vehículo? (genérica con concreta o iguales). */
function compatible(a: string, b: string): boolean {
  return (
    a === b ||
    (GENERIC_CLASSES.get(a)?.has(b) ?? false) ||
    (GENERIC_CLASSES.get(b)?.has(a) ?? false)
  );
}

interface Mention {
  start: number;
  end: number;
  clase: string;
  cita: string;
  narrator: boolean;
  definite: boolean;
  generic: boolean;
}

function mention(start: number, end: number, clase: string, cita: string, narrator: boolean) {
  return { start, end, clase, cita, narrator, definite: false, generic: false } as Mention;
}

function num(s: string): number {
  const t = s.replaceAll(",", ".");
  return t in NUM_WORDS ? NUM_WORDS[t]! : Number(t);
}

const MODELS = (modelos as { modelos: Record<string, { clase: string }> }).modelos;
let modelRules: { rx: PyRe; clase: string }[] | null = null;

function models(): { rx: PyRe; clase: string }[] {
  modelRules ??= Object.entries(MODELS).map(([key, info]) => ({
    rx: new PyRe(`(?<![a-z0-9])${escapeRegExp(key)}(?![a-z0-9])`),
    clase: info.clase,
  }));
  return modelRules;
}

function vehicleMentions(text: string, folded: string, terms: Term[]): Mention[] {
  const found: Mention[] = [];
  for (const t of terms) {
    for (const e of t.efectos) {
      if (e.campo === "vehiculo.clase") {
        found.push(mention(t.start, t.end, String(e.valor), t.texto, false));
      }
    }
  }
  for (const { rx, clase } of models()) {
    for (const m of rx.finditer(folded)) {
      found.push(mention(m.start(), m.end(), clase, text.slice(m.start(), m.end()), false));
    }
  }
  for (const m of NARRATOR_VEH.finditer(folded)) {
    found.push(mention(m.start(), m.end(), "", text.slice(m.start(), m.end()), true));
  }
  if (DECLARANT.search(folded)) {
    for (const m of DECLARANT_VEH.finditer(folded)) {
      found.push(mention(m.start(), m.end(), "", text.slice(m.start(), m.end()), true));
    }
  }
  for (const m of GENERIC_NOUN.finditer(folded)) {
    found.push(mention(m.start(1), m.end(1), "", text.slice(m.start(1), m.end(1)), false));
  }
  for (const x of found) {
    x.definite = DEFINITE.search(folded.slice(Math.max(0, x.start - 10), x.start)) !== null;
    x.generic = GENERIC_CLASSES.has(x.clase);
  }
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: Mention[] = [];
  for (const x of found) {
    const prev = out[out.length - 1];
    if (prev && x.start < prev.end) {
      // "mi carro Aveo" / "mi camioneta": la mención del narrador absorbe la clase.
      if (x.narrator || prev.narrator) {
        prev.narrator = true;
        if (!prev.clase && x.clase) {
          prev.clase = x.clase;
          prev.cita = x.cita;
        }
        prev.end = Math.max(prev.end, x.end);
      }
      continue;
    }
    out.push(x);
  }
  // "mi" justo antes de un modelo o clase ("en mi Aveo", "mi moto"); verbo en primera persona con
  // artículo ("manejando la Urvan", "traía la camioneta").
  for (const x of out) {
    const before = folded.slice(Math.max(0, x.start - 24), x.start);
    if (pyre(String.raw`(?<![a-z])mis?\s+(?:` + BRANDS + String.raw`)?$`).search(before)) {
      x.narrator = true;
    }
    const wider = folded.slice(Math.max(0, x.start - 30), x.start);
    if (pyre(OWN_VERB + String.raw`(?:\s+(?:la|el|una|un))?\s+$`).search(wider)) x.narrator = true;
  }
  // "mi vehículo Nissan Versa" / "Mi carro es un Jetta" / "Mi carro, un Fiesta gris": la clase pasa
  // al narrador. "taxi colectivo", "combi de la ruta", "vehículo tipo pickup": una mención.
  const merged: Mention[] = [];
  for (const x of out) {
    const prev = merged[merged.length - 1];
    const gap = prev ? folded.slice(prev.end, x.start) : "";
    if (
      prev &&
      prev.narrator &&
      x.clase &&
      !x.narrator &&
      ((!prev.clase &&
        gap.length <= 30 &&
        !pyre("[.;!?]").search(gap) &&
        pyre(String.raw`(?:[\s,]*[a-z]+){0,4}[\s,]*`).fullmatch(gap)) ||
        ((prev.generic || !prev.clase) &&
          pyre(String.raw`\s*,?\s*(?:(?:es|era)\s+)?(?:un|una)\s+`).fullmatch(gap) &&
          compatible(prev.clase, x.clase)))
    ) {
      prev.clase = x.clase;
      prev.cita = x.cita;
      prev.generic = x.generic;
      prev.end = x.end;
      continue;
    }
    if (
      prev &&
      !x.narrator &&
      pyre(String.raw`\s+(?:de\s+(?:la\s+|el\s+)?|tipo\s+|marca\s+)?`).fullmatch(gap)
    ) {
      if (!prev.clase || (prev.generic && x.clase && !x.generic)) {
        prev.clase = x.clase;
        prev.generic = x.generic;
      }
      prev.cita = text.slice(prev.start, x.end);
      prev.end = x.end;
      continue;
    }
    merged.push(x);
  }
  return merged;
}

function sentenceBounds(folded: string, pos: number): [number, number] {
  const s = Math.max(...[".", "!", "?", ";", "\n"].map((c) => rfindBefore(folded, c, pos))) + 1;
  const ends = [".", "!", "?", ";", "\n"].map((c) => folded.indexOf(c, pos)).filter((i) => i >= 0);
  return [s, ends.length > 0 ? Math.min(...ends) : folded.length];
}

function isFirstPerson(segment: string): boolean {
  return FIRST.search(segment) !== null;
}

function nearPassenger(folded: string, pos: number): boolean {
  const [s] = sentenceBounds(folded, pos);
  return PASSENGER.search(folded.slice(s, pos)) !== null;
}

function cmpKey(a: readonly (number | boolean)[], b: readonly (number | boolean)[]): number {
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    if (x !== y) return x - y;
  }
  return 0;
}

/** Hechos del relato (redactado) con evidencia literal. */
export function extractFacts(text: string): Facts {
  const folded = fold(text);
  const terms = findTerms(text);
  const f = emptyFacts();
  // "iba", "venía", "estaba" valen para yo y para él: aquí solo cuentan las marcas inequívocas.
  const firstPerson = FIRST_STRONG.search(folded) !== null;
  const mentions = vehicleMentions(text, folded, terms);

  // Vehículos: el del narrador primero (A), luego los demás en orden de aparición.
  const narr = mentions.filter((m) => m.narrator);
  const others: Mention[] = [];
  for (const m of mentions) {
    if (m.narrator) continue;
    if (others.some((o) => o.clase === m.clase && o.cita.toLowerCase() === m.cita.toLowerCase())) {
      continue;
    }
    if (
      narr.length > 0 &&
      narr[0]!.clase === m.clase &&
      !narr[0]!.cita.toLowerCase().startsWith("mi")
    ) {
      continue;
    }
    const known = [...narr.slice(0, 1), ...others];
    // "la camioneta" después de "la Ranger", "el carro" después de un Jetta: el mismo vehículo.
    if (
      m.definite &&
      (m.generic || !m.clase) &&
      known.some((o) => o.clase && compatible(o.clase, m.clase))
    ) {
      continue;
    }
    others.push(m);
  }
  // Peatón que narra: "iba cruzando" sin sujeto en tercera persona ("un señor que iba cruzando" es
  // otra persona).
  const pedestrianNarrator =
    pyre(
      String.raw`(?<![a-z])(?<!que )(?:iba cruzando|estaba cruzando|cruzaba la calle|iba caminando)(?![a-z])`,
    ).search(folded) !== null &&
    pyre(String.raw`(?<![a-z])(?:yo|me|mi)(?![a-z])`).search(folded) !== null &&
    narr.length === 0;
  const vehs: Mention[] = [];
  if (narr.length > 0) vehs.push(narr[0]!);
  else if (
    firstPerson &&
    !pedestrianNarrator &&
    (DRIVING.search(folded) || (HIT_ME.search(folded) && !WITNESS.search(folded)))
  ) {
    // Narra en primera persona sin decir su vehículo ("choqué contra un poste", "iba a 80"): se
    // crea uno sin clase.
    vehs.push(mention(0, 0, "", "", true));
  }
  vehs.push(...others.slice(0, 4));
  vehs.forEach((m, i) => {
    const d = new Map<string, Fact>();
    if (m.clase && m.cita) d.set("clase", fact(m.clase, m.cita, "relato"));
    if (m.end) {
      const cm = COLOR_AFTER.match(folded.slice(m.end, m.end + 30));
      if (cm) {
        const a = m.end + cm.start(1);
        const b = m.end + cm.end(1);
        d.set("color", fact(fold(text.slice(a, b)), text.slice(a, b), "relato"));
      }
    }
    f.vehiculos.push(d);
    if (m.narrator) f.narradorVehiculo = i;
  });

  const owner = (pos: number, matchText: string): number | null => {
    if (f.vehiculos.length === 0) return null;
    const [s] = sentenceBounds(folded, pos);
    const mt = fold(matchText);
    const third = pyre(String.raw`(?<![a-z])(?:dio|doblo|giro|volteo|se)(?![a-z])`).search(mt);
    const first =
      pyre(String.raw`(?<![a-z])(?:me|yo)(?![a-z])`).search(mt) ??
      pyre(String.raw`(?:di|doble|gire|voltee|meti|frene|pise|clave|me)\b`).match(mt);
    if (third && !pyre(String.raw`(?<![a-z])me(?![a-z])`).search(mt)) {
      const cands = vehs.flatMap((v, k) => (!v.narrator && v.start < pos ? [k] : []));
      return cands.length > 0 ? cands[cands.length - 1]! : f.vehiculos.length > 1 ? 1 : null;
    }
    if (first) return f.narradorVehiculo;
    const before = vehs.flatMap((v, k) => (v.end && s <= v.start && v.start < pos ? [k] : []));
    if (before.length > 0) return before[before.length - 1]!;
    const window = folded.slice(Math.max(s, pos - 40), pos);
    if (isFirstPerson(window)) return f.narradorVehiculo;
    return f.narradorVehiculo !== null ? f.narradorVehiculo : 0;
  };

  // Velocidades.
  for (const m of SPEED.finditer(folded)) {
    const g = m.group(1)!;
    const val = num(g);
    if (!(val >= 5 && val <= 250) || (g in NUM_WORDS && val < 10)) continue;
    const k = owner(m.start(), text.slice(Math.max(0, m.start() - 25), m.start()));
    if (k !== null && k < f.vehiculos.length && !f.vehiculos[k]!.has("velocidad_kmh")) {
      f.vehiculos[k]!.set(
        "velocidad_kmh",
        fact(val, text.slice(m.start(), m.end()).trim(), "relato"),
      );
    }
  }
  for (const t of terms) {
    for (const e of t.efectos) {
      if (e.campo === "velocidad.cualitativa" && e.valor === "muy_baja") {
        const k = owner(t.start, t.texto);
        if (k !== null && k < f.vehiculos.length && !f.vehiculos[k]!.has("velocidad_kmh")) {
          f.vehiculos[k]!.set("velocidad_kmh", fact(8.0, t.texto, "relato"));
        }
      }
    }
  }

  // Maniobras y frenado (las específicas primero: "dar vuelta a la derecha" gana a "se me cerró").
  const generic = new Set(["se_me_cerro", "me_echo_la_lamina", "cambio_carril"]);
  const byGeneric = [...terms].sort((a, b) =>
    cmpKey([generic.has(a.id), a.start], [generic.has(b.id), b.start]),
  );
  for (const t of byGeneric) {
    for (const e of t.efectos) {
      const campo = e.campo;
      if (campo === "vehiculo.maniobra" || campo === "otro.maniobra") {
        let valor = String(e.valor);
        if (valor === "cambio_carril") {
          const tail = folded.slice(t.end, t.end + 25);
          if (tail.includes("derecha")) valor = "cambio_carril_derecha";
          else if (tail.includes("izquierda")) valor = "cambio_carril_izquierda";
        }
        let k =
          campo === "vehiculo.maniobra"
            ? owner(t.start, t.texto)
            : f.vehiculos.length > 1
              ? 1
              : null;
        if (campo === "otro.maniobra" && f.narradorVehiculo !== null) {
          const cands = f.vehiculos.flatMap((_, i) => (i !== f.narradorVehiculo ? [i] : []));
          k = cands.length > 0 ? cands[0]! : null;
        }
        if (k !== null && k < f.vehiculos.length && !f.vehiculos[k]!.has("maniobra")) {
          f.vehiculos[k]!.set("maniobra", fact(valor, t.texto, "relato"));
        }
      } else if (campo === "vehiculo.frenado.aplico") {
        const orig = t.texto;
        let k: number | null;
        if (
          pyre("frenó|frenaron|nunca frenó").search(orig) ||
          ["freno a fondo", "si freno", "alcanzo a frenar"].includes(fold(orig))
        ) {
          const cands = f.vehiculos.flatMap((_, i) => (i !== f.narradorVehiculo ? [i] : []));
          k = cands.length > 0 ? cands[0]! : null;
        } else {
          k = owner(t.start, orig);
        }
        if (k !== null && k < f.vehiculos.length && !f.vehiculos[k]!.has("frenado")) {
          f.vehiculos[k]!.set("frenado", fact(Boolean(e.valor), orig, "relato"));
        }
      }
    }
  }

  // Lugar, entorno, dispositivos, objetos y evento.
  const keymap: Readonly<Record<string, string>> = {
    "lugar.tipo_via": "lugar.tipo_via",
    "lugar.superficie": "lugar.superficie",
    "lugar.estado_superficie": "lugar.estado_superficie",
    "entorno.clima": "entorno.clima",
    "entorno.iluminacion": "entorno.iluminacion",
    "objeto.tipo": "evento.objeto",
  };
  const byAmbiguous = [...terms].sort((a, b) => cmpKey([a.ambiguo, a.start], [b.ambiguo, b.start]));
  for (const t of byAmbiguous) {
    for (const e of t.efectos) {
      const campo = String(e.campo);
      const target = keymap[campo];
      if (target !== undefined && !f.escalares.has(target)) {
        f.escalares.set(target, fact(e.valor, t.texto, "relato"));
      } else if (campo === "dispositivo.tipo" && f.dispositivos.every((d) => d.valor !== e.valor)) {
        f.dispositivos.push(fact(e.valor, t.texto, "relato"));
      }
    }
  }

  // Iluminación por la hora del relato ("8 de la mañana", "19:30 horas").
  if (!f.escalares.has("entorno.iluminacion")) {
    const hm = HOUR.search(folded);
    if (hm) {
      let h = parseInt(hm.group(1)!, 10) % 24;
      const suf = hm.group(3);
      if (
        (suf === "de la tarde" || suf === "de la noche" || suf === "pm" || suf === "p.m.") &&
        h < 12
      ) {
        h += 12;
      }
      const lum = h >= 7 && h < 19 ? "dia" : h >= 19 && h < 20 ? "atardecer" : "noche";
      f.escalares.set("entorno.iluminacion", fact(lum, text.slice(hm.start(), hm.end()), "relato"));
    }
  }
  let ev: Fact | null = null;
  const pedestrian = terms.find((t) => t.efectos.some((x) => x.campo === "persona.rol"));
  const vuelco = terms.find((t) => t.id === "se_volteo");
  const derrape = terms.find((t) => t.id === "derrape");
  const salida = pyre(
    "me sali del camino|se salio del camino|me sali de la carretera|me fui a la cuneta|me fui al barranco",
  ).search(folded);
  const obj = f.escalares.get("evento.objeto");
  const impactWord = pyre(
    String.raw`(?<![a-z])(?:(?:me|le|la|lo|nos|se)\s+(?:\w+\s+)?(?:pego|pegue|pegaron|pegamos|pegaste|dio|di|dieron|` +
      String.raw`impacto|impacte|golpeo|golpee|estampo|estampe|estrello|estrelle|alcanzo|rozo|rayo|choco|` +
      String.raw`chocaron|comi|lleve|arranco|aventaron|avento|echo)|choque|chocamos|chocaron|impactado|` +
      String.raw`impactada|impactando|impactaron|impacto|golpe|golpeado|golpeada|atropelle|atropello|` +
      String.raw`lo arrollo|la arrollo|nos dimos|me fui contra|pegue contra|fuimos a dar contra|` +
      String.raw`fue a dar contra|termine contra|se proyecto contra|un llegue|echo lamina|` +
      String.raw`me la lleve|me lo lleve|me lo comi)(?![a-z])`,
  ).search(folded);
  const slice = (m: PyMatch): string => text.slice(m.start(), m.end());
  if (pedestrian !== undefined && f.vehiculos.length > 0) {
    ev = fact(
      "impacto_vehiculo_persona",
      impactWord
        ? impactWord.group(0)
          ? slice(impactWord)
          : impactWord.group(0)!
        : pedestrian.texto,
      "relato",
    );
    if (!pedestrianNarrator) {
      // el peatón que narra se agrega abajo
      f.personas.push(new Map([["rol", fact("peaton", pedestrian.texto, "relato")]]));
    }
  } else if (obj !== undefined) {
    const cita = impactWord ? slice(impactWord) : String(obj.cita);
    ev = fact("impacto_vehiculo_objeto", cita, "relato");
  } else if (vuelco !== undefined) {
    ev = fact("volcadura", vuelco.texto, "relato");
  } else if (salida !== null) {
    ev = fact("derrape", slice(salida), "relato");
  } else if (f.vehiculos.length >= 2 && impactWord !== null) {
    ev = fact("impacto_vehiculo_vehiculo", slice(impactWord), "relato");
  } else if (derrape !== undefined) {
    ev = fact("derrape", derrape.texto, "relato");
  }
  if (ev !== null) f.escalares.set("evento.tipo", ev);

  // Zonas de impacto (CDC) por frases típicas.
  zones(text, folded, f);

  // Distancias.
  let m = MARKS.search(folded) ?? MARKS2.search(folded);
  if (m) f.escalares.set("evidencias.marcas_m", fact(num(m.group(1)!), slice(m), "relato"));
  m = THROW.search(folded);
  if (m) {
    f.escalares.set(
      "evidencias.distancia_proyeccion_m",
      fact(num(m.group(1)!), slice(m), "relato"),
    );
  }

  // Personas: quien narra, pasajeros, peatón narrador, cinturón y casco.
  const passengerNarr = NARRATOR_PASSENGER.search(folded);
  if (passengerNarr && f.narradorVehiculo === null && f.vehiculos.length > 0) {
    f.personas.unshift(
      new Map([
        ["rol", fact("pasajero", slice(passengerNarr), "relato")],
        ["vehiculo", fact(0, null, "supuesto")],
      ]),
    );
  } else if (f.narradorVehiculo !== null) {
    const nv = vehs[f.narradorVehiculo]!;
    const clase = nv.clase;
    const rol =
      clase === "motocicleta" || clase === "scooter"
        ? "motociclista"
        : clase === "bicicleta"
          ? "ciclista"
          : "conductor";
    const cue = FIRST.search(folded) ?? (nv.narrator ? DECLARANT_VEH.search(folded) : null);
    const cita = cue ? slice(cue) : null;
    f.personas.unshift(
      new Map([
        ["rol", fact(rol, cita, cita ? "relato" : "supuesto")],
        ["vehiculo", fact(f.narradorVehiculo, null, "supuesto")],
      ]),
    );
  } else if (pedestrianNarrator) {
    const pm = pyre("iba cruzando|estaba cruzando|cruzaba la calle|iba caminando").search(folded)!;
    f.personas.unshift(new Map([["rol", fact("peaton", slice(pm), "relato")]]));
  }
  const passengerSpans: [number, number][] = [];
  for (const pm of PASSENGER.finditer(folded)) {
    passengerSpans.push([pm.start(), pm.end()]);
    f.personas.push(
      new Map([
        ["rol", fact("pasajero", slice(pm), "relato")],
        ["vehiculo", fact(f.narradorVehiculo || 0, null, "supuesto")],
      ]),
    );
  }
  if (f.narradorVehiculo !== null && !pedestrianNarrator) {
    for (const pm of PASSENGER_WITH.finditer(folded)) {
      if (passengerSpans.some(([a, b]) => a < pm.end() && pm.start() < b)) continue;
      const n = ({ dos: 2, tres: 3, cuatro: 4 } as Record<string, number>)[pm.group(1) ?? ""] ?? 1;
      for (let r = 0; r < n; r++) {
        f.personas.push(
          new Map([
            ["rol", fact("pasajero", slice(pm), "relato")],
            ["vehiculo", fact(f.narradorVehiculo, null, "supuesto")],
          ]),
        );
      }
    }
  }
  // Quien va en la moto o la bici del otro vehículo ("el de la moto", "un chavo en bici").
  const rider: Readonly<Record<string, string>> = {
    motocicleta: "motociclista",
    scooter: "motociclista",
    bicicleta: "ciclista",
  };
  vehs.forEach((mm, k) => {
    if (k === f.narradorVehiculo || !mm.cita) return;
    const r = rider[mm.clase];
    if (r !== undefined && k < f.vehiculos.length) {
      f.personas.push(
        new Map([
          ["rol", fact(r, mm.cita, "relato")],
          ["vehiculo", fact(k, null, "supuesto")],
        ]),
      );
    }
  });
  for (const t of terms) {
    for (const e of t.efectos) {
      if (e.campo === "persona.cinturon" || e.campo === "persona.casco") {
        const key = String(e.campo).split(".")[1]!;
        const target =
          f.personas.length > 1 && nearPassenger(folded, t.start)
            ? f.personas[f.personas.length - 1]
            : f.personas[0];
        if (target !== undefined && !target.has(key)) {
          target.set(key, fact(Boolean(e.valor), t.texto, "relato"));
        }
      }
    }
  }
  return f;
}

const ZONE_RULES: [PyRe, string | null, string | null][] = [
  // (patrón, lado del narrador, lado del otro)
  [
    new PyRe(
      String.raw`(?:me pegaron|me pego|me dieron|me dio|sentí el golpe|senti el golpe|me alcanzo|me impacto|me golpeo|el golpe)\s+(?:\w+\s+){0,2}por (?:atras|detras)`,
    ),
    "B",
    "F",
  ],
  [
    new PyRe(
      String.raw`(?:le pegue|le di|lo alcance|la alcance|choque)\s+(?:\w+\s+){0,2}por (?:atras|detras)`,
    ),
    "F",
    "B",
  ],
  [new PyRe("por alcance"), "F", "B"],
  [new PyRe(String.raw`(?:le di|le pegue|lo alcance|la alcance)\s+(?:un\s+)?alcance`), "F", "B"],
  [new PyRe(String.raw`(?:me dieron|me dio|me pegaron|me pego)\s+(?:un\s+)?alcance`), "B", "F"],
  [new PyRe("de frente|frente a frente"), "F", "F"],
  [new PyRe("defensas traseras"), "B", "B"],
  [
    new PyRe(
      String.raw`(?:me pego|me dio|me impacto|me pegaron|me golpeo|me rozo)\s+(?:\w+\s+){0,4}(?:puerta del copiloto|lado (?:del )?copiloto|lado derecho|costado derecho|parte de atras del lado derecho)`,
    ),
    "R",
    null,
  ],
  [
    new PyRe(
      String.raw`(?:me pego|me dio|me impacto|me pegaron|me golpeo|me rozo)\s+(?:\w+\s+){0,4}(?:puerta del conductor|lado del conductor|lado izquierdo|costado izquierdo|puerta del lado del conductor)`,
    ),
    "L",
    null,
  ],
  [
    new PyRe(
      String.raw`(?:le pegue|le di|lo golpee|la golpee)\s+(?:\w+\s+){0,4}(?:en la puerta|en el costado|de lado)`,
    ),
    "F",
    null,
  ],
];
const THEIR_PART = new PyRe(
  String.raw`(?<![a-z])(?:su|sus)\s+$|(?<![a-z])(?:le|la|lo)\s+\w+(?:\s+\w+){0,3}\s+(?:en|a|por)\s+(?:la|el|su|sus)?\s*$`,
);
const MY_PART = new PyRe(
  String.raw`(?<![a-z])(?:mi|mis)\s+$|de mi\s+\w+\s+$|(?<![a-z])me\s+\w+(?:\s+\w+){0,4}\s+(?:en|por|de)\s+(?:la|el|mi|mis|las|los)?\s*$`,
);
const WITH_ART = new PyRe(String.raw`(?<![a-z])con\s+(?:la|el|las|los)\s+$`);
const I_HIT = new PyRe(
  String.raw`(?<![a-z])(?:le di|le pegue|pegue|me fui|me estrelle|choque|me lo lleve|me la lleve)(?![a-z])`,
);

function zones(text: string, folded: string, f: Facts): void {
  if (f.vehiculos.length === 0) return;
  const me = f.narradorVehiculo !== null ? f.narradorVehiculo : 0;
  const otherIdx = f.vehiculos.findIndex((_, i) => i !== me);
  const other = otherIdx >= 0 ? otherIdx : null;
  const put = (i: number | null, lado: string, cita: string): void => {
    if (i !== null && !f.zonas.has(i)) f.zonas.set(i, fact(lado, cita, "relato"));
  };
  for (const [rx, mine, theirs] of ZONE_RULES) {
    const m = rx.search(folded);
    if (m) {
      const cita = text.slice(m.start(), m.end());
      if (mine) put(me, mine, cita);
      if (theirs && other !== null) put(other, theirs, cita);
    }
  }
  // Partes del vehículo y de quién son: "me pegó en la cajuela" (quien narra), "con su costado
  // derecho" (el otro), "le di con la defensa" (quien narra).
  for (const m of PARTS.finditer(folded)) {
    const groups = m.groupdict();
    const key = Object.keys(groups).find((k) => groups[k] !== undefined)!;
    const side = PART_SIDE[key]!;
    const [s0] = sentenceBounds(folded, m.start());
    const window = folded.slice(Math.max(s0, m.start() - 45), m.start());
    const cita = text.slice(m.start(), m.end());
    if (THEIR_PART.search(window)) put(other, side, cita);
    else if (MY_PART.search(window) || (WITH_ART.search(window) && I_HIT.search(window))) {
      put(me, side, cita);
    }
  }
}

/** EscenaSpec de la línea base (mismo constructor que la referencia). */
export function extractSpec(text: string, specId = "linea-base"): Record<string, unknown> {
  return buildSpec(extractFacts(text), text, { specId, origen: "escrito", sintetico: false });
}

export type { FactValue };
