/**
 * Cómo se dicen, en los dos idiomas, los valores del contrato (`EscenaSpec` y `Resultado`): tipo
 * de evento, clase de vehículo, maniobra, vía, piso, clima, luz, rol de las personas, fuente de
 * cada dato y parámetros del solver. Lo usan los paneles, la demo y el informe PDF, para que digan
 * lo mismo. El español conserva los textos que ya tenían esos lugares.
 */
import { fixtureTitle, type FixtureName } from "@croquis/scene-schema";
import type { Lang } from "./index";

type Vocab = Record<string, { es: string; en: string }>;

/** Valores del contrato en palabras llanas (hechos del relato). */
export const VALOR: Vocab = {
  impacto_vehiculo_vehiculo: { es: "choque entre vehículos", en: "collision between vehicles" },
  impacto_vehiculo_objeto: { es: "choque contra un objeto", en: "collision with an object" },
  impacto_vehiculo_persona: { es: "golpe a una persona", en: "a person was struck" },
  volcadura: { es: "volcadura", en: "rollover" },
  derrape: { es: "salida del camino", en: "run-off-road" },
  inicio_frenado: { es: "frenón", en: "hard braking" },
  arrastre: { es: "arrastre", en: "dragging" },
  sedan_compacto: { es: "auto compacto", en: "compact car" },
  sedan_mediano: { es: "auto mediano", en: "mid-size car" },
  hatchback: { es: "hatchback", en: "hatchback" },
  suv_compacta: { es: "camioneta SUV compacta", en: "compact SUV" },
  suv_grande: { es: "camioneta SUV grande", en: "large SUV" },
  pickup: { es: "pickup", en: "pickup" },
  van: { es: "van", en: "van" },
  microbus_combi: { es: "combi o microbús", en: "minibus" },
  autobus: { es: "autobús", en: "bus" },
  camion_unitario: { es: "camión de carga", en: "truck" },
  tractocamion: { es: "tráiler", en: "tractor-trailer" },
  motocicleta: { es: "motocicleta", en: "motorcycle" },
  bicicleta: { es: "bicicleta", en: "bicycle" },
  scooter: { es: "scooter", en: "scooter" },
  recto: { es: "seguía recto", en: "going straight" },
  vuelta_izquierda: { es: "vuelta a la izquierda", en: "left turn" },
  vuelta_derecha: { es: "vuelta a la derecha", en: "right turn" },
  vuelta_u: { es: "vuelta en U", en: "U-turn" },
  cambio_carril_izquierda: { es: "cambio de carril a la izquierda", en: "lane change to the left" },
  cambio_carril_derecha: { es: "cambio de carril a la derecha", en: "lane change to the right" },
  reversa: { es: "en reversa", en: "reversing" },
  incorporacion: { es: "incorporándose", en: "merging" },
  detenido: { es: "detenido", en: "stopped" },
  estacionado: { es: "estacionado", en: "parked" },
  recta: { es: "tramo recto", en: "straight road" },
  curva: { es: "curva", en: "curve" },
  interseccion_x: { es: "cruce en X", en: "four-way intersection" },
  interseccion_t: { es: "cruce en T", en: "T intersection" },
  glorieta: { es: "glorieta", en: "roundabout" },
  retorno: { es: "retorno", en: "U-turn bay" },
  estacionamiento: { es: "estacionamiento", en: "parking lot" },
  carretera_dos_carriles: { es: "carretera", en: "two-lane highway" },
  autopista: { es: "autopista", en: "freeway" },
  seco: { es: "seco", en: "dry" },
  mojado: { es: "mojado", en: "wet" },
  encharcado: { es: "encharcado", en: "flooded" },
  grava_suelta: { es: "grava suelta", en: "loose gravel" },
  despejado: { es: "despejado", en: "clear" },
  nublado: { es: "nublado", en: "cloudy" },
  lluvia_ligera: { es: "lluvia ligera", en: "light rain" },
  lluvia_fuerte: { es: "lluvia fuerte", en: "heavy rain" },
  niebla: { es: "niebla", en: "fog" },
  granizo: { es: "granizo", en: "hail" },
  dia: { es: "de día", en: "daytime" },
  amanecer: { es: "amanecer", en: "dawn" },
  atardecer: { es: "atardecer", en: "dusk" },
  noche_con_alumbrado: { es: "noche con alumbrado", en: "night with street lighting" },
  noche_sin_alumbrado: { es: "noche sin alumbrado", en: "night without street lighting" },
  conductor: { es: "conductor", en: "driver" },
  pasajero: { es: "pasajero", en: "passenger" },
  peaton: { es: "peatón", en: "pedestrian" },
  ciclista: { es: "ciclista", en: "cyclist" },
  motociclista: { es: "motociclista", en: "motorcyclist" },
};

