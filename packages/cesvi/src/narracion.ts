/**
 * R0 (docs/cesvi/PLAN-CESVI.md §3): dos campos más por dictamen del corpus.
 *
 * - **La narración del perito sin conclusiones:** solo hechos, lugar, daños, evidencias y medidas,
 *   sin velocidades calculadas, energías ni conclusiones. Es lo que recibe Croquis en la evaluación
 *   E-R4, y por eso pasa una revisión automática de fuga (`fugas`).
 * - **Lo que concluyó CESVI, para comparar:** modalidad, zonas de contacto por vehículo, secuencia
 *   de impactos, velocidades calculadas y posiciones finales, cada dato con su cita.
 *
 * Como en C0, Claude solo ordena y redacta lo que dice el dictamen; Croquis revisa las citas contra
 * el texto, los números contra su cita, y redacta los datos personales al volver.
 */
import { ubicarCita } from "./hecho-lectura";
import {
  IDS_VEHICULO,
  MODALIDADES,
  numerosEnCita,
  numerosEscritos,
  redactar,
  VALORES,
  type DocumentoCrudo,
} from "./corpus";

export const VERSION_PROMPT_NARRACION = "narracion-cesvi-v1";

type IdVehiculo = (typeof IDS_VEHICULO)[number];

const texto = { type: "string" };
const enumeracion = (valores: readonly string[]) => ({ type: "string", enum: [...valores] });
const lista = (items: object) => ({ type: "array", items });
const objeto = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const veh = enumeracion(IDS_VEHICULO);

/** La salida estructurada: todo requerido; lo que el dictamen no dice va vacío o «sin_dato». */
export const ESQUEMA_NARRACION = objeto({
  descripcion: texto,
  conclusiones: objeto({
    modalidad: enumeracion([...MODALIDADES, "sin_dato"]),
    modalidad_cita: texto,
    zonas_contacto: lista(
      objeto({
        vehiculo: veh,
        cara: enumeracion(VALORES.cara!),
        tercio: enumeracion([...VALORES.tercio!, "no_aplica"]),
        cita: texto,
      }),
    ),
    secuencia: lista(
      objeto({
        orden: { type: "integer" },
        participantes: lista(veh),
        objeto_fijo: texto,
        cita: texto,
      }),
    ),
    velocidades: lista(
      objeto({
        vehiculo: enumeracion([...IDS_VEHICULO, "ninguno"]),
        valor: texto,
        que: texto,
        cita: texto,
      }),
    ),
    posiciones_finales: lista(objeto({ vehiculo: veh, descripcion: texto, cita: texto })),
  }),
});

export interface SalidaNarracion {
  descripcion: string;
  conclusiones: {
    modalidad: string;
    modalidad_cita: string;
    zonas_contacto: { vehiculo: IdVehiculo; cara: string; tercio: string; cita: string }[];
    secuencia: { orden: number; participantes: IdVehiculo[]; objeto_fijo: string; cita: string }[];
    /** `valor` tal como está escrito, con su unidad («63.15 km/h»). */
    velocidades: { vehiculo: IdVehiculo | "ninguno"; valor: string; que: string; cita: string }[];
    posiciones_finales: { vehiculo: IdVehiculo; descripcion: string; cita: string }[];
  };
}

