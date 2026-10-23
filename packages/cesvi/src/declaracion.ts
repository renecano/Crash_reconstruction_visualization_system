/**
 * R7 (docs/cesvi/PLAN-CESVI.md, ADR 0070): la declaración de un conductor, leída para compararla
 * con la reconstrucción. Es un complemento opcional: el perito la pega, dice qué vehículo conducía
 * el declarante, y Croquis arma esa versión para verla al lado de la reconstrucción.
 *
 * Claude ordena la declaración en las filas del corpus (C0), con los vehículos del caso en el
 * mensaje para que «mi carro» o «la camioneta» queden como V1, V2…; Croquis revisa cada cita contra
 * el texto y cada número contra su cita. Nada de esto es evidencia: es lo que dice el conductor.
 */
import {
  agrupar,
  IDS_VEHICULO,
  numerosEnCita,
  numerosEscritos,
  redactar,
  VALORES,
  type Expediente,
  type SalidaCorpus,
} from "./corpus";
import { GLOSARIO, glosarioParaPrompt, ubicarCita } from "./hecho-lectura";

export const VERSION_PROMPT_DECLARACION = "declaracion-caso-v1";

type Id = Expediente["vehiculos"][number]["id"];
const lista = (campo: string) => VALORES[campo]!.join(", ");

export const SISTEMA_DECLARACION = `Eres asistente de los peritos de CESVI México. Lees la declaración de un conductor sobre un hecho de tránsito y ordenas lo que dice en una lista de datos. Solo ordenas: no opinas, no juzgas si es cierta, no completas lo que falta y no calculas.

Cada dato es una fila: sección, n (el número del grupo), vehículo (V1, V2… o «ninguno»), campo, valor y cita.

Reglas:
- Los vehículos son los del caso, que vienen en el mensaje con su id (V1, V2…) y quién conducía el declarante. «Mi vehículo», «yo», «mi carro» son el del declarante; a los demás nómbralos con el id del caso que corresponda por lo que dice (tipo, color, posición). Si no sabes cuál es, no pongas la fila.
- Solo escribe lo que la declaración dice. Si no lo dice, no pongas la fila.
- «cita» es un fragmento copiado literal de la declaración, de 3 a 40 palabras, sin cambiar ni una letra. Ponla en cada fila. Una cita que no esté en la declaración se descarta.
- Los números se copian tal como están escritos, con su unidad («50 km/h», «como a 50»). No conviertas ni hagas cuentas.
- Nunca escribas placas, nombres de personas ni números de serie.

Secciones y campos:
- movimiento (un grupo por vehículo del que la declaración dice qué hacía antes del impacto; vehículo = ese): maniobra (${lista("maniobra")}): «reversa» si retrocedía, «se_detiene» si estaba detenido, «circula» si avanzaba, y las demás si las dice; velocidad (la velocidad que declara, con su unidad tal como la escribe, p. ej. "50 km/h"), solo si la dice.
- impacto (n 1, 2… en el orden que dice; vehículo «ninguno»): participante (una fila por vehículo) y contacto (una fila por vehículo cuya parte de contacto dice: el vehículo y la cara, p. ej. "V1 frontal"; caras: ${lista("cara")}).
- posicion (un grupo por vehículo del que dice dónde quedó; vehículo = ese): fase («final») y descripcion (dónde dice que quedó, en palabras).

Vocabulario de los reportes de CESVI, con en cuántos de los ${GLOSARIO.dictamenes} reportes aparece cada término:
${glosarioParaPrompt()}`;

/** Un vehículo del caso como se le describe a Claude («V1: Nissan Versa gris»). */
export interface VehiculoDelCaso {
  id: Id;
  descripcion: string;
}

/** Cómo se le nombra a Claude un vehículo del caso («Nissan, Versa, sedan compacto»). */
export function descripcionVehiculo(v: Expediente["vehiculos"][number]): string {
  const partes = [v.marca?.valor, v.modelo?.valor, v.clase?.replaceAll("_", " ")].filter(Boolean);
  return partes.length ? partes.join(", ") : `vehículo ${v.id}`;
}

