/**
 * La lectura de un texto del expediente de CESVI (ADR 0055): la descripción técnica del hecho que
 * escribe el perito, o la versión declarada de un conductor. Define la salida estructurada que pide
 * Claude, el prompt (con el glosario de los 671 dictámenes) y la validación que hace Croquis al
 * volver: cada dato cita su frase literal, y si la frase no está en el texto, el dato se descarta;
 * si un número no está en su frase, se descarta el número. La IA ordena lo que dice el texto; no
 * produce números.
 */
import glosarioJson from "../../../data/cesvi/glosario.json";

export const VERSION_PROMPT_HECHO = "hecho-cesvi-v1";

export type TipoTexto = "descripcion" | "declaracion";
export type Hacia = "norte" | "sur" | "oriente" | "poniente";
export const MANIOBRAS = [
  "circula",
  "se_detiene",
  "reversa",
  "frena",
  "vira_izquierda",
  "vira_derecha",
  "cambia_carril",
  "evasiva",
  "otra",
] as const;
export type Maniobra = (typeof MANIOBRAS)[number];

/** Un dato leído: su valor en términos de CESVI y la frase literal del texto de donde sale. */
export interface DatoLeido {
  valor: string;
  cita: string;
}
export interface SentidoLeido extends DatoLeido {
  /** «no_dice» es como lo devuelve el modelo cuando el texto no lo dice. */
  hacia: Hacia | "no_dice" | null;
}
export interface ManiobraLeida extends DatoLeido {
  tipo: Maniobra;
  /** Metros, solo si el número está escrito en la cita. */
  metros: number | null;
}
export interface RestosLeidos extends DatoLeido {
  metros: number | null;
}
export interface VehiculoLeido {
  sentido: SentidoLeido | null;
  carril: DatoLeido | null;
  zona_contacto: DatoLeido | null;
  acentuacion: DatoLeido | null;
  vertice: DatoLeido | null;
  direccion_fuerza: DatoLeido | null;
  maniobras: ManiobraLeida[];
  posicion_final: DatoLeido | null;
}
export interface LecturaHecho {
  modalidad: DatoLeido | null;
  vehiculos: { A: VehiculoLeido; B: VehiculoLeido };
  restos: RestosLeidos[];
  huellas: DatoLeido[];
  via: DatoLeido[];
  preguntas: { clave: string; texto: string }[];
}

/* ------------------------------------------------------------------------------------------ */
/* Salida estructurada                                                                        */
/* ------------------------------------------------------------------------------------------ */

/** Los campos que el modelo puede leer, uno por renglón de su lista. */
export const CAMPOS = [
  "modalidad",
  "sentido",
  "carril",
  "zona_contacto",
  "acentuacion",
  "vertice",
  "direccion_fuerza",
  "maniobra",
  "posicion_final",
  "restos",
  "huella",
  "via",
] as const;
export type Campo = (typeof CAMPOS)[number];

/**
 * Lo que devuelve el modelo: una lista plana de datos (cada uno con su campo, su vehículo, su valor
 * y su cita) y las preguntas. Una lista plana mantiene chica la gramática de la salida
 * estructurada; `lecturaDeSalida` la convierte en la lectura por vehículo.
 */
export interface SalidaModelo {
  datos: {
    campo: Campo;
    vehiculo: "A" | "B" | "ninguno";
    valor: string;
    cita: string;
    hacia: Hacia | "no_aplica";
    maniobra: Maniobra | "no_aplica";
    metros: number | null;
  }[];
  preguntas: { clave: string; texto: string }[];
}

const texto = { type: "string" };

