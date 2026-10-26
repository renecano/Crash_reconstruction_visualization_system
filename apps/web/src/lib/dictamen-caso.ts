/**
 * El dictamen de una reconstrucción de «Caso nuevo» (R8, docs/cesvi/PLAN-CESVI.md; ADR 0072), en
 * PDF y en Word con el mismo contenido:
 * - la narración del perito;
 * - el croquis 2D a escala y cuadros del 3D;
 * - los resultados con sus rangos;
 * - la verificación con el método de CESVI;
 * - la reconstrucción contra cada método del reporte de CESVI, con su diferencia (ADR 0091);
 * - la comparación con la declaración del conductor (R7), si el perito la usó;
 * - la trazabilidad (método, huella de las entradas, quién validó y cuándo).
 *
 * Dos órdenes: el de la reconstrucción (por omisión) y, si el perito lo pide, el de los reportes de
 * CESVI (título con la modalidad, objetivos, fundamentos, características, observación de daños,
 * lugar, consideraciones, conclusiones). Los números salen del solver y del módulo de cálculo; la
 * conclusión la escribe el perito. Sin validación, el documento es un borrador.
 */
import {
  modalidadInferida,
  reconstruccionContraCesvi,
  type Expediente,
  type FilaDeclarada,
  type Reconstruccion,
  type MensajeBitacora,
  type VerificacionVehiculo,
  encabezadoHipotesis,
  mensajeEnPalabras,
} from "@croquis/cesvi";
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { LEYENDA_DICTAMEN } from "./dictamen-cesvi";
import { dictamenDocx } from "./exportar-cesvi";
import { pdfBytes } from "./pdf";

type Id = Expediente["vehiculos"][number]["id"];

export interface DatosDictamenCaso {
  expediente: Expediente;
  /** La narración técnica del perito, tal como la escribió (null en un reporte importado). */
  narracion: string | null;
  reconstruccion: Reconstruccion;
  verificacion: VerificacionVehiculo[];
  /** El croquis 2D a escala (PNG, data URL), si se pudo dibujar. */
  croquis: string | null;
  /** El croquis va sobre las calles del mapa (R8b); si no, es el dibujo a escala sin mapa. */
  croquisSobreMapa?: boolean;
  /** Cuadros del 3D (PNG, data URL), si el perito abrió el 3D. */
  cuadros3d: { etiqueta: string; imagen: string }[];
  /** La atribución de los vehículos de Sketchfab que se ven en esos cuadros (R10, CC-BY). */
  modelos3d?: { modelo: string; autor: string; licencia: string; url: string }[];
  /** La comparación con la declaración del conductor (R7), si la usó. */
  declarada: {
    declarante: Id;
    filas: FilaDeclarada[];
    /** La sugerencia, solo si el perito la pidió, con lo que decidió. */
    sugerencia: { texto: string; decision: "confirmada" | "descartada" | null } | null;
  } | null;
  validacion: { perito: string; conclusion: string; fecha: string } | null;
  /** Con la estructura de los reportes de CESVI (si el perito la pide). */
  estructuraCesvi: boolean;
  trazabilidad: { metodo: string; huella: string };
  /** La bitácora de los agentes de la pizarra (R12b, ADR 0093), en orden. */
  bitacora?: readonly MensajeBitacora[];
}

const titulo = (t: string): Content => ({
  text: t,
  bold: true,
  fontSize: 12,
  margin: [0, 14, 0, 6],
});
const subtitulo = (t: string): Content => ({ text: t, bold: true, margin: [0, 8, 0, 4] });
const parrafo = (t: string): Content => ({ text: t, margin: [0, 0, 0, 6] });
const nota = (t: string): Content => ({
  text: t,
  fontSize: 8,
  color: "#555555",
  margin: [0, 0, 0, 6],
});

function tabla(encabezados: string[], filas: TableCell[][]): Content {
  return {
    table: {
      headerRows: 1,
      widths: encabezados.map(() => "*"),
      body: [encabezados.map((h) => ({ text: h, bold: true, fontSize: 9 })), ...filas],
    },
    layout: "lightHorizontalLines",
    fontSize: 9,
    margin: [0, 2, 0, 8],
  };
}

