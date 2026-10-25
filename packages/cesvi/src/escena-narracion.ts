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
import MASAS_TIPICAS from "./data/masas-tipicas.json";
import {
  expedienteDeSalida,
  problemasExpediente,
  VALORES,
  type Conteos,
  type Conversion,
  type Expediente,
  type PosicionDescrita,
  type SalidaCorpus,
} from "./corpus";
import { GLOSARIO, glosarioParaPrompt } from "./hecho-lectura";

export const VERSION_PROMPT_ESCENA = "escena-narracion-v2";

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
- vehiculo (n 1, 2…; vehículo V1, V2…): marca, modelo (el tipo o versión), anio, clase (solo si es clara: ${lista("clase")}), masa (también si la llama peso: "1,450 kg") y rigidez ("A = 52,000 N/m, B = 345,000 N/m²"), si las escribe.
- dano (un grupo por cada zona dañada de cada vehículo; vehículo = el dañado): cara (${lista("cara")}); tercio (izquierdo, centro o derecho en el frente y la parte posterior; delantero, medio o trasero en los laterales); vertice (${lista("vertice")}); altura ("45 a 95 cm"); direccion (${lista("direccion")}; una fila por dirección); tipo (${lista("tipo")}; una fila por tipo); magnitud (${lista("magnitud")}); medidas (las de deformación C1…C6 y el ancho L con su unidad: "C1 0.96 m, C2 0.86 m, L 1.689 m"; si la narración hace la cuenta, «C1 = 85 – 45 = 40 cm», copia el resultado: "C1 40 cm"); intercambio; previo («si» si la narración dice que el daño es previo o sin relación).
- impacto (n = el orden: 1, 2…; vehículo «ninguno»): solo si la narración dice qué vehículos u objetos entraron en contacto. participante (una fila por vehículo), objeto_fijo (la contraparte si es un objeto, la superficie o un cuerpo no identificado) y contacto (una fila por vehículo cuya cara de contacto en ese impacto dice la narración: el vehículo y la cara, p. ej. "V1 frontal"; caras: ${lista("cara")}).
- movimiento (un grupo por vehículo cuyo movimiento antes del impacto dice la narración; vehículo = ese): maniobra (${lista("maniobra")}): «reversa» si retrocedía, «se_detiene» si estaba detenido o estacionado, «circula» si avanzaba, y las demás si las dice.
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

/**
 * Cómo se contesta una pregunta (comentario de René, 2026-10-24): cada una pide un solo dato y trae su
 * control; «No sé» va siempre aparte, como opción secundaria.
 */
export type ControlPregunta =
  | { tipo: "sino" }
  | { tipo: "opciones"; opciones: { valor: string; etiqueta: string }[] }
  | {
      tipo: "numero";
      unidad: "kg" | "m";
      /** El valor típico de su clase, con su fuente; al usarlo queda como supuesto. */
      tipico?: { valor: number; fuente: string };
    }
  /** Se contesta colocándolo en el mapa (paso del lugar). */
  | { tipo: "mapa" };

export interface PreguntaEscena {
  clave: string;
  texto: string;
  /** Por qué importa para reconstruir. */
  porQue: string;
  control: ControlPregunta;
  vehiculo?: Id;
  impacto?: number;
}

/** Las clases que se ofrecen al preguntar el tipo de vehículo, con la del contrato que usa cada una. */
export const CLASES_PREGUNTA: { valor: string; etiqueta: string }[] = [
  { valor: "sedan_compacto", etiqueta: "Sedán" },
  { valor: "hatchback", etiqueta: "Hatchback" },
  { valor: "suv_compacta", etiqueta: "SUV" },
  { valor: "pickup", etiqueta: "Pickup" },
  { valor: "camion_unitario", etiqueta: "Camión" },
  { valor: "motocicleta", etiqueta: "Moto" },
  { valor: "otro", etiqueta: "Otro" },
];

/** Los objetos fijos que se ofrecen cuando hay un solo vehículo (el texto va al impacto). */
export const OBJETOS_PREGUNTA: { valor: string; etiqueta: string }[] = [
  { valor: "poste", etiqueta: "Un poste" },
  { valor: "arbol", etiqueta: "Un árbol" },
  { valor: "muro", etiqueta: "Un muro o una barda" },
  { valor: "otro", etiqueta: "Otro objeto fijo" },
];
const OBJETO_TEXTO: Record<string, string> = {
  poste: "poste",
  arbol: "árbol",
  muro: "muro",
  otro: "objeto fijo",
};

