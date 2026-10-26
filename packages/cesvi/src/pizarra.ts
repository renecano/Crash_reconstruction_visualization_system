/**
 * R12b (PLAN-CESVI, ADR 0093): agentes especialistas con pizarra.
 *
 * La pizarra es el expediente y lo que los agentes escriben sobre él. Cada agente dice si tiene algo
 * que hacer con lo que hay en la pizarra (`quiere`) y, si le toca, actúa (`actua`). El coordinador
 * elige, en cada paso, al primero de `ORDEN_AGENTES` que quiere actuar, y lleva la bitácora de
 * mensajes. No es una cadena fija: el Verificador de citas puede rechazar datos y pedirle al Lector
 * que relea, y el Físico puede pedirle evidencia al Preguntador cuando la física no cuadra.
 *
 * La IA solo entra por el Lector (`ctx.leer`, la API de Claude o una respuesta grabada), y solo
 * traduce la narración a filas con su cita. Los números físicos los calcula el Físico (el solver)
 * y el Verificador CESVI (las fórmulas de CESVI). Todo es determinista: el mismo caso con las mismas
 * respuestas da la misma pizarra y la misma bitácora.
 */
import { agrupar, expedienteDeSalida, type Conversion, type SalidaCorpus } from "./corpus";
import { comparar, type ComparacionDictamen, type Conclusiones } from "./dictamenes-r4";
import { escenaDeConversion, type EscenaNarrada, type PreguntaEscena } from "./escena-narracion";
import { ubicarCita } from "./hecho-lectura";
import type { Reconstruccion } from "./reconstruccion";
import type { PasoVelocidad } from "./formulas";
import { verificacionCesvi, type VerificacionVehiculo } from "./verificacion";

type Expediente = Conversion["expediente"];
type Id = Expediente["vehiculos"][number]["id"];

export const ORDEN_AGENTES = [
  "lector",
  "verificador_citas",
  "validador",
  "preguntador",
  "fisico",
  "verificador_cesvi",
  "comparador",
  "redactor",
] as const;
export type NombreAgente = (typeof ORDEN_AGENTES)[number] | "coordinador" | "perito";

export const NOMBRE_AGENTE: Record<NombreAgente, string> = {
  lector: "Lector IA",
  verificador_citas: "Verificador de citas",
  validador: "Validador",
  preguntador: "Preguntador",
  fisico: "Físico",
  verificador_cesvi: "Verificador CESVI",
  comparador: "Comparador",
  redactor: "Redactor",
  coordinador: "Coordinador",
  perito: "Perito",
};

/** Cuántas veces puede pedir el Verificador de citas que se relea la narración. */
export const MAX_RELECTURAS = 1;
/** Tope de pasos del coordinador (cada paso, un agente). */
export const MAX_PASOS = 40;
/**
 * Banderas del solver con las que el Físico le pide evidencia al Preguntador: las que el perito
 * puede contestar con un dato del lugar (la posición final o las huellas de frenado).
 */
const BANDERAS_DE_EVIDENCIA = new Set([
  "reposo_inalcanzable",
  "reposo_supuesto_vs_dano",
  "velocidad_vs_evidencia",
]);

export interface MensajeBitacora {
  /** Orden en la bitácora, desde 1. */
  n: number;
  de: NombreAgente;
  /** A quién va: otro agente o la pizarra (lo que escribe para todos). */
  para: NombreAgente | "pizarra";
  tipo: "escribe" | "pide" | "rechaza" | "avisa";
  texto: string;
}

export interface Pizarra {
  narracion: string | null;
  /** Las conclusiones de CESVI, si el caso trae su reporte (las usa el Comparador). */
  conclusiones: Conclusiones | null;
  /** Las lecturas del Lector, en orden; la verificada es `conversion`. */
  lecturas: SalidaCorpus[];
  verificadas: number;
  relecturas: number;
  /** El Verificador de citas le pidió al Lector que relea, con las citas que no encontró. */
  pedidoRelectura: { rechazadas: string[]; atendido: boolean } | null;
  lecturaFallida: boolean;
  conversion: Conversion | null;
  escena: EscenaNarrada | null;
  expediente: Expediente | null;
  preguntas: PreguntaEscena[];
  preguntasPublicadas: boolean;
  /** El perito pidió reconstruir (en la app el Físico no corre solo: tarda segundos). */
  pideReconstruir: boolean;
  reconstruccion: Reconstruccion | null;
  reconstruidoDe: Expediente | null;
  /** El Físico le pidió evidencia al Preguntador, con las banderas del solver. */
  pedidoEvidencia: {
    banderas: { codigo: string; vehiculo: Id | null }[];
    atendido: boolean;
  } | null;
  verificacion: VerificacionVehiculo[] | null;
  verificadoDe: Expediente | null;
  comparacion: ComparacionDictamen | null;
  comparadoDe: Expediente | null;
  pideDictamen: boolean;
  dictamen: boolean;
  bitacora: MensajeBitacora[];
}