const enPalabras = (s: string) => s.replaceAll("_", " ");
const kmh = (x?: number) => (x === undefined ? "—" : x.toFixed(1));
/** «71.56 (62.40–90.00)»: el valor con su p10–p90 alrededor de la solución elegida, si lo hay. */
const rangoTexto = (kmh: number, rango: [number, number] | null) =>
  rango ? `${kmh.toFixed(2)} (${rango[0].toFixed(2)}–${rango[1].toFixed(2)})` : kmh.toFixed(2);
const conSigno = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;

/**
 * La velocidad de la reconstrucción contra la de cada método del reporte (ADR 0091), con su
 * diferencia en km/h y en %, por qué los métodos no miden lo mismo y, si la reconstrucción no
 * alcanza la deformación medida, el aviso con sus números.
 */
function hipotesis(d: DatosDictamenCaso): Content[] {
  const r = d.reconstruccion;
  if (!r.hipotesis) return [];
  const hs = r.hipotesis;
  const vista = hs.find((h) => h.clave === r.elegida);
  return [
    subtitulo(encabezadoHipotesis(hs)),
    parrafo(
      vista
        ? `El perito eligió «${vista.titulo}»; los números de este dictamen son los de esa hipótesis.`
        : `El perito no eligió hipótesis: los números son los de «${hs[0]!.titulo}» (${hs[0]!.familia === "dano" ? "lo medido pesa más que lo supuesto y es la de menor costo" : "la de menor costo"}). Falta su elección.`,
    ),
    tabla(
      [
        "Hipótesis",
        "Costo del ajuste",
        "Velocidades previas (p10–p90)",
        "Reposo supuesto",
        "Deformación medida",
      ],
      hs.map((h) => [
        h.titulo,
        h.costo === null ? "—" : h.costo.toFixed(3),
        h.velocidades
          .map(
            (v) =>
              `${v.vehiculo}: ${v.kmh === null ? "—" : `${v.fijada ? rangoTexto(v.kmh, v.rango) : v.kmh.toFixed(2)} km/h`}${v.fijada || v.kmh === null ? "" : " (mejor ajuste; la evidencia medida no la fija)"}`,
          )
          .join("; "),
        h.reposos.map((x) => `${x.vehiculo} a ${x.m.toFixed(1)} m`).join("; ") || "—",
        h.alcanzaDano ? "La alcanza" : "No la alcanza",
      ]),
    ),
    nota(
      "El costo mide qué tan bien reproduce cada solución la evidencia (menor es mejor); solo se comparan los de la misma hipótesis. El p10–p90 sale de las entradas perturbadas (medidas, fricción, masas y reposo supuesto) alrededor de cada solución.",
    ),
  ];
}

function contraReporte(d: DatosDictamenCaso): Content[] {
  const k = reconstruccionContraCesvi(d.expediente, d.reconstruccion);
  if (!k.filas.length) return [];
  return [
    subtitulo("La reconstrucción contra el reporte de CESVI"),
    tabla(
      ["Método del reporte", "CESVI (km/h)", "Croquis (km/h)", "Diferencia"],
      k.filas.map((f) => [
        `${f.metodo}: ${f.cesviQue}`,
        f.cesviKmh.toFixed(2),
        f.croquisKmh === null
          ? "la evidencia no la fija"
          : rangoTexto(f.croquisKmh, f.croquisRango),
        f.diferenciaKmh === null || f.diferenciaPct === null
          ? "—"
          : `${conSigno(f.diferenciaKmh)} km/h (${conSigno(f.diferenciaPct)} %)`,
      ]),
    ),
    ...(k.filas.some((f) => f.croquisRango)
      ? [
          nota(
            "Entre paréntesis, el p10–p90: la velocidad que reproduce la evidencia cuando sus entradas (medidas, fricción, masas y reposo supuesto) varían dentro de su incertidumbre, alrededor de la solución elegida.",
          ),
        ]
      : []),
    ...k.filas.map((f) => nota(`${f.metodo}: ${f.porQue}`)),
    ...k.avisos.map((a) => parrafo(a)),
  ];
}
const ESTADO: Record<FilaDeclarada["estado"], string> = {
  coincide: "Coincide",
  no_coincide: "No coincide",
  sin_dato: "Sin dato",
};

