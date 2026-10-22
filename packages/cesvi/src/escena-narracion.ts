/**
 * R1 (docs/cesvi/PLAN-CESVI.md): de la narración técnica del perito a la escena completa del
 * contrato 2.0.0 (ADR 0061). N vehículos con clase y masa, M impactos con sus zonas de contacto,
 * objetos fijos, restos, huellas y, en palabras, dónde queda cada vehículo.
 *
 * Reutiliza el extractor del corpus (C0, `corpus.ts`): Claude ordena la narración en filas planas,
 * y Croquis revisa cada cita contra el texto y cada número contra su cita. Aquí la fuente de todo
 * es el perito. Las posiciones no van al contrato, que las pide con coordenadas: las coloca el
 * perito en el mapa, y la descripción le dice dónde.
 */
import {
  expedienteDeSalida,
  problemasExpediente,
  VALORES,
  type Conteos,
  type Expediente,
  type PosicionDescrita,
  type SalidaCorpus,
} from "./corpus";
import { GLOSARIO, glosarioParaPrompt } from "./hecho-lectura";

export const VERSION_PROMPT_ESCENA = "escena-narracion-v1";

const lista = (campo: string) => VALORES[campo]!.join(", ");

export const SISTEMA_ESCENA = `Eres asistente de los peritos de CESVI México. Lees la narración técnica de un hecho de tránsito que escribe el perito y ordenas lo que dice en una lista de datos, con el vocabulario técnico de los dictámenes de CESVI. Solo ordenas: no opinas, no completas lo que falta y no calculas.

Cada dato es una fila: sección, n (el número del grupo dentro de la sección: el daño 1, el impacto 1…), vehículo (V1, V2… o «ninguno»), campo, valor y cita.

Reglas generales:
- Solo escribe lo que la narración dice. Si no lo dice, no pongas la fila.
- «cita» es un fragmento copiado literal de la narración, de 3 a 40 palabras, sin cambiar ni una letra. Ponla en la primera fila de cada grupo y en cada fila que salga de otra frase; en las demás filas del grupo, "". Una cita que no esté en la narración se descarta.
- Los números se copian tal como están escritos, con su unidad (p. ej. "1,450 kg" o "15.89 m"). No conviertas, no redondees y no hagas cuentas.
- Los campos de valores cerrados usan exactamente uno de los valores de la lista; si ninguno corresponde, no pongas la fila.
- Nunca escribas placas, VIN, números de serie ni nombres de personas.

Vehículos: el que la narración llama «vehículo A» es V1, el «vehículo B» es V2, y así; si no los nombra con letras, V1, V2… en el orden en que aparecen.

Secciones y campos:
- caso (n 1, vehículo «ninguno»): modalidad (solo si la narración la nombra: ${lista("modalidad")}), fecha_hora, lugar (la vía y el punto como los escribe), municipio, entidad.
- vehiculo (n 1, 2…; vehículo V1, V2…): marca, modelo (el tipo o versión), anio, clase (solo si es clara: ${lista("clase")}) y masa, si las escribe.
- dano (un grupo por cada zona dañada de cada vehículo; vehículo = el dañado): cara (${lista("cara")}); tercio (izquierdo, centro o derecho en el frente y la parte posterior; delantero, medio o trasero en los laterales); vertice (${lista("vertice")}); altura ("45 a 95 cm"); direccion (${lista("direccion")}; una fila por dirección); tipo (${lista("tipo")}; una fila por tipo); magnitud (${lista("magnitud")}); medidas ("C1 0.96, C2 0.86, L 1.689 m"); intercambio; previo («si» si la narración dice que el daño es previo o sin relación).
- impacto (n = el orden: 1, 2…; vehículo «ninguno»): solo si la narración dice qué vehículos u objetos entraron en contacto. participante (una fila por vehículo) y objeto_fijo (la contraparte si es un objeto, la superficie o un cuerpo no identificado).
- restos (n 1): longitud de la zona de restos, si la mide.
- huella (un grupo por huella; vehículo = el que la dejó o «ninguno»): tipo_huella (${lista("tipo_huella")}) y longitud.
- objeto_fijo (un grupo por objeto fijo dañado): descripcion.
- posicion (un grupo por vehículo y fase que la narración ubique; vehículo = el ubicado): fase (inicial, impacto o final) y descripcion (dónde queda, en palabras: «sobre el acotamiento derecho, a 15.89 m del punto de contacto»).

Vocabulario de los dictámenes de CESVI, con en cuántos de los ${GLOSARIO.dictamenes} dictámenes aparece cada término:
${glosarioParaPrompt()}`;

export function mensajeEscena(narracion: string): string {
  return `Narración del perito:\n\n${narracion}`;
}

type Id = Expediente["vehiculos"][number]["id"];
type Zona = NonNullable<Expediente["danos"]>[number]["zona"];