/** Lo que los agentes usan de afuera: el modelo (solo el Lector) y el solver (solo el Físico). */
export interface ContextoPizarra {
  /** Lee la narración a filas con su cita; con `rechazadas`, relee avisando qué no se encontró. null si no hay lectura. */
  leer: (narracion: string, rechazadas?: readonly string[]) => Promise<SalidaCorpus | null>;
  /** Reconstruye el expediente con el solver. Sin él, el Físico no actúa. */
  reconstruir?: (e: Expediente) => Promise<Reconstruccion>;
  /** El Físico reconstruye en cuanto hay escena, sin esperar al perito (las evaluaciones). */
  fisicoAutomatico?: boolean;
}

export function pizarraNueva(
  narracion: string | null,
  o: { conclusiones?: Conclusiones | null; expediente?: Expediente | null } = {},
): Pizarra {
  return {
    narracion,
    conclusiones: o.conclusiones ?? null,
    lecturas: [],
    verificadas: 0,
    relecturas: 0,
    pedidoRelectura: null,
    lecturaFallida: false,
    conversion: null,
    escena: null,
    expediente: o.expediente ?? null,
    preguntas: [],
    preguntasPublicadas: false,
    pideReconstruir: false,
    reconstruccion: null,
    reconstruidoDe: null,
    pedidoEvidencia: null,
    verificacion: null,
    verificadoDe: null,
    comparacion: null,
    comparadoDe: null,
    pideDictamen: false,
    dictamen: false,
    bitacora: [],
  };
}

interface Agente {
  nombre: (typeof ORDEN_AGENTES)[number];
  quiere: (p: Pizarra, ctx: ContextoPizarra) => boolean;
  actua: (p: Pizarra, ctx: ContextoPizarra, decir: Decir) => Pizarra | Promise<Pizarra>;
}
type Decir = (para: MensajeBitacora["para"], tipo: MensajeBitacora["tipo"], texto: string) => void;

const pendienteRelectura = (p: Pizarra) =>
  Boolean(p.pedidoRelectura && !p.pedidoRelectura.atendido);
const kmh = (x: number) => `${x.toFixed(2)} km/h`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Las citas de una lectura que no están en la narración, en el orden en que vienen. */
export function citasRechazadas(s: SalidaCorpus, narracion: string): string[] {
  const out: string[] = [];
  for (const g of agrupar(s.datos).grupos)
    for (const c of g.citas) if (!ubicarCita(narracion, c) && !out.includes(c)) out.push(c);
  return out;
}

const rechazos = (c: Conversion) => c.conteos.citas_fuera + c.conteos.numeros_fuera;

const lector: Agente = {
  nombre: "lector",
  quiere: (p) =>
    Boolean(p.narracion) &&
    // La primera lectura, solo si la escena no viene ya leída (un caso de ejemplo, guardado o
    // importado); una relectura, si el Verificador la pidió.
    ((p.lecturas.length === 0 && !p.lecturaFallida && !p.escena) || pendienteRelectura(p)),
  async actua(p, ctx, decir) {
    const relee = pendienteRelectura(p);
    const s = await ctx.leer(p.narracion!, relee ? p.pedidoRelectura!.rechazadas : undefined);
    if (relee) {
      const pedido = { ...p.pedidoRelectura!, atendido: true };
      if (!s) {
        decir(
          "verificador_citas",
          "avisa",
          "No hay relectura: se sigue con los datos ya verificados.",
        );
        return { ...p, pedidoRelectura: pedido };
      }
      decir(
        "pizarra",
        "escribe",
        `Relectura: ${plural(s.datos.length, "fila", "filas")} con su cita.`,
      );
      return { ...p, pedidoRelectura: pedido, lecturas: [...p.lecturas, s] };
    }
    if (!s) {
      decir("pizarra", "avisa", "No se pudo leer la narración: el perito llena la escena a mano.");
      return { ...p, lecturaFallida: true };
    }
    decir("pizarra", "escribe", `Lectura: ${plural(s.datos.length, "fila", "filas")} con su cita.`);
    return { ...p, lecturas: [...p.lecturas, s] };
  },
};