/** Clase de vehículo en los resultados (nombres técnicos, como en el informe). */
export const CLASE: Vocab = {
  sedan_compacto: { es: "sedán compacto", en: "compact sedan" },
  sedan_mediano: { es: "sedán mediano", en: "mid-size sedan" },
  hatchback: { es: "hatchback", en: "hatchback" },
  suv_compacta: { es: "SUV compacta", en: "compact SUV" },
  suv_grande: { es: "SUV grande", en: "large SUV" },
  pickup: { es: "pickup", en: "pickup" },
  van: { es: "van", en: "van" },
  microbus_combi: { es: "microbús o combi", en: "minibus" },
  autobus: { es: "autobús", en: "bus" },
  camion_unitario: { es: "camión unitario", en: "single-unit truck" },
  tractocamion: { es: "tractocamión", en: "tractor-trailer" },
  motocicleta: { es: "motocicleta", en: "motorcycle" },
  bicicleta: { es: "bicicleta", en: "bicycle" },
  scooter: { es: "scooter", en: "scooter" },
};

/** De dónde salió un dato (`procedencia.fuente`). */
export const FUENTE: Vocab = {
  relato: { es: "del relato", en: "from the narrative" },
  usuario: { es: "tu respuesta", en: "your answer" },
  supuesto: { es: "supuesto", en: "assumed" },
  default: { es: "por omisión", en: "default" },
  mapa: { es: "del mapa", en: "from the map" },
};

/** Parámetros del solver. */
export const PARAM: Vocab = {
  friccion_llanta: { es: "Fricción llanta–pavimento", en: "Tire–road friction" },
  restitucion_vehiculo_vehiculo: {
    es: "Restitución entre vehículos",
    en: "Vehicle–vehicle restitution",
  },
  relacion_impulso_tangencial: { es: "Fricción en el contacto", en: "Contact friction" },
  arrastre_post_impacto: {
    es: "Arrastre después del impacto (fracción de μ)",
    en: "Post-impact drag (fraction of μ)",
  },
  factor_abs: { es: "Factor de frenado con ABS", en: "ABS braking factor" },
  aproximacion_previa_s: {
    es: "Tiempo de aproximación mostrado (s)",
    en: "Approach time shown (s)",
  },
  velocidad_peaton: { es: "Velocidad al caminar (m/s)", en: "Walking speed (m/s)" },
  friccion_cuerpo_suelo: { es: "Fricción cuerpo–suelo", en: "Body–ground friction" },
  factor_proyeccion_jinete: {
    es: "Factor de proyección del jinete",
    en: "Rider projection factor",
  },
  friccion_moto_caida: { es: "Arrastre de la moto caída", en: "Downed motorcycle drag" },
  altura_cg_volcadura: {
    es: "Altura del centro de masa (fracción del alto)",
    en: "Center of mass height (fraction of height)",
  },
  altura_ojo: { es: "Altura del ojo del conductor (m)", en: "Driver eye height (m)" },
  alcance_deteccion_nocturna: {
    es: "Alcance de detección con luces bajas (m)",
    en: "Detection range with low beams (m)",
  },
};

/** Tipo de fuente de un parámetro. */
export const TIPO_PARAM: Vocab = {
  primaria: { es: "fuente primaria", en: "primary source" },
  secundaria: { es: "fuente secundaria", en: "secondary source" },
  supuesto: { es: "supuesto", en: "assumption" },
  relato: { es: "del relato", en: "from the narrative" },
  medido: { es: "medido", en: "measured" },
};

/** Busca un valor en un vocabulario; si no está, lo deja legible (sin guiones bajos). */
export function palabra(vocab: Vocab, valor: unknown, lang: Lang): string {
  const s = String(valor ?? "—");
  return vocab[s]?.[lang] ?? s.replaceAll("_", " ");
}

/** Solo el español de un vocabulario, para los lugares que aún reciben `Record<string, string>`. */
export function soloEs(vocab: Vocab): Record<string, string> {
  return Object.fromEntries(Object.entries(vocab).map(([k, v]) => [k, v.es]));
}

/** Títulos de las escenas canónicas en inglés (en español, los de cada escena: `meta.titulo`). */
export const TITULO_ESCENA_EN: Record<FixtureName, string> = {
  alcance: "Rear-end collision on Paseo Tollocan at a red light",
  lateral_interseccion: "Side collision at a signalized intersection (downtown Toluca)",
  frontal_curva: "Head-on collision on a curve of the road to Temoaya",
  peaton_cruce: "Pedestrian hit on a crosswalk at dusk",
  motociclista: "Left turn in front of a motorcycle",
  objeto_fijo_arbol: "Running off the road into a tree on a curve",
  poste: "Crash into a concrete pole at night on a wet road",
  volcadura: "Large SUV rollover on the México-Toluca freeway",
  nocturno_lluvia: "A minibus cutting in at night in heavy rain",
  glorieta: "Entering a roundabout without yielding",
  interseccion_toluca: "Side collision at Carranza and Juárez (Toluca, OpenStreetMap street)",
  carambola: "Chain collision on Paseo Tollocan at a red light",
};

/** Título de una escena canónica en el idioma de la página. */
export function tituloEscena(name: FixtureName, lang: Lang): string {
  return lang === "en" ? TITULO_ESCENA_EN[name] : fixtureTitle(name);
}
