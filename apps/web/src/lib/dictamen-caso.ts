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
import { HUELLA_PARA_QUE, huellaLetraChica } from "./huella-documento";
import {
  formato as F,
  alternativaSupuesta,
  modalidadInferida,
  reconstruccionContraCesvi,
  type Expediente,
  type FilaDeclarada,
  type Reconstruccion,
  type SupuestoDeclarado,
  type VerificacionVehiculo,
  encabezadoHipotesis,
  enPalabras,
  danoEnCorto,
  danoEnTexto,
  lecturasDeDano,
  notaDeMuestras,
} from "@croquis/cesvi";
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { conGlifosDeRoboto, LEYENDA_DICTAMEN } from "./dictamen-cesvi";
import { nombreVehiculo } from "./escena-facil";
import { dictamenDocx } from "./exportar-cesvi";
import { ANCHO_LOGO, PROPORCION_LOGO } from "./marca-dictamen";
import { pdfBytes } from "./pdf";
import type { VersionesDictamen } from "./versiones-caso";


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
  /** El logo de la marca como PNG (`logoDictamen`), para la cabecera; sin él, el dictamen va sin logo. */
  logo?: string | null;
  /** La atribución de los vehículos de Sketchfab que se ven en esos cuadros (R10, CC-BY). */
  modelos3d?: { modelo: string; autor: string; licencia: string; url: string }[];
  /**
   * Las versiones del caso (ronda 4, punto 8): lo que declaró cada conductor (R7) y las hipótesis
   * «¿y si…?» que probó el perito, marcadas como tales. Vacías si no usó el acto «Versiones».
   */
  versiones?: VersionesDictamen;
  validacion: { perito: string; conclusion: string; fecha: string } | null;
  /**
   * La velocidad por deformación contra la del reporte (Contra CESVI): con las mismas medidas y el
   * mismo método, con su diferencia en km/h y en %. No es la de la reconstrucción física.
   */
  contraDeformacion?: {
    vehiculo: string;
    croquis: number;
    cesvi: number;
    difKmh: number;
    difPct: number;
  } | null;
  /** Con la estructura de los reportes de CESVI (si el perito la pide). */
  estructuraCesvi: boolean;
  trazabilidad: { metodo: string; huella: string };
  /** Lo que el caso no trae, como supuesto declarado con su justificación (ADR 0091). */
  supuestos?: readonly SupuestoDeclarado[];
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

/** La letra chica (el código de la huella y cómo comprobarla). */
const letraChica = (t: string): Content => ({
  text: t,
  fontSize: 6.5,
  color: "#666666",
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

const kmh = (x?: number) => F.kmh(x, "reconstruccion");
/** «57 (55–78)»: el valor con su p10–p90 alrededor de la solución elegida, si lo hay. */
const rangoTexto = (kmh: number, rango: [number, number] | null) =>
  rango
    ? `${F.kmh(kmh, "reconstruccion")} (${F.rangoKmh(rango[0], rango[1], "reconstruccion")})`
    : F.kmh(kmh, "reconstruccion");
// La reconstrucción contra una cifra del reporte: la diferencia va en enteros, como la reconstrucción.

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
        : `El perito no eligió hipótesis: los números son los de «${hs[0]!.titulo}» (${hs[0]!.familia === "dano" ? "lo medido pesa más que lo supuesto y es la que menos se aparta de la evidencia" : "la que menos se aparta de la evidencia"}). Falta su elección.`,
    ),
    tabla(
      [
        "Hipótesis",
        "Desajuste con la evidencia",
        "Velocidades antes del impacto (rango del 80 %)",
        "Reposo supuesto",
        "Deformación medida",
      ],
      hs.map((h) => [
        h.familia === "reposo" ? `${h.titulo} (supuesto)` : h.titulo,
        h.costo === null ? "—" : F.numero(h.costo, 3),
        h.velocidades
          .map(
            (v) =>
              `${v.vehiculo}: ${v.kmh === null ? "—" : `${v.fijada ? rangoTexto(v.kmh, v.rango) : F.kmh(v.kmh, "reconstruccion")} km/h`}${v.fijada || v.kmh === null ? "" : " (mejor ajuste; la evidencia medida no la fija)"}`,
          )
          .join("; "),
        h.reposos.map((x) => `${x.vehiculo} a ${F.metros(x.m, 1)}`).join("; ") || "—",
        // Cuánto de la deformación medida explica cada hipótesis (auditoría, C5).
        lecturasDeDano(r, h.clave)
          .map((l) => `${l.vehiculo}: ${danoEnCorto(l)}`)
          .join("; ") || (h.alcanzaDano ? "La alcanza" : "No la alcanza"),
      ]),
    ),
    nota(
      "El desajuste mide qué tanto se aparta cada solución de la evidencia (menor es mejor); solo se comparan los de la misma hipótesis. El rango es donde cae el 80 % de las simulaciones con las entradas variadas (medidas, fricción, masas y reposo supuesto) alrededor de cada solución. Si con eso la solución no se mueve, el rango es una aproximación del cálculo.",
    ),
  ];
}

