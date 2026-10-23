/**
 * El corpus estructurado de los reportes de CESVI (C0, docs/cesvi/PLAN-CESVI.md §3): cada dictamen
 * se lee con Claude en una lista plana de datos (`ESQUEMA_CORPUS`) y Croquis la convierte en un
 * expediente del contrato v2 (`expedienteDeSalida`).
 *
 * La lista es plana (cada fila: sección, número de grupo, vehículo, campo, valor y cita) porque un
 * esquema con una estructura por sección pasa el límite de gramática de la salida estructurada de
 * la API; la lista cabe sin importar cuántas secciones haya. Los valores cerrados se revisan aquí
 * contra las enumeraciones del contrato.
 *
 * Lo que hace Croquis al volver, sin confiar en el modelo:
 * - un valor fuera de su enumeración o un campo que no es de su sección se descarta y se cuenta;
 * - cada cita debe estar en el dictamen (sin distinguir acentos, mayúsculas ni espacios); si no está,
 *   se quita y se cuenta;
 * - cada número debe estar escrito en una cita encontrada de su grupo; si no, se quita y se cuenta;
 * - las citas y los textos que se guardan pasan por la redacción de datos personales;
 * - el expediente se valida contra el JSON Schema y el validador semántico.
 *
 * La IA ordena lo que dice el dictamen: copia los números como están escritos; las unidades de las
 * medidas de deformación (cm a m) y de altura (m a cm) las convierte este código.
 */
import { redact, sha256Hex } from "@croquis/extraction";
import {
  checkExpediente,
  ESCENA_JSON_SCHEMA,
  expedienteErrors,
  type EscenaSpec,
} from "@croquis/scene-schema";
import { GLOSARIO, glosarioParaPrompt, ubicarCita } from "./hecho-lectura";

export const VERSION_PROMPT_CORPUS = "corpus-cesvi-v4";

/**
 * Versiones del prompt con que se aceptan lecturas en el corpus. La v3 solo agrega cómo nombrar la
 * contraparte de un impacto de un solo vehículo y el vehículo del declarante; con ella se releyeron
 * los dictámenes que con la v2 no validaban por eso (ADR 0058). La v4 solo agrega que la masa, la
 * rigidez y las medidas de deformación van en el vehículo y en el daño aunque el reporte las
 * escriba en sus cálculos o en una tabla, y que de una cuenta se copia el resultado; con ella se
 * releen los reportes que traen esas medidas (R4b, ADR 0069).
 */
export const VERSIONES_ACEPTADAS = ["corpus-cesvi-v2", "corpus-cesvi-v3", "corpus-cesvi-v4"];

export type Expediente = NonNullable<EscenaSpec["expediente"]>;

// --- Enumeraciones: las del contrato -----------------------------------------------------------

type Prop = { enum?: string[]; items?: Prop; properties?: Record<string, Prop> };
const DEFS = (ESCENA_JSON_SCHEMA as unknown as { $defs: Record<string, Prop> }).$defs;
const enumDe = (def: string, ...ruta: string[]): string[] => {
  let p = DEFS[def]!;
  for (const r of ruta) p = (p.properties ?? p.items!.properties)![r]!;
  const e = p.enum ?? p.items?.enum;
  if (!e) throw new Error(`Sin enum en ${def}/${ruta.join("/")}`);
  return e;
};

export const MODALIDADES = enumDe("Modalidad");
export const VEREDICTOS = enumDe("ResultadoExpediente", "conclusion", "veredicto");

/** Hasta 8 vehículos por dictamen: V1, V2… en el orden en que el dictamen los presenta. */
export const IDS_VEHICULO = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"] as const;

/** Las secciones y sus campos. */
export const CAMPOS_POR_SECCION = {
  caso: ["modalidad", "aseguradora", "fecha_hora", "lugar", "municipio", "entidad"],
  vehiculo: ["marca", "modelo", "anio", "clase", "masa", "rigidez"],
  dano: [
    "cara",
    "tercio",
    "vertice",
    "altura",
    "direccion",
    "tipo",
    "magnitud",
    "medidas",
    "intercambio",
    "previo",
  ],
  impacto: ["participante", "objeto_fijo", "contacto"],
  declaracion: ["version", "maniobra"],
  restos: ["longitud"],
  huella: ["tipo_huella", "longitud"],
  objeto_fijo: ["descripcion"],
  // Solo la lectura de la narración del perito (R1): dónde queda cada vehículo, en palabras.
  posicion: ["fase", "descripcion"],
  // Lo que hacía cada vehículo antes del impacto: la narración (R4b) y la declaración (R7, con
  // la velocidad que declara el conductor).
  movimiento: ["maniobra", "velocidad"],
  calculo: ["metodo", "resultado", "entradas"],
  criterio: ["criterio", "estado"],
  conclusion: ["veredicto"],
} as const;
export type Seccion = keyof typeof CAMPOS_POR_SECCION;
const SECCIONES = Object.keys(CAMPOS_POR_SECCION) as Seccion[];
const CAMPOS = [...new Set(Object.values(CAMPOS_POR_SECCION).flat())];

