/**
 * La escena rehecha desde cero (René, 2026-11-05, tras la prueba con personas T4): una pregunta a
 * la vez, Croquis propone primero desde la narración y la persona confirma con un toque. Aquí va
 * la lógica sin interfaz, para probarla sola:
 *
 * - lo que Croquis lee de la narración: el cruce, el sentido de cada vehículo y su color, cada uno
 *   con la frase de donde sale (nada se inventa: si no lo dice, no hay propuesta);
 * - lo que sale de las calles de OpenStreetMap: el cruce más probable, una flecha por cada calle que
 *   llega al choque y el ajuste a la calle más cercana;
 * - los pasos (el choque, luego cada vehículo: por dónde venía y dónde quedó) y el resumen final;
 * - cada respuesta convertida en el mismo expediente de antes (posiciones, rumbos y la bandera de
 *   supuesto): el solver no cambia.
 *
 * Rumbos en grados desde el norte, en sentido horario (0 = norte, 90 = este), como el expediente.
 */
import { interpretarLugar } from "./lugar-texto";
import { leerCarretera } from "./buscadores/carretera-narrada";
import {
  formato as F,
  avanzar,
  conObjetosNarrados,
  conPosicion,
  distanciaM,
  distanciaProyeccion,
  enMetros,
  agregarPersona,
  marcarFinalPersona,
  moverPersona,
  nombrePersona,
  OBJETO_PERSONA,
  posesDeImpacto,
  rumboDeLlegada,
  rumboDeMarcha,
  rumboDelFrente,
  objetosDe,
  piezasTerreno,
  rumboDeg,
  usaRelieve,
  limiteDeLaVia,
  limiteDelLugarNarrado,
  medidasDe,
  agregarOndulacion,
  agregarTope,
  agregarZona,
  type Expediente,
  type LonLat,
  type TipoObjeto,
  type TipoSuperficie,
  type TopeNorma,
} from "@croquis/cesvi";
import {
  HIGHWAY_RANK,
  type OsmNode,
  type OsmWay,
  type OverpassResponse,
} from "@croquis/croquis-2d";

type Id = Expediente["vehiculos"][number]["id"];
export interface Punto {
  lat: number;
  lon: number;
}

export const normalizar = (r: number) => ((r % 360) + 360) % 360;
const difAngulo = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const ll = (p: Punto): LonLat => [p.lon, p.lat];
const punto = ([lon, lat]: readonly [number, number]): Punto => ({ lat, lon });

// --- Texto: lo que dice la narración --------------------------------------------------------------

/** Minúsculas y sin acentos, para comparar nombres. */
export function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const PREFIJOS =
  /^(calle|c\.|avenida|av\.?|avda\.?|boulevard|blvd\.?|bulevar|calzada|calz\.?|carretera|privada|priv\.?|prolongacion|prol\.?|andador|circuito|camino|paseo|eje)\s+/;

/** El nombre de una calle para compararlo: sin acentos, sin «Calle», «Av.» y similares. */
export function nombreComparable(s: string): string {
  let t = sinAcentos(s).replace(/\s+/g, " ").trim();
  for (let k = 0; k < 2; k++) t = t.replace(PREFIJOS, "");
  return t.replace(/^(de|del|la|las|los|el)\s+/, "").trim();
}

/** Recorta una cita larga alrededor de lo que importa, con «…». */
export function citaCorta(oracion: string, foco: string, max = 90): string {
  if (oracion.length <= max) return oracion;
  const i = Math.max(0, oracion.indexOf(foco));
  const ini = Math.max(0, i - Math.floor((max - foco.length) / 2));
  const fin = Math.min(oracion.length, ini + max);
  return `${ini > 0 ? "… " : ""}${oracion.slice(ini, fin).trim()}${fin < oracion.length ? " …" : ""}`;
}

// El tipo de vía en mayúscula o minúscula (con «Viaducto», «Anillo», «Autopista», «Libramiento» y
// «Glorieta», revisión de la cadena 2026-11-24); el nombre, con mayúscula (la expresión no lleva «i»: con
// ella, «calle Azucena esquina con Av» se tragaba las palabras en minúscula).
const TIPO_VIA =
  "(?:[Cc]alle|[Aa]venida|[Aa]v\\.?|[Bb]oulevard|[Bb]lvd\\.?|[Bb]ulevar|[Cc]alzada|[Cc]arretera|[Pp]rivada|[Pp]rolongaci[oó]n|[Pp]erif[eé]rico|[Cc]ircuito|[Cc]amino|[Pp]aseo|[Ee]je|[Vv]iaducto|[Aa]nillo|[Aa]utopista|[Ll]ibramiento|[Gg]lorieta)";
const PALABRA_NOMBRE = "[A-ZÁÉÍÓÚÑ0-9][\\wÁÉÍÓÚÑáéíóúñ.'-]*";
const UNION = "(?:\\s+(?:de|del|la|las|los|el)\\s+|\\s+)";
const RE_CALLE = new RegExp(
  // «Avenida de los Insurgentes Sur», «Calzada de Tlalpan»: los artículos pueden ir antes del nombre.
  `\\b(${TIPO_VIA})\\s+((?:(?:de|del)\\s+(?:la\\s+|las\\s+|los\\s+|el\\s+)?)?${PALABRA_NOMBRE}(?:${UNION}${PALABRA_NOMBRE}){0,3})`,
  "g",
);

/** Las calles que nombra la narración («la Calle Azucena», «Av. Juárez»), en orden y sin repetir. */
export function callesNarradas(narracion: string): { nombre: string; en: number }[] {
  const out: { nombre: string; en: number }[] = [];
  for (const m of narracion.matchAll(RE_CALLE)) {
    // «… y la Calle Jazmín»: el nombre se corta en una palabra minúscula que no sea de unión.
    // «por la Calle 16 de Septiembre de Poniente a Oriente»: el sentido no es parte del nombre.
    const nombre = `${m[1]!} ${m[2]!}`
      .replace(/[.,;:]+$/, "")
      .replace(new RegExp(`\\s+del?\\s+${PUNTO}$`, "i"), "")
      .trim();
    if (!out.some((x) => nombreComparable(x.nombre) === nombreComparable(nombre)))
      out.push({ nombre, en: m.index ?? 0 });
  }
  return out;
}

/**
 * La carretera que dice la narración, para buscarla si la lectura no trajo el lugar (revisión de la
 * cadena, René 2026-11-24: un reporte de CESVI decía «en el kilómetro 77 de la carretera
 * Pijijiapan–Tonalá» y la lectura grabada no lo guardó). Solo si el buscador la reconoce como
 * carretera (con su número, su kilómetro o sus poblaciones).
 */
export function carreteraNarrada(narracion: string): string | null {
  const m =
    /(?:\b(?:km\.?|kil[oó]metro)\s*\d{1,4}(?:\s*\+\s*\d{1,3})?\s+(?:de\s+la|del)\s+)?\b(?:carretera|autopista|tramo\s+carretero)\b[^.;\n]{3,110}?(?=,\s+(?:en\s+el\s+estado|el\s+d[ií]a|a\s+las)\b|[.;\n]|$)/i.exec(
      narracion,
    );
  if (!m) return null;
  const texto = m[0].trim();
  return interpretarLugar(texto).tipo === "carretera" ? texto : null;
}

/** El cruce que dice la narración: dos calles y la frase donde aparecen; null si no nombra dos. */
export function cruceNarrado(narracion: string): { calles: [string, string]; cita: string } | null {
  const cs = callesNarradas(narracion);
  if (cs.length < 2) return null;
  const [a, b] = cs as [{ nombre: string; en: number }, { nombre: string; en: number }];
  // De unas palabras antes de la primera calle al final de la segunda (las abreviaturas como «Av.»
  // cortaban la oración en dos).
  let ini = Math.max(0, a.en - 28);
  if (ini > 0) ini = narracion.indexOf(" ", ini) + 1 || ini;
  const fin = b.en + b.nombre.length;
  const cita = narracion.slice(ini, fin).replace(/\s+/g, " ").trim();
  return {
    calles: [a.nombre, b.nombre],
    cita: `${ini > 0 ? "… " : ""}${cita}${fin < narracion.length ? " …" : ""}`,
  };
}

export type Cardinal =
  "norte" | "noreste" | "este" | "sureste" | "sur" | "suroeste" | "oeste" | "noroeste";
const CARDINALES: readonly Cardinal[] = [
  "norte",
  "noreste",
  "este",
  "sureste",
  "sur",
  "suroeste",
  "oeste",
  "noroeste",
];
/** El punto cardinal más cercano a un rumbo (8 rumbos). */
export const cardinal = (rumbo: number): Cardinal =>
  CARDINALES[Math.round(normalizar(rumbo) / 45) % 8]!;

const RUMBO_DE: Record<string, number> = {
  norte: 0,
  noreste: 45,
  nororiente: 45,
  este: 90,
  oriente: 90,
  sureste: 135,
  suroriente: 135,
  sur: 180,
  suroeste: 225,
  surponiente: 225,
  oeste: 270,
  poniente: 270,
  noroeste: 315,
  norponiente: 315,
};
const PUNTO =
  "(norte|sur|oriente|poniente|este|oeste|noreste|noroeste|sureste|suroeste|nororiente|norponiente|suroriente|surponiente)";

/** Lo que dice la narración del sentido de un vehículo: hacia dónde iba y la frase. */
export interface SentidoNarrado {
  /** Hacia dónde avanzaba (rumbo). */
  rumbo: number;
  /** De dónde venía («sur» en «de sur a norte»). */
  desde: Cardinal;
  cita: string;
}

/**
 * El sentido de un vehículo según la narración, buscado en las oraciones que lo nombran (por su
 * marca, su modelo o su letra): «circulaba de sur a norte», «con dirección al poniente», «sentido
 * norte-sur». null si no lo dice.
 */
/**
 * Lo que una oración dice de un vehículo (René, 2026-11-26: «el vehículo A … que circulaba por la
 * Avenida de la Compañía de Sur a Norte, y el vehículo B … que circulaba por la Calle 16 de Septiembre
 * de Poniente a Oriente» le daba al B el sentido y la calle del A). Desde la primera vez que lo nombra
 * hasta que nombra a otro vehículo («el vehículo B»); si lo nombra antes que a cualquier otro, desde el
 * principio («De sur a norte circulaba el vehículo A, …»). Sin acentos, como la buscan los lectores.
 */
export function tramoDelVehiculo(oracion: string, nombres: readonly string[]): string {
  const [desde, hasta] = rangoDelVehiculo(oracion, nombres);
  return sinAcentos(oracion).slice(desde, hasta);
}

/** Dónde empieza y dónde termina `tramoDelVehiculo` en la oración (mismas posiciones sin acentos). */
export function rangoDelVehiculo(oracion: string, nombres: readonly string[]): [number, number] {
  const t = sinAcentos(oracion);
  const mios = nombres
    .filter((n) => n.trim())
    .map((n) => new RegExp(`\\b${escapar(sinAcentos(n))}\\b`, "g"));
  const enMi = (i: number) =>
    mios.some((r) => {
      r.lastIndex = 0;
      const m = r.exec(t.slice(i));
      return m?.index === 0;
    });
  let inicio = Infinity;
  for (const r of mios) {
    r.lastIndex = 0;
    const m = r.exec(t);
    if (m) inicio = Math.min(inicio, m.index);
  }
  if (!Number.isFinite(inicio)) return [0, t.length];
  const otros = [...t.matchAll(/\bvehiculo\s+[a-z]\b/g)]
    .map((m) => m.index)
    .filter((i) => !enMi(i));
  const antes = otros.filter((i) => i < inicio);
  const despues = otros.filter((i) => i > inicio);
  return [antes.length ? inicio : 0, despues.length ? Math.min(...despues) : t.length];
}

export function sentidoNarrado(
  narracion: string,
  nombres: readonly string[],
): SentidoNarrado | null {
  const oraciones = narracion.split(/(?<=[.;])\s+/);
  const nombra = (o: string) =>
    nombres.some(
      (n) => n.trim() && new RegExp(`\\b${escapar(sinAcentos(n))}\\b`).test(sinAcentos(o)),
    );
  for (const o of oraciones.filter(nombra)) {
    const t = tramoDelVehiculo(o, nombres);
    const deA = new RegExp(`\\bde(?:l)?\\s+${PUNTO}\\s+(?:a|al|hacia(?: el)?)\\s+${PUNTO}\\b`).exec(
      t,
    );
    const guion = new RegExp(`\\bsentido\\s+${PUNTO}\\s*[-–]\\s*${PUNTO}\\b`).exec(t);
    const par = deA ?? guion;
    if (par) {
      const rumbo = normalizar(rumboEntreCardinales(par[1]!, par[2]!));
      return { rumbo, desde: cardinal(rumbo + 180), cita: citaDe(o, par[0]) };
    }
    const hacia = new RegExp(
      `\\b(?:hacia|rumbo\\s+al?|con\\s+(?:direccion|rumbo)\\s+al?|en\\s+direccion\\s+al?|direccion)\\s+(?:el\\s+)?${PUNTO}\\b`,
    ).exec(t);
    if (hacia) {
      const rumbo = RUMBO_DE[hacia[1]!]!;
      return { rumbo, desde: cardinal(rumbo + 180), cita: citaDe(o, hacia[0]) };
    }
  }
  return null;
}

function rumboEntreCardinales(de: string, a: string): number {
  // «de sur a norte»: avanza hacia el norte (si los dos son opuestos o no, manda el destino).
  return RUMBO_DE[a] ?? normalizar((RUMBO_DE[de] ?? 0) + 180);
}

