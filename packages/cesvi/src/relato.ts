/**
 * El relato antes y después de leerlo (W2 del plan v4; observaciones O1 y O5 de quienes usaron
 * Croquis):
 *
 * - **Antes de llamar al modelo:** `revisarRelato` ve si el texto tiene contenido real, no solo
 *   longitud. Si no, no se gasta API.
 * - **Vocabulario mexicano:** `vehiculosMencionados` reconoce cómo se nombra a los vehículos aquí
 *   (combi, pesero, vocho, torton, pipa…) y `conVocabulario` le pone a cada vehículo de la lectura su
 *   mención y, si la lectura no trae su clase, la más cercana como supuesto declarado.
 * - **Lo mínimo para reconstruir:** `minimoParaReconstruir` dice si la escena leída alcanza.
 *
 * Todo es determinista y sin red.
 */
import type { Expediente, FilaCorpus, SalidaCorpus } from "./corpus";
import type { SupuestoDeclarado } from "./supuestos";

// --- ¿El relato tiene contenido? ----------------------------------------------------------------

/** Un relato de ejemplo, para el mensaje cuando el texto no alcanza. */
export const EJEMPLO_RELATO =
  "En el cruce de Av. Reforma y calle Azucena, el vehículo A (sedán) circulaba al norte y fue impactado en su costado derecho por el vehículo B (pickup), que venía del oriente. A quedó a 6 m del punto de impacto.";

/** Palabras que casi cualquier frase en español lleva: sin ninguna, no es un relato. */
const FUNCIONALES = new Set(
  "el la los las un una unos unas de del al a en con por para que se su sus y o lo le fue era es no si como cuando donde contra sobre hacia desde entre".split(
    " ",
  ),
);
/** Abreviaturas sin vocal que sí son contenido. */
const ABREVIATURAS = new Set(["km", "kg", "cm", "m", "mts", "hrs", "h", "n", "s", "v"]);

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Si una palabra parece una palabra: con vocales y sin tiras de letras imposibles en español. */
export function palabraReconocible(palabra: string): boolean {
  const p = sinAcentos(palabra.toLowerCase());
  if (ABREVIATURAS.has(p) || FUNCIONALES.has(p)) return true;
  if (p.length < 2 || p.length > 23) return false;
  if (!/[aeiou]/.test(p)) return false;
  if (/(.)\1\1/.test(p)) return false; // «gggg», «aaaa»
  if (/[^aeiou]{5,}/.test(p)) return false; // cinco consonantes seguidas
  if (/[aeiou]{4,}/.test(p)) return false;
  return true;
}

export type MotivoRelato = "corto" | "simbolos" | "sin_palabras" | "repetido" | "sin_frases";

export interface RevisionRelato {
  suficiente: boolean;
  motivo?: MotivoRelato;
  /** Para el perito, amable y con qué hacer. */
  mensaje?: string;
  /** Lo que se midió, para las pruebas y para explicar el resultado. */
  medidas: {
    palabras: number;
    reconocibles: number;
    distintas: number;
    funcionales: number;
    letras: number;
  };
}

const MENSAJES: Record<MotivoRelato, string> = {
  corto: "El relato es muy corto para leerlo.",
  simbolos: "El texto tiene más símbolos y números que palabras.",
  sin_palabras: "Croquis no reconoce palabras en el texto.",
  repetido: "El texto repite lo mismo y no cuenta qué pasó.",
  sin_frases: "El texto no parece contar un hecho: le faltan frases.",
};

/** Lo mínimo de un relato: palabras distintas reconocibles y alguna palabra de enlace. */
export const MIN_PALABRAS_RELATO = 6;

/**
 * Revisa que el relato tenga contenido real: proporción de palabras reconocibles, repetición y
 * letras contra símbolos. No juzga si alcanza para reconstruir (eso es `minimoParaReconstruir`).
 */
export function revisarRelato(texto: string): RevisionRelato {
  const t = texto.trim();
  const visibles = t.replace(/\s/g, "");
  const letras = (visibles.match(/\p{L}/gu) ?? []).length;
  const palabras = t.match(/\p{L}+/gu) ?? [];
  const minus = palabras.map((p) => sinAcentos(p.toLowerCase()));
  const reconocibles = minus.filter(palabraReconocible);
  const distintas = new Set(reconocibles).size;
  const funcionales = new Set(minus.filter((p) => FUNCIONALES.has(p))).size;
  const medidas = {
    palabras: palabras.length,
    reconocibles: reconocibles.length,
    distintas,
    funcionales,
    letras,
  };
  const no = (motivo: MotivoRelato): RevisionRelato => ({
    suficiente: false,
    motivo,
    mensaje: `${MENSAJES[motivo]} Cuenta qué vehículos participaron, cómo chocaron y dónde. Por ejemplo: «${EJEMPLO_RELATO}»`,
    medidas,
  });
  if (palabras.length < MIN_PALABRAS_RELATO)
    return no(letras < visibles.length * 0.5 ? "simbolos" : "corto");
  if (letras < visibles.length * 0.6) return no("simbolos");
  if (reconocibles.length < palabras.length * 0.7) return no("sin_palabras");
  if (distintas < MIN_PALABRAS_RELATO || distintas < reconocibles.length * 0.25)
    return no("repetido");
  if (funcionales < 2) return no("sin_frases");
  return { suficiente: true, medidas };
}