export const SISTEMA_NARRACION = `Eres asistente de los peritos de CESVI México. Lees un dictamen técnico completo de un hecho de tránsito y haces dos cosas.

1. «descripcion»: redactas la narración que haría el perito ANTES de analizar el hecho, con el vocabulario técnico de los dictámenes de CESVI, en español de México, en tercera persona y en uno a cuatro párrafos. Va solo lo observado y medido:
- el lugar (vía, sentidos, carriles, superficie, señalamientos) y la hora;
- los vehículos (tipo, clase, año; la masa si el dictamen la escribe), identificados como «vehículo A», «vehículo B»… en el orden en que el dictamen los presenta;
- los daños de cada vehículo: zona, altura desde el piso, dirección de la deformación, tipo de daño, medidas de deformación (C1…C6 y L) e intercambio de material, tal como los describe;
- las evidencias del lugar: restos (dónde empiezan y terminan, su longitud), huellas de frenado o derrape con su longitud, objetos fijos dañados, posiciones finales observadas.
No pongas: velocidades ni energías calculadas; nombres de métodos de cálculo ni sus resultados; la modalidad ni la dinámica que concluye el dictamen; si los daños corresponden o no; la declaración de los conductores; frases como «se concluye», «se determina», «corresponde», «no corresponde», «se sostiene». Copia las medidas como están escritas; no conviertas ni redondees. Nunca escribas placas, VIN, números de serie, números de siniestro ni nombres de personas.

2. «conclusiones»: lo que concluye el dictamen, para compararlo después. Cada dato con «cita», un fragmento copiado literal del dictamen, de 3 a 40 palabras, sin cambiar ni una letra. Si el dictamen no lo dice, deja la lista vacía o «sin_dato».
- modalidad (con modalidad_cita): la que concluye el dictamen.
- zonas_contacto: por vehículo (V1, V2… en el orden en que el dictamen los presenta), la cara y el tercio de la zona de contacto que el dictamen determina.
- secuencia: los impactos en orden (1, 2…), con sus participantes; objeto_fijo nombra la contraparte si el impacto es contra un objeto, la superficie o un cuerpo no identificado ("" si son dos vehículos).
- velocidades: cada velocidad que el dictamen calcula o concluye, con «valor» copiado tal como está escrito con su unidad (p. ej. "63.15 km/h") y «que» (velocidad de impacto por deformación, por desplazamiento, crítica en curva…).
- posiciones_finales: la posición final de cada vehículo que describa.`;

export function mensajeNarracion(textoDictamen: string): string {
  return `Dictamen:\n\n${textoDictamen}`;
}

// --- Revisión de fuga ---------------------------------------------------------------------------

/** Una palabra completa: `\b` de JS no ve las letras con acento («declaró»). */
const palabra = (cuerpo: string) =>
  new RegExp(`(?<![\\p{L}\\d])(?:${cuerpo})(?![\\p{L}\\d])`, "giu");

/**
 * Una velocidad del lugar, no del hecho: el límite de un señalamiento («restrictivo de 40 km/h»,
 * «velocidad máxima de 80 km/h», «SR 09»). Se busca en las palabras que van antes de la cifra.
 */
const LIMITE_DE_VELOCIDAD =
  /(?:m[aá]xim|l[ií]mit|restrictiv|señal|SR\s*-?\s*\d|SP\s*-?\s*\d|permitid|reductor)/iu;

/**
 * Lo que no puede aparecer en la narración sin conclusiones: cifras de velocidad (salvo los límites
 * señalados en el lugar) o de energía, métodos de cálculo y frases de conclusión. Cada patrón tiene
 * nombre para reportar cuál saltó. «Corresponde a» (es) y «el apartado de conclusiones» no cuentan:
 * no adelantan ninguna conclusión del dictamen. Revisado a mano contra las 48 marcas de la primera
 * lectura (ADR 0060).
 */
export const PATRONES_FUGA: readonly {
  nombre: string;
  rx: RegExp;
  /** Si la coincidencia no cuenta según lo que va antes y después de ella. */
  excepto?: (antes: string, despues: string) => boolean;
}[] = [
  {
    nombre: "velocidad",
    rx: palabra(String.raw`\d[\d.,]*\s*(?:km\s*/\s*h(?:r|rs)?|kph|m\s*/\s*s(?:eg)?)`),
    excepto: (antes, despues) =>
      LIMITE_DE_VELOCIDAD.test(antes.slice(-60)) || /^\s*(?:como )?m[aá]xim/iu.test(despues),
  },
  {
    nombre: "energia",
    rx: palabra(String.raw`\d[\d.,]*\s*(?:k?j(?:oules?)?|julios?|kgf?\s*·?\s*m)`),
  },
  { nombre: "metodo", rx: palabra("mc\\s*henry|ebs|velocidad equivalente|cantidad de movimiento") },
  {
    nombre: "conclusion",
    rx: palabra("se (?:concluye|determina|establece que|infiere)|conclu(?:sión|siones|ye)"),
    excepto: (antes) => /apartado de\s*$/iu.test(antes),
  },
  {
    nombre: "correspondencia",
    rx: palabra(
      "no corresponden?|corresponden? (?:en [\\p{L}]+(?: y [\\p{L}]+)? )?con|en correspondencia|son consistentes|(?:versión|declaración)[^.]{0,40}se sostiene",
    ),
  },
  { nombre: "declaracion", rx: palabra("declar(?:a|ó|ación|ado|ada|aron)") },
  { nombre: "modalidad", rx: palabra("modalidad de") },
];