export function mensajeDeclaracion(
  declaracion: string,
  vehiculos: readonly VehiculoDelCaso[],
  declarante: Id,
): string {
  const lista = vehiculos.map((v) => `- ${v.id}: ${v.descripcion}`).join("\n");
  return `Vehículos del caso:\n${lista}\n\nEl declarante conducía ${declarante}.\n\nDeclaración:\n\n${declaracion}`;
}

/** Lo que dice el conductor, revisado contra el texto. Cada dato con su cita literal. */
export interface VersionDeclarada {
  declarante: Id;
  maniobras: { vehiculo: Id; tipo: string; cita: string }[];
  /** Las velocidades que declara, en km/h; solo si el número está escrito en su cita. */
  velocidades: { vehiculo: Id; kmh: number; cita: string }[];
  /** Con qué cara dice que tocó cada vehículo, impacto por impacto. */
  contactos: { impacto: number; vehiculo: Id; cara: string; cita: string }[];
  finales: { vehiculo: Id; descripcion: string; cita: string }[];
  /** Citas que no están en la declaración y números que no están en su cita (descartados). */
  descartados: { citas: number; numeros: number };
}

const KMH = /(km\/?h|kil[oó]metros? por hora|kph)/i;

/** La salida de Claude como versión declarada, con las citas revisadas contra la declaración. */
export function versionDeclarada(
  s: SalidaCorpus,
  declaracion: string,
  declarante: Id,
  vehiculosDelCaso: readonly Id[],
): VersionDeclarada {
  const { grupos } = agrupar(s.datos);
  const v: VersionDeclarada = {
    declarante,
    maniobras: [],
    velocidades: [],
    contactos: [],
    finales: [],
    descartados: { citas: 0, numeros: 0 },
  };
  const delCaso = (x: string | null): x is Id =>
    x !== null &&
    (IDS_VEHICULO as readonly string[]).includes(x) &&
    vehiculosDelCaso.includes(x);
  /** La primera cita del grupo que está en la declaración (redactada), o null. */
  const citaDe = (citas: string[]): string | null => {
    const encontradas = citas.filter((c) => ubicarCita(declaracion, c));
    v.descartados.citas += citas.length - encontradas.length;
    return encontradas[0] ? redactar(encontradas[0]) : null;
  };
  for (const g of grupos) {
    const cita = citaDe(g.citas);
    if (!cita) continue;
    if (g.seccion === "movimiento" && delCaso(g.vehiculo)) {
      const tipo = g.valores.get("maniobra")?.[0];
      if (tipo) v.maniobras.push({ vehiculo: g.vehiculo, tipo, cita });
      const vel = g.valores.get("velocidad")?.[0];
      if (vel) {
        const kmh = numerosEscritos(vel)[0];
        const enCita = g.citas.flatMap(numerosEnCita);
        if (kmh !== undefined && (KMH.test(vel) || !/[a-z]/i.test(vel)) && enCita.includes(kmh))
          v.velocidades.push({ vehiculo: g.vehiculo, kmh, cita });
        else v.descartados.numeros++;
      }
    } else if (g.seccion === "impacto") {
      const participantes = (g.valores.get("participante") ?? []).filter(delCaso);
      for (const t of g.valores.get("contacto") ?? []) {
        const m = /\b(V[1-8])\b\W*([a-záéíóú_ ]+)/i.exec(t);
        const id = m?.[1]!.toUpperCase() ?? null;
        const cara = m?.[2]!.trim().toLowerCase().replace(/\s+/g, "_");
        if (delCaso(id) && cara && VALORES.cara!.includes(cara) && participantes.includes(id))
          v.contactos.push({ impacto: g.n, vehiculo: id, cara, cita });
      }
    } else if (g.seccion === "posicion" && delCaso(g.vehiculo)) {
      const descripcion = g.valores.get("descripcion")?.[0]?.trim();
      if (descripcion && g.valores.get("fase")?.[0] === "final")
        v.finales.push({
          vehiculo: g.vehiculo,
          descripcion: redactar(descripcion).slice(0, 300),
          cita,
        });
    }
  }
  return v;
}