/** La cita textual de la oración original para lo que se encontró en su versión sin acentos. */
function citaDe(oracion: string, hallado: string): string {
  const i = sinAcentos(oracion).indexOf(hallado);
  const original = i >= 0 ? oracion.slice(i, i + hallado.length) : hallado;
  return citaCorta(oracion.trim().replace(/[.;]$/, ""), original, 100);
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Los colores de carrocería que se reconocen en la narración, con su color de pantalla. */
const COLORES: Record<string, { nombre: string; css: string }> = {
  rojo: { nombre: "rojo", css: "#D92D20" },
  roja: { nombre: "rojo", css: "#D92D20" },
  azul: { nombre: "azul", css: "#2563EB" },
  blanco: { nombre: "blanco", css: "#F8FAFC" },
  blanca: { nombre: "blanco", css: "#F8FAFC" },
  negro: { nombre: "negro", css: "#1F2937" },
  negra: { nombre: "negro", css: "#1F2937" },
  gris: { nombre: "gris", css: "#6B7280" },
  plata: { nombre: "plata", css: "#A8B0BA" },
  plateado: { nombre: "plata", css: "#A8B0BA" },
  plateada: { nombre: "plata", css: "#A8B0BA" },
  verde: { nombre: "verde", css: "#16A34A" },
  amarillo: { nombre: "amarillo", css: "#EAB308" },
  amarilla: { nombre: "amarillo", css: "#EAB308" },
  // El naranja de la pantalla es solo del choque: un coche naranja va en un ámbar oscuro.
  naranja: { nombre: "naranja", css: "#B45309" },
  cafe: { nombre: "café", css: "#7C4A2D" },
  guinda: { nombre: "guinda", css: "#7F1D1D" },
  vino: { nombre: "vino", css: "#7F1D1D" },
  morado: { nombre: "morado", css: "#7C3AED" },
  morada: { nombre: "morado", css: "#7C3AED" },
  dorado: { nombre: "dorado", css: "#B8860B" },
  dorada: { nombre: "dorado", css: "#B8860B" },
  beige: { nombre: "beige", css: "#D6C7A1" },
  arena: { nombre: "arena", css: "#D6C7A1" },
};

/** La paleta cuando la narración no dice el color: azul, morado, verde, gris (nunca naranja). */
export const PALETA_VEHICULOS = ["#2563EB", "#7C3AED", "#16A34A", "#6B7280"] as const;

/**
 * El color de un vehículo según la narración: una palabra de color a menos de cuatro palabras de
 * su nombre («un Jetta rojo», «el Camaro color gris»). null si no lo dice.
 */
export function colorNarrado(
  narracion: string,
  nombres: readonly string[],
): { nombre: string; css: string; cita: string } | null {
  const t = sinAcentos(narracion);
  for (const n of nombres.filter((x) => x.trim())) {
    // Hasta cinco palabras después, también tras comas («Jetta, modelo 2002, color azul»).
    const re = new RegExp(`\\b${escapar(sinAcentos(n))}\\b((?:[\\s,;:]+[\\wñ]+){0,5})`, "g");
    for (const m of t.matchAll(re)) {
      const palabras = m[1]!.split(/[\s,;:]+/).filter(Boolean);
      const c = palabras.find((p) => COLORES[p]);
      if (c) {
        const i = m.index ?? 0;
        const cita = narracion.slice(i, i + m[0].length).trim();
        return { ...COLORES[c]!, cita };
      }
    }
  }
  return null;
}

// --- Calles: lo que sale de OpenStreetMap --------------------------------------------------------

/** Una calle del mapa: su nombre (o null), sus puntos y su ancho estimado (m). */
export interface Calle {
  id: number;
  nombre: string | null;
  puntos: LonLat[];
  ancho: number;
  /** `lanes` y `width` de OSM tal como vienen (para el ancho que dibuja el 3D, `viaWidthM`). */
  carriles?: number;
  anchoOsm?: number;
  /** El ancho del acotamiento de OSM (`shoulder:width`), en m, si lo trae (René, 2026-11-27). */
  acotamiento?: number;
  /** Ids de sus nodos, en orden (para los cruces). */
  nodos: number[];
  /** Su tipo de OpenStreetMap (`highway`) y su límite (`maxspeed`), si lo trae (ronda 4). */
  tipo?: string;
  maxspeed?: string;
  /** Su número de carretera de OSM (`ref`: «MEX 134»), si lo trae. */
  ref?: string;
  /**
   * De un solo sentido (`oneway` de OSM, o una glorieta): 1 en el orden de sus nodos, -1 al revés.
   * Sin el campo, de doble sentido.
   */
  unSentido?: 1 | -1;
}

/** El ancho del acotamiento de una vía de OSM (m): `shoulder:width` o sus variantes; null sin él. */
export function acotamientoDeTags(tags: Record<string, string> | undefined): number | null {
  const t =
    tags?.["shoulder:width"] ?? tags?.["shoulder:right:width"] ?? tags?.["shoulder:both:width"];
  const v = Number.parseFloat(t ?? "");
  return Number.isFinite(v) && v > 0.3 && v <= 6 ? v : null;
}

/** Las calles de una respuesta de Overpass: las que se dibujan (sin andadores ni ciclovías). */
export function callesDe(resp: OverpassResponse | null): Calle[] {
  if (!resp) return [];
  const nodos = new Map<number, OsmNode>();
  for (const e of resp.elements) if (e.type === "node") nodos.set((e as OsmNode).id, e as OsmNode);
  const out: Calle[] = [];
  for (const e of resp.elements) {
    if (e.type !== "way") continue;
    const w = e as OsmWay;
    const tipo = w.tags?.highway;
    if (!tipo || HIGHWAY_RANK[tipo] === undefined) continue;
    const puntos = w.nodes.flatMap((id) => {
      const n = nodos.get(id);
      return n ? [[n.lon, n.lat] as LonLat] : [];
    });
    if (puntos.length < 2) continue;
    const carriles = Number.parseInt(w.tags?.lanes ?? "", 10);
    const ancho = Number.parseFloat(w.tags?.width ?? "");
    out.push({
      id: w.id,
      nombre: w.tags?.name ?? null,
      puntos,
      ancho:
        Number.isFinite(ancho) && ancho >= 3 && ancho <= 60
          ? ancho
          : (Number.isFinite(carriles) && carriles > 0 ? carriles : 2) * 3.3,
      ...(Number.isFinite(carriles) && carriles > 0 ? { carriles } : {}),
      ...(Number.isFinite(ancho) && ancho >= 3 && ancho <= 60 ? { anchoOsm: ancho } : {}),
      ...(acotamientoDeTags(w.tags) !== null ? { acotamiento: acotamientoDeTags(w.tags)! } : {}),
      nodos: w.nodes.filter((id) => nodos.has(id)),
      tipo,
      ...(w.tags?.maxspeed ? { maxspeed: w.tags.maxspeed } : {}),
      ...(w.tags?.ref ? { ref: w.tags.ref } : {}),
      ...(w.tags?.oneway === "-1"
        ? { unSentido: -1 as const }
        : /^(?:yes|true|1)$/.test(w.tags?.oneway ?? "") ||
            (w.tags?.junction === "roundabout" && w.tags?.oneway !== "no")
          ? { unSentido: 1 as const }
          : {}),
    });
  }
  return out;
}

/** El punto de una calle más cercano a `p`, su distancia (m), el rumbo de la calle y el tramo. */
export function sobreCalle(
  c: Calle,
  p: Punto,
): { punto: Punto; distancia: number; rumbo: number; tramo: number; t: number } {
  const origen = ll(p);
  let mejor = { punto: p, distancia: Infinity, rumbo: 0, tramo: 0, t: 0 };
  for (let i = 0; i + 1 < c.puntos.length; i++) {
    const a = enMetros(c.puntos[i]!, origen);
    const b = enMetros(c.puntos[i + 1]!, origen);
    const dx = b.este - a.este;
    const dy = b.norte - a.norte;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, -(a.este * dx + a.norte * dy) / l2));
    const x = a.este + t * dx;
    const y = a.norte + t * dy;
    const d = Math.hypot(x, y);
    if (d < mejor.distancia) {
      const q = avanzar(origen, normalizar((Math.atan2(x, y) * 180) / Math.PI), d);
      mejor = {
        punto: punto(q),
        distancia: d,
        rumbo: normalizar((Math.atan2(dx, dy) * 180) / Math.PI),
        tramo: i,
        t,
      };
    }
  }
  return mejor;
}

/** Hasta qué distancia (m) un toque se ajusta a la calle más cercana. */
export const AJUSTE_CALLE_M = 30;

/**
 * El toque ajustado a la calle más cercana (a menos de `AJUSTE_CALLE_M`): el punto sobre su eje,
 * su rumbo y su nombre. null si no hay calle cerca (o no hay calles).
 */
export function ajustarACalle(
  calles: readonly Calle[],
  p: Punto,
  alcance = AJUSTE_CALLE_M,
): { punto: Punto; rumbo: number; calle: Calle; distancia: number } | null {
  let mejor: { punto: Punto; rumbo: number; calle: Calle; distancia: number } | null = null;
  for (const c of calles) {
    const s = sobreCalle(c, p);
    if (s.distancia <= alcance && (!mejor || s.distancia < mejor.distancia))
      mejor = { punto: s.punto, rumbo: s.rumbo, calle: c, distancia: s.distancia };
  }
  return mejor;
}

/** Un cruce del mapa: su punto y los nombres de sus calles (sin repetir). */
export interface Cruce {
  punto: Punto;
  calles: string[];
}

/**
 * ¿El nombre del mapa es la calle narrada? Por sus palabras que la distinguen («Viaducto Miguel
 * Alemán» es «Viaducto Presidente Miguel Alemán Valdés»): todas las de la más corta están en la otra,
 * o por inclusión del nombre completo.
 */
export function mismaCalleNarrada(delMapa: string, narradaComparable: string): boolean {
  const x = nombreComparable(delMapa);
  const b = narradaComparable;
  if (x === b || x.includes(b) || b.includes(x)) return true;
  const palabras = (s: string) =>
    s.split(/\s+/).filter((w) => w.length > 2 && !/^(?:de|del|la|las|los|el|y)$/.test(w));
  const pa = palabras(x);
  const pb = palabras(b);
  const [corta, larga] = pa.length <= pb.length ? [pa, new Set(pb)] : [pb, new Set(pa)];
  return corta.length >= 2 && corta.every((w) => larga.has(w));
}

/** Los cruces: nodos que comparten dos o más calles distintas. */
export function crucesDe(calles: readonly Calle[]): Cruce[] {
  const porNodo = new Map<number, { punto: LonLat; calles: Set<Calle> }>();
  for (const c of calles)
    c.nodos.forEach((id, k) => {
      const e = porNodo.get(id) ?? { punto: c.puntos[k]!, calles: new Set<Calle>() };
      e.calles.add(c);
      porNodo.set(id, e);
    });
  const out: Cruce[] = [];
  for (const e of porNodo.values()) {
    if (e.calles.size < 2) continue;
    const nombres = [...new Set([...e.calles].map((c) => c.nombre ?? "").filter(Boolean))];
    // Dos tramos de la misma calle no son un cruce, ni una avenida con su lateral o su enlace sin
    // nombre (`*_link`): la camioneta de aud-05 iba por Solidaridad Las Torres y La escena la ponía
    // en el enlace, porque su unión con la avenida parecía un cruce (revisión de la cadena).
    const vias = [...e.calles].filter((c) => c.nombre || !/_link$/.test(c.tipo ?? ""));
    const distintas = new Set(vias.map((c) => c.nombre ?? `#${c.id}`)).size;
    if (distintas < 2) continue;
    out.push({ punto: punto(e.punto), calles: nombres });
  }
  return out;
}

/** Lo que Croquis propone para el choque, de dónde sale y la frase de la narración si la hay. */
export interface PropuestaChoque {
  punto: Punto;
  /** Las calles del cruce en el mapa. */
  calles: string[];
  /**
   * «narracion»: el cruce de las dos calles que nombra; «una_calle»: solo una de ellas está en el
   * mapa y se propone su cruce más cercano; «cercania»: el cruce más cercano al lugar.
   */
  segun: "narracion" | "una_calle" | "cercania" | "a_la_altura" | "carretera";
  cita: string | null;
  /** La calle de la narración que sí está (en «una_calle») y la que no se encontró. */
  encontrada?: string;
  faltante?: string;
}

/**
 * El cruce que propone Croquis para el choque: el de las dos calles que nombra la narración (el más
 * cercano al lugar del caso); si solo coincide una, el cruce de esa calle más cercano; si no, el
 * cruce más cercano al lugar (a menos de 150 m). null si no hay calles o ningún cruce cerca.
 */
export function proponerChoque(
  calles: readonly Calle[],
  narracion: string | null,
  lugar: Punto | null,
): PropuestaChoque | null {
  const cruces = crucesDe(calles);
  if (!cruces.length) return null;
  const narrado = narracion ? cruceNarrado(narracion) : null;
  const cerca = (c: Cruce) => (lugar ? distanciaM(ll(c.punto), ll(lugar)) : 0);
  const porCercania = [...cruces].sort((a, b) => cerca(a) - cerca(b));
  if (narrado) {
    const buscadas = narrado.calles.map(nombreComparable);
    const tiene = (c: Cruce, b: string) => c.calles.some((n) => mismaCalleNarrada(n, b));
    const ambas = porCercania.find((c) => buscadas.every((b) => tiene(c, b)));
    if (ambas)
      return { punto: ambas.punto, calles: ambas.calles, segun: "narracion", cita: narrado.cita };
    // Un paso a desnivel (el Viaducto bajo Insurgentes) no comparte nodo: el choque va sobre la
    // primera calle narrada («sobre X, a la altura de Y»), en su punto más cercano a la segunda, si
    // pasan a menos de 60 m (revisión de la cadena, René 2026-11-24).
    const sobre = calles.filter((c) => c.nombre && mismaCalleNarrada(c.nombre, buscadas[0]!));
    const otra = calles.filter((c) => c.nombre && mismaCalleNarrada(c.nombre, buscadas[1]!));
    let alto: { m: number; punto: LonLat; a: string; b: string } | null = null;
    for (const a of sobre)
      for (const p of a.puntos)
        for (const b of otra)
          for (const q of b.puntos) {
            const d = enMetros(p, q);
            const m = Math.hypot(d.este, d.norte);
            if (!alto || m < alto.m) alto = { m, punto: p, a: a.nombre!, b: b.nombre! };
          }
    if (alto && alto.m <= 60)
      return {
        punto: punto(alto.punto),
        calles: [alto.a, alto.b],
        segun: "a_la_altura",
        cita: narrado.cita,
      };
    const una = porCercania.find((c) => buscadas.some((b) => tiene(c, b)));
    if (una) {
      const k = buscadas.findIndex((b) => tiene(una, b));
      return {
        punto: una.punto,
        calles: una.calles,
        segun: "una_calle",
        cita: narrado.cita,
        encontrada: narrado.calles[k]!,
        faltante: narrado.calles[1 - k]!,
      };
    }
  }
  // La narración nombra una carretera y ningún cruce (René, 2026-11-28: «sobre la carretera
  // Hermosillo–Bahía de Kino, a la altura del poblado Miguel Alemán» quedó en «Calle Yucatán», una calle
  // del pueblo): el choque va SOBRE esa carretera, en su punto más cercano al lugar, nunca en otra calle.
  const carretera = !narrado && narracion && lugar ? leerCarretera(narracion) : null;
  if (carretera) {
    const suyas = calles.filter((c) => esLaCarretera(c, carretera));
    const a = suyas.length ? ajustarACalle(suyas, lugar!, 3000) : null;
    if (a)
      return {
        punto: a.punto,
        calles: [a.calle.nombre ?? a.calle.ref ?? "la carretera"],
        segun: "carretera",
        cita: /\b(?:sobre|en)\s+la\s+(?:carretera|autopista)[^,.;]*/i.exec(narracion!)?.[0] ?? null,
      };
  }
  const primero = porCercania[0]!;
  if (lugar && cerca(primero) > 150) return null;
  return { punto: primero.punto, calles: primero.calles, segun: "cercania", cita: null };
}