const verificadorCitas: Agente = {
  nombre: "verificador_citas",
  quiere: (p) => p.lecturas.length > p.verificadas,
  actua(p, _ctx, decir) {
    const s = p.lecturas.at(-1)!;
    const conv = expedienteDeSalida(s, p.narracion!, "perito");
    const k = conv.conteos;
    decir(
      "pizarra",
      "escribe",
      `Citas encontradas en la narración: ${k.citas - k.citas_fuera} de ${k.citas}; números con su cita: ${k.numeros - k.numeros_fuera} de ${k.numeros}. Lo que no está en el texto se descarta.`,
    );
    let conversion = conv;
    if (p.conversion) {
      // La relectura: se queda con la que tenga menos datos rechazados (en empate, la primera).
      if (rechazos(conv) < rechazos(p.conversion))
        decir(
          "pizarra",
          "escribe",
          "La relectura tiene menos datos rechazados: se usa la relectura.",
        );
      else {
        conversion = p.conversion;
        decir("pizarra", "escribe", "La relectura no rechaza menos: se queda la primera lectura.");
      }
    }
    let q: Pizarra = {
      ...p,
      verificadas: p.verificadas + 1,
      conversion,
      escena: conversion === p.conversion ? p.escena : null,
    };
    const fuera = citasRechazadas(s, p.narracion!);
    if (rechazos(conv) > 0 && p.relecturas < MAX_RELECTURAS) {
      decir(
        "lector",
        "rechaza",
        `${plural(rechazos(conv), "dato no está", "datos no están")} en la narración (${plural(fuera.length, "cita", "citas")}): pide releer.`,
      );
      q = {
        ...q,
        relecturas: p.relecturas + 1,
        pedidoRelectura: { rechazadas: fuera, atendido: false },
      };
    }
    return q;
  },
};

const validador: Agente = {
  nombre: "validador",
  quiere: (p) => Boolean(p.conversion) && !p.escena && !pendienteRelectura(p),
  actua(p, _ctx, decir) {
    const escena = escenaDeConversion(p.conversion!);
    const n = escena.expediente.vehiculos.length;
    decir(
      "pizarra",
      escena.problemas.length ? "avisa" : "escribe",
      escena.problemas.length
        ? `Escena con ${plural(escena.problemas.length, "problema", "problemas")} del esquema o del validador: ${escena.problemas.slice(0, 3).join("; ")}.`
        : `Escena válida: ${plural(n, "vehículo", "vehículos")}, ${plural(escena.expediente.impactos?.length ?? 0, "impacto", "impactos")}.`,
    );
    return { ...p, escena, expediente: escena.expediente, preguntasPublicadas: false };
  },
};

/** La pregunta con la que el Preguntador atiende una bandera del Físico. */
function preguntaPorBandera(codigo: string, v: Id | null): PreguntaEscena | null {
  if (!v) return null;
  if (codigo === "reposo_inalcanzable" || codigo === "reposo_supuesto_vs_dano")
    return {
      clave: `final-${v}`,
      texto: `¿Dónde quedó ${v} al final? Una posición medida en el lugar fija mejor su velocidad.`,
      porQue: "La física no cuadra con la posición final que hay: hace falta la medida.",
      control: { tipo: "mapa" },
      vehiculo: v,
    };
  if (codigo === "velocidad_vs_evidencia")
    return {
      clave: `huella-${v}`,
      texto: `¿Qué longitud tienen las huellas de frenado de ${v}?`,
      porQue: "La velocidad que da la evidencia no cuadra con la declarada; las huellas la fijan.",
      control: { tipo: "numero", unidad: "m" },
      vehiculo: v,
    };
  return null;
}

