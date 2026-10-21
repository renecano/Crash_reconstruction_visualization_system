/**
 * Paso 2 del recorrido, «El hecho» (ADR 0055): lo que Croquis entiende de la descripción técnica
 * del perito y de la versión declarada, cada uno por separado. La descripción arma la versión de la
 * evidencia; la declaración, la versión declarada. Cada dato lleva su fuente (perito, conductor,
 * expediente o supuesto) y su frase; lo que falta para reconstruir se pregunta en lenguaje técnico.
 */
import type {
  ConTramo,
  DatoLeido,
  Hacia,
  LecturaValidada,
  Maniobra,
  TipoTexto,
  Tramo,
  VehiculoValidado,
} from "./hecho-lectura";

export type FuenteHecho = "perito" | "conductor" | "expediente" | "supuesto";
export type LeidoPor = "ia" | "reglas" | "perito";
type Letra = "A" | "B";

export interface DatoHecho {
  clave: string;
  etiqueta: string;
  valor: string;
  vehiculo: Letra | null;
  fuente: FuenteHecho;
  leidoPor: LeidoPor;
  /** De qué texto sale (null si viene del expediente o de una respuesta). */
  texto: TipoTexto | null;
  tramo: Tramo | null;
}

export interface OpcionPregunta {
  valor: string;
  etiqueta: string;
}
export interface PreguntaHecho {
  clave: string;
  texto: string;
  version: "evidencia" | "declarada";
  /** «numero» pide metros; «opciones», elegir una. */
  tipo: "numero" | "opciones" | "texto";
  opciones?: OpcionPregunta[];
  /** Lo que contestó el perito (null si falta): las contestadas se quedan para poder cambiarlas. */
  respuesta: string | number | null;
  /** Por qué importa la respuesta: qué cambia en las versiones o en el dictamen. */
  porQue: string;
}

/** Lo que contesta el perito, por clave de pregunta. */
export type RespuestasHecho = Partial<Record<string, string | number | null>>;

export interface ParametrosHecho {
  evidencia: { hacia: Hacia | null; distanciaRestos: number | null };
  declarada: { hacia: Hacia | null; reversaM: number | null; maniobraA: Maniobra | null };
}

export interface InterpretacionHecho {
  expediente: DatoHecho[];
  evidencia: DatoHecho[];
  declarada: DatoHecho[];
  preguntas: PreguntaHecho[];
  parametros: ParametrosHecho;
}

const NOMBRE_MANIOBRA: Record<Maniobra, string> = {
  circula: "circula",
  se_detiene: "se detiene",
  reversa: "reversa",
  frena: "frena",
  vira_izquierda: "vira a la izquierda",
  vira_derecha: "vira a la derecha",
  cambia_carril: "cambia de carril",
  evasiva: "maniobra evasiva",
  otra: "otra maniobra",
};

const CARRILES: OpcionPregunta[] = [
  { valor: "izquierdo", etiqueta: "Izquierdo" },
  { valor: "derecho", etiqueta: "Derecho" },
  { valor: "central", etiqueta: "Central" },
  { valor: "acotamiento", etiqueta: "Acotamiento" },
];
const SENTIDOS: OpcionPregunta[] = [
  { valor: "norte", etiqueta: "De sur a norte" },
  { valor: "sur", etiqueta: "De norte a sur" },
  { valor: "oriente", etiqueta: "De poniente a oriente" },
  { valor: "poniente", etiqueta: "De oriente a poniente" },
];
const DESDE: Record<Hacia, string> = {
  norte: "de sur a norte",
  sur: "de norte a sur",
  oriente: "de poniente a oriente",
  poniente: "de oriente a poniente",
};