/** La modalidad del título: la que narra el perito o, si no la dice, la que infiere Croquis. */
export function modalidadDelDictamen(e: Expediente, narracion: string | null) {
  const narrada = e.caso.modalidades?.[0];
  if (narrada) return { modalidad: narrada, inferida: false, motivo: null };
  const m = modalidadInferida(e, narracion ?? "");
  return { modalidad: m.modalidad, inferida: true, motivo: m.motivo };
}

/** Las secciones del dictamen, cada una con su título en los dos órdenes. */
function secciones(d: DatosDictamenCaso) {
  const e = d.expediente;
  const r = d.reconstruccion;
  const caracteristicas: Content[] = [
    tabla(
      ["Vehículo", "Marca y tipo", "Año", "Clase", "Masa"],
      e.vehiculos.map((v) => [
        v.id,
        [v.marca?.valor, v.modelo?.valor].filter(Boolean).join(" ") || "—",
        v.anio ? String(v.anio) : "—",
        v.clase ? enPalabras(v.clase) : "—",
        v.masa ? `${v.masa.valor} ${v.masa.unidad}` : "—",
      ]),
    ),
  ];
  const danos: Content[] = (e.danos ?? []).length
    ? [
        tabla(
          ["Vehículo", "Zona", "Dirección de la deformación", "Magnitud", "Medidas"],
          (e.danos ?? []).map((x) => [
            x.vehiculo,
            [enPalabras(x.zona.cara), x.zona.tercio, x.zona.vertice && enPalabras(x.zona.vertice)]
              .filter(Boolean)
              .join(", ") + (x.dano_previo ? " (previo)" : ""),
            (x.direcciones ?? []).map(enPalabras).join(", ") || "—",
            x.magnitud?.cualitativa ?? "—",
            x.magnitud?.c_m?.length
              ? `C ${x.magnitud.c_m.join(", ")} m${x.magnitud.l_m !== undefined ? `; L ${x.magnitud.l_m} m` : ""}`
              : "—",
          ]),
        ),
      ]
    : [parrafo("La narración no describe daños.")];
  const lugar: Content[] = [
    parrafo(
      [
        e.caso.lugar?.descripcion?.valor,
        e.caso.lugar?.municipio?.valor,
        e.caso.lugar?.estado?.valor,
      ]
        .filter(Boolean)
        .join(", ") || "La narración no da el lugar.",
    ),
    ...(d.croquis
      ? [
          { image: d.croquis, width: 480, margin: [0, 4, 0, 4] } as Content,
          nota(
            d.croquisSobreMapa
              ? "Croquis de la reconstrucción sobre el mapa (calles de OpenStreetMap): recorrido y posición inicial, de impacto y final de cada vehículo."
              : "Croquis a escala de la reconstrucción: posición inicial, de impacto y final de cada vehículo.",
          ),
        ]
      : []),
  ];
  const reconstruccion: Content[] = [
    parrafo(
      "El solver de Croquis ajusta las velocidades para que la simulación reproduzca la evidencia que colocó el perito. Lo que la evidencia no fija se dice así; ningún número se inventa.",
    ),
    tabla(
      ["Vehículo", "Velocidad previa (km/h)", "Al impacto, p10–p50–p90 (km/h)"],
      r.velocidades.map((v) => [
        v.vehiculo,
        v.previa
          ? `${v.previa.mejor.toFixed(1)} (${kmh(v.previa.p10)}–${kmh(v.previa.p90)})`
          : "la evidencia no la fija",
        v.impacto ? `${kmh(v.impacto.p10)}–${kmh(v.impacto.p50)}–${kmh(v.impacto.p90)}` : "—",
      ]),
    ),
    ...hipotesis(d),
    ...contraReporte(d),
    ...(r.impactos.length > 1
      ? [
          parrafo(
            `Impactos: ${r.impactos.map((i) => `X${i.numero} (${i.t === 0 ? "0.00 s" : `+${i.t.toFixed(2)} s`}, ${i.vehiculos.join(" con ")})`).join("; ")}.`,
          ),
        ]
      : []),
    ...(r.limites.length
      ? [
          subtitulo("Lo que la reconstrucción no cubre"),
          { ul: r.limites, margin: [0, 0, 0, 6] } as Content,
        ]
      : []),
    ...(d.cuadros3d.length
      ? [
          subtitulo("Cuadros del 3D"),
          ...d.cuadros3d.flatMap((c): Content[] => [
            { image: c.imagen, width: 420, margin: [0, 2, 0, 2] },
            nota(c.etiqueta),
          ]),
          ...(d.modelos3d?.length
            ? [
                nota(
                  `Vehículos 3D: ${d.modelos3d.map((m) => `«${m.modelo}» de ${m.autor} (${m.licencia}, ${m.url})`).join("; ")}.`,
                ),
              ]
            : []),
        ]
      : []),
  ];
  const verificacion: Content[] = d.verificacion.flatMap((v): Content[] => [
    subtitulo(v.vehiculo),
    ...v.pasos.map((p): Content => ({
      stack: [
        { text: p.titulo, italics: true, fontSize: 9 },
        { text: p.paso.general, fontSize: 9, color: "#444444" },
        { text: p.paso.sustituida, fontSize: 9 },
        { text: p.paso.resultado, bold: true, fontSize: 10 },
      ],
      margin: [12, 2, 0, 6],
    })),
    ...(v.falta.length ? [nota(`Falta: ${v.falta.join("; ")}.`)] : []),
  ]);
  const declarada: Content[] = d.declarada
    ? [
        parrafo(
          `Versión que declara el conductor de ${d.declarada.declarante}, simulada con el mismo solver. Es lo que dice el conductor, no evidencia.`,
        ),
        tabla(
          ["Vehículo", "Concepto", "Versión declarada", "Evidencia y reconstrucción", "Estado"],
          d.declarada.filas.map((f) => [
            f.vehiculo,
            f.concepto,
            f.declarada,
            f.evidencia,
            ESTADO[f.estado],
          ]),
        ),
        ...(d.declarada.sugerencia
          ? [
              parrafo(
                `Sugerencia de Croquis, pedida por el perito: ${d.declarada.sugerencia.texto}`,
              ),
              parrafo(
                d.declarada.sugerencia.decision
                  ? `El perito ${d.declarada.sugerencia.decision === "confirmada" ? "confirmó" : "descartó"} la sugerencia.`
                  : "El perito no ha confirmado ni descartado la sugerencia.",
              ),
            ]
          : []),
      ]
    : [];
  const conclusion: Content[] = d.validacion
    ? [parrafo(d.validacion.conclusion)]
    : [parrafo("[el perito debe concluir]")];
  const validacion: Content[] = d.validacion
    ? [
        parrafo(
          `Validó: ${d.validacion.perito}, el ${new Date(d.validacion.fecha).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}.`,
        ),
      ]
    : [
        {
          text: "BORRADOR · Pendiente de validación del perito",
          bold: true,
          color: "#9a3412",
          margin: [0, 0, 0, 6],
        },
      ];
  const trazabilidad: Content[] = [
    nota(
      `Método: ${d.trazabilidad.metodo} · huella de las entradas ${d.trazabilidad.huella} · validó ${d.validacion ? `${d.validacion.perito}, ${d.validacion.fecha}` : "pendiente"}.`,
    ),
    ...(d.bitacora?.length
      ? [
          subtitulo("Bitácora de los agentes"),
          nota(
            "Quién escribió qué en la pizarra del caso y qué se pidieron los agentes, en orden. La IA solo lee la narración; los números los calculan el solver y el método de CESVI.",
          ),
          ...d.bitacora.map((m) => nota(mensajeEnPalabras(m))),
        ]
      : []),
  ];
  return {
    caracteristicas,
    danos,
    lugar,
    reconstruccion,
    verificacion,
    declarada,
    conclusion,
    validacion,
    trazabilidad,
  };
}