/**
 * ¿Esta vía del mapa es la carretera narrada? Por su número (`ref` «MEX 134», «MEX-134», «134») o por
 * su tramo en el nombre («Carretera Hermosillo - Bahía de Kino»), sin acentos ni mayúsculas.
 */
export function esLaCarretera(
  c: Calle,
  v: { ref: string | null; tramo: [string, string] | null },
): boolean {
  const numero = v.ref ? /\d+\s*D?$/i.exec(v.ref)?.[0].replace(/\s/g, "").toUpperCase() : null;
  if (numero && c.ref) {
    const refs = c.ref
      .split(/[;,]/)
      .map((r) => /\d+\s*D?$/i.exec(r.trim())?.[0].replace(/\s/g, "").toUpperCase());
    if (refs.includes(numero)) return true;
  }
  if (v.tramo && c.nombre) {
    const n = sinAcentos(c.nombre).toLowerCase();
    if (v.tramo.every((t) => n.includes(sinAcentos(t).toLowerCase()))) return true;
  }
  return false;
}

/** Una flecha: por dónde pudo llegar un vehículo al choque. */
export interface Flecha {
  /** Hacia dónde avanzaba el vehículo al llegar (rumbo). */
  rumbo: number;
  /** De dónde venía («Del sur»). */
  desde: Cardinal;
  /** Por qué calle (null si no hay calles del mapa o la calle no tiene nombre). */
  calle: string | null;
  /** Dónde va la flecha en el mapa: sobre la calle, antes del choque. */
  en: Punto;
}

/** A qué distancia (m) del choque se dibuja cada flecha. */
export const DISTANCIA_FLECHA_M = 22;
/** El orden de las vías de OpenStreetMap, de más a menos importante (para las flechas encimadas). */
const JERARQUIA: Record<string, number> = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  tertiary: 4,
  unclassified: 5,
  residential: 5,
};

/** Los metros de la calle junto al choque que dan el rumbo de llegada (su dirección local). */
const TRAMO_DEL_RUMBO_M = 6;

/**
 * Las flechas de llegada al choque: una por cada calle que llega (los dos lados de una calle que
 * pasa, uno si termina ahí), con su punto cardinal y su nombre; las que difieren menos de 25° cuentan
 * una vez. Sin calles cerca, las cuatro de los puntos cardinales.
 */
export function flechasDeLlegada(calles: readonly Calle[], choque: Punto): Flecha[] {
  const out: Flecha[] = [];
  // Entre flechas casi iguales (dos calzadas paralelas) se queda la de la calle que pasa por el
  // choque (a menos de su medio ancho y 4 m), con nombre antes que sin él, y la más cercana.
  // Con varias vías encimadas en el mismo nodo (el Periférico, su segundo piso y sus enlaces), la de
  // más jerarquía; un enlace (`*_link`) al final.
  const orden = (x: { c: Calle; s: { distancia: number } }) =>
    (x.s.distancia <= x.c.ancho / 2 + 4 ? 0 : 20) +
    (x.c.nombre ? 0 : 10) +
    (JERARQUIA[(x.c.tipo ?? "").replace(/_link$/, "")] ?? 6) +
    (/_link$/.test(x.c.tipo ?? "") ? 5 : 0);
  const cerca = calles
    .map((c) => ({ c, s: sobreCalle(c, choque) }))
    .filter((x) => x.s.distancia <= 25)
    .sort((a, b) => orden(a) - orden(b) || a.s.distancia - b.s.distancia);
  for (const { c, s } of cerca) {
    // Los dos brazos desde el punto más cercano: hacia el inicio y hacia el final de la calle.
    for (const haciaFinal of [true, false]) {
      const brazo = puntoDelBrazo(c, s.tramo, s.t, haciaFinal, DISTANCIA_FLECHA_M);
      if (!brazo) continue;
      // El rumbo es el de la calle junto al choque (los últimos metros del brazo), no la línea del
      // brazo al choque: con el choque a 10–15 m del eje (una avenida de dos calzadas, el choque en la
      // calzada de su sentido) esa línea cruzaba la calle de 25° a 35° y el vehículo quedaba atravesado
      // en su carril (revisión de la cadena, René 2026-11-25).
      const cerca6 = puntoDelBrazo(c, s.tramo, s.t, haciaFinal, TRAMO_DEL_RUMBO_M) ?? brazo;
      const salida = rumboDeg(ll(s.punto), ll(cerca6));
      const rumbo = normalizar(salida + 180);
      if (out.some((f) => difAngulo(f.rumbo, rumbo) < 25)) continue;
      out.push({ rumbo, desde: cardinal(salida), calle: c.nombre, en: brazo });
    }
  }
  if (out.length) return out.sort((a, b) => normalizar(a.rumbo) - normalizar(b.rumbo));
  return [0, 90, 180, 270].map((rumbo) => ({
    rumbo,
    desde: cardinal(rumbo + 180),
    calle: null,
    en: punto(avanzar(ll(choque), normalizar(rumbo + 180), DISTANCIA_FLECHA_M)),
  }));
}

/**
 * «Por dónde venía» con un toque en el mapa (René, 2026-11-22): sin calles del mapa, la escena pide
 * «Marcar en el mapa» y el toque no hacía nada. El vehículo venía del punto tocado hacia el choque;
 * la calle, si el toque cae sobre una.
 */
export function flechaDelToque(calles: readonly Calle[], choque: Punto, p: Punto): Flecha {
  const salida = rumboDeg(ll(choque), ll(p));
  return {
    rumbo: normalizar(salida + 180),
    desde: cardinal(salida),
    calle: ajustarACalle(calles, p)?.calle.nombre ?? null,
    en: p,
  };
}

/** El punto a `d` m del choque a lo largo de la calle, en un sentido; null si la calle no llega. */
function puntoDelBrazo(
  c: Calle,
  tramo: number,
  t: number,
  haciaFinal: boolean,
  d: number,
): Punto | null {
  const pts = c.puntos;
  const a = pts[tramo]!;
  const b = pts[tramo + 1]!;
  let actual: LonLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  let falta = d;
  let i = haciaFinal ? tramo + 1 : tramo;
  while (i >= 0 && i < pts.length) {
    const sig = pts[i]!;
    const l = distanciaM(actual, sig);
    if (l >= falta) {
      const f = falta / (l || 1);
      return punto([actual[0] + (sig[0] - actual[0]) * f, actual[1] + (sig[1] - actual[1]) * f]);
    }
    falta -= l;
    actual = sig;
    i += haciaFinal ? 1 : -1;
  }
  // La calle termina antes: si avanzó al menos 8 m, la flecha va al final.
  return d - falta >= 8 ? punto(actual) : null;
}

/** La flecha que propone Croquis: la del sentido narrado; si no, la más cercana al rumbo dado. */
export function flechaPropuesta(
  flechas: readonly Flecha[],
  sentido: SentidoNarrado | null,
  rumboPorContacto: number | null,
): number {
  const objetivo = sentido?.rumbo ?? rumboPorContacto;
  if (objetivo === null || !flechas.length) return -1;
  let mejor = -1;
  let d = Infinity;
  flechas.forEach((f, i) => {
    const x = difAngulo(f.rumbo, objetivo);
    if (x < d) {
      d = x;
      mejor = i;
    }
  });
  // Una flecha que contradice el sentido narrado no se propone (revisión de la cadena, René
  // 2026-11-24: el March «de norte a sur» quedaba «de este a oeste» porque en el lugar no había otra
  // calle): sin ella, el vehículo va como dice la narración y el perito revisa el lugar.
  if (sentido && d > FLECHA_CONTRA_NARRADO_DEG) return -1;
  return mejor;
}

/** Grados: más que esto entre la flecha de una calle y el sentido narrado, la flecha no se propone. */
export const FLECHA_CONTRA_NARRADO_DEG = 60;

/** ¿La flecha elegida va en contra de lo que dice la narración (más de 100°)? */
export const contraNarracion = (rumbo: number, sentido: SentidoNarrado | null) =>
  sentido !== null && difAngulo(rumbo, sentido.rumbo) > 100;

/** «Del sur, por Calle Jazmín». */
export const textoFlecha = (f: Flecha) => `Del ${f.desde}${f.calle ? `, por ${f.calle}` : ""}`;

/** «de sur a norte», para los avisos. */
export const textoSentido = (s: SentidoNarrado) => `de ${s.desde} a ${cardinal(s.rumbo)}`;

/**
 * ¿Un coche quedó fuera de la calle? Su centro a más de medio ancho de la calle más cercana y un
 * metro. Sin calles del mapa no se puede saber (false).
 */
export function fueraDeLaCalle(calles: readonly Calle[], p: Punto): boolean {
  if (!calles.length) return false;
  let fuera = true;
  for (const c of calles) {
    const s = sobreCalle(c, p);
    if (s.distancia <= c.ancho / 2 + 1) fuera = false;
  }
  return fuera;
}

/** El choque lejos de cualquier calle (más de `AJUSTE_CALLE_M`), cuando hay calles. */
export const choqueLejosDeCalles = (calles: readonly Calle[], p: Punto) =>
  calles.length > 0 && ajustarACalle(calles, p) === null;

/** El rumbo de la calle en `p` en el sentido más parecido a `preferido` (o el de la calle). */
export function rumboAlineado(calles: readonly Calle[], p: Punto, preferido: number): number {
  const a = ajustarACalle(calles, p, 40);
  if (!a) return normalizar(preferido);
  const r = a.rumbo;
  return difAngulo(r, preferido) <= difAngulo(r + 180, preferido)
    ? normalizar(r)
    : normalizar(r + 180);
}

// --- Vehículos: nombre y color ---------------------------------------------------------------------

type Vehiculo = Expediente["vehiculos"][number];

/**
 * Marca y modelo, como los escribe el perito: «Mazda 3», «Volkswagen Jetta». Si el modelo ya trae la
 * marca, va una vez; con uno solo, ese. Nunca el modelo solo cuando hay marca (René, 2026-11-18: «A · 3»).
 */
export function marcaYModelo(
  marca: string | null | undefined,
  modelo: string | null | undefined,
): string {
  const ma = marca?.trim() ?? "";
  const mo = modelo?.trim() ?? "";
  if (ma && mo) return mo.toLowerCase().startsWith(ma.toLowerCase()) ? mo : `${ma} ${mo}`;
  return mo || ma;
}

/** Cómo se llama un vehículo en pantalla: marca y modelo («Mazda 3»); nunca «V1». */
export function nombreVehiculo(v: Vehiculo, todos: readonly Vehiculo[] = [v]): string {
  const de = (x: Vehiculo) => marcaYModelo(x.marca?.valor, x.modelo?.valor);
  const base = de(v) || `Vehículo ${letra(v, todos)}`;
  const repetido = todos.filter((x) => de(x) === base).length;
  return repetido > 1 ? `${base} ${letra(v, todos)}` : base;
}

const letra = (v: Vehiculo, todos: readonly Vehiculo[]) =>
  String.fromCharCode(
    65 +
      Math.max(
        0,
        todos.findIndex((x) => x.id === v.id),
      ),
  );

/**
 * Las palabras con que la narración puede nombrar a un vehículo, de la más a la menos precisa:
 * modelo, marca, «vehículo A» (por su orden) y su id.
 */
export const nombresDe = (v: Vehiculo, todos: readonly Vehiculo[] = [v]): string[] =>
  [v.modelo?.valor, v.marca?.valor, `vehículo ${letra(v, todos)}`, String(v.id)].filter(
    (x): x is string => Boolean(x?.trim()),
  );

/** El color de cada vehículo: el de la narración, o el de la paleta por orden. */
export function coloresVehiculos(
  vehiculos: readonly Vehiculo[],
  narracion: string | null,
): Record<string, { css: string; nombre: string | null; cita: string | null }> {
  const out: Record<string, { css: string; nombre: string | null; cita: string | null }> = {};
  let k = 0;
  for (const v of vehiculos) {
    const c = narracion ? colorNarrado(narracion, nombresDe(v, vehiculos)) : null;
    out[v.id] = c
      ? { css: c.css, nombre: c.nombre, cita: c.cita }
      : { css: PALETA_VEHICULOS[k++ % PALETA_VEHICULOS.length]!, nombre: null, cita: null };
  }
  return out;
}

// --- Pasos ---------------------------------------------------------------------------------------

/** Un impacto que se marca en el mapa (de `impactosAColocar`). */
export interface ImpactoAColocar {
  orden: number;
  vehiculos: string[];
}

/**
 * Lo que la persona contestó en las preguntas de C1 (W3), además de lo que queda en el expediente:
 * «No sé dónde fue el primer golpe», «No chocó contra nada más» y «Listo» en los puntos de paso.
 */
export interface RespuestasC1 {
  /**
   * La escena llegó completa (un dictamen importado, un caso guardado): las tres preguntas no se
   * hacen solas, pero siguen disponibles en el avance para marcar algo.
   */
  omitidas?: boolean;
  golpeNoSe?: boolean;
  choquesListos?: boolean;
  pasosListos?: boolean;
  /** C3 (W5): «¿Cómo es el terreno?» ya se contestó (liso, o con lo que quedó marcado). */
  terrenoListo?: boolean;
}

export type PasoEscena =
  | { tipo: "choque"; orden: number; hecho: boolean }
  /**
   * C1: «¿Dónde fue el primer golpe?», «¿Chocó contra algo más?» y «¿Sabes por dónde pasó?». C3
   * (W5): «¿Cómo es el terreno?».
   */
  | { tipo: "golpe" | "otros" | "paso" | "terreno"; hecho: boolean }
  | {
      tipo: "vehiculo";
      vehiculo: string;
      /** ¿Ya dijo por dónde venía (o «No sé»)? */
      direccion: boolean;
      /** ¿Ya dijo dónde quedó (o «No sé»)? */
      final: boolean;
      hecho: boolean;
    };

const posicionesDe = (e: Expediente) =>
  e.versiones?.find((v) => v.tipo === "evidencia")?.posiciones ?? [];
export const poseDe = (e: Expediente, v: string, fase: "impacto" | "final" | "inicial") =>
  posicionesDe(e).find((p) => p.vehiculo === v && p.fase === fase) ?? null;

/**
 * Los pasos de la escena, en orden: cada choque (uno en dos vehículos; en una carambola, uno por
 * impacto) y, por cada vehículo en el orden de los impactos, por dónde venía y dónde quedó.
 */
/** Si el expediente ya trae algo del terreno marcado (no solo el relieve real que pidió la narración). */
export function terrenoMarcado(e: Expediente): boolean {
  const t = e.terreno;
  return Boolean(t?.superficies?.length || t?.ondulaciones?.length || t?.topes?.length);
}