// --- Vocabulario mexicano de vehículos ----------------------------------------------------------

type Clase = NonNullable<Expediente["vehiculos"][number]["clase"]>;

interface EntradaVocabulario {
  /** Cómo se escribe, sin acentos y en minúsculas (expresión regular). */
  patron: string;
  /** La clase de `vehicle_classes.json`; sin ella, la palabra solo marca la mención. */
  clase?: Clase;
  /** Si la clase es la suya, o solo la más cercana (entonces va como supuesto declarado). */
  exacta?: boolean;
  /** Si manda sobre la clase que diga la lectura. */
  manda?: boolean;
  /** Por qué esa clase, cuando es la más cercana. */
  nota?: string;
}

/**
 * Cómo se nombra a los vehículos en México y su clase en `vehicle_classes.json`. Los nombres
 * comerciales («Lobo», «Tsuru») no van aquí: se quedan como texto del modelo. La excepción es
 * «urvan», que aquí se usa como nombre de la van de pasajeros.
 */
export const VOCABULARIO_VEHICULOS: readonly EntradaVocabulario[] = [
  { patron: "combis?", clase: "microbus_combi", exacta: true },
  { patron: "peser[oa]s?", clase: "microbus_combi", exacta: true },
  { patron: "microbus(?:es)?", clase: "microbus_combi", exacta: true },
  { patron: "micros?", clase: "microbus_combi", exacta: true },
  { patron: "urvans?", clase: "van", exacta: true },
  { patron: "tortons?", clase: "camion_unitario", exacta: true },
  { patron: "rabon(?:es)?", clase: "camion_unitario", exacta: true },
  { patron: "trailers?", clase: "tractocamion", exacta: true },
  { patron: "tractocamion(?:es)?", clase: "tractocamion", exacta: true },
  {
    patron: "voch(?:o|ito)s?",
    clase: "sedan_compacto",
    exacta: false,
    nota: "un vocho es un sedán compacto de dos puertas",
  },
  {
    patron: "pipas?",
    clase: "camion_unitario",
    exacta: false,
    nota: "una pipa es un camión cisterna; no hay clase propia",
  },
  {
    patron: "(?:camion(?:es)? de )?volteos?",
    clase: "camion_unitario",
    exacta: false,
    nota: "un volteo es un camión de caja basculante; no hay clase propia",
  },
  {
    patron: "motonetas?",
    clase: "motocicleta",
    exacta: false,
    manda: true,
    nota: "una motoneta es una moto ligera con motor; la clase «scooter» es el patín eléctrico",
  },
  {
    patron: "taxis?",
    clase: "sedan_compacto",
    exacta: false,
    nota: "la mayoría de los taxis son sedanes compactos",
  },
  { patron: "pick ?-?ups?", clase: "pickup", exacta: true },
  { patron: "hatchbacks?", clase: "hatchback", exacta: true },
  { patron: "autobus(?:es)?", clase: "autobus", exacta: true },
  { patron: "motocicletas?", clase: "motocicleta", exacta: true },
  { patron: "motos?", clase: "motocicleta", exacta: true },
  { patron: "bicicletas?", clase: "bicicleta", exacta: true },
  { patron: "vans?", clase: "van", exacta: true },
  // Palabras que nombran a un vehículo sin decir su clase: solo marcan la mención.
  { patron: "sedan(?:es)?" },
  { patron: "camionetas?" },
  { patron: "camion(?:es)?" },
  { patron: "automovil(?:es)?" },
  { patron: "autos?" },
  { patron: "coches?" },
  { patron: "carros?" },
  { patron: "suvs?" },
];

export interface MencionVehiculo {
  /** Dónde está en el texto. */
  ini: number;
  fin: number;
  /** Tal como está escrita. */
  texto: string;
  /** La palabra del vocabulario, sin acentos. */
  palabra: string;
  clase?: Clase;
  exacta: boolean;
  manda: boolean;
  nota?: string;
}