/** «A · Silverado 2500 (V1)»: el vehículo como en el panel del caso, con su id. */
function nombreDelVehiculo(d: DatosDictamenCaso, id: string): string {
  const vs = d.expediente.vehiculos;
  const i = vs.findIndex((v) => v.id === id);
  if (i < 0) return id;
  return `${String.fromCharCode(65 + i)} · ${nombreVehiculo(vs[i]!, vs)} (${id})`;
}

function contraReporte(d: DatosDictamenCaso): Content[] {
  const k = reconstruccionContraCesvi(d.expediente, d.reconstruccion);
  if (!k.filas.length) return [];
  return [
    subtitulo("La reconstrucción contra el reporte de CESVI"),
    tabla(
      ["Método del reporte", "CESVI (km/h)", "Croquis (km/h)", "Diferencia"],
      k.filas.map((f) => [
        `${nombreDelVehiculo(d, f.vehiculo)} ${f.momento} · CESVI ${f.cesviComo}`,
        F.kmh(f.cesviKmh, "metodo"),
        f.croquisKmh === null
          ? "la evidencia no la fija"
          : rangoTexto(f.croquisKmh, f.croquisRango),
        f.diferenciaKmh === null || f.diferenciaPct === null
          ? "—"
          : `${F.diferenciaKmh(f.diferenciaKmh, "reconstruccion")} (${F.diferenciaPct(f.diferenciaPct, "reconstruccion")})`,
      ]),
    ),
    ...(k.filas.some((f) => f.croquisRango)
      ? [
          nota(
            "Entre paréntesis, el rango donde cae el 80 % de las simulaciones: la velocidad que reproduce la evidencia cuando sus entradas (medidas, fricción, masas y reposo supuesto) varían dentro de su incertidumbre, alrededor de la solución elegida. Si con eso la solución no se mueve, el rango es una aproximación del cálculo.",
          ),
        ]
      : []),
    ...k.filas.map((f) => nota(`${f.metodo}: ${f.porQue}`)),
    ...k.avisos.map((a) => parrafo(a)),
    // La otra hipótesis, con el reposo supuesto como dato, marcada como supuesto (ADR 0135).
    ...(alternativaSupuesta(d.reconstruccion)
      ? [nota(alternativaSupuesta(d.reconstruccion)!.texto)]
      : []),
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
            // Cada parte con su nombre: «posterior, posterior izquierdo» parecía una repetición.
            [
              enPalabras(x.zona.cara),
              x.zona.tercio && `tercio ${x.zona.tercio}`,
              x.zona.vertice && `vértice ${enPalabras(x.zona.vertice)}`,
            ]
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
    // El municipio y el estado, y aparte la descripción (que es una oración con su punto): unidos
    // con comas salía «…no da coordenadas., Ahome».
    parrafo(
      [
        [e.caso.lugar?.municipio?.valor, e.caso.lugar?.estado?.valor].filter(Boolean).join(", "),
        e.caso.lugar?.descripcion?.valor?.trim(),
      ]
        .filter((p): p is string => Boolean(p))
        .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
        .join(" ") || "La narración no da el lugar.",
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
      "Croquis ajusta las velocidades para que la simulación reproduzca la evidencia que colocó el perito. Lo que la evidencia no fija se dice así; ningún número se inventa.",
    ),
    tabla(
      [
        "Vehículo",
        "Velocidad previa (km/h)",
        "Al contacto en las simulaciones, p10–p50–p90 (km/h)",
      ],
      r.velocidades.map((v) => [
        v.vehiculo,
        v.previa
          ? `${kmh(v.previa.mejor)} (${kmh(v.previa.p10)}–${kmh(v.previa.p90)})`
          : "la evidencia no la fija",
        v.impacto ? `${kmh(v.impacto.p10)}–${kmh(v.impacto.p50)}–${kmh(v.impacto.p90)}` : "—",
      ]),
    ),
    // La deformación medida contra la reconstrucción que se ve, con sus números.
    ...lecturasDeDano(r).map((l) => parrafo(danoEnTexto(l))),
    // Cada rango dice de cuántas simulaciones sale, y por qué va en enteros.
    nota(
      `El rango entre paréntesis es el ${notaDeMuestras(r)}. Las velocidades de la reconstrucción van en enteros: el rango cambia cerca de 1 km/h entre corridas y varios km/h con los supuestos.`,
    ),
    ...(d.supuestos?.length
      ? [
          subtitulo("Supuestos declarados"),
          nota(
            "Lo que el caso no trae entra como supuesto, con su justificación y su incertidumbre, que ya está en el rango de las velocidades.",
          ),
          tabla(
            ["Supuesto", "Justificación", "Incertidumbre"],
            d.supuestos.map((x) => [`${x.que}: ${x.valor}`, x.justificacion, x.incertidumbre]),
          ),
        ]
      : []),
    ...hipotesis(d),
    ...contraReporte(d),
    ...(r.impactos.length > 1
      ? [
          parrafo(
            `Impactos: ${r.impactos.map((i) => `X${i.numero} (${F.instante(i.t)}, ${i.vehiculos.join(" con ")})`).join("; ")}.`,
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
          // Cada cuadro lleva la leyenda del visor (que es una capa de pantalla y no sale en la
          // captura): si el perito copia la imagen a su reporte, la nota va con ella.
          ...d.cuadros3d.flatMap((c): Content[] => [
            { image: c.imagen, width: 420, margin: [0, 2, 0, 2] },
            nota(`${c.etiqueta}. ${LEYENDA_3D}`),
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
    ...(d.contraDeformacion?.vehiculo === v.vehiculo
      ? [
          parrafo(
            `Método de CESVI con los datos del reporte: Croquis ${F.kmhConUnidad(d.contraDeformacion.croquis, "metodo")} y el reporte ${F.kmhConUnidad(d.contraDeformacion.cesvi, "metodo")}, con las mismas medidas y el mismo método; diferencia de ${F.diferenciaKmh(d.contraDeformacion.difKmh, "metodo")} (${F.diferenciaPct(d.contraDeformacion.difPct, "metodo")}).`,
          ),
        ]
      : []),
  ]);
  // Las versiones (ronda 4): cada declaración y cada hipótesis, marcada como tal. Lo que dice un
  // conductor no es evidencia; una hipótesis es una prueba ilustrativa del perito.
  const vs = d.versiones ?? { declaradas: [], hipotesis: [] };
  const nombre = (id: string) =>
    vs.declaradas.find((x) => x.declarante === id)?.nombre ?? nombreDelVehiculo(d, id);
  const declarada: Content[] = [
    ...(vs.declaradas.length || vs.hipotesis.length
      ? [
          parrafo(
            "Lo que declaró cada conductor y las hipótesis que probó el perito, simuladas con la misma física que la reconstrucción. Croquis no dice quién tiene razón ni juzga a ningún conductor.",
          ),
        ]
      : []),
    ...vs.declaradas.flatMap((x) => [
      subtitulo(`Declaración del conductor de ${x.nombre}`),
      parrafo(
        `Versión que declara el conductor de ${x.nombre}, simulada con la misma física. Es lo que dice el conductor, no evidencia.`,
      ),
      tabla(
        ["Vehículo", "Concepto", "Versión declarada", "Evidencia y reconstrucción", "Estado"],
        x.filas.map((f) => [
          nombre(f.vehiculo),
          f.concepto,
          f.declarada,
          f.evidencia,
          ESTADO[f.estado],
        ]),
      ),
      ...(x.sugerencia
        ? [
            parrafo(`Sugerencia de Croquis, pedida por el perito: ${x.sugerencia.texto}`),
            parrafo(
              x.sugerencia.decision
                ? `El perito ${x.sugerencia.decision === "confirmada" ? "confirmó" : "descartó"} la sugerencia.`
                : "El perito no ha confirmado ni descartado la sugerencia.",
            ),
          ]
        : []),
    ]),
    ...vs.hipotesis.flatMap((h) => [
      subtitulo(`Hipótesis del perito: ${h.titulo}`),
      parrafo(
        `${h.resumen}. Es una prueba ilustrativa del perito con los conductores como agentes, comparada con los mismos conductores sin la hipótesis; llega hasta el primer contacto y no calcula el choque ni el daño. No es evidencia ni un juicio sobre ningún conductor.`,
      ),
      tabla(
        ["Concepto", "Con la hipótesis", "Sin ella"],
        h.cambios.map((c) => [c.concepto, c.version, c.reconstruccion]),
      ),
    ]),
  ];
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
      `Método: ${d.trazabilidad.metodo} · validó ${d.validacion ? `${d.validacion.perito}, ${d.validacion.fecha}` : "pendiente"}.`,
    ),
    ...(d.validacion ? [nota(HUELLA_PARA_QUE)] : []),
    letraChica(huellaLetraChica(d.trazabilidad.huella)),
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
/**
 * La leyenda de los cuadros del 3D (IA responsable, PLAN §10): la misma idea que la del visor
 * («Reconstrucción ilustrativa · entorno procedural: no es el lugar real»), en una oración.
 */
export const LEYENDA_3D =
  "Reconstrucción ilustrativa; el entorno es procedural: no es el lugar real.";

export function dictamenCasoContenido(d: DatosDictamenCaso): Content[] {
  // Roboto no trae algunas flechas: en el dictamen van en palabras.
  const cuerpo = conGlifosDeRoboto(cuerpoDelDictamen(d));
  // La cabecera: el logo de la marca, tal cual (assets/brand/marca.json).
  return d.logo
    ? [
        {
          image: d.logo,
          width: ANCHO_LOGO,
          height: Math.round(ANCHO_LOGO * PROPORCION_LOGO),
          margin: [0, 0, 0, 10],
        } as Content,
        ...cuerpo,
      ]
    : cuerpo;
}

function cuerpoDelDictamen(d: DatosDictamenCaso): Content[] {
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
      ...conDeclarada("Versiones del caso"),
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
    ...conDeclarada("Versiones del caso"),
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