export function pasosEscena(
  e: Expediente,
  impactos: readonly ImpactoAColocar[],
  s: {
    desconocidos: readonly string[];
    direccionesNoSe: readonly string[];
    /** Con esto, después de los vehículos van las tres preguntas de C1 (W3). */
    c1?: RespuestasC1;
  },
): PasoEscena[] {
  const choques: PasoEscena[] = impactos.map((i) => ({
    tipo: "choque",
    orden: i.orden,
    hecho: i.vehiculos.every((v) => poseDe(e, v, "impacto")),
  }));
  const orden = [
    ...new Set([...impactos.flatMap((i) => i.vehiculos), ...e.vehiculos.map((v) => String(v.id))]),
  ];
  const vehiculos: PasoEscena[] = orden.map((v) => {
    const imp = poseDe(e, v, "impacto");
    const direccion = Boolean(imp && (imp.fuente !== "supuesto" || s.direccionesNoSe.includes(v)));
    const final = Boolean(poseDe(e, v, "final")) || s.desconocidos.includes(v);
    return { tipo: "vehiculo", vehiculo: v, direccion, final, hecho: direccion && final };
  });
  if (!s.c1) return [...choques, ...vehiculos];
  // C1: lo que ya está marcado en el expediente también cuenta como contestado (un caso que se
  // vuelve a abrir no repite la pregunta).
  const omitidas = s.c1.omitidas === true;
  const c1: PasoEscena[] = [
    { tipo: "golpe", hecho: omitidas || Boolean(primerGolpe(e)) || s.c1.golpeNoSe === true },
    {
      tipo: "otros",
      hecho: omitidas || s.c1.choquesListos === true || choquesIntermedios(e).length > 0,
    },
    {
      tipo: "paso",
      hecho: omitidas || s.c1.pasosListos === true || puntosDePaso(e).length > 0,
    },
    {
      tipo: "terreno",
      // Lo marcado (zonas, ondulaciones, topes) cuenta como contestado; el relieve real que pide la
      // narración («con pendiente») no: el perito todavía tiene que poder marcar el tope que narró
      // (René, 2026-11-21: la reversa perdía su tope en la t5c).
      hecho: omitidas || s.c1.terrenoListo === true || terrenoMarcado(e),
    },
  ];
  return [...choques, ...vehiculos, ...c1];
}

// --- C1 (W3): el primer golpe, los choques contra algo más y los puntos de paso ------------------

type Impacto = NonNullable<Expediente["impactos"]>[number];
type IdVehiculo = Expediente["vehiculos"][number]["id"];

/** Los objetos contra los que se puede chocar después del primer golpe, como los ve el perito. */
export const OBJETOS_C1 = [
  { id: "poste", texto: "Poste", con: "un poste" },
  { id: "pared", texto: "Pared o muro", con: "una pared" },
  { id: "árbol", texto: "Árbol", con: "un árbol" },
  { id: "barrera", texto: "Barrera", con: "una barrera" },
  { id: "guarnición", texto: "Guarnición", con: "la guarnición" },
  { id: "señal", texto: "Señal", con: "una señal" },
  { id: "vehículo estacionado", texto: "Vehículo estacionado", con: "un vehículo estacionado" },
] as const;

const elPrimero = (e: Expediente): Impacto | null => {
  const orden = [...(e.impactos ?? [])].sort((a, b) => a.orden - b.orden);
  return orden.find((i) => i.orden === 1) ?? orden[0] ?? null;
};

/** Dónde marcó el perito el primer golpe; null si no lo ha marcado. */
export function primerGolpe(e: Expediente): Punto | null {
  const i = elPrimero(e);
  return i?.punto && !i.objeto_fijo ? i.punto : null;
}

/**
 * «¿Dónde fue el primer golpe?»: el punto del primer contacto. Va en el primer impacto del
 * expediente (se crea con los vehículos del choque si el caso no traía impactos): es evidencia
 * medida y entra a la reconstrucción.
 */
export function marcarPrimerGolpe(
  e: Expediente,
  impactos: readonly ImpactoAColocar[],
  p: Punto,
): Expediente {
  const primero = elPrimero(e);
  if (primero && !primero.objeto_fijo) {
    return {
      ...e,
      impactos: (e.impactos ?? []).map((i) => (i === primero ? { ...i, punto: p } : i)),
    };
  }
  const vehiculos = (impactos[0]?.vehiculos ?? []) as IdVehiculo[];
  return {
    ...e,
    impactos: [{ orden: 1, vehiculos, punto: p, fuente: "perito" }, ...(e.impactos ?? [])],
  };
}

export interface ChoqueIntermedio {
  orden: number;
  vehiculo: string;
  objeto: string;
  punto: Punto;
  /**
   * El objeto lo nombra la narración y el perito no lo marcó: Croquis lo pone donde quedó el vehículo
   * (René, 2026-11-28). El texto del supuesto, para el perito.
   */
  supuesto?: string;
}

/**
 * Los choques contra objetos después del primer golpe, en su orden: los que marcó el perito y los que
 * nombra la narración (donde quedó el vehículo, como supuesto, mientras el perito no los mueva).
 */
export function choquesIntermedios(e0: Expediente): ChoqueIntermedio[] {
  const { expediente: e, colocados } = conObjetosNarrados(e0);
  const supuesto = new Map(colocados.map((c) => [c.orden, c.texto]));
  return [...(e.impactos ?? [])]
    .sort((a, b) => a.orden - b.orden)
    .flatMap((i) =>
      i.objeto_fijo && i.punto && (i.vehiculos ?? []).length === 1 && i.orden > 1
        ? [
            {
              orden: i.orden,
              vehiculo: String(i.vehiculos![0]),
              objeto: i.objeto_fijo,
              punto: i.punto,
              ...(supuesto.has(i.orden) ? { supuesto: supuesto.get(i.orden)! } : {}),
            },
          ]
        : [],
    );
}

/** «¿Chocó contra algo más?» → sí: ese vehículo, contra ese objeto, en ese punto, al final del orden. */
export function agregarChoqueIntermedio(
  e: Expediente,
  vehiculo: string,
  objeto: string,
  p: Punto,
): Expediente {
  // El choque contra ese objeto que ya trae la narración («hasta un poste … contra el cual se
  // impactó»), sin lugar todavía: se completa con el punto, no se agrega otro (René, 2026-11-26: el
  // poste del ejemplo quedaba dos veces, el narrado «sin calcular» y el marcado).
  const nombre = sinAcentos(objeto);
  const narrado = (e.impactos ?? []).find(
    (i) =>
      (i.orden ?? 1) > 1 &&
      !i.punto &&
      i.objeto_fijo &&
      !OBJETO_PERSONA.test(i.objeto_fijo) &&
      (i.vehiculos ?? []).length === 1 &&
      i.vehiculos![0] === vehiculo &&
      sinAcentos(i.objeto_fijo).includes(nombre),
  );
  if (narrado)
    return {
      ...e,
      impactos: (e.impactos ?? []).map((i) => (i === narrado ? { ...i, punto: p } : i)),
    };
  // Nunca con el orden 1: ese es el primer golpe.
  const orden = Math.max(1, ...(e.impactos ?? []).map((i) => i.orden)) + 1;
  return {
    ...e,
    impactos: [
      ...(e.impactos ?? []),
      {
        orden,
        vehiculos: [vehiculo as IdVehiculo],
        objeto_fijo: objeto,
        punto: p,
        fuente: "perito",
      },
    ],
  };
}

export function quitarChoqueIntermedio(e: Expediente, orden: number): Expediente {
  return { ...e, impactos: (e.impactos ?? []).filter((i) => i.orden !== orden) };
}

/** Corregir después (W4): lleva el lugar de un choque intermedio a otro punto. */
export function moverChoqueIntermedio(e: Expediente, orden: number, p: Punto): Expediente {
  if (!choquesIntermedios(e).some((c) => c.orden === orden)) return e;
  return {
    ...e,
    impactos: (e.impactos ?? []).map((i) => (i.orden === orden ? { ...i, punto: p } : i)),
  };
}

export interface PuntoDePaso {
  vehiculo: string;
  orden: number;
  punto: Punto;
}

/** Los puntos de paso que el perito marcó (de un vehículo, o de todos), en su orden. */
export function puntosDePaso(e: Expediente, vehiculo?: string): PuntoDePaso[] {
  const todos = e.versiones?.find((v) => v.tipo === "evidencia")?.puntos_paso ?? [];
  return todos
    .filter((q) => vehiculo === undefined || q.vehiculo === vehiculo)
    .map((q) => ({ vehiculo: String(q.vehiculo), orden: q.orden, punto: q.punto }))
    .sort((a, b) => a.vehiculo.localeCompare(b.vehiculo) || a.orden - b.orden);
}

function conPuntosDePaso(
  e: Expediente,
  cambiar: (
    previos: NonNullable<NonNullable<Expediente["versiones"]>[number]["puntos_paso"]>,
  ) => NonNullable<NonNullable<Expediente["versiones"]>[number]["puntos_paso"]>,
): Expediente {
  const versiones = [...(e.versiones ?? [])];
  let i = versiones.findIndex((v) => v.tipo === "evidencia");
  if (i < 0) {
    versiones.unshift({ tipo: "evidencia" });
    i = 0;
  }
  versiones[i] = { ...versiones[i]!, puntos_paso: cambiar(versiones[i]!.puntos_paso ?? []) };
  return { ...e, versiones };
}

/** «¿Sabes por dónde pasó?»: un toque agrega el siguiente punto de ese vehículo. */
export function agregarPuntoDePaso(e: Expediente, vehiculo: string, p: Punto): Expediente {
  return conPuntosDePaso(e, (previos) => [
    ...previos,
    {
      vehiculo: vehiculo as IdVehiculo,
      orden: previos.filter((q) => q.vehiculo === vehiculo).length + 1,
      punto: p,
      fuente: "perito",
    },
  ]);
}

/** Corregir después (W4): lleva un punto de paso a otro lugar. */
export function moverPuntoDePaso(
  e: Expediente,
  vehiculo: string,
  orden: number,
  p: Punto,
): Expediente {
  if (!puntosDePaso(e, vehiculo).some((q) => q.orden === orden)) return e;
  return conPuntosDePaso(e, (previos) =>
    previos.map((q) => (q.vehiculo === vehiculo && q.orden === orden ? { ...q, punto: p } : q)),
  );
}

/** Corregir después (W4): quita un punto de paso y renumera los que siguen de ese vehículo. */
export function quitarPuntoDePaso(e: Expediente, vehiculo: string, orden: number): Expediente {
  if (!puntosDePaso(e, vehiculo).some((q) => q.orden === orden)) return e;
  return conPuntosDePaso(e, (previos) =>
    previos
      .filter((q) => !(q.vehiculo === vehiculo && q.orden === orden))
      .map((q) => (q.vehiculo === vehiculo && q.orden > orden ? { ...q, orden: q.orden - 1 } : q)),
  );
}

/** Corregir después (W4): quita el primer golpe marcado (vuelve al lugar del choque). */
export function quitarPrimerGolpe(e: Expediente): Expediente {
  const primero = elPrimero(e);
  if (!primero?.punto || primero.objeto_fijo) return e;
  return {
    ...e,
    impactos: (e.impactos ?? []).map((i) => {
      if (i !== primero) return i;
      const resto = { ...i };
      delete resto.punto;
      return resto;
    }),
  };
}

/** Quita el último punto de paso de ese vehículo. */
export function quitarUltimoPuntoDePaso(e: Expediente, vehiculo: string): Expediente {
  return conPuntosDePaso(e, (previos) => {
    const suyos = previos.filter((q) => q.vehiculo === vehiculo);
    const ultimo = suyos.sort((a, b) => a.orden - b.orden).at(-1);
    return previos.filter((q) => q !== ultimo);
  });
}

/** Las líneas de C1 para el resumen «¡La escena está lista!». */
export function resumenC1(s: {
  e: Expediente;
  nombres: Record<string, string>;
  c1: RespuestasC1;
}): LineaResumen[] {
  const out: LineaResumen[] = [];
  const golpe = primerGolpe(s.e);
  // Si no se preguntó (la escena llegó completa) y no hay nada marcado, no se dice nada.
  if (golpe || s.c1.golpeNoSe)
    out.push({
      tipo: "golpe",
      texto: golpe ? "El primer golpe, donde lo marcaste" : "El primer golpe",
      detalle: null,
      supuesto: golpe
        ? null
        : "No sabías dónde fue el primer golpe: Croquis usa el lugar del choque y el dictamen lo dice.",
    });
  for (const c of choquesIntermedios(s.e)) {
    const objeto = OBJETOS_C1.find((o) => o.id === c.objeto)?.con ?? c.objeto;
    out.push({
      tipo: "objeto",
      vehiculo: c.vehiculo,
      orden: c.orden,
      texto: `Después, el ${s.nombres[c.vehiculo] ?? c.vehiculo} chocó contra ${objeto}`,
      detalle: c.supuesto
        ? "Croquis usa medidas típicas del objeto y el dictamen lo dice."
        : "Donde lo marcaste. Croquis usa medidas típicas del objeto y el dictamen lo dice.",
      supuesto: c.supuesto ?? null,
    });
  }
  const pasos = puntosDePaso(s.e);
  for (const v of [...new Set(pasos.map((q) => q.vehiculo))]) {
    const n = pasos.filter((q) => q.vehiculo === v).length;
    out.push({
      tipo: "paso",
      vehiculo: v,
      texto: `El ${s.nombres[v] ?? v} pasó por ${n === 1 ? "el punto" : `los ${n} puntos`} que marcaste`,
      detalle: "La reconstrucción pasa por ahí.",
      supuesto: null,
    });
  }
  // C2 (W4): los objetos del lugar que colocó el perito.
  for (const o of objetosDe(s.e)) {
    out.push({
      tipo: "lugar",
      objeto: o.id,
      texto: `${articuloObjeto(o.tipo)} ${o.nombre.toLowerCase()}, donde lo colocaste`,
      detalle: o.medido
        ? "Con las medidas que le diste."
        : "Croquis usa medidas típicas del objeto y el dictamen lo dice.",
      supuesto: null,
    });
  }
  out.push(...resumenTerreno(s.e, s.c1));
  return out;
}

/**
 * A3: cada peatón o ciclista que colocó el perito, donde lo golpearon y, si marcó dónde quedó, la
 * distancia de proyección (la mide Croquis entre los dos puntos que marcó el perito).
 */
export function resumenPersonas(e: Expediente): LineaResumen[] {
  return (e.personas ?? []).map((p) => {
    const d = distanciaProyeccion(p);
    return {
      tipo: "persona",
      persona: p.id,
      texto: `${nombrePersona(e, p.id)}, donde lo golpearon`,
      detalle:
        d !== null
          ? `Quedó a ${F.metros(d, 1)} de ahí: es la distancia de proyección.`
          : "Falta marcar dónde quedó: con eso Croquis mide la distancia de proyección.",
      supuesto:
        p.fuente === "supuesto"
          ? "Croquis lo puso en el punto de contacto del choque. Si estaba en otro lugar, muévelo."
          : null,
    };
  });
}