/** El contenido del dictamen (el mismo para el PDF y el Word). */
export function dictamenCasoContenido(d: DatosDictamenCaso): Content[] {
  const s = secciones(d);
  const m = modalidadDelDictamen(d.expediente, d.narracion);
  const modalidad = m.modalidad ? enPalabras(m.modalidad) : null;
  const narracion = d.narracion
    ? [parrafo(d.narracion)]
    : [parrafo("El caso viene de un reporte importado.")];
  const conDeclarada = (t: string): Content[] =>
    s.declarada.length ? [titulo(t), ...s.declarada] : [];
  const inferida =
    m.inferida && m.motivo
      ? [nota(`Modalidad inferida por Croquis (${m.motivo}); el perito la confirma.`)]
      : [];
  if (d.estructuraCesvi) {
    return [
      {
        text: `DICTAMEN TÉCNICO DEL HECHO DE TRÁNSITO${modalidad ? ` EN SU MODALIDAD DE ${modalidad.toUpperCase()}` : ""}`,
        bold: true,
        fontSize: 14,
        margin: [0, 0, 0, 4],
      },
      ...inferida,
      titulo("Objetivos del dictamen"),
      parrafo(
        "Reconstruir la mecánica del hecho con la evidencia que reunió el perito y verificar sus resultados con el método de cálculo de CESVI.",
      ),
      titulo("Fundamentos del estudio"),
      ...narracion,
      titulo("Características de los vehículos"),
      ...s.caracteristicas,
      titulo("Observación de daños en los vehículos"),
      ...s.danos,
      titulo("Lugar de los hechos"),
      ...s.lugar,
      titulo("Consideraciones"),
      subtitulo("Reconstrucción física"),
      ...s.reconstruccion,
      subtitulo("Verificación con el método de CESVI"),
      ...s.verificacion,
      ...conDeclarada("Comparación con la declaración del conductor"),
      titulo("Conclusiones"),
      ...s.conclusion,
      titulo("Validación del perito"),
      ...s.validacion,
      ...s.trazabilidad,
    ];
  }
  return [
    {
      text: `Dictamen de la reconstrucción del hecho${modalidad ? ` · ${modalidad}` : ""}`,
      bold: true,
      fontSize: 14,
      margin: [0, 0, 0, 4],
    },
    ...inferida,
    titulo("Narración del perito"),
    ...narracion,
    titulo("Vehículos y daños"),
    ...s.caracteristicas,
    ...s.danos,
    titulo("Reconstrucción física"),
    ...s.reconstruccion,
    titulo("Croquis"),
    ...s.lugar,
    titulo("Verificación con el método de CESVI"),
    ...s.verificacion,
    ...conDeclarada("Comparación con la declaración del conductor"),
    titulo("Conclusión del perito"),
    ...s.conclusion,
    titulo("Validación"),
    ...s.validacion,
    ...s.trazabilidad,
  ];
}