export interface PreguntaEscena {
  clave: string;
  texto: string;
  /** Por qué importa para reconstruir. */
  porQue: string;
  vehiculo?: Id;
  impacto?: number;
}

export interface EscenaNarrada {
  expediente: Expediente;
  posiciones: PosicionDescrita[];
  conteos: Conteos;
  /** Errores del esquema o del validador semántico (vacío si la escena es válida). */
  problemas: string[];
  /** Lo que más cambia la reconstrucción y la narración no dice, en ese orden. Todas admiten «No sé». */
  preguntas: PreguntaEscena[];
}

/**
 * La zona dañada de un vehículo si es una sola cara (sin contar los daños previos): la cara, y el
 * tercio y el vértice solo si todos sus daños coinciden. null si no tiene daños o si están en más
 * de una cara.
 */
function zonaUnica(e: Expediente, v: Id): Zona | null {
  const zs = (e.danos ?? []).filter((d) => d.vehiculo === v && !d.dano_previo).map((d) => d.zona);
  const unico = <T>(xs: T[]) => (new Set(xs).size === 1 ? xs[0] : undefined);
  const cara = unico(zs.map((z) => z.cara));
  if (!cara) return null;
  const tercio = unico(zs.map((z) => z.tercio));
  const vertice = unico(zs.map((z) => z.vertice));
  return { cara, ...(tercio && { tercio }), ...(vertice && { vertice }) };
}

/**
 * Las zonas de contacto de cada impacto, de los daños que narra el perito: un vehículo que
 * participa en un solo impacto y tiene sus daños en una sola cara (`zonaUnica`) la aporta.
 * Si tiene varias zonas o varios impactos, la asignación es ambigua y se pregunta.
 */
function conZonas(e: Expediente): { expediente: Expediente; ambiguas: [number, Id][] } {
  const impactos = e.impactos ?? [];
  const ambiguas: [number, Id][] = [];
  const nuevos = impactos.map((i) => {
    const zonas: { vehiculo: Id; zona: Zona }[] = [];
    for (const v of i.vehiculos ?? []) {
      const enCuantos = impactos.filter((x) => x.vehiculos?.includes(v)).length;
      const zona = zonaUnica(e, v);
      if (enCuantos === 1 && zona) zonas.push({ vehiculo: v, zona });
      else ambiguas.push([i.orden, v]);
    }
    return zonas.length ? { ...i, zonas } : i;
  });
  return {
    expediente: nuevos.length ? { ...e, impactos: nuevos } : e,
    ambiguas,
  };
}

/**
 * Si la narración no dice qué entró en contacto, Croquis propone el impacto solo cuando no hay
 * ambigüedad: dos vehículos con sus daños en una sola cara cada uno, o un vehículo con sus daños en
 * una sola cara y un solo objeto fijo dañado. El impacto va con fuente «supuesto» y el perito
 * lo confirma; con más vehículos, zonas u objetos, se pregunta.
 */
function impactoPropuesto(e: Expediente): NonNullable<Expediente["impactos"]>[number] | null {
  const vs = e.vehiculos.map((v) => v.id);
  const objetos = e.evidencias?.objetos_fijos_danados ?? [];
  if (vs.length === 2 && vs.every((v) => zonaUnica(e, v))) {
    return {
      orden: 1,
      vehiculos: vs,
      zonas: vs.map((v) => ({ vehiculo: v, zona: zonaUnica(e, v)! })),
      fuente: "supuesto",
    };
  }
  if (vs.length === 1 && zonaUnica(e, vs[0]!) && objetos.length === 1) {
    return {
      orden: 1,
      vehiculos: vs,
      objeto_fijo: objetos[0]!.slice(0, 120),
      zonas: [{ vehiculo: vs[0]!, zona: zonaUnica(e, vs[0]!)! }],
      fuente: "supuesto",
    };
  }
  return null;
}

const enPalabras = (z: Zona) =>
  [z.cara.replace("_", " "), z.tercio, z.vertice?.replace("_", " ")].filter(Boolean).join(" ");