/** C3 (W5): las líneas del terreno para el resumen, con lo que es supuesto dicho como supuesto. */
export function resumenTerreno(e: Expediente, c1: RespuestasC1): LineaResumen[] {
  const out: LineaResumen[] = [];
  const m = (x: number | undefined) => F.numero(x ?? 0, 2);
  for (const t of piezasTerreno(e)) {
    if (t.clase === "zona")
      out.push({
        tipo: "terreno",
        terreno: t.id,
        texto: `Una zona de ${t.nombre.toLowerCase()}, donde la marcaste`,
        detalle:
          t.friccion !== undefined
            ? `Con la fricción que le diste (${m(t.friccion)}).`
            : "Croquis usa la fricción de la tabla para esa superficie, con su rango.",
        supuesto: null,
      });
    else if (t.clase === "ondulacion")
      out.push({
        tipo: "terreno",
        terreno: t.id,
        texto: "Una zona ondulada, donde la marcaste",
        detalle: `${m(t.amplitud_m)} m de valle a cresta, con crestas cada ${m(t.longitud_onda_m)} m.`,
        supuesto: t.porOmision
          ? "No mediste la ondulación: esas medidas son un supuesto y el dictamen lo dice."
          : null,
      });
    else
      out.push({
        tipo: "terreno",
        terreno: t.id,
        texto: "Un tope, donde lo marcaste",
        detalle: `${m(t.alto_m)} m de alto y ${m(t.largo_m)} m de largo${t.porOmision ? ": las medidas de la norma (NOM-034, tabla 38)." : ", como lo mediste."}`,
        supuesto: null,
      });
  }
  if (usaRelieve(e))
    out.push({
      tipo: "terreno",
      texto: "El relieve real del lugar",
      detalle: "Da la pendiente general de la vía; no ve una rampa corta ni un tope.",
      supuesto: null,
    });
  if (!out.length && c1.terrenoListo)
    out.push({
      tipo: "terreno",
      texto: "El terreno es pavimento liso",
      detalle: "La reconstrucción va en plano.",
      supuesto: null,
    });
  return out;
}

/** «Un poste», «Una pared»: el artículo de cada objeto de la paleta. */
export const articuloObjeto = (t: TipoObjeto) =>
  t === "muro" || t === "barrera" || t === "guarnicion" || t === "senal" ? "Una" : "Un";

/** El paso en curso: el primero sin terminar (los choques primero). null si todo está listo. */
export const pasoActual = (pasos: readonly PasoEscena[]) => pasos.find((p) => !p.hecho) ?? null;

// --- Respuestas → expediente ---------------------------------------------------------------------

/**
 * «Sí, fue en ese cruce» o un toque en el mapa: el choque en `p`. Las poses de impacto las propone
 * Croquis con las zonas de contacto (con fuente «supuesto» hasta que la persona dice por dónde venía
 * cada uno); en una carambola, solo las de quien entra en ese choque. `rumbo`: hacia dónde avanzaba
 * el primer vehículo (el de la narración, el de la calle o el que ya tenía); en reversa, su frente
 * queda al lado contrario (`rumboDelFrente`; si da vuelta, con la vuelta dada).
 */
export function marcarChoque(
  e: Expediente,
  impactos: readonly ImpactoAColocar[],
  orden: number,
  p: Punto,
  rumbo: number,
): Expediente {
  const antes = new Set(impactos.filter((x) => x.orden < orden).flatMap((x) => x.vehiculos));
  let r = e;
  const primero = impactos.find((x) => x.orden === orden)?.vehiculos[0];
  const frente = primero ? rumboDelFrente(e, primero, rumbo) : rumbo;
  for (const pose of posesDeImpacto(e, p, frente, orden)) {
    if (antes.has(pose.vehiculo)) continue;
    r = conPosicion(r, {
      vehiculo: pose.vehiculo,
      fase: "impacto",
      punto: pose.punto,
      rumbo: pose.rumbo,
      fuente: "supuesto",
    });
  }
  return conPersonaDelChoque(conPuntoDelObjeto(r, orden, p), orden, p, rumbo);
}

/**
 * Dónde queda un choque que toca el perito: sobre la calle más cercana (a menos de `AJUSTE_CALLE_M`),
 * salvo un choque posterior contra un objeto, que va donde está el objeto (René, 2026-11-26: el poste
 * del ejemplo, a 1.50 m del borde de la carpeta, se pegaba al centro de la calle). La usan La escena
 * y la tabla del índice.
 */
export function puntoDelChoqueTocado(
  e: Expediente,
  calles: readonly Calle[],
  orden: number,
  p: Punto,
): Punto {
  const imp = (e.impactos ?? []).find((i) => (i.orden ?? 1) === orden);
  if (orden > 1 && imp?.objeto_fijo && !OBJETO_PERSONA.test(imp.objeto_fijo)) return p;
  return ajustarACalle(calles, p)?.punto ?? p;
}

/** Lo que se pone en el terreno con el siguiente toque. */
export type TerrenoAPoner =
  | { clase: "zona"; tipo: TipoSuperficie }
  | { clase: "ondulacion" }
  | { clase: "tope"; norma: TopeNorma };

/**
 * «¿Cómo es el terreno?»: lo que toca el perito, alineado a la calle (las zonas a lo largo, el tope
 * atravesado). La usan La escena y la tabla del índice.
 */
export function ponerTerrenoEn(
  e: Expediente,
  calles: readonly Calle[],
  que: TerrenoAPoner,
  p: Punto,
  todo = false,
): Expediente {
  const rumbo = calles.length ? rumboAlineado(calles, p, 0) : 0;
  if (que.clase === "zona") return agregarZona(e, que.tipo, p, rumbo, todo).expediente;
  if (que.clase === "ondulacion") return agregarOndulacion(e, p, rumbo).expediente;
  return agregarTope(e, p, rumbo, que.norma).expediente;
}

/**
 * Un choque posterior contra un objeto que trae la narración («hasta un poste … contra el cual se
 * impactó»): el lugar que marca el perito es el del objeto, y va en el impacto, como en «¿Chocó contra
 * algo más?», para que la reconstrucción calcule ese golpe (René, 2026-11-26: el Sentra perdía la
 * energía del poste porque el punto no se guardaba y el impacto quedaba «sin calcular»). Una persona
 * no es un objeto fijo: la coloca `conPersonaDelChoque`.
 */
function conPuntoDelObjeto(e: Expediente, orden: number, p: Punto): Expediente {
  const imp = (e.impactos ?? []).find((i) => (i.orden ?? 1) === orden);
  if (
    orden <= 1 ||
    !imp?.objeto_fijo ||
    OBJETO_PERSONA.test(imp.objeto_fijo) ||
    (imp.vehiculos ?? []).length !== 1
  )
    return e;
  return {
    ...e,
    impactos: (e.impactos ?? []).map((i) => (i === imp ? { ...i, punto: p } : i)),
  };
}

/**
 * Un choque contra una persona («impactó a un peatón»): Croquis la coloca en el punto de contacto,
 * cruzando delante del vehículo, como supuesto que el perito puede mover (René, 2026-11-24: el peatón
 * del camión que daba vuelta nunca aparecía en el 3D, porque la lectura lo dejaba como «objeto
 * peatón» y nadie lo colocaba). Si ya la colocó el perito, no se toca.
 */
function conPersonaDelChoque(e: Expediente, orden: number, p: Punto, rumbo: number): Expediente {
  const imp = (e.impactos ?? []).find((i) => (i.orden ?? 1) === orden);
  if (!imp?.objeto_fijo || !OBJETO_PERSONA.test(imp.objeto_fijo)) return e;
  const actual = imp.persona ? (e.personas ?? []).find((x) => x.id === imp.persona) : undefined;
  if (actual && actual.fuente !== "supuesto") return e;
  if (actual) return moverPersona(e, actual.id, p);
  const rol = /ciclista|bicicleta/i.test(imp.objeto_fijo) ? "ciclista" : "peaton";
  const { expediente, id } = agregarPersona(e, rol, p, normalizar(rumbo + 90));
  return {
    ...expediente,
    personas: (expediente.personas ?? []).map((x) =>
      x.id === id
        ? { ...x, fuente: "supuesto" as const, ...(imp.cita ? { cita: imp.cita } : {}) }
        : x,
    ),
  };
}

/**
 * «El peatón quedó tendido … a 4 m del punto de contacto»: los metros que da la narración entre donde
 * golpearon a la persona y donde quedó; null si no los da.
 */