/** El esquema JSON de la salida estructurada (output_config.format). */
export const ESQUEMA_LECTURA = {
  type: "object",
  properties: {
    datos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          campo: { type: "string", enum: [...CAMPOS] },
          vehiculo: { type: "string", enum: ["A", "B", "ninguno"] },
          valor: texto,
          cita: texto,
          hacia: { type: "string", enum: ["norte", "sur", "oriente", "poniente", "no_aplica"] },
          maniobra: { type: "string", enum: [...MANIOBRAS, "no_aplica"] },
          metros: { anyOf: [{ type: "number" }, { type: "null" }] },
        },
        required: ["campo", "vehiculo", "valor", "cita", "hacia", "maniobra", "metros"],
        additionalProperties: false,
      },
    },
    preguntas: {
      type: "array",
      items: {
        type: "object",
        properties: { clave: texto, texto },
        required: ["clave", "texto"],
        additionalProperties: false,
      },
    },
  },
  required: ["datos", "preguntas"],
  additionalProperties: false,
} as const;

const vacio = (): VehiculoLeido => ({
  sentido: null,
  carril: null,
  zona_contacto: null,
  acentuacion: null,
  vertice: null,
  direccion_fuerza: null,
  maniobras: [],
  posicion_final: null,
});

/** La lista del modelo como lectura por vehículo (en cada campo único, el primer dato). */
export function lecturaDeSalida(s: SalidaModelo): LecturaHecho {
  const l: LecturaHecho = {
    modalidad: null,
    vehiculos: { A: vacio(), B: vacio() },
    restos: [],
    huellas: [],
    via: [],
    preguntas: s.preguntas,
  };
  for (const d of s.datos) {
    const base = { valor: d.valor, cita: d.cita };
    const v = d.vehiculo === "ninguno" ? null : l.vehiculos[d.vehiculo];
    switch (d.campo) {
      case "modalidad":
        l.modalidad ??= base;
        break;
      case "restos":
        l.restos.push({ ...base, metros: d.metros });
        break;
      case "huella":
        l.huellas.push(base);
        break;
      case "via":
        l.via.push(base);
        break;
      case "sentido":
        if (v) v.sentido ??= { ...base, hacia: d.hacia === "no_aplica" ? null : d.hacia };
        break;
      case "maniobra":
        if (v) {
          v.maniobras.push({
            ...base,
            tipo: d.maniobra === "no_aplica" ? "otra" : d.maniobra,
            metros: d.metros,
          });
        }
        break;
      default:
        if (v) v[d.campo] ??= base;
    }
  }
  return l;
}

/* ------------------------------------------------------------------------------------------ */
/* Prompt                                                                                     */
/* ------------------------------------------------------------------------------------------ */

interface TerminoGlosario {
  termino: string;
  variantes: string[];
  documentos: number;
}
interface Glosario {
  dictamenes: number;
  glosario: Record<string, TerminoGlosario[]>;
}
export const GLOSARIO = glosarioJson as Glosario;

const NOMBRE_CATEGORIA: Record<string, string> = {
  modalidad: "Modalidad",
  tipo_de_dano: "Tipo de daño",
  zona_de_contacto: "Zona de contacto",
  acentuacion: "Acentuación",
  direccion_de_la_fuerza: "Dirección de la fuerza",
  sentido_y_carril: "Sentido y carril",
  maniobras: "Maniobras",
  restos_y_huellas: "Restos y huellas",
  posiciones: "Posiciones",
  via: "Condiciones de la vía",
};

/** El glosario como lo lee el modelo: por categoría, cada término con en cuántos dictámenes sale. */
export function glosarioParaPrompt(g: Glosario = GLOSARIO): string {
  return Object.entries(g.glosario)
    .map(
      ([cat, ts]) =>
        `${NOMBRE_CATEGORIA[cat] ?? cat}: ${ts.map((t) => `${t.termino} (${t.documentos})`).join(", ")}`,
    )
    .join("\n");
}