/** Los datos de un vehículo leído, con su fuente. */
function datosVehiculo(
  v: VehiculoValidado,
  letra: Letra,
  fuente: FuenteHecho,
  leidoPor: LeidoPor,
  texto: TipoTexto,
): DatoHecho[] {
  const out: DatoHecho[] = [];
  const pon = (clave: string, etiqueta: string, d: ConTramo<DatoLeido> | null) => {
    if (!d) return;
    out.push({
      clave: `${clave}_${letra.toLowerCase()}`,
      etiqueta: `${letra} · ${etiqueta}`,
      valor: d.valor,
      vehiculo: letra,
      fuente,
      leidoPor,
      texto,
      tramo: d.tramo,
    });
  };
  pon("sentido", "Sentido", v.sentido);
  pon("carril", "Carril", v.carril);
  pon("zona_contacto", "Zona de contacto", v.zona_contacto);
  pon("acentuacion", "Acentuación", v.acentuacion);
  pon("vertice", "Vértice", v.vertice);
  pon("direccion_fuerza", "Dirección de la fuerza", v.direccion_fuerza);
  v.maniobras.forEach((m, i) =>
    out.push({
      clave: `maniobra_${letra.toLowerCase()}_${i + 1}`,
      etiqueta: `${letra} · Maniobra ${i + 1}`,
      valor:
        m.metros === null ? NOMBRE_MANIOBRA[m.tipo] : `${NOMBRE_MANIOBRA[m.tipo]}, ${m.metros} m`,
      vehiculo: letra,
      fuente,
      leidoPor,
      texto,
      tramo: m.tramo,
    }),
  );
  pon("posicion_final", "Posición final", v.posicion_final);
  return out;
}

function datosHecho(
  l: LecturaValidada,
  fuente: FuenteHecho,
  leidoPor: LeidoPor,
  texto: TipoTexto,
): DatoHecho[] {
  const base = (clave: string, etiqueta: string, d: ConTramo<DatoLeido>): DatoHecho => ({
    clave,
    etiqueta,
    valor: d.valor,
    vehiculo: null,
    fuente,
    leidoPor,
    texto,
    tramo: d.tramo,
  });
  return [
    ...(l.modalidad ? [base("modalidad", "Modalidad", l.modalidad)] : []),
    ...datosVehiculo(l.vehiculos.A, "A", fuente, leidoPor, texto),
    ...datosVehiculo(l.vehiculos.B, "B", fuente, leidoPor, texto),
    ...l.restos.map((r, i) => base(`restos_${i + 1}`, "Restos", r)),
    ...l.huellas.map((h, i) => base(`huellas_${i + 1}`, "Huellas", h)),
    ...l.via.map((v, i) => base(`via_${i + 1}`, "Vía", v)),
  ];
}

/** Una respuesta del perito como dato. */
const respuesta = (
  clave: string,
  etiqueta: string,
  valor: string,
  vehiculo: Letra | null,
): DatoHecho => ({
  clave,
  etiqueta,
  valor,
  vehiculo,
  fuente: "perito",
  leidoPor: "perito",
  texto: null,
  tramo: null,
});

const contestada = (r: RespuestasHecho, clave: string) =>
  r[clave] !== undefined && r[clave] !== null && r[clave] !== "";
const valorDe = (r: RespuestasHecho, clave: string) => (contestada(r, clave) ? r[clave]! : null);

/** «No sé»: el perito no lo sabe; el dato queda como supuesto y no se vuelve a preguntar. */
export const NO_SE = "no_se";

/**
 * Lo que el perito puede llenar a mano (ADR 0057), con las mismas claves que las preguntas: si
 * Claude falla o no hay saldo, el formulario «Llenar a mano» da estos datos y el recorrido sigue
 * igual. Lo que llena el perito gana a lo leído.
 */