export function distanciaNarradaDePersona(narracion: string | null): number | null {
  if (!narracion) return null;
  const m =
    /\b(?:peat[oó]n|ciclista|persona|transe[uú]nte|lesionad[oa])(?![\wáéíóúñ])[^.]*?\bqued[oó](?![\wáéíóúñ])[^.]*?\ba\s+(?:unos\s+|aproximadamente\s+|cerca\s+de\s+)?(\d{1,3}(?:[.,]\d+)?)\s*m(?:etros?)?\s+del?\s+(?:punto\s+de(?:l)?\s+(?:contacto|impacto|atropell\w*)|(?:primer\s+)?(?:impacto|contacto|choque|atropell\w*))/i.exec(
      narracion,
    );
  const n = m ? Number(m[1]!.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Dónde quedó la persona golpeada, como lo dice la narración (René, 2026-11-28: el peatón del caso 2
 * quedó «a 4 m del punto de contacto» y el perito tenía que ponerlo): a esos metros de donde la
 * golpearon, hacia donde avanzaba el vehículo (la dirección de la proyección; supuesto). Solo mientras
 * la persona sea un supuesto de Croquis: si el perito marca dónde quedó, es suya y no se toca.
 */
export function conReposoNarradoDePersonas(e: Expediente, narracion: string | null): Expediente {
  const n = distanciaNarradaDePersona(narracion);
  if (n === null || !(e.personas ?? []).some((p) => p.fuente === "supuesto")) return e;
  let r = e;
  for (const imp of e.impactos ?? []) {
    const per = imp.persona ? (r.personas ?? []).find((p) => p.id === imp.persona) : undefined;
    const v = imp.vehiculos?.[0];
    if (!per || per.fuente !== "supuesto" || !v) continue;
    const pose = poseDe(r, String(v), "impacto");
    if (!pose) continue;
    const marcha = rumboDeMarcha(r, String(v), pose.rumbo);
    const fin = punto(avanzar(ll(per.punto), marcha, n));
    if (per.final && distanciaM(ll(per.final), ll(fin)) < 0.01) continue;
    r = marcarFinalPersona(r, per.id, fin);
  }
  return r;
}

/**
 * «Por dónde venía»: el vehículo avanzaba con `rumbo` al llegar al choque (en reversa, su frente mira
 * al lado contrario: la pose guarda el frente). El primero de su choque
 * gira todo el choque (los demás se recolocan por sus zonas de contacto); su pose queda como dato
 * de la persona. Con «No sé por dónde venía» (`noSe`), se queda la que propone Croquis, como
 * supuesto.
 */
export function elegirDireccion(
  e: Expediente,
  impactos: readonly ImpactoAColocar[],
  vehiculo: string,
  rumbo: number,
  /** El punto de cada choque, por orden. */
  puntoDe: (orden: number) => Punto | null,
  noSe = false,
): Expediente {
  const imp = impactos.find((i) => i.vehiculos.includes(vehiculo));
  const pose = poseDe(e, vehiculo, "impacto");
  if (!imp || !pose) return e;
  let r = e;
  const primero = imp.vehiculos[0] === vehiculo;
  // Gira cada choque donde va primero (en una carambola, B es el primero del segundo choque: su
  // dirección acomoda a C). Los que ya se confirmaron conservan su dato.
  for (const i of impactos.filter((x) => x.vehiculos[0] === vehiculo)) {
    const p = puntoDe(i.orden);
    if (!p) continue;
    r = marcarChoque(r, impactos, i.orden, p, rumbo);
    for (const v of i.vehiculos) {
      if (v === vehiculo) continue;
      const previa = poseDe(e, v, "impacto");
      const nueva = poseDe(r, v, "impacto");
      if (previa?.fuente === "perito" && nueva)
        r = conPosicion(r, {
          vehiculo: v as Id,
          fase: "impacto",
          punto: nueva.punto,
          rumbo: nueva.rumbo,
          fuente: "perito",
        });
    }
  }
  const nueva = poseDe(r, vehiculo, "impacto");
  return conPosicion(r, {
    vehiculo: vehiculo as Id,
    fase: "impacto",
    punto: nueva?.punto ?? pose.punto,
    rumbo: primero
      ? (nueva?.rumbo ?? rumboDelFrente(e, vehiculo, rumbo))
      : rumboDelFrente(e, vehiculo, rumbo),
    fuente: noSe ? "supuesto" : "perito",
  });
}

/** «Lo marco en el mapa»: dónde quedó, alineado a la calle si hay una cerca. */
/**
 * Un choque marcado con un toque en el mapa: el rumbo del primer vehículo de ese choque es el narrado,
 * o el de su llegada si ya tenía pose, o el de la calle de ese punto. La usan La escena y la tabla de
 * los ejemplos (René, 2026-11-26).
 */
export function tocarChoque(
  e: Expediente,
  impactos: readonly ImpactoAColocar[],
  orden: number,
  p: Punto,
  sentidoDelPrimero: SentidoNarrado | null,
  calles: readonly Calle[],
): Expediente {
  const primero = impactos.find((i) => i.orden === orden)?.vehiculos[0];
  const previa = primero ? poseDe(e, primero, "impacto") : null;
  const rumbo =
    sentidoDelPrimero?.rumbo ??
    (previa && primero ? rumboDeLlegada(e, primero, previa.rumbo) : null) ??
    (calles.length ? rumboAlineado(calles, p, 0) : 0);
  return marcarChoque(e, impactos, orden, p, rumbo);
}

/**
 * Dónde quedó, con un toque en el mapa: el vehículo ahí, alineado a la calle de ese punto (o con su
 * rumbo de antes, sin calles). La usan La escena y la tabla de los ejemplos (René, 2026-11-26: «el
 * mismo código que La escena»).
 */
/** Las posiciones que el perito puede escribir en metros en vez de tocarlas (René, 2026-11-27). */
export type FaseEscrita = "final" | "inicial" | "impacto";

/** Desde dónde se mide cada posición escrita: su pose del choque o, la del choque, el cruce. */
function referenciaEscrita(
  e: Expediente,
  vehiculo: string,
  fase: FaseEscrita,
  calles: readonly Calle[],
): { punto: Punto; marcha: number; desde: string } | null {
  const imp = poseDe(e, vehiculo, "impacto");
  if (!imp) return null;
  const marcha = rumboDeMarcha(e, vehiculo, imp.rumbo);
  if (fase !== "impacto") return { punto: imp.punto, marcha, desde: "su posición en el choque" };
  const cruce = crucesDe(calles)
    .map((c) => ({ c, d: distanciaM(ll(c.punto), ll(imp.punto)) }))
    .sort((a, b) => a.d - b.d)[0];
  if (!cruce || cruce.d > 150) return null;
  return {
    punto: cruce.c.punto,
    marcha,
    desde: `el cruce de ${cruce.c.calles.slice(0, 2).join(" y ") || "las calles"}`,
  };
}

/**
 * Lo que mide una posición desde su referencia: metros adelante (hacia donde avanzaba; negativo,
 * atrás) y a la izquierda (negativo, a la derecha). La ve el perito en metros y la puede editar.
 */
export function medidaEscrita(
  e: Expediente,
  vehiculo: string,
  fase: FaseEscrita,
  calles: readonly Calle[],
): { adelante: number; izquierda: number; desde: string } | null {
  const ref = referenciaEscrita(e, vehiculo, fase, calles);
  const pose = poseDe(e, vehiculo, fase);
  if (!ref || !pose) return null;
  const m = enMetros(ll(pose.punto), ll(ref.punto));
  const r = (ref.marcha * Math.PI) / 180;
  const adelante = m.este * Math.sin(r) + m.norte * Math.cos(r);
  const izquierda = -(m.este * Math.cos(r) - m.norte * Math.sin(r));
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { adelante: r1(adelante), izquierda: r1(izquierda), desde: ref.desde };
}

/** La posición a esos metros de su referencia, exacta (fuente: el perito). */
export function conPosicionEscrita(
  e: Expediente,
  vehiculo: string,
  fase: FaseEscrita,
  adelante: number,
  izquierda: number,
  calles: readonly Calle[],
): Expediente {
  const ref = referenciaEscrita(e, vehiculo, fase, calles);
  if (!ref) return e;
  const q = avanzar(
    avanzar(ll(ref.punto), ref.marcha, adelante),
    normalizar(ref.marcha - 90),
    izquierda,
  );
  const imp = poseDe(e, vehiculo, "impacto")!;
  const rumbo = poseDe(e, vehiculo, fase)?.rumbo ?? imp.rumbo;
  return conPosicion(e, {
    vehiculo: vehiculo as Id,
    fase,
    punto: punto(q),
    rumbo: normalizar(rumbo),
    fuente: "perito",
  });
}

/** m: un toque a menos de esto del centro de un carril se ajusta a él (René, 2026-11-27). */
export const TOLERANCIA_CARRIL_M = 0.75;

/**
 * El toque del perito, al centro de su carril (René, 2026-11-27: la carambola daba 24 en Chromium y 25
 * en WebKit con la misma receta; un toque unos píxeles al lado no debe cambiar la cifra). Solo si cae
 * dentro de la calzada y a menos de `TOLERANCIA_CARRIL_M` del centro de un carril; si no (el
 * acotamiento, la banqueta), queda donde tocó: la posición final es evidencia y no se mueve en
 * silencio. Solo se mueve a lo ancho de la calle: la distancia a lo largo es la que mide el perito.
 */
export function alCarril(
  calles: readonly Calle[],
  p: Punto,
): { punto: Punto; movidoM: number; carril: number; calle: string | null } | null {
  const s = ajustarACalle(calles, p, AJUSTE_CALLE_M);
  if (!s) return null;
  const pie = s.punto;
  const m = enMetros(ll(p), ll(pie));
  const r = (s.rumbo * Math.PI) / 180;
  // A la derecha de la dirección de la calle: (cos r, −sin r) en (este, norte).
  const lado = m.este * Math.cos(r) - m.norte * Math.sin(r);
  const ancho = s.calle.ancho;
  if (Math.abs(lado) > ancho / 2) return null;
  const n = Math.max(1, s.calle.carriles ?? Math.round(ancho / 3.3));
  const w = ancho / n;
  let k = Math.floor((lado + ancho / 2) / w);
  k = Math.max(0, Math.min(n - 1, k));
  const centro = -ancho / 2 + (k + 0.5) * w;
  const movido = Math.abs(lado - centro);
  if (movido > TOLERANCIA_CARRIL_M || movido < 0.05) return null;
  return {
    punto: punto(avanzar(ll(pie), normalizar(s.rumbo + 90), centro)),
    movidoM: movido,
    carril: k + 1,
    calle: s.calle.nombre,
  };
}

export function tocarFinal(
  e: Expediente,
  vehiculo: string,
  p: Punto,
  calles: readonly Calle[],
): Expediente {
  const imp = poseDe(e, vehiculo, "impacto");
  const previo = poseDe(e, vehiculo, "final")?.rumbo ?? imp?.rumbo ?? 0;
  const q = alCarril(calles, p)?.punto ?? p;
  return marcarFinal(e, vehiculo, q, calles.length ? rumboAlineado(calles, q, previo) : previo);
}

export function marcarFinal(e: Expediente, vehiculo: string, p: Punto, rumbo: number): Expediente {
  return conPosicion(e, {
    vehiculo: vehiculo as Id,
    fase: "final",
    punto: p,
    rumbo: normalizar(rumbo),
    fuente: "perito",
  });
}

/**
 * «Quedó junto al choque»: un poco adelante de su pose de impacto (1.5 m hacia donde avanzaba; en
 * reversa, hacia atrás), con el mismo rumbo. Sin pose de impacto, nada cambia.
 */
export function quedoJuntoAlChoque(e: Expediente, vehiculo: string): Expediente {
  const pose = poseDe(e, vehiculo, "impacto");
  if (!pose) return e;
  const p = punto(avanzar(ll(pose.punto), rumboDeMarcha(e, vehiculo, pose.rumbo), 1.5));
  return marcarFinal(e, vehiculo, p, pose.rumbo);
}

/** «No sé dónde quedó»: sin posición final (la reconstrucción la calcula y el dictamen lo dice). */
export function sinFinal(e: Expediente, vehiculo: string): Expediente {
  const versiones = (e.versiones ?? []).map((v) =>
    v.tipo === "evidencia"
      ? {
          ...v,
          posiciones: (v.posiciones ?? []).filter(
            (p) => !(p.vehiculo === vehiculo && p.fase === "final"),
          ),
        }
      : v,
  );
  return { ...e, versiones };
}

/** Gira la pose de un vehículo `grados` (los botones de 15°), sin moverla. */
export function girar(
  e: Expediente,
  vehiculo: string,
  fase: "final" | "inicial",
  grados: number,
): Expediente {
  const pose = poseDe(e, vehiculo, fase);
  if (!pose) return e;
  return conPosicion(e, {
    vehiculo: vehiculo as Id,
    fase,
    punto: pose.punto,
    rumbo: normalizar(pose.rumbo + grados),
    ...(pose.fuente === "perito" || pose.fuente === "supuesto" ? { fuente: pose.fuente } : {}),
  });
}

/** Lleva un coche fuera de la calle a la calle más cercana, alineado a ella. */
export function ponerEnLaCalle(
  e: Expediente,
  calles: readonly Calle[],
  vehiculo: string,
): Expediente {
  const pose = poseDe(e, vehiculo, "final");
  if (!pose) return e;
  const a = ajustarACalle(calles, pose.punto, 500);
  if (!a) return e;
  return marcarFinal(e, vehiculo, a.punto, rumboAlineado(calles, a.punto, pose.rumbo));
}

// --- El resumen final ----------------------------------------------------------------------------

export interface LineaResumen {
  tipo: "choque" | "vehiculo" | "golpe" | "objeto" | "paso" | "lugar" | "terreno" | "persona";
  vehiculo?: string;
  /** El peatón o el ciclista de una línea «persona» (A3): para «Cambiar». */
  persona?: string;
  /** La pieza del terreno de una línea «terreno» (zona, ondulación o tope): para «Cambiar». */
  terreno?: string;
  /** El choque (su orden) de una línea «choque» u «objeto»: para «Cambiar». */
  orden?: number;
  /** El objeto colocado de una línea «lugar»: para «Cambiar». */
  objeto?: string;
  texto: string;
  detalle: string | null;
  /** Lo que la persona no sabía: va con la etiqueta «Supuesto» y su explicación. */
  supuesto: string | null;
}

/** De qué lado del choque quedó un punto («al noreste del cruce»), o «junto al choque». */
export function ladoDelChoque(choque: Punto, p: Punto): string {
  const d = distanciaM(ll(choque), ll(p));
  if (d < 4) return "junto al choque";
  return `al ${cardinal(rumboDeg(ll(choque), ll(p)))} del choque, a ${Math.round(d)} m`;
}

/** El resumen de lo marcado, para la tarjeta «¡La escena está lista!». */
export function resumenEscena(s: {
  e: Expediente;
  impactos: readonly ImpactoAColocar[];
  puntos: Record<number, Punto>;
  callesChoque: Record<number, string[]>;
  nombres: Record<string, string>;
  desconocidos: readonly string[];
  direccionesNoSe: readonly string[];
  juntoAlChoque: readonly string[];
}): LineaResumen[] {
  const out: LineaResumen[] = [];
  for (const i of s.impactos) {
    const calles = s.callesChoque[i.orden] ?? [];
    const lugar =
      calles.length >= 2
        ? `en ${calles[0]} y ${calles[1]}`
        : calles.length === 1
          ? `en ${calles[0]}`
          : "donde lo marcaste";
    out.push({
      tipo: "choque",
      orden: i.orden,
      texto: `${s.impactos.length > 1 ? `El choque ${i.orden}` : "El choque"}, ${lugar}`,
      detalle: null,
      supuesto: null,
    });
  }
  const choque = s.puntos[1] ?? null;
  for (const v of [...new Set(s.impactos.flatMap((i) => i.vehiculos))]) {
    const nombre = s.nombres[v] ?? v;
    const imp = poseDe(s.e, v, "impacto");
    const fin = poseDe(s.e, v, "final");
    const desde = imp ? cardinal(imp.rumbo + 180) : null;
    const noSeDir = s.direccionesNoSe.includes(v);
    const noSeFin = s.desconocidos.includes(v);
    const texto = `El ${nombre} ${desde ? `venía del ${desde}` : "venía hacia el choque"}`;
    const detalle = noSeFin
      ? null
      : s.juntoAlChoque.includes(v)
        ? "Quedó junto al choque."
        : fin && choque
          ? `Quedó ${ladoDelChoque(choque, fin.punto)}, donde lo pusiste.`
          : null;
    const supuestos = [
      noSeDir
        ? "No sabías por dónde venía: Croquis usa la dirección que dan las zonas de contacto y el dictamen lo dice."
        : null,
      noSeFin ? "No sabías dónde quedó: Croquis lo calcula y el dictamen lo dice." : null,
    ].filter(Boolean);
    out.push({
      tipo: "vehiculo",
      vehiculo: v,
      texto,
      detalle,
      supuesto: supuestos.length ? supuestos.join(" ") : null,
    });
  }
  return out;
}

/** El mensaje de éxito después de marcar el choque. */
export function textoChoqueListo(
  calles: readonly string[],
  varios: boolean,
  orden: number,
): string {
  const que = varios ? `El choque ${orden}` : "El choque";
  if (calles.length >= 2) return `¡Listo! ${que} quedó en ${calles[0]} y ${calles[1]}.`;
  if (calles.length === 1) return `¡Listo! ${que} quedó sobre ${calles[0]}.`;
  return `¡Listo! ${que} quedó marcado.`;
}

/** Las calles de un punto: las de su cruce (si cae en uno) o la calle más cercana. */
export function callesEn(calles: readonly Calle[], p: Punto): string[] {
  const cruce = crucesDe(calles)
    .map((c) => ({ c, d: distanciaM(ll(c.punto), ll(p)) }))
    .filter((x) => x.d < 15)
    .sort((a, b) => a.d - b.d)[0];
  if (cruce && cruce.c.calles.length) return cruce.c.calles.slice(0, 2);
  const a = ajustarACalle(calles, p);
  return a?.calle.nombre ? [a.calle.nombre] : [];
}

/**
 * El límite de la vía por donde circulaba el vehículo (ronda 4; René, 2026-11-23: el árbol de
 * «Paseo Tollocan» tomó una calle secundaria de 30 km/h que pasaba más cerca del choque). Entre las
 * calles a menos de 40 m del punto: la que nombra el lugar narrado y va en el rumbo del vehículo en el
 * impacto; si no, la que nombra el lugar (la que se nombra primero); si no, la que va en su rumbo (a
 * menos de 25 m); si no, la más cercana a menos de 25 m. Con su `maxspeed` o el de su tipo (LGMSV,
 * art. 49 fr. III). null si no hay calle cerca.
 */
export function limiteEnElChoque(
  calles: readonly Calle[],
  p: Punto,
  o: {
    rumbo?: number | null;
    lugar?: string | null;
    /**
     * La clase sale del nombre de la vía elegida («Calle Azucena»), no del lugar narrado completo
     * (René, 2026-11-26: «calle Azucena esquina con Avenida del Árbol» daba «avenida» a la calle).
     */
    claseDeSuNombre?: boolean;
  } = {},
): { kmh: number; fuente: string } | null {
  const lugar = sinAcentos(o.lugar ?? "");
  const cerca = calles
    .map((c) => {
      const s = sobreCalle(c, p);
      const nucleo = c.nombre ? nombreComparable(c.nombre) : "";
      const en = nucleo.length >= 4 ? lugar.indexOf(nucleo) : -1;
      // Una vía no tiene sentido: 0° y 180° son la misma dirección.
      const giro =
        o.rumbo == null ? null : Math.abs(((((s.rumbo - o.rumbo) % 180) + 270) % 180) - 90);
      return { c, d: s.distancia, en, alineada: giro !== null && giro <= 35 };
    })
    .filter((x) => x.d <= 40);
  const porCercania = (xs: typeof cerca) => [...xs].sort((a, b) => a.d - b.d)[0];
  const nombradas = cerca.filter((x) => x.en >= 0).sort((a, b) => a.en - b.en || a.d - b.d);
  const mejor =
    nombradas.find((x) => x.alineada) ??
    nombradas[0] ??
    porCercania(cerca.filter((x) => x.alineada && x.d <= 25)) ??
    porCercania(cerca.filter((x) => x.d <= 25));
  if (!mejor) return null;
  const l = limiteDeLaVia(mejor.c.tipo, mejor.c.maxspeed);
  // La vía que nombra la narración, sin límite publicado en el mapa: su clase la da el texto del lugar
  // («Paseo Tollocan» es una avenida). El tipo de OpenStreetMap («secondary») no es la clase de la
  // LGMSV: Tollocan salía como «calle secundaria» de 30 km/h (René, 2026-11-23).
  const narrada =
    mejor.en >= 0 && l?.fuente.startsWith("LGMSV")
      ? limiteDelLugarNarrado(o.claseDeSuNombre ? mejor.c.nombre : o.lugar)
      : null;
  if (narrada)
    return {
      kmh: narrada.kmh,
      fuente: `${narrada.fuente.replace(/, mientras la vía no se ubica en el mapa$/, "")}; ${mejor.c.nombre}, sin límite publicado en el mapa`,
    };
  return l && mejor.c.nombre ? { ...l, fuente: `${l.fuente}; ${mejor.c.nombre}` } : l;
}

/**
 * Si se avisa que no hay calles (ronda 4; René, 2026-11-18: «el aviso rojo sale cada vez que se regresa
 * a La escena, aunque el mapa dibuja las calles»). Solo si Overpass no respondió, no hay calles de
 * ninguna otra fuente (las teselas de este mapa, las del recorrido o las guardadas con el caso), las
 * teselas de este lugar ya se leyeron y el aviso no se ha mostrado en la sesión.
 */
export function avisarSinCalles(o: {
  overpassFallo: boolean;
  hayCalles: boolean;
  teselasLeidasDe: string | null;
  lugar: string | null;
  yaVisto: boolean;
  descartado: boolean;
}): boolean {
  return (
    o.overpassFallo &&
    !o.hayCalles &&
    o.lugar !== null &&
    o.teselasLeidasDe === o.lugar &&
    !o.yaVisto &&
    !o.descartado
  );
}

/** Un número de la narración («6», «2.5», «2,5»). */
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const metros = (x: string) => Number(x.replace(",", "."));
/** El vehículo que nombra la narración («vehículo B») como id del expediente («V2»). */
const idDeLetra = (l: string) => `V${l.toUpperCase().charCodeAt(0) - 64}`;

/**
 * Hacia dónde dice la narración que salió un vehículo después del choque (René, 2026-11-25, aud-02:
 * «fue desplazado hacia el noroeste del cruce y quedó detenido a 7 m del punto de contacto» lo ponía 7 m
 * adelante en su propia línea, al poniente). Un punto cardinal («hacia el noroeste», «quedó al norte del
 * cruce»), «hacia el camellón» (a su izquierda: se circula por la derecha), «hacia la banqueta» (a su
 * derecha), «hacia su izquierda/derecha» (los lados, adelante y a 45°) o «hacia atrás». No cuenta «con el frente hacia…» (es cómo quedó, no hacia dónde
 * salió) ni «de sur a norte» (es cómo circulaba). null si no lo dice.
 */
export function direccionDeSalida(
  descripcion: string,
  marcha: number,
): { rumbo: number; texto: string } | null {
  const d = sinAcentos(descripcion.toLowerCase())
    .replace(
      new RegExp(
        String.raw`(?:con\s+el\s+frente|orientad[oa]|mirando|viendo)\s+(?:hacia|al|viendo\s+al)\s+(?:el\s+)?${PUNTO}\b`,
        "g",
      ),
      " ",
    )
    .replace(new RegExp(String.raw`\bde\s+${PUNTO}\s+a\s+${PUNTO}\b`, "g"), " ");
  const c =
    new RegExp(String.raw`\bhacia\s+(?:el\s+)?${PUNTO}\b`).exec(d) ??
    new RegExp(
      String.raw`\bal\s+${PUNTO}\s+del?\s+(?:cruce|choque|punto|impacto|contacto|lugar)`,
    ).exec(d);
  if (c) {
    const nombre = c[1]!;
    return { rumbo: RUMBO_DE[nombre]!, texto: `hacia el ${nombre}` };
  }
  // Los lados son relativos a su marcha: después del choque sigue avanzando, así que sale adelante y
  // hacia ese lado (45°, supuesto). Solo con «hacia»: «junto a la guarnición» dice dónde quedó, no
  // hacia dónde salió.
  const aUnLado = (signo: -1 | 1, texto: string) => ({
    rumbo: normalizar(marcha + signo * 45),
    texto: `adelante y ${texto}`,
  });
  if (/\bhacia\s+(?:el\s+)?camellon\b/.test(d))
    return aUnLado(-1, "hacia el camellón (a su izquierda)");
  if (/\bhacia\s+(?:la\s+)?(?:banqueta|acera|guarnicion)\b/.test(d))
    return aUnLado(1, "hacia la banqueta (a su derecha)");
  const lado = /\bhacia\s+(?:su\s+|la\s+)?(izquierda|derecha)\b/.exec(d);
  if (lado)
    return lado[1] === "izquierda"
      ? aUnLado(-1, "hacia su izquierda")
      : aUnLado(1, "hacia su derecha");
  if (/\bhacia\s+atras\b|\bhacia\s+donde\s+venia\b/.test(d))
    return { rumbo: normalizar(marcha + 180), texto: "hacia atrás, de donde venía" };
  return null;
}

/** m: el ancho del acotamiento cuando OSM no lo trae (supuesto, René 2026-11-27). */
export const ACOTAMIENTO_SUPUESTO_M = 2.5;
/** m: el ancho del carril cuando no se conoce la calle (supuesto). */
const CARRIL_SUPUESTO_M = 3.5;

/**
 * Cuánto se corre a su derecha un vehículo que quedó «sobre el acotamiento»: del centro de su carril al
 * centro del acotamiento, medio carril más medio acotamiento. El carril, de la calle (su ancho entre
 * sus carriles); el acotamiento, de OSM (`shoulder:width`) o, si no lo trae, el supuesto de 2.5 m.
 */
export function corrimientoAlAcotamiento(
  calles: readonly Calle[],
  p: Punto,
): { metros: number; carrilM: number; acotamientoM: number; delMapa: boolean } {
  const s = calles.length ? ajustarACalle(calles, p) : null;
  const carril = s
    ? s.calle.ancho / Math.max(1, s.calle.carriles ?? Math.round(s.calle.ancho / 3.3))
    : CARRIL_SUPUESTO_M;
  const acot = s?.calle.acotamiento ?? null;
  const acotamientoM = acot ?? ACOTAMIENTO_SUPUESTO_M;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    metros: r1(carril / 2 + acotamientoM / 2),
    carrilM: r1(carril),
    acotamientoM: r1(acotamientoM),
    delMapa: acot !== null,
  };
}

export interface FinalNarrado {
  punto: Punto;
  rumbo: number;
  /** Cómo lo colocó Croquis, para el perito: «6 m adelante del choque, hacia donde avanzaba». */
  texto: string;
}

/**
 * Dónde quedó, como lo dice la narración (René, 2026-11-24): las distancias que da contra el choque,
 * contra otro vehículo o contra donde estaba detenido. Antes La escena solo ofrecía «junto al
 * choque» o marcarlo a mano, y el camión que quedó «6 m después del paso peatonal» quedaba a 1.5 m
 * (la reconstrucción daba 7 km/h contra los 15 narrados). Lo que no reconoce da null: el perito lo
 * marca en el mapa.
 */
export function finalDeLaNarracion(
  e: Expediente,
  vehiculo: string,
  descripcion: string,
  /** Las descripciones de los demás, para «a 1 m detrás del vehículo B». */
  otras: readonly { vehiculo: string; descripcion: string }[] = [],
  vistos: ReadonlySet<string> = new Set(),
  /** Las calles del lugar, para el ancho del carril y del acotamiento (René, 2026-11-27). */
  calles: readonly Calle[] = [],
): FinalNarrado | null {
  const imp = poseDe(e, vehiculo, "impacto");
  if (!imp) return null;
  // «a 3 m uno del otro», «separados 3 m entre sí» (René, 2026-11-27): con un solo otro vehículo, es
  // «a 3 m del vehículo B».
  const otrosVehiculos = e.vehiculos.filter((x) => x.id !== vehiculo);
  const letraOtro =
    otrosVehiculos.length === 1 && /^V\d+$/.test(otrosVehiculos[0]!.id)
      ? String.fromCharCode(64 + Number(otrosVehiculos[0]!.id.slice(1))).toLowerCase()
      : null;
  const d = letraOtro
    ? descripcion
        .toLowerCase()
        .replace(
          new RegExp(
            String.raw`(?:a\s+)?${NUM}\s*m(?:etros?)?\s+(?:el\s+)?uno\s+del\s+otro|separad[oa]s\s+(?:por\s+)?(?:unos\s+)?${NUM}\s*m(?:etros?)?(?:\s+entre\s+s[ií])?`,
          ),
          (_t, a?: string, b?: string) => `a ${a ?? b} m del vehiculo ${letraOtro}`,
        )
    : descripcion.toLowerCase();
  const marcha = rumboDeMarcha(e, vehiculo, imp.rumbo);
  // «con el frente hacia el suroeste»: el rumbo con que quedó.
  const f = new RegExp(
    String.raw`con\s+el\s+frente\s+(?:hacia|al|viendo\s+al)\s+(?:el\s+)?${PUNTO}\b`,
  ).exec(sinAcentos(d));
  const frente = f ? RUMBO_DE[f[1]!] : undefined;
  const salida = direccionDeSalida(descripcion, marcha);
  // Con una dirección narrada, los metros van en esa dirección; si no, hacia donde avanzaba.
  const adelante = (n: number, texto: string): FinalNarrado =>
    salida && n > 0
      ? {
          punto: punto(avanzar(ll(imp.punto), salida.rumbo, n)),
          rumbo: frente ?? imp.rumbo,
          texto: `${n} m ${salida.texto} de su posición en el choque, como dice la narración`,
        }
      : {
          punto: punto(avanzar(ll(imp.punto), marcha, n)),
          rumbo: frente ?? imp.rumbo,
          texto,
        };
  // «a 1 m detrás del vehículo B», «a 2 m delante del vehículo C», «a 1 m del vehículo B»: desde donde
  // quedó el otro, defensa con defensa más N; sin «detrás» ni «delante», del lado donde estaba este en
  // el choque.
  const rel = new RegExp(
    String.raw`a\s+${NUM}\s*m(?:etros?)?\s+(?:(detr[aá]s|delante|adelante|enfrente)\s+)?del\s+veh[ií]culo\s+([a-z])\b`,
  ).exec(d);
  if (rel) {
    const otro = idDeLetra(rel[3]!);
    if (vistos.has(otro) || otro === vehiculo) return null;
    const suyo = otras.find((o) => o.vehiculo === otro);
    const finOtro =
      poseDe(e, otro, "final") ??
      (suyo
        ? finalDeLaNarracion(
            e,
            otro,
            suyo.descripcion,
            otras,
            new Set([...vistos, vehiculo]),
            calles,
          )
        : null);
    const vo = e.vehiculos.find((x) => x.id === otro);
    const vv = e.vehiculos.find((x) => x.id === vehiculo);
    if (!finOtro || !vo || !vv) return null;
    const n = metros(rel[1]!);
    const separacion = (medidasDe(vo).largo + medidasDe(vv).largo) / 2 + n;
    const lado = rel[2] ? (/detr/.test(rel[2]) ? "detrás" : "delante") : null;
    const haciaEste = enMetros(ll(imp.punto), ll(finOtro.punto));
    const rumboSep =
      lado === "detrás"
        ? normalizar(finOtro.rumbo + 180)
        : lado === "delante"
          ? finOtro.rumbo
          : normalizar((Math.atan2(haciaEste.este, haciaEste.norte) * 180) / Math.PI);
    return {
      punto: punto(avanzar(ll(finOtro.punto), rumboSep, separacion)),
      rumbo: frente ?? (lado ? finOtro.rumbo : imp.rumbo),
      texto: `${n} m ${lado ? `${lado} de` : "de"} donde quedó el vehículo ${rel[3]!.toUpperCase()}`,
    };
  }
  // «6 m después del paso peatonal», «a 4 m adelante del punto de contacto», «a 2 m del punto del
  // primer impacto», «a 3 m de donde estaba detenido» (o estacionado): desde su pose del choque, hacia
  // donde avanzaba.
  const desde = new RegExp(
    String.raw`${NUM}\s*m(?:etros?)?\s+(?:despu[eé]s|adelante|m[aá]s\s+all[aá])\s+del?\s+(?:paso\s+peatonal|punto\s+de\s+(?:contacto|impacto)|impacto|choque|cruce|contacto)|a\s+(?:unos\s+|aproximadamente\s+|cerca\s+de\s+)?${NUM}\s*m(?:etros?)?\s+del\s+punto\s+del?\s+(?:primer\s+)?(?:impacto|choque|contacto)|a\s+${NUM}\s*m(?:etros?)?\s+de\s+donde\s+(?:estaba|se\s+encontraba)\s+(?:detenid|estacionad)[oa]`,
  ).exec(d);
  // «sobre el acotamiento» (René, 2026-11-26: el Vento quedó en el acotamiento, no en su carril): del
  // centro de su carril (3.5 m) al centro del acotamiento (2.5 m), 3 m a su derecha (supuesto).
  const enElAcotamiento = (f: FinalNarrado): FinalNarrado => {
    if (!/\bsobre\s+el\s+acotamiento\b/.test(sinAcentos(d))) return f;
    const c = corrimientoAlAcotamiento(calles, f.punto);
    return {
      ...f,
      punto: punto(avanzar(ll(f.punto), normalizar(marcha + 90), c.metros)),
      texto: `${f.texto}, sobre el acotamiento: ${c.metros} m a la derecha de su carril (medio carril de ${c.carrilM} m y medio acotamiento de ${c.acotamientoM} m${c.delMapa ? ", de OpenStreetMap" : ", supuesto"}; corrígelo en «Escribir las posiciones en metros»)`,
    };
  };
  // «5 metros adelante del área de restos», «9 metros adelante del inicio de los restos» (René,
  // 2026-11-27): desde donde están los restos, el punto del primer choque, hacia donde avanzaba; no
  // desde su propia pose (el tercero de una carambola choca más adelante).
  const restos = new RegExp(
    String.raw`${NUM}\s*m(?:etros?)?\s+(?:despu[eé]s|adelante|m[aá]s\s+all[aá])\s+del?\s+(?:(?:[aá]rea|zona)\s+de\s+(?:los\s+)?restos|inicio\s+de\s+(?:los\s+)?restos|(?:[aá]rea|zona)\s+del\s+primer\s+contacto)`,
  ).exec(d);
  const primero = [...(e.impactos ?? [])].sort((a, b) => (a.orden ?? 1) - (b.orden ?? 1))[0];
  // El punto del primer choque; si no está guardado, el centro de las poses de sus vehículos.
  const poses = (primero?.vehiculos ?? []).flatMap((x) => {
    const q = poseDe(e, String(x), "impacto");
    return q ? [q.punto] : [];
  });
  const enLosRestos: Punto | null =
    primero?.punto ??
    (poses.length
      ? {
          lat: poses.reduce((a, q) => a + q.lat, 0) / poses.length,
          lon: poses.reduce((a, q) => a + q.lon, 0) / poses.length,
        }
      : null);
  if (restos && enLosRestos) {
    const n = metros(restos[1]!);
    return enElAcotamiento({
      punto: punto(avanzar(ll(enLosRestos), marcha, n)),
      rumbo: frente ?? imp.rumbo,
      texto: `${n} m adelante del área de los restos (el primer choque), hacia donde avanzaba`,
    });
  }
  // «a 25 m del borde de la carretera», «a 4 m de la orilla del camino, del lado izquierdo» (René,
  // 2026-11-27: la volcadura narrada a 110 km/h salía en 10 km/h porque el reposo no se ofrecía): desde
  // la orilla de la calzada, hacia afuera, a la altura de donde chocó. El lado, el narrado; si no lo
  // dice, la derecha de su marcha (supuesto, lo dice el texto).
  const borde = new RegExp(
    String.raw`a\s+(?:unos\s+|aproximadamente\s+)?${NUM}\s*m(?:etros?)?\s+(?:fuera\s+)?del?\s+(?:la\s+)?(?:borde|orilla|limite|l[ií]mite)\s+(?:de\s+la\s+|del\s+)?(?:carretera|cinta\s+asf[aá]ltica|camino|calzada|arroyo|pavimento|asfalto|acotamiento|v[ií]a|carpeta)`,
  ).exec(d);
  if (borde) {
    const n = metros(borde[1]!);
    const izquierda = /\b(?:lado|costado|margen)\s+izquierd[oa]\b|\ba\s+la\s+izquierda\b/.test(d);
    const derecha = /\b(?:lado|costado|margen)\s+derech[oa]\b|\ba\s+la\s+derecha\b/.test(d);
    const s = calles.length ? ajustarACalle(calles, imp.punto) : null;
    const mitad = s ? s.calle.ancho / 2 : CARRIL_SUPUESTO_M / 2;
    const eje = s?.punto ?? imp.punto;
    const lado = izquierda && !derecha ? -90 : 90;
    return {
      punto: punto(avanzar(ll(eje), normalizar(marcha + lado), mitad + n)),
      rumbo: frente ?? imp.rumbo,
      texto: `${n} m fuera de la orilla de la calzada, a la ${lado < 0 ? "izquierda" : "derecha"} de su marcha${izquierda || derecha ? "" : " (el lado es supuesto: la narración no lo dice)"}, a la altura del choque${s ? ` (la calzada de ${F.metros(s.calle.ancho, 1)})` : " (calzada supuesta de un carril)"}; corrígelo en «Escribir las posiciones en metros»`,
    };
  }
  // «se detuvo 3 metros adelante sobre Nicolás Bravo», «quedó 10 m más adelante»: desde su pose del
  // choque, hacia donde avanzaba.
  const masAdelante = new RegExp(
    String.raw`${NUM}\s*m(?:etros?)?\s+(?:m[aá]s\s+)?adelante(?:\s+sobre\s+(?:la\s+|el\s+)?([^,.;]+))?(?![\s]+del?\b)`,
  ).exec(d);
  if (!desde && masAdelante) {
    const n = metros(masAdelante[1]!);
    const sobreMin = /^acotamiento\b/.test(masAdelante[2]?.trim() ?? "")
      ? undefined
      : masAdelante[2]?.trim();
    // Como la escribió el perito («Nicolás Bravo»), no en minúsculas.
    const i = sobreMin ? descripcion.toLowerCase().indexOf(sobreMin) : -1;
    const sobre = sobreMin && i >= 0 ? descripcion.slice(i, i + sobreMin.length) : sobreMin;
    return enElAcotamiento(
      adelante(
        n,
        `${n} m adelante de su posición en el choque${sobre ? `, sobre ${sobre}` : ""}, hacia donde avanzaba`,
      ),
    );
  }
  if (desde) {
    const n = metros(desde[1] ?? desde[2] ?? desde[3]!);
    return enElAcotamiento(
      adelante(n, `${n} m adelante de su posición en el choque, hacia donde avanzaba`),
    );
  }
  // «junto al árbol», «contra la barda», «a 2 m adelante del poste»: en el objeto del choque (su pose
  // del choque), más los metros que diga hacia donde avanzaba.
  const objeto = new RegExp(
    String.raw`(?:a\s+${NUM}\s*m(?:etros?)?\s+(?:adelante|delante|despu[eé]s|m[aá]s\s+all[aá])\s+del?\s+(?:la\s+)?|junto\s+(?:al?|a\s+la)\s+|contra\s+(?:el|la)\s+)(?:arbol|árbol|poste|barda|muro|barrera|pared)`,
  ).exec(d);
  if (objeto) {
    const n = objeto[1] ? metros(objeto[1]) : 0;
    return adelante(
      n,
      n ? `${n} m adelante del objeto contra el que chocó` : "en el objeto contra el que chocó",
    );
  }
  // «quedó a 5 m, hacia el camellón», «a 4 metros al norte del cruce»: con la dirección narrada, los
  // metros que diga, aunque no diga desde dónde (desde su pose del choque).
  const suelto = new RegExp(String.raw`\ba\s+${NUM}\s*m(?:etros?)?\b`).exec(d);
  if (suelto && salida) return adelante(metros(suelto[1]!), "");
  // «el vehículo A quedó sobre el acotamiento sur», sin metros (René, 2026-11-28, #396): en el
  // acotamiento, a la altura del choque; cuánto avanzó es un supuesto y se dice.
  if (/\bsobre\s+el\s+acotamiento\b/.test(sinAcentos(d)))
    return enElAcotamiento(
      adelante(
        0,
        "a la altura de su posición en el choque (supuesto: la narración no dice cuántos metros avanzó)",
      ),
    );
  return null;
}

/**
 * Lo que va entre «sobre» o «por» y el nombre de la vía por la que se circulaba: nada, un artículo o
 * «los carriles laterales de la», «el carril central de», «la calzada de».
 */
const OBJETO_DE_LA_VIA =
  /\b(?:sobre|por)\s+(?:(?:el|la|los|las)\s+)?(?:(?:carril(?:es)?|lateral(?:es)?|cuerpo|arroyo|calzada|acotamiento)\b[^,.;]{0,30}?\bde\s+(?:(?:la|el|los|las)\s+)?)?$/;

/** La vía donde la narración pone el hecho: «se ubica sobre Paseo de la Reforma, en la bajada…». */
function viaDelLugar(narracion: string): string | null {
  const primera = narracion.split(/(?<=[.;])\s+/)[0] ?? "";
  const tp = sinAcentos(primera);
  for (const c of callesNarradas(primera))
    if (/\bsobre\s+(?:(?:la|el)\s+)?$/.test(tp.slice(Math.max(0, c.en - 20), c.en)))
      return c.nombre;
  return null;
}

/** Estar quieto en la vía. */
const ESTACIONADO = /\b(?:estacionad|detenid|parad)[oa]s?\b/;

/** Circular, en las formas en que lo dicen las narraciones. */
const CIRCULABA =
  /\b(?:circulaba|transitaba|iba|venia|avanzaba|se\s+desplazaba|se\s+dirigia|conducia|bajaba|subia|marchaba)\b/;

/**
 * La calle por la que la narración dice que llegaba un vehículo («el vehículo A circulaba sobre
 * Avenida Tecnológico de sur a norte»; «por los carriles laterales de la Calzada de Tlalpan»): en la
 * primera oración que lo nombra y dice que circulaba, la primera calle nombrada poco después de «sobre»
 * o «por» (René, 2026-11-25: la calle de llegada tiene que ser la narrada). null si no la dice.
 */
export function calleDeLlegadaNarrada(
  narracion: string,
  v: Vehiculo,
  todos: readonly Vehiculo[],
  delOtro = true,
): string | null {
  const nombres = nombresDe(v, todos);
  const nombra = (o: string) =>
    nombres.some(
      (n) => n.trim() && new RegExp(`\\b${escapar(sinAcentos(n))}\\b`).test(sinAcentos(o)),
    );
  for (const o of narracion.split(/(?<=[.;])\s+/)) {
    if (!nombra(o)) continue;
    // Solo lo que la oración dice de ESTE vehículo (René, 2026-11-26: el poste en Tianguismanalco).
    const [a, b] = rangoDelVehiculo(o, nombres);
    const t = sinAcentos(o).slice(a, b);
    // Estacionado o detenido sin nombrar la vía: en la vía donde la narración pone el hecho (aud-37:
    // «se encontraban estacionados junto a la guarnición»).
    if (!CIRCULABA.test(t)) {
      if (ESTACIONADO.test(t)) {
        const lugar = viaDelLugar(narracion);
        if (lugar) return lugar;
      }
      continue;
    }
    const desde = CIRCULABA.exec(t)!.index;
    const completa = sinAcentos(o);
    for (const c of callesNarradas(o)) {
      if (c.en < a + desde || c.en >= b) continue;
      // La calle es lo que va después de «sobre» o «por» («por los carriles laterales de la …»), no
      // cualquier calle que siga («por el semáforo de Avenida Prado Norte» no es por dónde iba).
      if (OBJETO_DE_LA_VIA.test(completa.slice(Math.max(a + desde, c.en - 60), c.en)))
        return c.nombre;
    }
    // «por el carril derecho del paso a desnivel»: la vía del lugar, la primera que nombra la narración.
    if (/\bcarril\b[^.;]*\bdel\s+(?:paso|puente|tunel|viaducto|distribuidor)\b/.test(t))
      return callesNarradas(narracion)[0]?.nombre ?? null;
    // «circulaba … por el carril derecho», sin nombrar la vía: el carril es de la vía donde la narración
    // pone el hecho («se ubica sobre Paseo de la Reforma…»; aud-33).
    if (/\bpor\s+el\s+carril\s+(?!mismo)/.test(t)) {
      const lugar = viaDelLugar(narracion);
      if (lugar) return lugar;
    }
    // «circulaba detrás de él por el mismo carril», «bajaba en sentido contrario»: por la calle del otro.
    if (
      delOtro &&
      /\b(?:por\s+el\s+mismo\s+carril|detras\s+de\s+(?:el|ella)|en\s+sentido\s+contrario|en\s+el\s+mismo\s+sentido)\b/.test(
        t,
      )
    ) {
      for (const w of todos)
        if (w.id !== v.id) {
          const suya = calleDeLlegadaNarrada(narracion, w, todos, false);
          if (suya) return suya;
        }
      // Si el otro tampoco la dice: la vía donde la narración pone el hecho.
      const lugar = viaDelLugar(narracion);
      if (lugar) return lugar;
    }
  }
  return null;
}

/**
 * El sentido de un vehículo en su caso: el que dice la narración, o el relativo a otro (René,
 * 2026-11-24: «el vehículo B … bajaba en sentido contrario» quedaba cruzado, porque solo se entendían
 * los puntos cardinales). «En sentido contrario» u «opuesto» es el contrario del otro vehículo que
 * nombra la oración (o del único otro con sentido); «en el mismo sentido», «por el mismo carril» o
 * «detrás de él», el mismo.
 */
export function sentidoEnElCaso(
  narracion: string,
  v: Vehiculo,
  todos: readonly Vehiculo[],
): SentidoNarrado | null {
  const propio = sentidoNarrado(narracion, nombresDe(v, todos));
  if (propio) return propio;
  const nombra = (o: string, w: Vehiculo) =>
    nombresDe(w, todos).some(
      (n) => n.trim() && new RegExp(`\\b${escapar(sinAcentos(n))}\\b`).test(sinAcentos(o)),
    );
  const otros = todos
    .filter((w) => w.id !== v.id)
    .map((w) => ({ w, s: sentidoNarrado(narracion, nombresDe(w, todos)) }))
    .filter((x): x is { w: Vehiculo; s: SentidoNarrado } => x.s !== null);
  for (const o of narracion.split(/(?<=[.;])\s+/).filter((x) => nombra(x, v))) {
    const t = sinAcentos(o);
    const m =
      /\b(?:en|con|por el|circulaba en)\s+(?:el\s+)?(sentido|direccion)\s+(contrari[oa]|opuest[oa]|invers[oa])\b|\ben\s+el\s+mismo\s+sentido\b|\bpor\s+el\s+mismo\s+carril\b|\bdetras\s+de\s+(?:el|ella|este|este\s+ultimo)\b/.exec(
        t,
      );
    if (!m) continue;
    const ref = otros.find((x) => nombra(o, x.w)) ?? (otros.length === 1 ? otros[0] : undefined);
    if (!ref) continue;
    const mismo = !m[2];
    const rumbo = normalizar(ref.s.rumbo + (mismo ? 0 : 180));
    return { rumbo, desde: cardinal(rumbo + 180), cita: citaDe(o, m[0]) };
  }
  return null;
}

const difRumbo = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Si se puede circular por la calle con ese rumbo en ese tramo (±45°, respetando su sentido único). */
function admiteRumbo(c: Calle, rumboTramo: number, rumbo: number): boolean {
  if (c.unSentido === 1) return difRumbo(rumboTramo, rumbo) <= 45;
  if (c.unSentido === -1) return difRumbo(rumboTramo + 180, rumbo) <= 45;
  return difRumbo(rumboTramo, rumbo) <= 45 || difRumbo(rumboTramo + 180, rumbo) <= 45;
}

/**
 * La calzada en el sentido del vehículo (revisión de la cadena, cesvi-ebb5c029a8): en una avenida con
 * carriles centrales y laterales de un solo sentido, La escena ponía al que iba de norte a sur en la
 * lateral que va de sur a norte, y «su derecha» quedaba hacia los carriles centrales. Si ninguna calle a
 * 3 m del choque admite ese rumbo, el choque pasa a la calzada más cercana (a menos de 40 m) que sí lo
 * admite. null si no hace falta moverlo o si no hay otra.
 */
export function calzadaEnSuSentido(
  calles: readonly Calle[],
  p: Punto,
  rumbo: number,
): { punto: Punto; calle: Calle } | null {
  const aqui = calles.map((c) => ({ c, s: sobreCalle(c, p) })).filter((x) => x.s.distancia <= 3);
  if (!aqui.length || aqui.some((x) => admiteRumbo(x.c, x.s.rumbo, rumbo))) return null;
  // Solo si la calle de aquí es de un solo sentido y va al revés.
  if (
    !aqui.some(
      (x) => x.c.unSentido && difRumbo(x.s.rumbo + (x.c.unSentido === -1 ? 180 : 0), rumbo) > 135,
    )
  )
    return null;
  let mejor: { punto: Punto; calle: Calle; d: number } | null = null;
  for (const c of calles) {
    const s = sobreCalle(c, p);
    if (s.distancia > 40 || !admiteRumbo(c, s.rumbo, rumbo)) continue;
    if (!mejor || s.distancia < mejor.d) mejor = { punto: s.punto, calle: c, d: s.distancia };
  }
  return mejor ? { punto: mejor.punto, calle: mejor.calle } : null;
}
