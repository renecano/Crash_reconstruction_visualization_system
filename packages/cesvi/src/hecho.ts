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

export interface EntradaHecho {
  /** Cómo se llama cada vehículo en el expediente («Chevrolet Silverado 2500»). */
  expediente: { A: string; B: string };
  declarante: Letra;
  descripcion: { lectura: LecturaValidada; leidoPor: LeidoPor } | null;
  declaracion: { lectura: LecturaValidada; leidoPor: LeidoPor } | null;
  respuestas: RespuestasHecho;
}

export function interpretarHecho(e: EntradaHecho): InterpretacionHecho {
  const r = e.respuestas;
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

  // Versión de la evidencia: sentido y carril de A, y la longitud de los restos.
  let haciaEvidencia: Hacia | null = ld?.vehiculos.A.sentido?.hacia ?? null;
  if (ld && !haciaEvidencia) {
    preguntas.push({
      clave: "sentido_a",
      texto: "¿Sentido de circulación de A?",
      version: "evidencia",
      tipo: "opciones",
      opciones: SENTIDOS,
      respuesta: valorDe(r, "sentido_a"),
    });
    if (contestada(r, "sentido_a")) {
      haciaEvidencia = r.sentido_a as Hacia;
      evidencia.push(respuesta("sentido_a", "A · Sentido", DESDE[haciaEvidencia], "A"));
    }
  }
  if (ld && !ld.vehiculos.A.carril) {
    preguntas.push({
      clave: "carril_a",
      texto: "¿Carril de A al momento del impacto?",
      version: "evidencia",
      tipo: "opciones",
      opciones: CARRILES,
      respuesta: valorDe(r, "carril_a"),
    });
    if (contestada(r, "carril_a")) {
      evidencia.push(respuesta("carril_a", "A · Carril", `carril ${r.carril_a}`, "A"));
    }
  }
  let distanciaRestos = ld?.restos.find((x) => x.metros !== null)?.metros ?? null;
  if (ld && distanciaRestos === null) {
    preguntas.push({
      clave: "restos",
      texto: "¿Longitud de la zona de restos, en metros?",
      version: "evidencia",
      tipo: "numero",
      respuesta: valorDe(r, "restos"),
    });
    if (contestada(r, "restos")) {
      distanciaRestos = Number(r.restos);
      evidencia.push(respuesta("restos", "Restos", `a lo largo de ${distanciaRestos} m`, null));
    }
  }

  // Versión declarada: sentido y maniobra de quien declara; los metros de reversa, si no los dice.
  const decl = lc?.vehiculos[e.declarante] ?? null;
  const haciaDeclarada = decl?.sentido?.hacia ?? null;
  const reversa = decl?.maniobras.find((m) => m.tipo === "reversa") ?? null;
  let reversaM = reversa?.metros ?? null;
  if (reversa && reversaM === null) {
    preguntas.push({
      clave: "reversa",
      texto: "¿Cuántos metros de reversa?",
      version: "declarada",
      tipo: "numero",
      respuesta: valorDe(r, "reversa"),
    });
    if (contestada(r, "reversa")) {
      reversaM = Number(r.reversa);
      declarada.push(
        respuesta("reversa", `${e.declarante} · Metros de reversa`, `${reversaM} m`, e.declarante),
      );
    }
  }
  const ultima = decl?.maniobras.filter((m) => m.tipo !== "circula").at(-1)?.tipo ?? null;

  // Las preguntas del modelo sobre la descripción técnica (hasta 4) que no repiten las de
  // Croquis. Las de la declaración no: lo que no dice el conductor lo da la descripción.
  for (const [lectura, version] of [[ld, "evidencia"]] as const) {
    for (const p of (lectura?.preguntas ?? []).slice(0, 4)) {
      const clave = p.clave.toLowerCase();
      if (preguntas.some((q) => q.clave === clave || q.texto === p.texto)) continue;
      if (/carril_a|sentido_a|restos|reversa/.test(clave)) continue;
      const k = `${version}:${clave}`;
      preguntas.push({
        clave: k,
        texto: p.texto,
        version,
        tipo: "texto",
        respuesta: valorDe(r, k),
      });
      if (contestada(r, k)) {
        (version === "evidencia" ? evidencia : declarada).push(
          respuesta(k, p.texto.replace(/[¿?]/g, ""), String(r[k]), null),
        );
      }
    }
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