export const CAMPOS_MANUALES = [
  {
    clave: "modalidad",
    etiqueta: "Modalidad",
    vehiculo: null,
    version: "evidencia",
    tipo: "texto",
  },
  {
    clave: "sentido_a",
    etiqueta: "A · Sentido",
    vehiculo: "A",
    version: "evidencia",
    tipo: "sentido",
  },
  {
    clave: "carril_a",
    etiqueta: "A · Carril",
    vehiculo: "A",
    version: "evidencia",
    tipo: "carril",
  },
  {
    clave: "zona_contacto_a",
    etiqueta: "A · Zona de contacto",
    vehiculo: "A",
    version: "evidencia",
    tipo: "texto",
  },
  {
    clave: "acentuacion_a",
    etiqueta: "A · Acentuación",
    vehiculo: "A",
    version: "evidencia",
    tipo: "texto",
  },
  {
    clave: "vertice_a",
    etiqueta: "A · Vértice",
    vehiculo: "A",
    version: "evidencia",
    tipo: "texto",
  },
  {
    clave: "direccion_fuerza_a",
    etiqueta: "A · Dirección de la fuerza",
    vehiculo: "A",
    version: "evidencia",
    tipo: "texto",
  },
  {
    clave: "zona_contacto_b",
    etiqueta: "B · Zona de contacto",
    vehiculo: "B",
    version: "evidencia",
    tipo: "texto",
  },
  {
    clave: "acentuacion_b",
    etiqueta: "B · Acentuación",
    vehiculo: "B",
    version: "evidencia",
    tipo: "texto",
  },
  {
    clave: "direccion_fuerza_b",
    etiqueta: "B · Dirección de la fuerza",
    vehiculo: "B",
    version: "evidencia",
    tipo: "texto",
  },
  { clave: "restos", etiqueta: "Restos (m)", vehiculo: null, version: "evidencia", tipo: "numero" },
  {
    clave: "maniobra_declarada",
    etiqueta: "Maniobra declarada",
    vehiculo: null,
    version: "declarada",
    tipo: "maniobra",
  },
  {
    clave: "reversa",
    etiqueta: "Metros de reversa",
    vehiculo: null,
    version: "declarada",
    tipo: "numero",
  },
] as const;
export type ClaveManual = (typeof CAMPOS_MANUALES)[number]["clave"];

const POR_QUE: Record<string, string> = {
  sentido_a: "Orienta a los dos vehículos en la versión de la evidencia.",
  carril_a:
    "Va en la tabla de datos del dictamen: dice por dónde circulaba A al momento del impacto.",
  restos: "Fija dónde termina A en la versión de la evidencia (la zona de restos).",
  reversa: "Mueve la posición inicial de A en la versión declarada.",
};

export interface EntradaHecho {
  /** Cómo se llama cada vehículo en el expediente («Chevrolet Silverado 2500»). */
  expediente: { A: string; B: string };
  declarante: Letra;
  descripcion: { lectura: LecturaValidada; leidoPor: LeidoPor } | null;
  declaracion: { lectura: LecturaValidada; leidoPor: LeidoPor } | null;
  /** Lo que contesta o llena a mano el perito, por clave. */
  respuestas: RespuestasHecho;
}

/** Pone un dato del perito: reemplaza al leído con la misma clave o se agrega. */
function delPerito(lista: DatoHecho[], d: DatoHecho) {
  const i = lista.findIndex((x) => x.clave === d.clave);
  if (i >= 0) lista[i] = d;
  else lista.push(d);
}

