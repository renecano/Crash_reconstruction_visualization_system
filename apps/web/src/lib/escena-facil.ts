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
import {
  avanzar,
  conPosicion,
  distanciaM,
  enMetros,
  posesDeImpacto,
  rumboDeg,
  type Expediente,
  type LonLat,
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

// El tipo de vía en mayúscula o minúscula; el nombre, con mayúscula (la expresión no lleva «i»: con
// ella, «calle Azucena esquina con Av» se tragaba las palabras en minúscula).
const TIPO_VIA =
  "(?:[Cc]alle|[Aa]venida|[Aa]v\\.?|[Bb]oulevard|[Bb]lvd\\.?|[Bb]ulevar|[Cc]alzada|[Cc]arretera|[Pp]rivada|[Pp]rolongaci[oó]n|[Pp]erif[eé]rico|[Cc]ircuito|[Cc]amino|[Pp]aseo|[Ee]je)";
const PALABRA_NOMBRE = "[A-ZÁÉÍÓÚÑ0-9][\\wÁÉÍÓÚÑáéíóúñ.'-]*";
const UNION = "(?:\\s+(?:de|del|la|las|los|el)\\s+|\\s+)";
const RE_CALLE = new RegExp(
  `\\b(${TIPO_VIA})\\s+(${PALABRA_NOMBRE}(?:${UNION}${PALABRA_NOMBRE}){0,3})`,
  "g",
);

/** Las calles que nombra la narración («la Calle Azucena», «Av. Juárez»), en orden y sin repetir. */
export function callesNarradas(narracion: string): { nombre: string; en: number }[] {
  const out: { nombre: string; en: number }[] = [];
  for (const m of narracion.matchAll(RE_CALLE)) {
    // «… y la Calle Jazmín»: el nombre se corta en una palabra minúscula que no sea de unión.
    const nombre = `${m[1]!} ${m[2]!}`.replace(/[.,;:]+$/, "").trim();
    if (!out.some((x) => nombreComparable(x.nombre) === nombreComparable(nombre)))
      out.push({ nombre, en: m.index ?? 0 });
  }
  return out;
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
    const t = sinAcentos(o);
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
  /** Ids de sus nodos, en orden (para los cruces). */
  nodos: number[];
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
      nodos: w.nodes.filter((id) => nodos.has(id)),
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
    // Dos tramos de la misma calle no son un cruce.
    const distintas = new Set([...e.calles].map((c) => c.nombre ?? `#${c.id}`)).size;
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
  segun: "narracion" | "una_calle" | "cercania";
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
    const tiene = (c: Cruce, b: string) =>
      c.calles.some((n) => {
        const x = nombreComparable(n);
        return x === b || x.includes(b) || b.includes(x);
      });
    const ambas = porCercania.find((c) => buscadas.every((b) => tiene(c, b)));
    if (ambas)
      return { punto: ambas.punto, calles: ambas.calles, segun: "narracion", cita: narrado.cita };
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
  const primero = porCercania[0]!;
  if (lugar && cerca(primero) > 150) return null;
  return { punto: primero.punto, calles: primero.calles, segun: "cercania", cita: null };
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

/**
 * Las flechas de llegada al choque: una por cada calle que llega (los dos lados de una calle que
 * pasa, uno si termina ahí), con su punto cardinal y su nombre; las que difieren menos de 25° cuentan
 * una vez. Sin calles cerca, las cuatro de los puntos cardinales.
 */
export function flechasDeLlegada(calles: readonly Calle[], choque: Punto): Flecha[] {
  const out: Flecha[] = [];
  for (const c of calles) {
    const s = sobreCalle(c, choque);
    if (s.distancia > 25) continue;
    // Los dos brazos desde el punto más cercano: hacia el inicio y hacia el final de la calle.
    for (const haciaFinal of [true, false]) {
      const brazo = puntoDelBrazo(c, s.tramo, s.t, haciaFinal, DISTANCIA_FLECHA_M);
      if (!brazo) continue;
      const salida = rumboDeg(ll(choque), ll(brazo));
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
  return mejor;
}

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

/** Cómo se llama un vehículo en pantalla: su modelo o su marca («Jetta»); nunca «V1». */
export function nombreVehiculo(v: Vehiculo, todos: readonly Vehiculo[] = [v]): string {
  const base = v.modelo?.valor?.trim() || v.marca?.valor?.trim() || `Vehículo ${letra(v, todos)}`;
  const repetido = todos.filter(
    (x) => (x.modelo?.valor?.trim() || x.marca?.valor?.trim() || "") === base,
  ).length;
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

export type PasoEscena =
  | { tipo: "choque"; orden: number; hecho: boolean }
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
export function pasosEscena(
  e: Expediente,
  impactos: readonly ImpactoAColocar[],
  s: { desconocidos: readonly string[]; direccionesNoSe: readonly string[] },
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
  return [...choques, ...vehiculos];
}

/** El paso en curso: el primero sin terminar (los choques primero). null si todo está listo. */
export const pasoActual = (pasos: readonly PasoEscena[]) => pasos.find((p) => !p.hecho) ?? null;

// --- Respuestas → expediente ---------------------------------------------------------------------

/**
 * «Sí, fue en ese cruce» o un toque en el mapa: el choque en `p`. Las poses de impacto las propone
 * Croquis con las zonas de contacto (con fuente «supuesto» hasta que la persona dice por dónde venía
 * cada uno); en una carambola, solo las de quien entra en ese choque. `rumbo`: el del primer
 * vehículo (el de la narración, el de la calle o el que ya tenía).
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
  for (const pose of posesDeImpacto(e, p, rumbo, orden)) {
    if (antes.has(pose.vehiculo)) continue;
    r = conPosicion(r, {
      vehiculo: pose.vehiculo,
      fase: "impacto",
      punto: pose.punto,
      rumbo: pose.rumbo,
      fuente: "supuesto",
    });
  }
  return r;
}

/**
 * «Por dónde venía»: el vehículo avanzaba con `rumbo` al llegar al choque. El primero de su choque
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
    rumbo: primero ? (nueva?.rumbo ?? rumbo) : rumbo,
    fuente: noSe ? "supuesto" : "perito",
  });
}

/** «Lo marco en el mapa»: dónde quedó, alineado a la calle si hay una cerca. */
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
 * «Quedó junto al choque»: un poco adelante de su pose de impacto (1.5 m en su rumbo), con el mismo
 * rumbo. Sin pose de impacto, nada cambia.
 */
export function quedoJuntoAlChoque(e: Expediente, vehiculo: string): Expediente {
  const pose = poseDe(e, vehiculo, "impacto");
  if (!pose) return e;
  const p = punto(avanzar(ll(pose.punto), pose.rumbo, 1.5));
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
  tipo: "choque" | "vehiculo";
  vehiculo?: string;
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