export const SISTEMA_LECTURA =
  `Eres asistente de los peritos de CESVI México. Lees un texto del expediente de un hecho de tránsito y ordenas lo que dice en la estructura pedida, con el vocabulario técnico de los dictámenes de CESVI.

El texto es de uno de dos tipos:
- «descripcion»: la descripción técnica del hecho que escribe el perito. Con ella se arma la versión de la evidencia.
- «declaracion»: la versión declarada de un conductor, citada literalmente (en primera persona: «yo», «me», «mi camioneta» son el vehículo de quien declara). Con ella se arma la versión declarada.

Qué leer, para cada vehículo (A y B, como se te indica en el mensaje):
- sentido de circulación (de sur a norte, de oriente a poniente…) y, en «hacia», el punto cardinal al que se dirige;
- carril al momento del impacto (izquierdo, derecho, central, acotamiento);
- zona de contacto (parte frontal, parte posterior, lado izquierdo, lado derecho…), su acentuación (hacia qué lado se carga el daño) y el vértice (vértice posterior izquierdo…);
- dirección de la fuerza (de atrás hacia adelante, de izquierda a derecha…);
- maniobras en orden (circula, se detiene, reversa, frena, vira, cambia de carril, maniobra evasiva), con los metros solo si el texto los escribe con número;
- posición final.
Y del hecho: la modalidad (alcance, colisión lateral, crucero…), los restos (con su longitud en metros si el texto la escribe), las huellas (de frenado, de arrastre, derrapamiento) y las condiciones de la vía (carpeta, carriles, líneas, pendiente, curva, visibilidad).

Formato: una lista «datos», un renglón por dato, con su «campo», el «vehiculo» al que se refiere ("ninguno" para modalidad, restos, huellas y vía), «valor» y «cita». En «sentido», «hacia» es el punto cardinal al que se dirige; en «maniobra», «maniobra» es su tipo; «metros» va en «maniobra» y «restos»; en lo demás, «hacia» y «maniobra» son "no_aplica" y «metros» es null. Las maniobras van en el orden en que ocurrieron.

Reglas:
- «cita» es un fragmento copiado letra por letra del texto, el más corto que respalda el dato. Si el texto no lo dice o no puedes citarlo, no pongas el dato.
- «valor» usa los términos del glosario (abajo, con en cuántos de los ${GLOSARIO.dictamenes} dictámenes aparece cada uno), en minúsculas y sin adornos.
- No calcules, no estimes y no conviertas números: los metros solo se copian si están escritos en la cita; «unos metros» es metros null.
- No supongas lo que el texto no dice; para eso están las preguntas.
- «preguntas»: lo que el perito tendría que precisar para reconstruir el hecho y que el texto no dice o deja ambiguo, en lenguaje técnico y breve («¿Carril de A al momento del impacto?», «¿Cuántos metros de reversa?»). No preguntes velocidades: salen del cálculo. «clave» es una palabra corta en minúsculas (carril_a, reversa, restos…).
- No atribuyas culpa ni responsabilidad legal.

Glosario de los dictámenes de CESVI:
{GLOSARIO}`.replace("{GLOSARIO}", glosarioParaPrompt());

/** El mensaje: el tipo de texto, quién es A y quién es B, y el texto. */
export function mensajeLectura(
  tipo: TipoTexto,
  texto: string,
  vehiculos: { A: string; B: string },
  declarante?: "A" | "B",
): string {
  const quien =
    tipo === "declaracion"
      ? `Tipo: declaracion. Declara el conductor del vehículo ${declarante ?? "A"}.`
      : "Tipo: descripcion (del perito).";
  return `${quien}\nVehículo A: ${vehiculos.A}. Vehículo B: ${vehiculos.B}.\n\nTexto:\n${texto}`;
}

/* ------------------------------------------------------------------------------------------ */
/* Validación                                                                                 */
/* ------------------------------------------------------------------------------------------ */

/** Sin acentos ni mayúsculas, con la misma longitud (para que las posiciones sirvan en el original). */
export function plano(t: string): string {
  let out = "";
  for (const c of t) {
    const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
    out += (base.length === c.length ? base : c).toLowerCase();
  }
  return out;
}

export interface Tramo {
  inicio: number;
  fin: number;
  texto: string;
}