/** Los valores permitidos de los campos cerrados (los del contrato). */
export const VALORES: Record<string, readonly string[]> = {
  modalidad: MODALIDADES,
  clase: enumDe("VehiculoExpediente", "clase"),
  cara: enumDe("ZonaDiagrama", "cara"),
  tercio: enumDe("ZonaDiagrama", "tercio"),
  vertice: enumDe("ZonaDiagrama", "vertice"),
  direccion: enumDe("DireccionDeformacion"),
  tipo: enumDe("DanoExpediente", "tipos"),
  magnitud: enumDe("DanoExpediente", "magnitud", "cualitativa"),
  previo: ["si", "no"],
  participante: IDS_VEHICULO,
  maniobra: enumDe("ManiobraExpediente", "tipo"),
  tipo_huella: enumDe("EvidenciasLugar", "huellas", "tipo"),
  metodo: enumDe("CalculoExpediente", "metodo"),
  criterio: enumDe("CriterioExpediente", "criterio"),
  estado: enumDe("CriterioExpediente", "estado"),
  veredicto: VEREDICTOS,
  fase: ["inicial", "impacto", "final"],
};

// --- Lo que devuelve el modelo ------------------------------------------------------------------

const texto = { type: "string" };
const enumeracion = (valores: readonly string[]) => ({ type: "string", enum: [...valores] });

/** La salida estructurada: una lista plana de datos, todos con sus seis campos. */
export const ESQUEMA_CORPUS = {
  type: "object",
  properties: {
    datos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          seccion: enumeracion(SECCIONES),
          n: { type: "integer" },
          vehiculo: enumeracion([...IDS_VEHICULO, "ninguno"]),
          campo: enumeracion(CAMPOS),
          valor: texto,
          cita: texto,
        },
        required: ["seccion", "n", "vehiculo", "campo", "valor", "cita"],
        additionalProperties: false,
      },
    },
  },
  required: ["datos"],
  additionalProperties: false,
} as const;

export interface FilaCorpus {
  seccion: Seccion;
  n: number;
  vehiculo: (typeof IDS_VEHICULO)[number] | "ninguno";
  campo: string;
  valor: string;
  cita: string;
}
export interface SalidaCorpus {
  datos: FilaCorpus[];
}

// --- El prompt ----------------------------------------------------------------------------------

const lista = (campo: string) => VALORES[campo]!.join(", ");

export const SISTEMA_CORPUS = `Eres asistente de los peritos de CESVI México. Lees un dictamen técnico completo de un hecho de tránsito y ordenas lo que dice en una lista de datos, con el vocabulario técnico de los dictámenes de CESVI. Solo ordenas: no opinas, no completas lo que falta y no calculas.

Cada dato es una fila: sección, n (el número del grupo dentro de la sección: el daño 1, el daño 2, el impacto 1…), vehículo (V1, V2… o «ninguno»), campo, valor y cita.

Reglas generales:
- Solo escribe lo que el dictamen dice. Si no lo dice, no pongas la fila.
- «cita» es un fragmento copiado literal del dictamen, de 3 a 40 palabras, sin cambiar ni una letra (puede cortar a media oración). Ponla en la primera fila de cada grupo y en cada fila que salga de otra frase; en las demás filas del grupo, "". Una cita que no esté en el dictamen se descarta.
- Los números se copian tal como están escritos, con su unidad (p. ej. "1,450 kg" o "15.89 m"). No conviertas, no redondees y no hagas cuentas. Un número que no esté escrito en una cita de su grupo se descarta.
- Los campos de valores cerrados usan exactamente uno de los valores de la lista; si ninguno corresponde, no pongas la fila.
- Nunca escribas placas, VIN, números de serie ni nombres de personas en ningún valor, y evítalos en las citas.

Vehículos: V1, V2, V3… en el orden en que el dictamen los presenta por primera vez, incluidos los que solo menciona sin dar sus datos (p. ej. «el vehículo B»). Úsalos igual en todas las secciones.

Secciones y campos:
- caso (n 1, vehículo «ninguno»): modalidad (una fila por modalidad: ${lista("modalidad")}), aseguradora, fecha_hora, lugar (la dirección como la escribe), municipio, entidad (el estado de la república).
- vehiculo (n 1, 2…; vehículo V1, V2…): marca, modelo (lo que el dictamen llama tipo o versión, p. ej. «Matiz»), anio (el año modelo), clase (solo si es clara: ${lista("clase")}), masa (p. ej. "1,450 kg"; también si la llama peso) y rigidez (p. ej. "A = 52,000 N/m, B = 345,000 N/m²"), solo si las escribe, aunque sea en la sección de cálculos o en una tabla.
- dano (un grupo por cada zona dañada de cada vehículo que describe, incluidas las previas o sin relación; vehículo = el dañado):
  - cara (${lista("cara")}); tercio (izquierdo, centro o derecho en el frente y la parte posterior; delantero, medio o trasero en los laterales); vertice (${lista("vertice")});
  - altura: la altura del daño desde el piso, como "45 a 95 cm" (o un solo valor);
  - direccion: la dirección de la deformación (${lista("direccion")}; una fila por dirección);
  - tipo (${lista("tipo")}; una fila por tipo); magnitud (${lista("magnitud")}) si la califica;
  - medidas: las medidas de deformación C1…C6 y el ancho L con su unidad, como "C1 0.96 m, C2 0.86 m, L 1.689 m", aunque estén en la sección de cálculos o en una tabla; si el dictamen hace la cuenta («C1 = 85 – 45 = 40 cm»), copia el resultado escrito ("C1 40 cm");
  - intercambio: el material transferido, su color y sobre qué zona (p. ej. "pintura blanca sobre la defensa trasera");
  - previo: «si» si el dictamen dice que el daño es previo, con óxido o sin relación con el hecho.
- impacto (n = el orden en la secuencia: 1, 2, 3…; una carambola tiene varios; vehículo «ninguno»): participante (una fila por cada vehículo que participa, aunque el dictamen no dé sus datos: V1, V2…) y objeto_fijo (poste, muro, guarnición, registro, árbol…) si el impacto es contra un objeto. Todo impacto tiene dos participantes, o un participante y un objeto_fijo: si solo participa un vehículo, objeto_fijo nombra la contraparte como la describe el dictamen («superficie de rodamiento» en una volcadura, «bache», «talud», «cuerpo duro no identificado» si no la identifica).
- declaracion (un grupo por cada versión de un conductor que el dictamen transcribe o resume; vehículo = el que conducía o en el que iba el declarante; si no lo dice, el vehículo asegurado): version (valor "", con la cita más representativa de esa versión, hasta 60 palabras) y maniobra (lo que el conductor dice que hizo: ${lista("maniobra")}; una fila por maniobra).
- restos (n 1): longitud de la zona de restos (p. ej. "15.89 m"), si la mide.
- huella (un grupo por huella; vehículo = el que la dejó o «ninguno»): tipo_huella (${lista("tipo_huella")}) y longitud.
- objeto_fijo (un grupo por objeto fijo dañado): descripcion.
- calculo (un grupo por cada cálculo que hace el dictamen; vehículo = el del cálculo o «ninguno»): metodo (${lista("metodo")}), resultado con su unidad tal como lo escribe (p. ej. "220.19 kJ") y entradas: las que escribe con su valor, separadas por punto y coma (p. ej. "L = 1.689 m; A = 52,000 N/m; C1 = 0.96 m").
- criterio (un grupo por cada criterio de correspondencia que analiza): criterio (${lista("criterio")}) y estado (${lista("estado")}).
- conclusion (n 1): veredicto sobre la versión declarada o el hecho reportado a la aseguradora, con la frase de la conclusión como cita:
  - se_sostiene: concluye que los daños corresponden con el hecho reportado o con la versión declarada;
  - no_se_sostiene: concluye que no corresponden, o que la mecánica declarada no es posible;
  - parcial: concluye que una parte sí corresponde y otra no (algunos daños sí y otros no; el contacto sí, pero no como se declaró). Si unos daños no corresponden y de los demás no se puede determinar, es no_se_sostiene;
  - sin_juicio: no se pronuncia (solo describe, reconstruye o calcula).

Vocabulario de los dictámenes de CESVI, con en cuántos de los ${GLOSARIO.dictamenes} dictámenes aparece cada término:
${glosarioParaPrompt()}`;

