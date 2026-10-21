/**
 * Lo que entiende Croquis de la declaración de un dictamen (paso 2 del recorrido del perito,
 * docs/cesvi/PROTOTIPO.md, ADR 0052).
 *
 * Reúne tres fuentes:
 *
 * - La extracción de «Cuenta qué pasó» (`/api/relato/extraer`, con Claude o con reglas): las
 *   maniobras de cada vehículo y la frase que las sostiene.
 * - Detectores escritos para declaraciones de dictamen, que cubren lo que el contrato de escena no
 *   guarda: el sentido de circulación, el orden de los hechos y quién impacta a quién.
 * - Las notas y respuestas del perito, que mandan sobre lo anterior.
 *
 * Cada dato lleva su frase, su fuente (declaración, expediente, perito o supuesto) y quién lo
 * entendió (IA, reglas o perito). No produce números finales: si la declaración dice «unos metros»,
 * pregunta cuántos.
 */

export type FuenteDato = "declaracion" | "expediente" | "perito" | "supuesto";
export type EntendidoPor = "ia" | "reglas" | "perito";

export interface Frase {
  inicio: number;
  fin: number;
  texto: string;
}

export interface DatoEntendido {
  clave: "vehiculo_a" | "vehiculo_b" | "sentido" | "maniobra_a" | "reversa" | "impacta";
  etiqueta: string;
  valor: string;
  fuente: FuenteDato;
  entendidoPor: EntendidoPor;
  frase: Frase | null;
}

export interface Hecho {
  orden: number;
  texto: string;
  frase: Frase;
}

export interface PreguntaDeclaracion {
  clave: string;
  texto: string;
}

export type Impacta = "B_a_A" | "A_a_B";

export interface Dinamica {
  /** Sentido de circulación de A (para orientar la versión declarada en el mapa). */
  sentido: { desde: string; hacia: string } | null;
  maniobraA: string | null;
  impacta: Impacta | null;
  /** Metros de reversa que dice la declaración o el perito; null si no se sabe. */
  reversaM: number | null;
}

export interface Interpretacion {
  datos: DatoEntendido[];
  hechos: Hecho[];
  preguntas: PreguntaDeclaracion[];
  dinamica: Dinamica;
}

/** Lo que devuelve `/api/relato/extraer` y usa este módulo. */
export interface ExtraccionRelato {
  metodo: "reglas" | "claude";
  spec: {
    vehiculos?: {
      id: string;
      rol?: string;
      maniobra?: { valor: string; fuente: string; evidencia?: Frase[] };
    }[];
  };
  preguntas?: { texto?: string }[];
}

export interface RespuestasPerito {
  reversaM?: number | null;
  impacta?: Impacta | null;
}

export interface ExpedienteDeclaracion {
  textoA: string;
  textoB: string;
}

/** Sin acentos y en minúsculas, unidad por unidad: las posiciones siguen valiendo en el original. */
function plano(t: string): string {
  return t
    .split("")
    .map((c) => (c.normalize("NFD")[0] ?? c).toLowerCase())
    .join("");
}

function buscar(texto: string, re: RegExp): Frase | null {
  const m = re.exec(plano(texto));
  if (!m) return null;
  return {
    inicio: m.index,
    fin: m.index + m[0].length,
    texto: texto.slice(m.index, m.index + m[0].length),
  };
}

const PUNTOS = "(sur|norte|oriente|poniente|este|oeste)";
const DETECTORES: { texto: string; re: RegExp }[] = [
  {
    texto: "Circula",
    re: new RegExp(`(venia|circulaba|iba|transitaba)( de ${PUNTOS} a ${PUNTOS})?`),
  },
  { texto: "Ve un accidente adelante", re: /vi (un|una) (accidente|choque)( de (un|una) [a-z]+)?/ },
  { texto: "Se detiene", re: /me pare|me detuve|me frene|frene/ },
  {
    texto: "Retrocede",
    re: /(revers[a-z]*|eche (de )?reversa|retroced[a-z]*)( \w+)? metros|revers[a-z]+|retroced[a-z]+/,
  },
  {
    texto: "Llega otro vehículo",
    re: /llego (la|el|una|un) (camioneta|carro|auto|coche|vehiculo|camion|trailer|tractocamion)/,
  },
  { texto: "Impacto", re: /me (impacto|pego|choco|golpeo)|(impacte|choque|pegue) (a|con|contra)/ },
];