/** Las caras de un vehículo que se ofrecen al preguntar la zona de contacto. */
export const CARAS_PREGUNTA: { valor: string; etiqueta: string }[] = [
  { valor: "frontal", etiqueta: "Frente" },
  { valor: "posterior", etiqueta: "Parte trasera" },
  { valor: "lateral_izquierdo", etiqueta: "Costado izquierdo" },
  { valor: "lateral_derecho", etiqueta: "Costado derecho" },
];

/**
 * La masa típica de una clase, con su fuente (`data/masas-tipicas.json`, generado de E2 y de las
 * fichas de fabricante por `data/cesvi/scripts/masas-tipicas.mjs`), o null si no hay dato.
 */
export function masaTipica(clase: string | undefined): { valor: number; fuente: string } | null {
  const m = clase
    ? (MASAS_TIPICAS.masas as Record<string, { kg: number; fuente: string }>)[clase]
    : undefined;
  return m ? { valor: m.kg, fuente: m.fuente } : null;
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
    // Las que dice la narración (R4b) se quedan; las demás salen de los daños.
    const zonas: { vehiculo: Id; zona: Zona }[] = [...(i.zonas ?? [])];
    for (const v of i.vehiculos ?? []) {
      if (zonas.some((z) => z.vehiculo === v)) continue;
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
  return escenaDeConversion(expedienteDeSalida(s, narracion, "perito"));
}

/**
 * La escena de un expediente ya convertido (la narración del perito o un dictamen importado, R5):
 * las zonas de contacto, el impacto que se puede suponer y lo que más cambia la reconstrucción y el
 * texto no dice.
 */
export function escenaDeConversion(c: Conversion): EscenaNarrada {
  const leido = conZonas(c.expediente);
  const preguntas: PreguntaEscena[] = [];
  const propuesto = leido.expediente.impactos?.length ? null : impactoPropuesto(leido.expediente);
  const expediente = propuesto ? { ...leido.expediente, impactos: [propuesto] } : leido.expediente;
  const { ambiguas } = leido;
  if (propuesto) {
    const partes = propuesto.zonas!.map((z) => `${z.vehiculo} en su ${enPalabras(z.zona)}`);
    preguntas.push({
      clave: "impacto-propuesto",
      texto: `La narración no dice qué entró en contacto. Por los daños, Croquis supone un impacto entre ${partes.join(" y ")}${propuesto.objeto_fijo ? ` contra ${propuesto.objeto_fijo}` : ""}. ¿Es correcto?`,
      porQue:
        "Sin los impactos no hay reconstrucción; este es un supuesto hasta que el perito lo confirme.",
      control: { tipo: "sino" },
      impacto: 1,
    });
  }
  // Si no hay impactos (o el perito dice que el supuesto no es correcto): cuáles chocaron primero;
  // con un solo vehículo, contra qué.
  const ids = expediente.vehiculos.map((v) => v.id);
  const pares = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as const));
  preguntas.push(
    ids.length === 1
      ? {
          clave: "impactos",
          texto: `¿Contra qué chocó ${ids[0]}?`,
          porQue: "Sin los impactos no hay reconstrucción.",
          control: {
            tipo: "opciones",
            opciones: OBJETOS_PREGUNTA.map((o) => ({
              valor: `${ids[0]}|objeto:${o.valor}`,
              etiqueta: o.etiqueta,
            })),
          },
        }
      : {
          clave: "impactos",
          texto: "¿Qué vehículos chocaron primero?",
          porQue: "Sin los impactos no hay reconstrucción.",
          control: {
            tipo: "opciones",
            opciones: [
              ...pares.map(([a, b]) => ({ valor: `${a}|${b}`, etiqueta: `${a} y ${b}` })),
              ...ids.map((v) => ({
                valor: `${v}|objeto:otro`,
                etiqueta: `${v} contra un objeto fijo`,
              })),
            ],
          },
        },
  );
  for (const [orden, v] of ambiguas) {
    preguntas.push({
      clave: `zona-${orden}-${v}`,
      texto: `¿Con qué zona entró en contacto ${v} en el impacto ${orden}?`,
      porQue: "La zona de contacto fija la dirección de la fuerza en el impacto.",
      control: { tipo: "opciones", opciones: CARAS_PREGUNTA },
      vehiculo: v,
      impacto: orden,
    });
  }
  for (const v of expediente.vehiculos) {
    // Un solo dato por pregunta: primero la clase (si falta) y luego la masa, aparte.
    if (!v.clase) {
      preguntas.push({
        clave: `clase-${v.id}`,
        texto: `¿Qué tipo de vehículo es ${v.id}?`,
        porQue: "La clase da sus medidas y su masa típica, y la rigidez de su carrocería.",
        control: { tipo: "opciones", opciones: CLASES_PREGUNTA },
        vehiculo: v.id,
      });
    }
    if (!v.masa) {
      const tipico = masaTipica(v.clase);
      preguntas.push({
        clave: `masa-${v.id}`,
        texto: `¿Cuál es la masa de ${v.id}?`,
        porQue: "La masa reparte la cantidad de movimiento y cambia las velocidades.",
        control: { tipo: "numero", unidad: "kg", ...(tipico ? { tipico } : {}) },
        vehiculo: v.id,
      });
    }
  }
  if (!expediente.evidencias?.restos?.longitud) {
    preguntas.push({
      clave: "restos",
      texto: "¿Qué longitud tiene la zona de restos?",
      porQue: "Los restos fijan el desplazamiento después del impacto.",
      control: { tipo: "numero", unidad: "m" },
    });
  }
  for (const v of expediente.vehiculos) {
    if (!c.posiciones.some((p) => p.vehiculo === v.id && p.fase === "final")) {
      preguntas.push({
        clave: `final-${v.id}`,
        texto: `¿Dónde quedó ${v.id} al final?`,
        porQue: "La posición final es evidencia para la inversión de velocidades.",
        control: { tipo: "mapa" },
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
  p: {
    vehiculo: Id;
    fase: Fase;
    punto: { lat: number; lon: number };
    rumbo: number;
    /**
     * «supuesto»: en una pose de impacto, la que propone Croquis y el perito todavía no acepta (se
     * ve como fantasma); en una final, un reposo que el reporte no da y el perito supone (ADR 0091).
     */
    fuente?: "perito" | "supuesto";
  },
): Expediente {
  const versiones = [...(e.versiones ?? [])];
  let i = versiones.findIndex((v) => v.tipo === "evidencia");
  if (i < 0) {
    versiones.unshift({ tipo: "evidencia" });
    i = 0;
  }
  const v = versiones[i]!;
  const rumbo = ((p.rumbo % 360) + 360) % 360;
  const previa = (v.posiciones ?? []).find((x) => x.vehiculo === p.vehiculo && x.fase === p.fase);
  // Mover un reposo supuesto no lo vuelve dato: sigue siendo supuesto hasta que el perito lo diga.
  const fuente =
    p.fuente ?? (p.fase === "final" && previa?.fuente === "supuesto" ? "supuesto" : "perito");
  versiones[i] = {
    ...v,
    posiciones: [
      ...(v.posiciones ?? []).filter((x) => !(x.vehiculo === p.vehiculo && x.fase === p.fase)),
      { vehiculo: p.vehiculo, fase: p.fase, punto: p.punto, rumbo, fuente },
    ],
  };
  return { ...e, versiones };
}

/**
 * Marca (o desmarca) el reposo de un vehículo como supuesto: el reporte no lo da y el perito lo
 * supone. En la inversión pesa menos que lo medido (ADR 0091).
 */
export function conReposoSupuesto(e: Expediente, vehiculo: Id, supuesto: boolean): Expediente {
  return {
    ...e,
    versiones: (e.versiones ?? []).map((v) =>
      v.tipo !== "evidencia"
        ? v
        : {
            ...v,
            posiciones: (v.posiciones ?? []).map((p) =>
              p.vehiculo === vehiculo && p.fase === "final"
                ? { ...p, fuente: supuesto ? "supuesto" : "perito" }
                : p,
            ),
          },
    ),
  };
}

/** ¿El reposo de este vehículo está marcado como supuesto? */
export function reposoSupuesto(e: Expediente, vehiculo: Id): boolean {
  return (e.versiones ?? []).some(
    (v) =>
      v.tipo === "evidencia" &&
      (v.posiciones ?? []).some(
        (p) => p.vehiculo === vehiculo && p.fase === "final" && p.fuente === "supuesto",
      ),
  );
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

/**
 * Una huella de frenado que mide el perito en el mapa (V2): reemplaza la de ese vehículo si ya la
 * había medido él; las del reporte se quedan.
 */
export function conHuella(e: Expediente, vehiculo: Id, m: number): Expediente {
  const ev = e.evidencias ?? {};
  const otras = (ev.huellas ?? []).filter(
    (h) => !(h.vehiculo === vehiculo && h.tipo === "frenado" && h.longitud?.fuente === "perito"),
  );
  return {
    ...e,
    evidencias: {
      ...ev,
      huellas: [
        ...otras,
        { tipo: "frenado", vehiculo, longitud: { valor: m, unidad: "m", fuente: "perito" } },
      ],
    },
  };
}

/** El perito confirma un impacto que Croquis supuso: deja de ser supuesto. */
/**
 * Si una pregunta sigue pendiente con lo que ya tiene el expediente: las contestadas se ocultan. La
 * masa típica cuenta como contestada (queda como supuesto) y la masa se vuelve a preguntar si se
 * elige otra clase.
 */
export function preguntaPendiente(
  p: PreguntaEscena,
  e: Expediente,
  finales: readonly { vehiculo: Id }[],
): boolean {
  const vehiculo = e.vehiculos.find((v) => v.id === p.vehiculo);
  if (p.clave === "impacto-propuesto")
    return e.impactos?.some((i) => i.fuente === "supuesto") ?? false;
  if (p.clave === "impactos") return !e.impactos?.length;
  if (p.clave.startsWith("zona-"))
    return !e.impactos
      ?.find((i) => i.orden === p.impacto)
      ?.zonas?.some((z) => z.vehiculo === p.vehiculo);
  if (p.clave.startsWith("clase-")) return !vehiculo?.clase;
  if (p.clave.startsWith("masa-")) return !vehiculo?.masa;
  if (p.clave === "restos") return !e.evidencias?.restos?.longitud;
  if (p.clave.startsWith("final-")) return !finales.some((x) => x.vehiculo === p.vehiculo);
  return true;
}

/** La clase que contesta el perito (`otro` no cambia la clase: se pregunta la masa sin típica). */
export function conClase(e: Expediente, vehiculo: Id, clase: string): Expediente {
  if (clase === "otro") return e;
  return {
    ...e,
    vehiculos: e.vehiculos.map((v) =>
      v.id === vehiculo ? { ...v, clase: clase as NonNullable<typeof v.clase> } : v,
    ),
  };
}

/** La masa típica de su clase, marcada como supuesto (null si su clase no tiene dato). */
export function conMasaTipica(e: Expediente, vehiculo: Id): Expediente | null {
  const t = masaTipica(e.vehiculos.find((v) => v.id === vehiculo)?.clase);
  if (!t) return null;
  return {
    ...e,
    vehiculos: e.vehiculos.map((v) =>
      v.id === vehiculo ? { ...v, masa: { valor: t.valor, unidad: "kg", fuente: "supuesto" } } : v,
    ),
  };
}

/** La zona de contacto de un vehículo en un impacto, la cara que elige el perito. */
export function conZonaImpacto(
  e: Expediente,
  orden: number,
  vehiculo: Id,
  cara: string,
): Expediente {
  return {
    ...e,
    impactos: e.impactos?.map((i) =>
      i.orden === orden
        ? {
            ...i,
            zonas: [
              ...(i.zonas ?? []).filter((z) => z.vehiculo !== vehiculo),
              { vehiculo, zona: { cara: cara as Zona["cara"] } },
            ],
          }
        : i,
    ),
  };
}

/**
 * El primer impacto que contesta el perito: dos vehículos (`A|B`) o uno contra un objeto fijo
 * (`A|objeto:poste`).
 */
export function conPrimerImpacto(e: Expediente, valor: string): Expediente {
  const [a, b] = valor.split("|") as [Id, string];
  const impacto = b.startsWith("objeto:")
    ? {
        orden: 1,
        vehiculos: [a],
        objeto_fijo: OBJETO_TEXTO[b.slice(7)] ?? "objeto fijo",
        fuente: "perito" as const,
      }
    : { orden: 1, vehiculos: [a, b], fuente: "perito" as const };
  return { ...e, impactos: [impacto] };
}

/** «No es correcto» al impacto que supuso Croquis: se quita y se pregunta cuáles chocaron. */
export function sinImpactoSupuesto(e: Expediente): Expediente {
  return { ...e, impactos: (e.impactos ?? []).filter((i) => i.fuente !== "supuesto") };
}

export function confirmarImpacto(e: Expediente, orden: number): Expediente {
  return {
    ...e,
    impactos: e.impactos?.map((i) =>
      i.orden === orden && i.fuente === "supuesto" ? { ...i, fuente: "perito" } : i,
    ),
  };
}