const preguntador: Agente = {
  nombre: "preguntador",
  quiere: (p) =>
    (Boolean(p.escena) && !p.preguntasPublicadas) ||
    Boolean(p.pedidoEvidencia && !p.pedidoEvidencia.atendido),
  actua(p, _ctx, decir) {
    if (p.escena && !p.preguntasPublicadas) {
      const preguntas = p.escena.preguntas;
      decir(
        "pizarra",
        "escribe",
        preguntas.length
          ? `${plural(preguntas.length, "pregunta", "preguntas")} para el perito, de lo que más cambia la reconstrucción: ${preguntas.map((x) => x.clave).join(", ")}.`
          : "Nada que preguntar: la narración trae lo que la reconstrucción necesita.",
      );
      return { ...p, preguntas, preguntasPublicadas: true };
    }
    const nuevas: PreguntaEscena[] = [];
    for (const b of p.pedidoEvidencia!.banderas) {
      const q = preguntaPorBandera(b.codigo, b.vehiculo);
      if (
        q &&
        !p.preguntas.some((x) => x.clave === q.clave) &&
        !nuevas.some((x) => x.clave === q.clave)
      )
        nuevas.push(q);
    }
    decir(
      "fisico",
      "escribe",
      nuevas.length
        ? `Pregunta al perito: ${nuevas.map((x) => x.texto).join(" ")}`
        : "Lo que pide el Físico ya está entre las preguntas al perito.",
    );
    return {
      ...p,
      preguntas: [...p.preguntas, ...nuevas],
      pedidoEvidencia: { ...p.pedidoEvidencia!, atendido: true },
    };
  },
};

const fisico: Agente = {
  nombre: "fisico",
  quiere: (p, ctx) =>
    Boolean(ctx.reconstruir) &&
    Boolean(p.expediente) &&
    Boolean(p.escena) &&
    (p.pideReconstruir || Boolean(ctx.fisicoAutomatico)) &&
    p.reconstruidoDe !== p.expediente,
  async actua(p, ctx, decir) {
    const e = p.expediente!;
    let r: Reconstruccion;
    try {
      r = await ctx.reconstruir!(e);
    } catch (err) {
      decir("pizarra", "avisa", `El solver no pudo reconstruir: ${(err as Error).message}`);
      return { ...p, pideReconstruir: false, reconstruidoDe: e, reconstruccion: null };
    }
    const fijadas = r.velocidades.filter((v) => v.previa);
    decir(
      "pizarra",
      "escribe",
      fijadas.length
        ? `Reconstrucción: ${fijadas.map((v) => `${v.vehiculo} a ${kmh(v.previa!.mejor)}${v.previa!.p10 !== undefined && v.previa!.p90 !== undefined ? ` (${v.previa!.p10.toFixed(2)}–${v.previa!.p90.toFixed(2)})` : ""}`).join(", ")}.`
        : "Reconstrucción hecha; la evidencia todavía no fija ninguna velocidad.",
    );
    const consistencia = (r.resultado.consistencia ?? []) as {
      codigo: string;
      datos?: { vehiculo?: string };
    }[];
    const banderas: { codigo: string; vehiculo: Id | null }[] = consistencia
      .filter((c) => BANDERAS_DE_EVIDENCIA.has(c.codigo))
      .map((c) => ({
        codigo: c.codigo,
        vehiculo: c.datos?.vehiculo ? (r.ids[c.datos.vehiculo] ?? null) : null,
      }));
    if (!fijadas.length)
      for (const v of Object.values(r.ids))
        if (!banderas.some((b) => b.vehiculo === v))
          banderas.push({ codigo: "reposo_inalcanzable", vehiculo: v });
    let q: Pizarra = { ...p, reconstruccion: r, reconstruidoDe: e, pideReconstruir: false };
    if (banderas.length) {
      decir(
        "preguntador",
        "pide",
        `La física no cuadra o no alcanza (${[...new Set(banderas.map((b) => b.codigo))].join(", ")}): pide evidencia al perito.`,
      );
      q = { ...q, pedidoEvidencia: { banderas, atendido: false } };
    }
    return q;
  },
};

const verificadorCesvi: Agente = {
  nombre: "verificador_cesvi",
  quiere: (p) => Boolean(p.expediente) && p.verificadoDe !== p.expediente && !pendienteRelectura(p),
  actua(p, _ctx, decir) {
    const v = verificacionCesvi(p.expediente!);
    const ebs = v.flatMap((x) => {
      const paso = x.pasos.find((s) => s.titulo.startsWith("Velocidad equivalente de barrera"));
      return paso ? [`${x.vehiculo} a ${kmh((paso.paso as PasoVelocidad).calculo.kmh)}`] : [];
    });
    decir(
      "pizarra",
      "escribe",
      ebs.length
        ? `Método de CESVI (EBS por deformación): ${ebs.join(", ")}.`
        : "Sin medidas de deformación completas: no hay EBS con el método de CESVI.",
    );
    return { ...p, verificacion: v, verificadoDe: p.expediente };
  },
};