export function dictamenCasoDefinicion(d: DatosDictamenCaso): TDocumentDefinitions {
  return {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 50],
    info: {
      title: `Dictamen de la reconstrucción${d.validacion ? "" : " (borrador)"}`,
      subject: LEYENDA_DICTAMEN,
      keywords: "dictamen; reconstrucción; CESVI; Croquis",
      creator: "Croquis",
      producer: "Croquis (pdfmake)",
    },
    defaultStyle: { font: "Roboto", fontSize: 10 },
    footer: (pagina: number, paginas: number): Content => ({
      margin: [40, 10, 40, 0],
      columns: [
        {
          width: "*",
          text: `${LEYENDA_DICTAMEN} Reconstrucción de apoyo.`,
          fontSize: 8,
          color: "#333333",
        },
        { width: "auto", text: `${pagina} / ${paginas}`, fontSize: 8, color: "#555555" },
      ],
    }),
    content: dictamenCasoContenido(d),
  };
}

export function dictamenCasoPdf(d: DatosDictamenCaso): Promise<Uint8Array<ArrayBuffer>> {
  return pdfBytes(dictamenCasoDefinicion(d));
}

export function dictamenCasoWord(d: DatosDictamenCaso): Promise<Uint8Array> {
  return dictamenDocx(dictamenCasoContenido(d), `${LEYENDA_DICTAMEN} Reconstrucción de apoyo.`);
}