export function mensajeCorpus(textoDictamen: string): string {
  return `Dictamen:\n\n${textoDictamen}`;
}

// --- Documentos crudos --------------------------------------------------------------------------

export interface DocumentoCrudo {
  /** `cesvi-` y 10 caracteres del SHA-256 del nombre del archivo (el nombre no se guarda). */
  id: string;
  archivo: string;
  texto: string;
}

/** Los dictámenes de un lote crudo (`# Document: <archivo>`). */
export function dividirLote(md: string): DocumentoCrudo[] {
  return md
    .split(/^# Document: /m)
    .slice(1)
    .map((bloque) => {
      const salto = bloque.indexOf("\n");
      const archivo = bloque.slice(0, salto).trim();
      return { id: idDocumento(archivo), archivo, texto: bloque.slice(salto + 1).trim() };
    });
}

export function idDocumento(archivo: string): string {
  return `cesvi-${sha256Hex(archivo).slice(0, 10)}`;
}

// --- Números escritos ---------------------------------------------------------------------------

/** Miles con coma o con espacio («1,450», «50 600»); si no, un número con su decimal. */
const NUMERO = String.raw`-?\d{1,3}(?:[,\u00a0\u202f ]\d{3}(?!\d))+(?:\.\d+)?|-?\d+(?:[.,]\d+)?`;
const RX_NUMERO = new RegExp(NUMERO, "g");

/** Un número escrito: la coma o el espacio con tres cifras detrás son de miles; si no, decimal. */
function leerNumero(x: string): number {
  return /^-?\d{1,3}(?:[,\u00a0\u202f ]\d{3})+(?:\.\d+)?$/.test(x)
    ? Number(x.replace(/[,\u00a0\u202f ]/g, ""))
    : Number(x.replace(",", "."));
}

/** Los números de un valor del modelo, en orden ("45 a 95 cm" → [45, 95]). */
export function numerosEscritos(t: string): number[] {
  return [...t.matchAll(RX_NUMERO)].map((m) => leerNumero(m[0]));
}

/** El primero ("1,450 kg" → 1450; "0,45" → 0.45; "" → null). */
export function numeroEscrito(t: string): number | null {
  return numerosEscritos(t)[0] ?? null;
}

/** Lo que sigue al primer número: su unidad ("220.19 kJ" → "kJ"). */
export function unidadEscrita(t: string): string {
  const m = new RegExp(NUMERO).exec(t);
  if (!m) return "";
  return t
    .slice(m.index + m[0].length)
    .split(/[,;(]/)[0]!
    .trim()
    .slice(0, 20);
}

/** Escala a metros de una unidad de longitud escrita («cm» → 0.01); null si no hay unidad. */
function escalaDe(t: string): number | null {
  if (/(?<![a-z])mm\b|mil[ií]m/i.test(t)) return 0.001;
  if (/(?<![a-z])cm\b|cent[ií]m/i.test(t)) return 0.01;
  if (/(?<![a-z])m\b|metro/i.test(t)) return 1;
  return null;
}

/**
 * Las medidas de deformación de un texto («C1 0.96, C2 0.86, L 1.689 m»), en metros. Cada una vale
 * el último número de su tramo: si el texto hace la cuenta («C1 = 85 – 45 = 40 cm = 0.40 m»), es el
 * resultado escrito, no el primer término. La unidad es la que va junto a ese número o, si no
 * tiene, la del texto. Una C sin unidad de más de 3 se lee en cm (ninguna deformación mide 3 m).
 * Un tramo que solo trae la resta, sin resultado, no da medida: Croquis no hace cuentas.
 */
export function medidasDeDeformacion(
  t: string,
): { clave: string; valor: number; escrito: number; escala: number }[] {
  const general = escalaDe(t);
  const claves = [...t.matchAll(/\b(C\s?[1-6]|L)\b\s*[=:]?/gi)];
  return claves.flatMap((c, i) => {
    // El tramo llega hasta la siguiente medida o el siguiente separador («; », «, y una masa…»).
    const tramo = t
      .slice(c.index + c[0].length, claves[i + 1]?.index ?? t.length)
      .split(/;|,\s+(?=[^\d\s])|\sy\s/)[0]!;
    const nums = [...tramo.matchAll(RX_NUMERO)];
    const ultimo = nums.at(-1);
    if (!ultimo) return [];
    const escrito = leerNumero(ultimo[0]);
    const resta = nums.length > 1 && !/=/.test(tramo.slice(nums.at(-2)!.index, ultimo.index));
    if (escrito < 0 || resta) return [];
    const junto = /^\s*(mm|cm|m|metros?|cent[ií]metros?|mil[ií]metros?)\b/i.exec(
      tramo.slice(ultimo.index + ultimo[0].length),
    );
    const clave = c[1]!.replace(/\s/g, "").toUpperCase();
    let escala = (junto && escalaDe(junto[1]!)) ?? general ?? 1;
    if (!junto && general === null && clave !== "L" && escrito > 3) escala = 0.01;
    return [{ clave, valor: redondearM(escrito * escala), escrito, escala }];
  });
}
const redondearM = (x: number) => Math.round(x * 1e6) / 1e6;

/** Los números escritos en una cita, leyendo la coma como decimal y como separador de miles. */
export function numerosEnCita(cita: string): number[] {
  const out: number[] = [];
  for (const m of cita.matchAll(RX_NUMERO)) {
    const x = m[0];
    out.push(leerNumero(x));
    if (/^-?\d+,\d+$/.test(x)) out.push(Number(x.replace(/,/g, "")), Number(x.replace(",", ".")));
  }
  return out;
}

// --- Grupos -------------------------------------------------------------------------------------

export interface Grupo {
  seccion: Seccion;
  n: number;
  vehiculo: (typeof IDS_VEHICULO)[number] | null;
  valores: Map<string, string[]>;
  citas: string[];
}

/** Las filas por grupo (sección y n), con los valores cerrados revisados contra el contrato. */
export function agrupar(filas: FilaCorpus[]): { grupos: Grupo[]; invalidos: number } {
  const grupos = new Map<string, Grupo>();
  let invalidos = 0;
  for (const f of filas) {
    const valor = f.valor.trim();
    const campos = CAMPOS_POR_SECCION[f.seccion] as readonly string[] | undefined;
    const cerrados = VALORES[f.campo];
    if (!campos?.includes(f.campo) || (cerrados && !cerrados.includes(valor))) {
      invalidos++;
      continue;
    }
    const k = `${f.seccion}:${f.n}`;
    let g = grupos.get(k);
    if (!g) {
      g = { seccion: f.seccion, n: f.n, vehiculo: null, valores: new Map(), citas: [] };
      grupos.set(k, g);
    }
    if (f.vehiculo !== "ninguno") g.vehiculo ??= f.vehiculo;
    if (valor || f.campo === "version")
      g.valores.set(f.campo, [...(g.valores.get(f.campo) ?? []), valor]);
    if (f.cita.trim() && !g.citas.includes(f.cita.trim())) g.citas.push(f.cita.trim());
  }
  const orden = (g: Grupo) => SECCIONES.indexOf(g.seccion);
  return {
    grupos: [...grupos.values()].sort((a, b) => orden(a) - orden(b) || a.n - b.n),
    invalidos,
  };
}

// --- De la salida al expediente -----------------------------------------------------------------

export interface Conteos {
  filas: number;
  valores_invalidos: number;
  citas: number;
  citas_fuera: number;
  numeros: number;
  numeros_fuera: number;
}

/** Dónde queda un vehículo en una fase, en palabras: guía para colocarlo en el mapa (R1). */
export interface PosicionDescrita {
  vehiculo: (typeof IDS_VEHICULO)[number];
  fase: "inicial" | "impacto" | "final";
  descripcion: string;
  cita?: { texto: string };
}

export interface Conversion {
  expediente: Expediente;
  conteos: Conteos;
  /** Las posiciones que describe el texto; no van al contrato, que las pide con coordenadas. */
  posiciones: PosicionDescrita[];
}

type Fuente = "dictamen_importado" | "perito";
const redondear = (x: number) => Math.round(x * 1e6) / 1e6;
/** El objeto sin sus claves `undefined`. */
const limpio = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
const algo = <T extends object>(o: T): T | undefined => (Object.keys(o).length ? o : undefined);
const noVacio = <T>(xs: T[]): T[] | undefined => (xs.length ? xs : undefined);
/**
 * Placas que el módulo de `@croquis/extraction` no reconoce en los dictámenes: con guion largo,
 * partidas en dos renglones o en formatos de otros estados («MAV–1144», «263-HT-8», «974-1P6»,
 * «12-34-ABC»). Grupos unidos por guion, de 6 a 8 caracteres en total, con letra y número.
 */
const RX_PLACA_DICTAMEN = /\b[A-Z0-9]{1,4}(?:\s?[-–—]\s?[A-Z0-9]{1,4}){1,2}\b/g;
const largoDePlaca = (x: string) => {
  const n = x.replace(/[^A-Z0-9]/g, "").length;
  return n >= 6 && n <= 8;
};
/** Lo que sigue a «placas de circulación» (o «placa:», «matrícula»), si lleva un número, es la placa. */
const RX_TRAS_PLACAS =
  /(\b(?:placas?(?:\s+de\s+circulaci[oó]n)?|matr[ií]cula)(?:\s+n[uú]mero)?\s*[:|(]?\s*)([A-Z0-9]{1,8}(?:\s?[-–—]\s?[A-Z0-9]{1,4}){0,3})\b/gi;
/** El número de siniestro, póliza, folio o reporte identifica el caso: se redacta. */
const RX_TRAS_FOLIO =
  /(\b(?:siniestro|p[oó]liza|folio|reporte)\s*(?:n[uú]m(?:ero)?\.?|no\.?)?\s*[:|]?\s*)([A-Z0-9]{1,6}(?:-?[A-Z0-9]{1,6}){1,3})\b/gi;
/** Número de serie (VIN): 17 caracteres sin I, O ni Q, con letra y número. */
const RX_VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
const letraYNumero = (x: string) => /\d/.test(x) && /[A-Z]/.test(x);
/** Lo que parece placa pero, por lo que va antes, es un modelo («tipo FLD-120») o una norma. */
const modeloONorma = (antes: string) => /(?:\b(?:tipo|modelo)\s+|\bNOM-?)$/i.test(antes);

/**
 * El texto sin datos personales. Un «nombre» justo después de «marca» es la marca del vehículo
 * (p. ej. «Mercedes Benz»), no una persona: se conserva. Lo que parece placa después de «tipo» o
 * «modelo» es el modelo («tipo FLD-120»), y «NOM-012» es una norma: también se conservan.
 */
export function redactar(t: string): string {
  const r = redact(t);
  let out = "";
  let pos = 0;
  for (const sp of r.spans) {
    const antes = t.slice(0, sp.start);
    const conserva =
      (sp.kind === "NOMBRE" && /\bmarca\s+$/i.test(antes)) ||
      (sp.kind === "PLACA" && modeloONorma(antes));
    out += antes.slice(pos) + (conserva ? sp.original : `[${sp.kind}]`);
    pos = sp.end;
  }
  out += t.slice(pos);
  return out
    .replace(RX_TRAS_PLACAS, (m, antes: string, placa: string) =>
      /\d/.test(placa) ? `${antes}[PLACA]` : m,
    )
    .replace(RX_TRAS_FOLIO, (m, antes: string, folio: string) =>
      (folio.match(/\d/g) ?? []).length >= 4 ? `${antes}[NUMERO]` : m,
    )
    .replace(RX_PLACA_DICTAMEN, (m, i: number, s: string) =>
      !letraYNumero(m) || !largoDePlaca(m) || m.startsWith("NOM") || modeloONorma(s.slice(0, i))
        ? m
        : "[PLACA]",
    )
    .replace(RX_VIN, (m) => (letraYNumero(m) ? "[VIN]" : m));
}

const libre = (t: string, max: number): string | undefined => {
  const r = redactar(t.trim()).trim();
  return r ? r.slice(0, max) : undefined;
};

/**
 * La masa en kg aunque el texto escriba «Kg», «kgs», «kilogramos» o toneladas (R4b): la
 * verificación CESVI y la escena solo la toman en kg. Otra unidad se deja como está.
 */
function enKg<T extends { valor: number; unidad: string }>(m: T | undefined): T | undefined {
  if (!m) return m;
  if (/^k(?:ilo)?g/i.test(m.unidad.trim())) return { ...m, unidad: "kg" };
  if (/^(?:ton|t\b)/i.test(m.unidad.trim()))
    return { ...m, valor: redondear(m.valor * 1000), unidad: "kg" };
  return m;
}

/** Nombres de la masa en las entradas de un cálculo («m», «m2», «mB», «masa del vehículo B»…). */
const RX_MASA = /^(?:m(?:[_ ]?[1-8ab])?|masa\b.*|peso\b.*)$/i;
const RX_C = /^C\s?([1-6])$/i;

/**
 * Las entradas de los cálculos en los campos del vehículo y del daño (R4b), para que la
 * verificación CESVI y la inversión las usen: C1…C6 y L en la magnitud del primer daño del vehículo
 * (sin los previos) que no las trae; la masa y la rigidez A y B, en el vehículo. Solo llena campos
 * vacíos: lo que el texto dice en su lugar manda. Cada valor conserva la cita del cálculo.
 */
export function conEntradasDeCalculo(e: Expediente): Expediente {
  const vehiculos = e.vehiculos.map((v) => ({ ...v }));
  const danos = (e.danos ?? []).map((d) => ({ ...d }));
  for (const c of e.calculos ?? []) {
    const v = vehiculos.find((x) => x.id === c.vehiculo);
    if (!v) continue;
    const ent = (c.entradas ?? []).map((x) => ({ ...x, nombre: x.nombre.trim() }));
    const cita = c.cita ? { cita: c.cita } : {};
    if (!v.masa) {
      const m = ent.find((x) => RX_MASA.test(x.nombre) && /kg|ton|^t$/i.test(x.valor.unidad));
      if (m) {
        const ton = /ton|^t$/i.test(m.valor.unidad);
        v.masa = {
          valor: ton ? redondear(m.valor.valor * 1000) : m.valor.valor,
          unidad: "kg",
          fuente: m.valor.fuente,
          ...cita,
        };
      }
    }
    const a = ent.find((x) => x.nombre === "A");
    const b = ent.find((x) => x.nombre === "B");
    if (!v.rigidez && a && b) {
      v.rigidez = {
        A: a.valor.valor,
        B: b.valor.valor,
        fuente: a.valor.fuente === "perito" ? "perito" : "dictamen",
        ...cita,
      };
    }
    const enMetros = (x: (typeof ent)[number], esC: boolean) => {
      const escala = escalaDe(x.valor.unidad) ?? (esC && x.valor.valor > 3 ? 0.01 : 1);
      return redondear(x.valor.valor * escala);
    };
    const cs = ent
      .filter((x) => RX_C.test(x.nombre))
      .sort((p, q) => Number(RX_C.exec(p.nombre)![1]) - Number(RX_C.exec(q.nombre)![1]))
      .map((x) => enMetros(x, true));
    const l = ent.find((x) => x.nombre.toUpperCase() === "L");
    const d = danos.find((x) => x.vehiculo === v.id && !x.dano_previo && !x.magnitud?.c_m?.length);
    if (cs.length >= 2 && l && d) {
      d.magnitud = { ...d.magnitud, c_m: cs.slice(0, 6), l_m: enMetros(l, false) };
    }
  }
  return { ...e, vehiculos, ...(e.danos ? { danos } : {}) };
}

/** La salida del modelo como expediente, revisada contra el texto del dictamen. */
export function expedienteDeSalida(
  s: SalidaCorpus,
  textoDictamen: string,
  /** De dónde salen los datos: el dictamen importado (C0) o la narración del perito (R1). */
  F: Fuente = "dictamen_importado",
): Conversion {
  const { grupos, invalidos } = agrupar(s.datos);
  const conteos: Conteos = {
    filas: s.datos.length,
    valores_invalidos: invalidos,
    citas: 0,
    citas_fuera: 0,
    numeros: 0,
    numeros_fuera: 0,
  };

  // Las citas encontradas de cada grupo: la primera se guarda (redactada); todas sirven para los números.
  const encontradas = new Map<Grupo, string[]>();
  for (const g of grupos) {
    const ok: string[] = [];
    for (const c of g.citas) {
      conteos.citas++;
      if (ubicarCita(textoDictamen, c)) ok.push(c);
      else conteos.citas_fuera++;
    }
    encontradas.set(g, ok);
  }
  const cita = (g: Grupo): { texto: string } | undefined => {
    const c = encontradas.get(g)![0];
    if (!c) return undefined;
    const r = redactar(c);
    return { texto: r.length > 1200 ? `${r.slice(0, 1199)}…` : r };
  };
  /** El número, si está escrito en una cita encontrada del grupo. */
  const num = (n: number | null, g: Grupo): number | undefined => {
    if (n === null || !Number.isFinite(n)) return undefined;
    conteos.numeros++;
    const escritos = encontradas.get(g)!.flatMap(numerosEnCita);
    if (escritos.some((x) => Math.abs(x - n) < 1e-9)) return n;
    conteos.numeros_fuera++;
    return undefined;
  };
  const uno = (g: Grupo, campo: string) => g.valores.get(campo)?.[0] ?? "";
  const varios = (g: Grupo, campo: string) => [...new Set(g.valores.get(campo) ?? [])];
  const medida = (g: Grupo, campo: string, unidadPorOmision: string) => {
    const t = uno(g, campo);
    const v = num(numeroEscrito(t), g);
    return v === undefined
      ? undefined
      : { valor: v, unidad: unidadEscrita(t) || unidadPorOmision, fuente: F };
  };
  const dato = (g: Grupo, campo: string) => {
    // La marca y el modelo de un vehículo nunca son datos personales: no se redactan.
    const t = uno(g, campo).trim();
    const v =
      campo === "marca" || campo === "modelo" ? t.slice(0, 600) || undefined : libre(t, 600);
    return v ? { valor: v, fuente: F } : undefined;
  };
  const de = (seccion: Seccion) => grupos.filter((g) => g.seccion === seccion);

  // Caso
  const caso0 = de("caso")[0];
  const lugar = caso0
    ? algo(
        limpio({
          descripcion: dato(caso0, "lugar"),
          municipio: dato(caso0, "municipio"),
          estado: dato(caso0, "entidad"),
        }),
      )
    : undefined;
  const caso: Expediente["caso"] = limpio({
    aseguradora: caso0 && dato(caso0, "aseguradora"),
    fecha_hora: caso0 && dato(caso0, "fecha_hora"),
    lugar,
    modalidades: (caso0 ? varios(caso0, "modalidad") : []).slice(
      0,
      6,
    ) as Expediente["caso"]["modalidades"],
  });

  // Vehículos: los de su sección y, sin datos, los que solo aparecen en otras secciones.
  const vehiculos: Expediente["vehiculos"] = [];
  const ids = new Set<string>();
  for (const g of de("vehiculo")) {
    const id = g.vehiculo ?? IDS_VEHICULO[g.n - 1];
    if (!id || ids.has(id)) continue;
    ids.add(id);
    const anio = num(numeroEscrito(uno(g, "anio")), g);
    const masa = enKg(medida(g, "masa", "kg"));
    const rig = uno(g, "rigidez");
    const a = num(numeroEscrito(/\bA\s*[=:]?\s*([-\d.,]+)/.exec(rig)?.[1] ?? ""), g);
    const b = num(numeroEscrito(/\bB\s*[=:]?\s*([-\d.,]+)/.exec(rig)?.[1] ?? ""), g);
    const c = cita(g);
    vehiculos.push(
      limpio({
        id,
        marca: dato(g, "marca"),
        modelo: dato(g, "modelo"),
        anio:
          anio !== undefined && Number.isInteger(anio) && anio >= 1900 && anio <= 2100
            ? anio
            : undefined,
        clase: (uno(g, "clase") || undefined) as Expediente["vehiculos"][number]["clase"],
        masa: masa && { ...masa, ...(c && { cita: c }) },
        rigidez:
          a !== undefined && b !== undefined
            ? {
                A: a,
                B: b,
                fuente: F === "perito" ? ("perito" as const) : ("dictamen" as const),
                ...(c && { cita: c }),
              }
            : undefined,
      }),
    );
  }
  const referidos = [
    ...grupos.map((g) => g.vehiculo),
    ...de("impacto").flatMap((g) => varios(g, "participante")),
  ].filter((v): v is string => !!v);
  for (const id of IDS_VEHICULO.filter((v) => referidos.includes(v) && !ids.has(v))) {
    ids.add(id);
    vehiculos.push({ id });
  }
  vehiculos.sort((x, y) => x.id.localeCompare(y.id));

  // Daños
  const danos = de("dano")
    .filter((g) => g.vehiculo && uno(g, "cara"))
    .map((g) => {
      const t = uno(g, "altura");
      const k = /(?<![a-z])mm\b|mil[ií]m/i.test(t)
        ? 0.1
        : /(?<![a-z])cm\b|cent/i.test(t) || !/\bm\b|metro/i.test(t)
          ? 1
          : 100;
      const hs = numerosEscritos(t)
        .map((x) => num(x, g))
        .filter((x): x is number => x !== undefined)
        .map((x) => redondear(x * k));
      // Cada medida, si su número está escrito en una cita del grupo.
      const medidas = medidasDeDeformacion(uno(g, "medidas")).filter(
        (x) => num(x.escrito, g) !== undefined,
      );
      const cs = medidas.filter((x) => x.clave !== "L").map((x) => x.valor);
      const l = medidas.find((x) => x.clave === "L")?.valor;
      const tercio = uno(g, "tercio");
      return limpio({
        vehiculo: g.vehiculo!,
        zona: limpio({
          cara: uno(g, "cara"),
          tercio: tercio || undefined,
          vertice: uno(g, "vertice") || undefined,
        }),
        altura_cm: hs.length ? { min: Math.min(...hs), max: Math.max(...hs) } : undefined,
        direcciones: noVacio(varios(g, "direccion").slice(0, 4)),
        tipos: noVacio(varios(g, "tipo").slice(0, 7)),
        magnitud: algo(
          limpio({
            cualitativa: uno(g, "magnitud") || undefined,
            c_m: noVacio(cs.slice(0, 6)),
            l_m: l,
          }),
        ),
        intercambio_material: (() => {
          const i = libre(uno(g, "intercambio"), 200);
          return i ? { sobre: i } : undefined;
        })(),
        dano_previo: uno(g, "previo") === "si" || undefined,
        fuente: F,
        cita: cita(g),
      });
    }) as NonNullable<Expediente["danos"]>;

  const impactos = de("impacto").map((g) => {
    const vehiculos = varios(g, "participante");
    // La cara con que tocó cada participante, si el texto la dice («V1 frontal»): R4b.
    const zonas = varios(g, "contacto").flatMap((t) => {
      const m = /\b(V[1-8])\b\W*([a-záéíóú_ ]+)/i.exec(t);
      const cara = m?.[2]!.trim().toLowerCase().replace(/\s+/g, "_");
      if (!m || !cara || !VALORES.cara!.includes(cara) || !vehiculos.includes(m[1]!.toUpperCase()))
        return [];
      return [{ vehiculo: m[1]!.toUpperCase(), zona: { cara } }];
    });
    const unicas = zonas.filter((z, i) => zonas.findIndex((x) => x.vehiculo === z.vehiculo) === i);
    return limpio({
      orden: g.n,
      vehiculos: noVacio(vehiculos),
      objeto_fijo: libre(uno(g, "objeto_fijo"), 120),
      zonas: noVacio(unicas),
      fuente: F,
      cita: cita(g),
    });
  }) as NonNullable<Expediente["impactos"]>;

  // Lo que hacía cada vehículo antes del impacto según el texto (R4b): la versión de la evidencia.
  const movimientos = de("movimiento")
    .filter((g) => g.vehiculo && uno(g, "maniobra"))
    .map((g) => {
      const c = cita(g);
      return { vehiculo: g.vehiculo!, tipo: uno(g, "maniobra"), ...(c && { cita: c }) };
    });
  const evidencia = movimientos.length
    ? [{ tipo: "evidencia" as const, maniobras: movimientos.slice(0, 20) }]
    : [];

  const declaradas = de("declaracion").map((g) =>
    limpio({
      tipo: "declarada" as const,
      declarante: g.vehiculo ?? undefined,
      declaracion: cita(g),
      maniobras: g.vehiculo
        ? noVacio(
            varios(g, "maniobra")
              .slice(0, 20)
              .map((tipo) => ({ vehiculo: g.vehiculo!, tipo })),
          )
        : undefined,
    }),
  ) as NonNullable<Expediente["versiones"]>;
  const versiones = [...evidencia, ...declaradas] as NonNullable<Expediente["versiones"]>;

  const restos0 = de("restos")[0];
  const huellas = de("huella")
    .filter((g) => uno(g, "tipo_huella"))
    .map((g) =>
      limpio({
        tipo: uno(g, "tipo_huella"),
        vehiculo: g.vehiculo ?? undefined,
        longitud: medida(g, "longitud", "m"),
        cita: cita(g),
      }),
    );
  const objetos = de("objeto_fijo")
    .map((g) => libre(uno(g, "descripcion"), 200))
    .filter((x): x is string => !!x);
  const evidencias = algo(
    limpio({
      restos: restos0
        ? algo(limpio({ longitud: medida(restos0, "longitud", "m"), cita: cita(restos0) }))
        : undefined,
      huellas: noVacio(huellas),
      objetos_fijos_danados: noVacio(objetos),
    }),
  ) as Expediente["evidencias"];

  const calculos = de("calculo")
    .filter((g) => uno(g, "metodo"))
    .map((g) => {
      const entradas = uno(g, "entradas")
        .split(";")
        .map((e) => /^\s*([^=:]+?)\s*[=:]\s*(.+?)\s*$/.exec(e))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => ({
          nombre: m[1]!.slice(0, 40),
          v: num(numeroEscrito(m[2]!), g),
          u: unidadEscrita(m[2]!),
        }))
        .filter((e) => e.v !== undefined)
        .slice(0, 20)
        .map((e) => ({ nombre: e.nombre, valor: { valor: e.v!, unidad: e.u || "-", fuente: F } }));
      return limpio({
        metodo: uno(g, "metodo"),
        entradas: noVacio(entradas),
        resultado: medida(g, "resultado", "-"),
        vehiculo: g.vehiculo ?? undefined,
        cita: cita(g),
      });
    }) as NonNullable<Expediente["calculos"]>;

  const criterios = de("criterio")
    .filter((g) => uno(g, "criterio") && uno(g, "estado"))
    .map((g) =>
      limpio({ criterio: uno(g, "criterio"), estado: uno(g, "estado"), cita: cita(g) }),
    ) as NonNullable<Expediente["criterios"]>;

  const conclusion0 = de("conclusion").find((g) => uno(g, "veredicto"));
  const expediente = conEntradasDeCalculo(
    limpio({
      caso,
      vehiculos,
      danos: noVacio(danos),
      impactos: noVacio(impactos),
      versiones: noVacio(versiones),
      evidencias,
      calculos: noVacio(calculos),
      criterios: noVacio(criterios),
      resultado: conclusion0
        ? {
            conclusion: limpio({
              veredicto: uno(conclusion0, "veredicto"),
              cita: cita(conclusion0),
              fuente: F,
            }),
          }
        : undefined,
    }) as Expediente,
  );
  const posiciones = de("posicion")
    .filter((g) => g.vehiculo && uno(g, "fase") && uno(g, "descripcion").trim())
    .map((g) => {
      const c = cita(g);
      return {
        vehiculo: g.vehiculo!,
        fase: uno(g, "fase") as PosicionDescrita["fase"],
        descripcion: libre(uno(g, "descripcion"), 300)!,
        ...(c && { cita: c }),
      };
    });
  return { expediente, conteos, posiciones };
}

/** Problemas del expediente: el JSON Schema y, si pasa, los errores semánticos. */
export function problemasExpediente(e: Expediente): string[] {
  const esquema = expedienteErrors(e);
  if (esquema.length) return esquema.map((x) => `esquema ${x}`);
  return checkExpediente(e)
    .filter((p) => p.severidad === "error")
    .map((p) => `${p.codigo} ${p.ruta}: ${p.mensaje}`);
}

// --- Partición --------------------------------------------------------------------------------

export interface ParaParticion {
  id: string;
  modalidad: string;
  veredicto: string;
}

/**
 * Partición fija: 30 % de prueba, estratificada por modalidad principal y conclusión. Dentro de
 * cada estrato, los dictámenes se ordenan por el SHA-256 de `semilla:id` y la prueba se queda con
 * los primeros `round(0.3 · n)`. Devuelve los ids de prueba, ordenados.
 */
export function particionPrueba(docs: ParaParticion[], semilla: number, fraccion = 0.3): string[] {
  const estratos = new Map<string, ParaParticion[]>();
  for (const d of docs) {
    const k = `${d.modalidad}|${d.veredicto}`;
    estratos.set(k, [...(estratos.get(k) ?? []), d]);
  }
  const prueba: string[] = [];
  for (const grupo of estratos.values()) {
    const orden = grupo
      .map((d) => ({ id: d.id, h: sha256Hex(`${semilla}:${d.id}`) }))
      .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
    prueba.push(...orden.slice(0, Math.round(fraccion * grupo.length)).map((x) => x.id));
  }
  return prueba.sort();
}