export function escenaDeNarracion(s: SalidaCorpus, narracion: string): EscenaNarrada {
  const c = expedienteDeSalida(s, narracion, "perito");
  const leido = conZonas(c.expediente);
  const preguntas: PreguntaEscena[] = [];
  const propuesto = leido.expediente.impactos?.length ? null : impactoPropuesto(leido.expediente);
  const expediente = propuesto ? { ...leido.expediente, impactos: [propuesto] } : leido.expediente;
  const { ambiguas } = leido;
  const impactos = expediente.impactos ?? [];
  if (propuesto) {
    const partes = propuesto.zonas!.map((z) => `${z.vehiculo} en su ${enPalabras(z.zona)}`);
    preguntas.push({
      clave: "impacto-propuesto",
      texto: `La narración no dice qué entró en contacto. Por los daños, Croquis supone un impacto entre ${partes.join(" y ")}${propuesto.objeto_fijo ? ` contra ${propuesto.objeto_fijo}` : ""}. ¿Es correcto?`,
      porQue:
        "Sin los impactos no hay reconstrucción; este es un supuesto hasta que el perito lo confirme.",
      impacto: 1,
    });
  } else if (!impactos.length) {
    preguntas.push({
      clave: "impactos",
      texto: "¿Qué vehículos u objetos entraron en contacto, y en qué orden?",
      porQue: "Sin los impactos no hay reconstrucción.",
    });
  }
  for (const [orden, v] of ambiguas) {
    preguntas.push({
      clave: `zona-${orden}-${v}`,
      texto: `¿Con qué zona entró en contacto ${v} en el impacto ${orden}?`,
      porQue: "La zona de contacto fija la dirección de la fuerza en el impacto.",
      vehiculo: v,
      impacto: orden,
    });
  }
  for (const v of expediente.vehiculos) {
    if (!v.masa) {
      preguntas.push({
        clave: `masa-${v.id}`,
        texto: v.clase
          ? `¿Cuál es la masa de ${v.id}? Si no se sabe, se usa la típica de su clase, marcada como supuesto.`
          : `¿Qué clase de vehículo es ${v.id} y cuál es su masa?`,
        porQue: "La masa reparte la cantidad de movimiento y cambia las velocidades.",
        vehiculo: v.id,
      });
    }
  }
  if (!expediente.evidencias?.restos?.longitud) {
    preguntas.push({
      clave: "restos",
      texto: "¿Qué longitud tiene la zona de restos?",
      porQue: "Los restos fijan el desplazamiento después del impacto.",
    });
  }
  for (const v of expediente.vehiculos) {
    if (!c.posiciones.some((p) => p.vehiculo === v.id && p.fase === "final")) {
      preguntas.push({
        clave: `final-${v.id}`,
        texto: `¿Dónde quedó ${v.id} al final?`,
        porQue: "La posición final es evidencia para la inversión de velocidades.",
        vehiculo: v.id,
      });
    }
  }
  return {
    expediente,
    posiciones: c.posiciones,
    conteos: c.conteos,
    problemas: problemasExpediente(expediente),
    preguntas,
  };
}

export { problemasExpediente } from "./corpus";
export type { Expediente, PosicionDescrita, SalidaCorpus } from "./corpus";

// --- Lo que corrige el perito -------------------------------------------------------------------

type Fase = "inicial" | "impacto" | "final";

/**
 * Coloca un vehículo en una fase sobre el mapa (fuente «perito»): reemplaza su posición anterior en
 * esa fase dentro de la versión de la evidencia, que se crea si no existe.
 */
export function conPosicion(
  e: Expediente,
  p: { vehiculo: Id; fase: Fase; punto: { lat: number; lon: number }; rumbo: number },
): Expediente {
  const versiones = [...(e.versiones ?? [])];
  let i = versiones.findIndex((v) => v.tipo === "evidencia");
  if (i < 0) {
    versiones.unshift({ tipo: "evidencia" });
    i = 0;
  }
  const v = versiones[i]!;
  const rumbo = ((p.rumbo % 360) + 360) % 360;
  versiones[i] = {
    ...v,
    posiciones: [
      ...(v.posiciones ?? []).filter((x) => !(x.vehiculo === p.vehiculo && x.fase === p.fase)),
      { vehiculo: p.vehiculo, fase: p.fase, punto: p.punto, rumbo, fuente: "perito" },
    ],
  };
  return { ...e, versiones };
}

/** La masa que da el perito (kg). */
export function conMasa(e: Expediente, vehiculo: Id, kg: number): Expediente {
  return {
    ...e,
    vehiculos: e.vehiculos.map((v) =>
      v.id === vehiculo ? { ...v, masa: { valor: kg, unidad: "kg", fuente: "perito" } } : v,
    ),
  };
}

/** La longitud de la zona de restos que mide el perito (m). */
export function conRestos(e: Expediente, m: number): Expediente {
  const ev = e.evidencias ?? {};
  return {
    ...e,
    evidencias: {
      ...ev,
      restos: { ...ev.restos, longitud: { valor: m, unidad: "m", fuente: "perito" } },
    },
  };
}

/** El perito confirma un impacto que Croquis supuso: deja de ser supuesto. */
export function confirmarImpacto(e: Expediente, orden: number): Expediente {
  return {
    ...e,
    impactos: e.impactos?.map((i) =>
      i.orden === orden && i.fuente === "supuesto" ? { ...i, fuente: "perito" } : i,
    ),
  };
}