/** Las menciones de vehículos en el texto, en su orden. Una palabra dentro de otra no cuenta dos veces. */
export function vehiculosMencionados(texto: string): MencionVehiculo[] {
  // Mismo largo que el texto: cada letra acentuada pasa a su letra sola.
  const plano = [...texto].map((c) => (sinAcentos(c)[0] ?? c).toLowerCase()).join("");
  const out: MencionVehiculo[] = [];
  for (const e of VOCABULARIO_VEHICULOS) {
    for (const m of plano.matchAll(new RegExp(`(?<![a-z0-9])(?:${e.patron})(?![a-z0-9])`, "g"))) {
      const ini = m.index;
      const fin = ini + m[0].length;
      if (out.some((o) => ini < o.fin && fin > o.ini)) continue;
      out.push({
        ini,
        fin,
        texto: texto.slice(ini, fin),
        palabra: m[0],
        ...(e.clase ? { clase: e.clase } : {}),
        exacta: e.exacta ?? false,
        manda: e.manda ?? false,
        ...(e.nota ? { nota: e.nota } : {}),
      });
    }
  }
  return out.sort((a, b) => a.ini - b.ini);
}

/** La mención de un vehículo de la lectura, y si su clase quedó como supuesto. */
export interface MencionLeida extends MencionVehiculo {
  vehiculo: string;
  /** La clase que se puso por el vocabulario, si la lectura no la traía o la palabra manda. */
  claseSupuesta?: Clase;
}

/**
 * Le pone a cada vehículo de la lectura su mención en el relato y, si hace falta, su clase:
 *
 * 1. La mención dentro de la cita de su clase que coincide con esa clase (o con su modelo).
 * 2. Si no, la primera mención libre dentro de sus citas.
 * 3. Si la lectura lo nombra sin darle ni una fila propia (pasa con «taxi»), las menciones libres, en
 *    su orden.
 *
 * Con la mención, un vehículo sin clase recibe la del vocabulario: exacta, o la más cercana como
 * supuesto declarado. La salida no se modifica: se devuelve una copia.
 */