export function interpretarHecho(e: EntradaHecho): InterpretacionHecho {
  const r = e.respuestas;
  const noSe = (k: string) => r[k] === NO_SE;
  const sabe = (k: string) => contestada(r, k) && !noSe(k);
  const expediente: DatoHecho[] = (["A", "B"] as const).map((l) => ({
    clave: `vehiculo_${l.toLowerCase()}`,
    etiqueta: `${l} · Vehículo`,
    valor: `${e.expediente[l]}${l === e.declarante ? " (declara su conductor)" : ""}`,
    vehiculo: l,
    fuente: "expediente",
    leidoPor: "reglas",
    texto: null,
    tramo: null,
  }));

  const ld = e.descripcion?.lectura ?? null;
  const evidencia = ld ? datosHecho(ld, "perito", e.descripcion!.leidoPor, "descripcion") : [];
  const lc = e.declaracion?.lectura ?? null;
  const declarada = lc ? datosHecho(lc, "conductor", e.declaracion!.leidoPor, "declaracion") : [];
  const preguntas: PreguntaHecho[] = [];
  const manualEvidencia = CAMPOS_MANUALES.some((c) => c.version === "evidencia" && sabe(c.clave));
  const hayEvidencia = Boolean(ld) || manualEvidencia;

  // Lo que llena el perito a mano (o contesta): gana a lo leído.
  for (const c of CAMPOS_MANUALES) {
    if (!sabe(c.clave) || c.clave === "reversa") continue;
    const v = r[c.clave]!;
    const valor =
      c.tipo === "sentido"
        ? DESDE[v as Hacia]
        : c.tipo === "carril"
          ? `carril ${v}`
          : c.tipo === "numero"
            ? `a lo largo de ${v} m`
            : c.tipo === "maniobra"
              ? NOMBRE_MANIOBRA[v as Maniobra]
              : String(v);
    const veh = c.clave === "maniobra_declarada" ? e.declarante : c.vehiculo;
    delPerito(c.version === "evidencia" ? evidencia : declarada, {
      ...respuesta(c.clave, c.etiqueta, valor, veh),
    });
  }

  const pregunta = (p: Omit<PreguntaHecho, "respuesta" | "porQue">) =>
    preguntas.push({ ...p, respuesta: valorDe(r, p.clave), porQue: POR_QUE[p.clave] ?? "" });

  // Versión de la evidencia: sentido y carril de A, y la longitud de los restos.
  let haciaEvidencia: Hacia | null = sabe("sentido_a")
    ? (r.sentido_a as Hacia)
    : (ld?.vehiculos.A.sentido?.hacia ?? null);
  if (hayEvidencia && !ld?.vehiculos.A.sentido?.hacia) {
    pregunta({
      clave: "sentido_a",
      texto: "¿Sentido de circulación de A?",
      version: "evidencia",
      tipo: "opciones",
      opciones: SENTIDOS,
    });
  }
  if (noSe("sentido_a")) haciaEvidencia = null;
  if (hayEvidencia && !ld?.vehiculos.A.carril) {
    pregunta({
      clave: "carril_a",
      texto: "¿Carril de A al momento del impacto?",
      version: "evidencia",
      tipo: "opciones",
      opciones: CARRILES,
    });
  }
  const restosLeidos = ld?.restos.find((x) => x.metros !== null)?.metros ?? null;
  const distanciaRestos = sabe("restos") ? Number(r.restos) : restosLeidos;
  if (hayEvidencia && restosLeidos === null) {
    pregunta({
      clave: "restos",
      texto: "¿Longitud de la zona de restos, en metros?",
      version: "evidencia",
      tipo: "numero",
    });
  }

  // Versión declarada: sentido y maniobra de quien declara; los metros de reversa, si no los dice.
  const decl = lc?.vehiculos[e.declarante] ?? null;
  const haciaDeclarada = decl?.sentido?.hacia ?? null;
  const maniobraManual = sabe("maniobra_declarada") ? (r.maniobra_declarada as Maniobra) : null;
  const reversaLeida = decl?.maniobras.find((m) => m.tipo === "reversa") ?? null;
  const hayReversa = maniobraManual ? maniobraManual === "reversa" : Boolean(reversaLeida);
  let reversaM = maniobraManual ? null : (reversaLeida?.metros ?? null);
  if (hayReversa && reversaM === null) {
    pregunta({
      clave: "reversa",
      texto: "¿Cuántos metros de reversa?",
      version: "declarada",
      tipo: "numero",
    });
    if (sabe("reversa")) {
      reversaM = Number(r.reversa);
      delPerito(
        declarada,
        respuesta("reversa", `${e.declarante} · Metros de reversa`, `${reversaM} m`, e.declarante),
      );
    }
  }
  const ultima =
    maniobraManual ?? decl?.maniobras.filter((m) => m.tipo !== "circula").at(-1)?.tipo ?? null;

  // Las preguntas del modelo sobre la descripción técnica (hasta 4) que no repiten las de
  // Croquis. Las de la declaración no: lo que no dice el conductor lo da la descripción.
  for (const p of (ld?.preguntas ?? []).slice(0, 4)) {
    const clave = p.clave.toLowerCase();
    if (preguntas.some((q) => q.clave === clave || q.texto === p.texto)) continue;
    if (/carril_a|sentido_a|restos|reversa/.test(clave)) continue;
    const k = `evidencia:${clave}`;
    preguntas.push({
      clave: k,
      texto: p.texto,
      version: "evidencia",
      tipo: "texto",
      respuesta: valorDe(r, k),
      porQue: "La pidió la lectura de la descripción; va en la tabla de datos del dictamen.",
    });
    if (sabe(k)) {
      evidencia.push(respuesta(k, p.texto.replace(/[¿?]/g, ""), String(r[k]), null));
    }
  }

  // «No sé»: queda como supuesto, con la pregunta contestada.
  for (const p of preguntas) {
    if (!noSe(p.clave)) continue;
    const lista = p.version === "evidencia" ? evidencia : declarada;
    delPerito(lista, {
      ...respuesta(p.clave, p.texto.replace(/[¿?]/g, ""), "el perito no lo sabe", null),
      fuente: "supuesto",
    });
  }

  return {
    expediente,
    evidencia,
    declarada,
    preguntas,
    parametros: {
      evidencia: { hacia: haciaEvidencia, distanciaRestos },
      declarada: { hacia: haciaDeclarada, reversaM, maniobraA: ultima },
    },
  };
}