/** Dónde está la cita en el texto (sin distinguir acentos, mayúsculas ni espacios repetidos). */
export function ubicarCita(textoFuente: string, cita: string): Tramo | null {
  const c = plano(cita.trim()).replace(/\s+/g, " ");
  if (c.length < 2) return null;
  const t = plano(textoFuente);
  // Búsqueda tolerante a espacios: la cita normalizada contra el texto con espacios colapsados.
  const mapa: number[] = [];
  let colapsado = "";
  for (let i = 0; i < t.length; i++) {
    const esEspacio = /\s/.test(t[i]!);
    if (esEspacio && colapsado.endsWith(" ")) continue;
    colapsado += esEspacio ? " " : t[i];
    mapa.push(i);
  }
  const k = colapsado.indexOf(c);
  if (k < 0) return null;
  const inicio = mapa[k]!;
  const fin = mapa[k + c.length - 1]! + 1;
  return { inicio, fin, texto: textoFuente.slice(inicio, fin) };
}

/** Un número escrito en la cita (con punto o coma decimal). */
function numeroEnCita(n: number | null, cita: string): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  const escritos = (cita.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));
  return escritos.some((x) => Math.abs(x - n) < 1e-9) ? n : null;
}

/** Un dato con su tramo en el texto. */
export type ConTramo<T> = T & { tramo: Tramo };

/** El sentido ya validado: «no_dice» pasa a null. */
export interface SentidoValidado extends DatoLeido {
  hacia: Hacia | null;
}
export interface VehiculoValidado {
  sentido: ConTramo<SentidoValidado> | null;
  carril: ConTramo<DatoLeido> | null;
  zona_contacto: ConTramo<DatoLeido> | null;
  acentuacion: ConTramo<DatoLeido> | null;
  vertice: ConTramo<DatoLeido> | null;
  direccion_fuerza: ConTramo<DatoLeido> | null;
  maniobras: ConTramo<ManiobraLeida>[];
  posicion_final: ConTramo<DatoLeido> | null;
}
export interface LecturaValidada {
  modalidad: ConTramo<DatoLeido> | null;
  vehiculos: { A: VehiculoValidado; B: VehiculoValidado };
  restos: ConTramo<RestosLeidos>[];
  huellas: ConTramo<DatoLeido>[];
  via: ConTramo<DatoLeido>[];
  preguntas: { clave: string; texto: string }[];
  /** Cuántos datos se descartaron porque su cita no está en el texto. */
  descartados: number;
}

/**
 * Lo que vuelve del modelo, revisado contra el texto: los datos sin cita en el texto se descartan
 * y los números que no están en su cita se quitan.
 */
export function validarLectura(l: LecturaHecho, textoFuente: string): LecturaValidada {
  let descartados = 0;
  const uno = <T extends DatoLeido>(d: T | null): ConTramo<T> | null => {
    // Sin cita: el texto no lo dice (no cuenta como descartado).
    if (!d || !d.cita.trim()) return null;
    const tramo = ubicarCita(textoFuente, d.cita);
    if (!tramo) {
      descartados++;
      return null;
    }
    const conNumero =
      "metros" in d ? { ...d, metros: numeroEnCita(d.metros as number | null, d.cita) } : d;
    return { ...conNumero, tramo };
  };
  const varios = <T extends DatoLeido>(ds: T[]): ConTramo<T>[] =>
    ds.map(uno).filter((d): d is ConTramo<T> => d !== null);
  const veh = (v: VehiculoLeido): VehiculoValidado => ({
    sentido: ((x): ConTramo<SentidoValidado> | null =>
      x ? { ...x, hacia: x.hacia === "no_dice" ? null : x.hacia } : null)(uno(v.sentido)),
    carril: uno(v.carril),
    zona_contacto: uno(v.zona_contacto),
    acentuacion: uno(v.acentuacion),
    vertice: uno(v.vertice),
    direccion_fuerza: uno(v.direccion_fuerza),
    maniobras: varios(v.maniobras),
    posicion_final: uno(v.posicion_final),
  });
  const r: LecturaValidada = {
    modalidad: uno(l.modalidad),
    vehiculos: { A: veh(l.vehiculos.A), B: veh(l.vehiculos.B) },
    restos: varios(l.restos),
    huellas: varios(l.huellas),
    via: varios(l.via),
    preguntas: l.preguntas.filter((p) => !/velocidad/i.test(p.texto)).slice(0, 6),
    descartados: 0,
  };
  r.descartados = descartados;
  return r;
}