/** Los hechos que narra la declaración, en el orden en que aparecen. */
export function hechosDe(texto: string): Hecho[] {
  return DETECTORES.flatMap((d) => {
    const f = buscar(texto, d.re);
    return f ? [{ texto: d.texto, frase: f }] : [];
  })
    .sort((a, b) => a.frase.inicio - b.frase.inicio)
    .map((h, i) => ({ orden: i + 1, ...h }));
}

const NOMBRE_MANIOBRA: Record<string, string> = {
  reversa: "reversa",
  detenido: "detenido",
  recto: "de frente",
  estacionado: "estacionado",
};

export function interpretarDeclaracion(
  declaracion: string,
  expediente: ExpedienteDeclaracion,
  extraccion: ExtraccionRelato | null,
  notasPerito = "",
  respuestas: RespuestasPerito = {},
): Interpretacion {
  const datos: DatoEntendido[] = [];
  const hechos = hechosDe(declaracion);
  const preguntas: PreguntaDeclaracion[] = [];
  const porIa: EntendidoPor = extraccion?.metodo === "claude" ? "ia" : "reglas";

  // Vehículos: quien declara es A; el otro, como lo nombra la declaración.
  datos.push({
    clave: "vehiculo_a",
    etiqueta: "Vehículo A",
    valor: `quien declara (${expediente.textoA})`,
    fuente: "expediente",
    entendidoPor: "reglas",
    frase: null,
  });
  const otro = buscar(
    declaracion,
    /(la|el) (camioneta|carro|auto|coche|vehiculo|camion|trailer|tractocamion)(?= y me)/,
  );
  datos.push({
    clave: "vehiculo_b",
    etiqueta: "Vehículo B",
    valor: otro ? `«${otro.texto}» (${expediente.textoB})` : expediente.textoB,
    fuente: otro ? "declaracion" : "expediente",
    entendidoPor: "reglas",
    frase: otro,
  });

  // Sentido de circulación de A.
  const sentido = buscar(declaracion, new RegExp(`de ${PUNTOS} a ${PUNTOS}`));
  let dinSentido: Dinamica["sentido"] = null;
  if (sentido) {
    const [, desde, hacia] =
      new RegExp(`de ${PUNTOS} a ${PUNTOS}`).exec(plano(sentido.texto)) ?? [];
    dinSentido = desde && hacia ? { desde, hacia } : null;
    datos.push({
      clave: "sentido",
      etiqueta: "Sentido de A",
      valor: dinSentido ? `de ${dinSentido.desde} a ${dinSentido.hacia}` : sentido.texto,
      fuente: "declaracion",
      entendidoPor: "reglas",
      frase: sentido,
    });
  } else {
    preguntas.push({ clave: "sentido", texto: "¿En qué sentido circulaba el vehículo A?" });
  }

  // Maniobra de A: la de la extracción si trae evidencia; si no, la de los detectores.
  const a = extraccion?.spec.vehiculos?.find((v) => v.rol === "A" || v.id === "veh-a");
  const evidencia = a?.maniobra?.evidencia?.[0];
  let maniobraA: string | null = null;
  if (a?.maniobra && evidencia && a.maniobra.fuente === "relato") {
    maniobraA = a.maniobra.valor;
    datos.push({
      clave: "maniobra_a",
      etiqueta: "Maniobra de A antes del impacto",
      valor: NOMBRE_MANIOBRA[maniobraA] ?? maniobraA,
      fuente: "declaracion",
      entendidoPor: porIa,
      frase: evidencia,
    });
  } else {
    const r =
      hechos.find((h) => h.texto === "Retrocede") ?? hechos.find((h) => h.texto === "Se detiene");
    if (r) {
      maniobraA = r.texto === "Retrocede" ? "reversa" : "detenido";
      datos.push({
        clave: "maniobra_a",
        etiqueta: "Maniobra de A antes del impacto",
        valor: NOMBRE_MANIOBRA[maniobraA]!,
        fuente: "declaracion",
        entendidoPor: "reglas",
        frase: r.frase,
      });
    }
  }

  // Metros de reversa: un número en la declaración o en las notas; «unos metros» se pregunta.
  let reversaM: number | null = null;
  if (maniobraA === "reversa") {
    const enNotas = /(\d+(?:[.,]\d+)?) ?m(etros)?\b/.exec(plano(notasPerito));
    const enDeclaracion = buscar(declaracion, /(\d+(?:[.,]\d+)?) metros/);
    if (respuestas.reversaM != null) {
      reversaM = respuestas.reversaM;
      datos.push({
        clave: "reversa",
        etiqueta: "Metros de reversa",
        valor: `${reversaM} m`,
        fuente: "perito",
        entendidoPor: "perito",
        frase: null,
      });
    } else if (enNotas) {
      reversaM = Number(enNotas[1]!.replace(",", "."));
      datos.push({
        clave: "reversa",
        etiqueta: "Metros de reversa",
        valor: `${reversaM} m`,
        fuente: "perito",
        entendidoPor: "reglas",
        frase: null,
      });
    } else if (enDeclaracion) {
      reversaM = Number(/(\d+(?:[.,]\d+)?)/.exec(enDeclaracion.texto)![1]!.replace(",", "."));
      datos.push({
        clave: "reversa",
        etiqueta: "Metros de reversa",
        valor: `${reversaM} m`,
        fuente: "declaracion",
        entendidoPor: "reglas",
        frase: enDeclaracion,
      });
    } else {
      const vaga = buscar(declaracion, /unos metros|algunos metros|poquito|un poco/);
      datos.push({
        clave: "reversa",
        etiqueta: "Metros de reversa",
        valor: vaga ? `«${vaga.texto}» (sin número)` : "sin dato",
        fuente: "supuesto",
        entendidoPor: "reglas",
        frase: vaga,
      });
      preguntas.push({ clave: "reversa", texto: "¿Cuántos metros de reversa?" });
    }
  }

  // Quién impacta a quién.
  let impacta: Impacta | null = respuestas.impacta ?? null;
  if (impacta) {
    datos.push({
      clave: "impacta",
      etiqueta: "Quién impacta a quién",
      valor: impacta === "B_a_A" ? "B impacta a A" : "A impacta a B",
      fuente: "perito",
      entendidoPor: "perito",
      frase: null,
    });
  } else {
    const meImpacta = buscar(declaracion, /me (impacto|pego|choco|golpeo)/);
    const impacte = buscar(declaracion, /(impacte|choque|pegue) (a|con|contra)/);
    if (meImpacta || impacte) {
      impacta = meImpacta ? "B_a_A" : "A_a_B";
      datos.push({
        clave: "impacta",
        etiqueta: "Quién impacta a quién",
        valor: impacta === "B_a_A" ? "B impacta a A" : "A impacta a B",
        fuente: "declaracion",
        entendidoPor: "reglas",
        frase: (meImpacta ?? impacte)!,
      });
    } else {
      preguntas.push({ clave: "impacta", texto: "¿Qué vehículo impacta a cuál?" });
    }
  }

  // Lo que pregunta la extracción y sirve aquí: sin velocidades (salen de los cálculos) ni zonas
  // de golpe (las da la observación de daños del dictamen).
  for (const p of extraccion?.preguntas ?? []) {
    if (p.texto && !/velocidad|golpe|zona/i.test(p.texto))
      preguntas.push({ clave: `extraccion-${preguntas.length}`, texto: p.texto });
  }

  return {
    datos,
    hechos,
    preguntas,
    dinamica: { sentido: dinSentido, maniobraA, impacta, reversaM },
  };
}