const comparador: Agente = {
  nombre: "comparador",
  quiere: (p) =>
    Boolean(p.conclusiones && p.escena && p.expediente) && p.comparadoDe !== p.expediente,
  actua(p, _ctx, decir) {
    const c = comparar(p.conclusiones!, p.expediente!, p.escena!.posiciones, p.narracion ?? "");
    const m = c.modalidad;
    decir(
      "pizarra",
      "escribe",
      `Contra lo que concluyó CESVI: modalidad ${m.coincide === null ? "sin comparar" : m.coincide ? "coincide" : "no coincide"}; ${plural(c.velocidades.length, "velocidad", "velocidades")} del dictamen para comparar.`,
    );
    return { ...p, comparacion: c, comparadoDe: p.expediente };
  },
};

const redactor: Agente = {
  nombre: "redactor",
  quiere: (p) => p.pideDictamen && !p.dictamen,
  actua(p, _ctx, decir) {
    const partes = [
      p.reconstruccion ? "la reconstrucción" : null,
      p.verificacion?.length ? "la verificación con el método de CESVI" : null,
      p.comparacion ? "la comparación con lo que concluyó CESVI" : null,
      "esta bitácora",
    ].filter(Boolean);
    decir("pizarra", "escribe", `Dictamen redactado con ${partes.join(", ")}.`);
    return { ...p, dictamen: true };
  },
};

const AGENTES: Agente[] = [
  lector,
  verificadorCitas,
  validador,
  preguntador,
  fisico,
  verificadorCesvi,
  comparador,
  redactor,
];

/**
 * El coordinador: en cada paso actúa el primer agente de `ORDEN_AGENTES` que tiene algo que hacer,
 * hasta que ninguno quiere actuar (espera al perito) o se llega a `MAX_PASOS`.
 */
export async function coordinar(p0: Pizarra, ctx: ContextoPizarra): Promise<Pizarra> {
  let p = p0;
  const bitacora = [...p0.bitacora];
  for (let paso = 0; paso < MAX_PASOS; paso++) {
    const a = AGENTES.find((x) => x.quiere(p, ctx));
    if (!a) return { ...p, bitacora };
    const decir: Decir = (para, tipo, texto) =>
      bitacora.push({ n: bitacora.length + 1, de: a.nombre, para, tipo, texto });
    p = await a.actua({ ...p, bitacora }, ctx, decir);
  }
  bitacora.push({
    n: bitacora.length + 1,
    de: "coordinador",
    para: "pizarra",
    tipo: "avisa",
    texto: `Se llegó al tope de ${MAX_PASOS} pasos.`,
  });
  return { ...p, bitacora };
}

/**
 * La pizarra de un caso que abre con su escena ya leída (el ejemplo de AXA, un caso guardado o un
 * dictamen importado): el Lector, el Verificador de citas y el Validador ya no tienen nada que hacer.
 */
export function pizarraDeEscena(
  narracion: string | null,
  escena: EscenaNarrada,
  o: { conclusiones?: Conclusiones | null; origen: string },
): Pizarra {
  return delPerito(
    pizarraNueva(narracion, { conclusiones: o.conclusiones ?? null }),
    `Abre el caso (${o.origen}) con su escena ya leída.`,
    {
      escena,
      expediente: escena.expediente,
      preguntas: escena.preguntas,
      preguntasPublicadas: true,
    },
  );
}

/** Lo que hace el perito en la pizarra, para la bitácora (cambia el expediente, pide reconstruir…). */
export function delPerito(p: Pizarra, texto: string, cambios: Partial<Pizarra> = {}): Pizarra {
  const bitacora = [
    ...p.bitacora,
    {
      n: p.bitacora.length + 1,
      de: "perito" as const,
      para: "pizarra" as const,
      tipo: "escribe" as const,
      texto,
    },
  ];
  return { ...p, ...cambios, bitacora };
}

/** Un mensaje en palabras: «3 · Verificador de citas → Lector IA (rechaza): …». */
export function mensajeEnPalabras(m: MensajeBitacora): string {
  const para = m.para === "pizarra" ? "" : ` → ${NOMBRE_AGENTE[m.para]}`;
  return `${m.n} · ${NOMBRE_AGENTE[m.de]}${para} (${m.tipo}): ${m.texto}`;
}