export function conVocabulario(
  s: SalidaCorpus,
  narracion: string,
): { salida: SalidaCorpus; menciones: MencionLeida[] } {
  const todas = vehiculosMencionados(narracion);
  const ids = new Set<string>();
  for (const d of s.datos) {
    if (d.vehiculo !== "ninguno") ids.add(d.vehiculo);
    if (d.seccion === "impacto" && (d.campo === "participante" || d.campo === "contacto")) {
      const v = /^V\d+/.exec(d.valor)?.[0];
      if (v) ids.add(v);
    }
  }
  const orden = [...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const filasDe = (v: string) =>
    s.datos.filter((d) => d.seccion === "vehiculo" && d.vehiculo === v);
  const tramos = (filas: FilaCorpus[]) =>
    filas
      .map((d) => {
        const i = d.cita ? narracion.indexOf(d.cita) : -1;
        return i < 0 ? null : ([i, i + d.cita.length] as const);
      })
      .filter((x): x is readonly [number, number] => x !== null);
  const dentro = (m: MencionVehiculo, ts: readonly (readonly [number, number])[]) =>
    ts.some(([a, b]) => m.ini >= a && m.fin <= b);
  const tomadas = new Set<MencionVehiculo>();
  const palabrasTomadas = new Set<string>();
  const asignada = new Map<string, MencionVehiculo>();
  const tomar = (v: string, m: MencionVehiculo | undefined) => {
    if (!m) return;
    asignada.set(v, m);
    tomadas.add(m);
    palabrasTomadas.add(m.palabra);
  };
  const libre = (m: MencionVehiculo) => !tomadas.has(m) && !palabrasTomadas.has(m.palabra);

  // 1. Por la clase o el modelo que dice la lectura.
  for (const v of orden) {
    const filas = filasDe(v);
    const clase = filas.find((d) => d.campo === "clase");
    const modelo = sinAcentos(filas.find((d) => d.campo === "modelo")?.valor.toLowerCase() ?? "");
    const ts = tramos(filas);
    tomar(
      v,
      todas.find(
        (m) =>
          libre(m) &&
          dentro(m, ts) &&
          ((clase && m.clase === clase.valor) || (modelo !== "" && m.palabra === modelo)),
      ),
    );
  }
  // 2. La primera libre dentro de sus citas.
  for (const v of orden) {
    if (asignada.has(v)) continue;
    const ts = tramos(filasDe(v));
    tomar(
      v,
      todas.find((m) => libre(m) && dentro(m, ts)),
    );
  }
  // 3. Los que la lectura nombra sin filas propias: las menciones libres, en su orden.
  for (const v of orden) {
    if (asignada.has(v) || filasDe(v).some((d) => d.cita && narracion.includes(d.cita))) continue;
    tomar(v, todas.find(libre));
  }

  const datos = s.datos.map((d) => ({ ...d }));
  const menciones: MencionLeida[] = [];
  for (const v of orden) {
    const m = asignada.get(v);
    if (!m) continue;
    const fila = datos.find(
      (d) => d.seccion === "vehiculo" && d.vehiculo === v && d.campo === "clase",
    );
    let claseSupuesta: Clase | undefined;
    if (m.clase && (!fila || (m.manda && fila.valor !== m.clase))) {
      if (fila) fila.valor = m.clase;
      else
        datos.push({
          seccion: "vehiculo",
          n: Number(v.slice(1)),
          vehiculo: v as FilaCorpus["vehiculo"],
          campo: "clase",
          valor: m.clase,
          cita: "",
        });
      if (!m.exacta) claseSupuesta = m.clase;
    }
    menciones.push({ ...m, vehiculo: v, ...(claseSupuesta ? { claseSupuesta } : {}) });
  }
  return { salida: { datos }, menciones };
}

const NOMBRE_CLASE: Record<string, string> = {
  sedan_compacto: "sedán compacto",
  sedan_mediano: "sedán mediano",
  hatchback: "hatchback",
  suv_compacta: "SUV compacta",
  suv_grande: "SUV grande",
  pickup: "pickup",
  van: "van",
  microbus_combi: "microbús o combi",
  autobus: "autobús",
  camion_unitario: "camión unitario",
  tractocamion: "tractocamión",
  motocicleta: "motocicleta",
  bicicleta: "bicicleta",
  scooter: "scooter",
};

/** Las clases que salieron del vocabulario sin ser exactas, como supuestos declarados. */
export function supuestosDeClase(menciones: readonly MencionLeida[]): SupuestoDeclarado[] {
  return menciones
    .filter((m) => m.claseSupuesta)
    .map((m) => ({
      clave: `clase-${m.vehiculo}`,
      que: `Clase de ${m.vehiculo}`,
      valor: NOMBRE_CLASE[m.claseSupuesta!] ?? m.claseSupuesta!,
      vehiculo: m.vehiculo,
      justificacion: `El relato dice «${m.texto}»: ${m.nota ?? "se toma la clase más cercana"}.`,
      incertidumbre:
        "La clase da las medidas, la masa típica y la rigidez; si no es esta, cámbiala en su pregunta.",
    }));
}

// --- Lo mínimo para reconstruir -----------------------------------------------------------------

export interface MinimoReconstruir {
  /** «nada»: no se puede seguir. «parcial»: se sigue con preguntas y supuestos. */
  nivel: "nada" | "parcial" | "completo";
  /** Lo que falta, dicho para el perito. */
  faltan: string[];
  tiene: { vehiculo: boolean; otroActor: boolean; impacto: boolean; lugar: boolean };
}

/**
 * Lo mínimo para reconstruir (W2 del plan v4): un vehículo y otro actor (vehículo, peatón u objeto),
 * el tipo de impacto o la zona de contacto, y el lugar o su confirmación en el mapa.
 *
 * Sin vehículo no hay nada que reconstruir. Con vehículo, lo que falte se puede preguntar o suponer.
 */
export function minimoParaReconstruir(
  e: Expediente,
  o: { lugarEnMapa?: boolean; narracion?: string | null } = {},
): MinimoReconstruir {
  const impactos = e.impactos ?? [];
  const vehiculo = e.vehiculos.length >= 1;
  const otroActor =
    e.vehiculos.length >= 2 ||
    impactos.some((i) => Boolean(i.objeto_fijo)) ||
    (e.caso.modalidades ?? []).some((m) => m === "atropellamiento" || m === "objeto_fijo") ||
    /\b(peat[oó]n|ciclista|poste|[aá]rbol|muro|barda|barrera)\b/i.test(o.narracion ?? "");
  const impacto =
    (e.caso.modalidades ?? []).length > 0 ||
    (e.danos ?? []).some((d) => !d.dano_previo && Boolean(d.zona?.cara)) ||
    impactos.some((i) => (i.zonas ?? []).length > 0 || i.fuente !== "supuesto");
  const l = e.caso.lugar;
  const lugar =
    Boolean(o.lugarEnMapa) ||
    Boolean(l?.via?.valor ?? l?.municipio?.valor ?? l?.estado?.valor ?? l?.descripcion?.valor);
  const tiene = { vehiculo, otroActor, impacto, lugar };
  const faltan = [
    ...(vehiculo ? [] : ["qué vehículo participó"]),
    ...(otroActor ? [] : ["contra qué o contra quién chocó"]),
    ...(impacto ? [] : ["cómo fue el impacto o en qué zona"]),
    ...(lugar ? [] : ["dónde fue"]),
  ];
  const nivel = !vehiculo ? "nada" : faltan.length ? "parcial" : "completo";
  return { nivel, faltan, tiene };
}