export function fugas(descripcion: string): string[] {
  return PATRONES_FUGA.filter((p) =>
    [...descripcion.matchAll(p.rx)].some(
      (m) => !p.excepto?.(descripcion.slice(0, m.index), descripcion.slice(m.index + m[0].length)),
    ),
  ).map((p) => p.nombre);
}

/**
 * El texto convertido del dictamen solo trae las conclusiones (lo dice la narración): no hay hechos
 * que narrar, así que no sirve como entrada de E-R4. No es una fuga.
 */
export function soloConclusiones(descripcion: string): boolean {
  return /(?:únicamente|solo|sólo)[^.]{0,30}apartado de conclusiones/iu.test(descripcion);
}

// --- Revisión al volver -------------------------------------------------------------------------

export interface Narracion {
  id: string;
  descripcion: string;
  fugas: string[];
  /** El texto del dictamen solo trae las conclusiones: no hay hechos que narrar. */
  solo_conclusiones: boolean;
  conclusiones: {
    modalidad: string | null;
    zonas_contacto: { vehiculo: IdVehiculo; cara: string; tercio: string | null; cita: string }[];
    secuencia: {
      orden: number;
      participantes: IdVehiculo[];
      objeto_fijo: string | null;
      cita: string;
    }[];
    velocidades: { vehiculo: IdVehiculo | null; kmh: number; que: string; cita: string }[];
    posiciones_finales: { vehiculo: IdVehiculo; descripcion: string; cita: string }[];
  };
  conteos: { citas: number; citas_fuera: number; velocidades: number; velocidades_fuera: number };
}

/** km/h de un valor escrito con su unidad («17.54 m/s» → 63.144); null si no es una velocidad. */
export function aKmh(valor: string): number | null {
  const n = numerosEscritos(valor)[0];
  if (n === undefined) return null;
  if (/km\s*\/\s*h|kph/i.test(valor)) return n;
  if (/m\s*\/\s*s/i.test(valor)) return n * 3.6;
  return null;
}

export function narracionDeSalida(s: SalidaNarracion, doc: DocumentoCrudo): Narracion {
  let citas = 0;
  let citasFuera = 0;
  const citada = (c: string) => {
    if (!c.trim()) return null;
    citas++;
    if (!ubicarCita(doc.texto, c)) {
      citasFuera++;
      return null;
    }
    return redactar(c.trim());
  };
  const k = s.conclusiones;
  const modalidadCita = citada(k.modalidad_cita);
  let velocidades = 0;
  let velocidadesFuera = 0;
  const vels: Narracion["conclusiones"]["velocidades"] = [];
  for (const v of k.velocidades) {
    const cita = citada(v.cita);
    const kmh = aKmh(v.valor);
    velocidades++;
    const escrito = numerosEscritos(v.valor)[0];
    if (!cita || kmh === null || escrito === undefined || !numerosEnCita(cita).includes(escrito)) {
      velocidadesFuera++;
      continue;
    }
    vels.push({
      vehiculo: v.vehiculo === "ninguno" ? null : v.vehiculo,
      kmh: Math.round(kmh * 1e4) / 1e4,
      que: redactar(v.que.trim()),
      cita,
    });
  }
  const descripcion = redactar(s.descripcion.trim());
  return {
    id: doc.id,
    descripcion,
    fugas: fugas(descripcion),
    solo_conclusiones: soloConclusiones(descripcion),
    conclusiones: {
      modalidad: k.modalidad !== "sin_dato" && modalidadCita ? k.modalidad : null,
      zonas_contacto: k.zonas_contacto.flatMap((z) => {
        const cita = citada(z.cita);
        return cita
          ? [
              {
                vehiculo: z.vehiculo,
                cara: z.cara,
                tercio: z.tercio === "no_aplica" ? null : z.tercio,
                cita,
              },
            ]
          : [];
      }),
      secuencia: k.secuencia.flatMap((i) => {
        const cita = citada(i.cita);
        return cita
          ? [
              {
                orden: i.orden,
                participantes: i.participantes,
                objeto_fijo: i.objeto_fijo.trim() ? redactar(i.objeto_fijo.trim()) : null,
                cita,
              },
            ]
          : [];
      }),
      velocidades: vels,
      posiciones_finales: k.posiciones_finales.flatMap((p) => {
        const cita = citada(p.cita);
        return cita
          ? [{ vehiculo: p.vehiculo, descripcion: redactar(p.descripcion.trim()), cita }]
          : [];
      }),
    },
    conteos: { citas, citas_fuera: citasFuera, velocidades, velocidades_fuera: velocidadesFuera },
  };
}