export interface Completitud {
  presentes: number;
  total: number;
  /** Lo que falta, para las casillas punteadas. */
  faltan: { clave: string; etiqueta: string; version: "evidencia" | "declarada"; noSe: boolean }[];
}

/**
 * Qué tan completo está el hecho para reconstruir (ADR 0057): modalidad, sentido y carril de A,
 * zona de contacto de A y de B, dirección de la fuerza en A y restos (la evidencia), y la maniobra
 * declarada con sus metros si es una reversa (la declarada).
 */
export function completitud(i: InterpretacionHecho): Completitud {
  const tiene = (lista: DatoHecho[], re: RegExp) =>
    lista.some((d) => re.test(d.clave) && d.fuente !== "supuesto");
  const noSe = (lista: DatoHecho[], re: RegExp) =>
    lista.some((d) => re.test(d.clave) && d.fuente === "supuesto");
  const reversa = i.declarada.some(
    (d) => /^maniobra_|^maniobra_declarada$/.test(d.clave) && /reversa/.test(d.valor),
  );
  const requeridos: [string, string, "evidencia" | "declarada", RegExp][] = [
    ["modalidad", "Modalidad", "evidencia", /^modalidad$/],
    ["sentido_a", "A · Sentido", "evidencia", /^sentido_a$/],
    ["carril_a", "A · Carril al impacto", "evidencia", /^carril_a$/],
    ["zona_contacto_a", "A · Zona de contacto", "evidencia", /^zona_contacto_a$/],
    ["zona_contacto_b", "B · Zona de contacto", "evidencia", /^zona_contacto_b$/],
    ["direccion_fuerza_a", "A · Dirección de la fuerza", "evidencia", /^direccion_fuerza_a$/],
    ["restos", "Longitud de los restos", "evidencia", /^restos(_\d+)?$/],
    ["maniobra", "Maniobra declarada", "declarada", /^maniobra_|^maniobra_declarada$/],
  ];
  if (reversa)
    requeridos.push(["reversa", "Metros de reversa", "declarada", /^reversa$|^maniobra_.*/]);
  const faltan: Completitud["faltan"] = [];
  let presentes = 0;
  for (const [clave, etiqueta, version, re] of requeridos) {
    const lista = version === "evidencia" ? i.evidencia : i.declarada;
    const ok =
      clave === "restos"
        ? i.parametros.evidencia.distanciaRestos !== null
        : clave === "reversa"
          ? i.parametros.declarada.reversaM !== null
          : tiene(lista, re);
    if (ok) presentes++;
    else faltan.push({ clave, etiqueta, version, noSe: noSe(lista, new RegExp(`^${clave}$`)) });
  }
  return { presentes, total: requeridos.length, faltan };
}
