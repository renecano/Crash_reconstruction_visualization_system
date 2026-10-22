/**
 * El dictamen en PDF con la estructura de los reportes de CESVI (Hito 3, docs/cesvi/PROTOTIPO.md,
 * ADR 0051): título con la modalidad, objetivos, fundamentos, características de los vehículos,
 * observación de daños, lugar de los hechos con el croquis sobre el mapa, consideraciones,
 * conclusiones numeradas y validación del perito. Sin placas, VIN ni nombres del caso; el único
 * nombre es el del perito que valida, que escribe él mismo.
 *
 * Los números salen del módulo de cálculo (`@croquis/cesvi`); el texto de Claude entra solo como
 * redacción de las consideraciones, revisada por el perito.
 */
import {
  CRITERIOS,
  NOMBRE_ZONA,
  type CasoCesvi,
  type ClaveCriterio,
  type CriterioMarcado,
  type FilaReproduccion,
  type PasoEnergia,
  type PasoFormula,
  type PasoVelocidad,
  type ContraDictamen,
  type Sugerencia,
  type Validacion,
  type Zona,
} from "@croquis/cesvi";
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { pdfBytes } from "./pdf";
import { COLOR_VEHICULO, nombreVehiculo, type Letra } from "./vehiculos-cesvi";

export const LEYENDA_DICTAMEN =
  "Elaborado con apoyo de Croquis. El dictamen es responsabilidad del perito que lo firma.";

export interface DatosDictamen {
  caso: CasoCesvi;
  calculos: {
    mcHenry: PasoEnergia | null;
    ebsReporte: PasoVelocidad | null;
    ebsDatos: PasoVelocidad | null;
    v3: PasoVelocidad | null;
    comparacionTexto: string | null;
  };
  distanciaRestos: { valor: number; fuente: string } | null;
  reproduccion: FilaReproduccion[];
  /** Imagen PNG (data URL) del croquis sobre el mapa, con la versión que se ve. */
  croquis: {
    imagen: string;
    version: string;
    /** El punto de impacto del croquis; `ilustrativo` si es la ubicación ilustrativa (ADR 0056). */
    punto?: { lat: number; lon: number; ilustrativo: boolean };
  } | null;
  criterios: Record<"A" | "B", Record<ClaveCriterio, CriterioMarcado>>;
  zonas: Record<"A" | "B", Zona[]>;
  sugerencia: Sugerencia;
  /** Lo que concluyó CESVI contra lo que obtuvo Croquis (paso 7). */
  contraDictamen?: ContraDictamen;
  /** ¿El perito encendió la comparación con la declaración del conductor? (plan v2, R7). */
  compararDeclaracion?: boolean;
  validacion: Validacion | null;
  /** Consideraciones redactadas (borrador de Claude revisado por el perito), si las hay. */
  consideraciones: { texto: string; revisadas: boolean } | null;
  /** Qué incluir (paso 8, ADR 0057); por omisión, todo menos las notas internas. */
  incluir?: Partial<IncluirDictamen>;
  /** El croquis a escala de cada versión (PNG), para «Croquis de ambas versiones». */
  croquisVersiones?: { declarada: string | null; evidencia: string | null };
  /** Los datos del hecho con su fuente (paso 2), para «Tabla de datos y su fuente». */
  datosHecho?: { etiqueta: string; valor: string; fuente: string; version: string }[];
  /** Notas internas del perito (no van salvo que se pidan). */
  notasInternas?: string;
  /** Método, huella de las entradas, estado de la comparación y validación. */
  trazabilidad?: { metodo: string; huella: string; comparacion: string; valido: string };
}

const MARCA: Record<string, string> = {
  corresponde: "Corresponde",
  no_corresponde: "No corresponde",
  no_determinable: "No se puede determinar",
};

const titulo = (t: string): Content => ({
  text: t,
  bold: true,
  fontSize: 12,
  margin: [0, 14, 0, 6],
});
const subtitulo = (t: string): Content => ({ text: t, bold: true, margin: [0, 8, 0, 4] });
/** El cuadro de color de cada vehículo, el mismo del recorrido (ADR 0053). */
const cuadro = (letra: Letra) => ({ text: "■ ", color: COLOR_VEHICULO[letra] });
const parrafo = (t: string): Content => ({ text: t, margin: [0, 0, 0, 6] });
/** Con «Cálculos con valores sustituidos» apagado, solo el resultado de cada fórmula. */
let soloResultados = false;
const formula = (p: PasoFormula, etiqueta?: string): Content =>
  soloResultados
    ? {
        stack: [
          ...(etiqueta ? [{ text: etiqueta, italics: true, fontSize: 9 }] : []),
          { text: p.resultado, bold: true, fontSize: 10 },
        ],
        margin: [0, 0, 0, 6],
      }
    : formulaCompleta(p, etiqueta);
const formulaCompleta = (p: PasoFormula, etiqueta?: string): Content => ({
  stack: [
    ...(etiqueta ? [{ text: etiqueta, italics: true, fontSize: 9 }] : []),
    { text: p.general, fontSize: 9, color: "#444444" },
    { text: p.sustituida, fontSize: 9 },
    ...p.intermedios.map((l) => ({ text: l, fontSize: 9, color: "#444444" })),
    { text: p.resultado, bold: true, fontSize: 10 },
  ],
  margin: [12, 2, 0, 8],
});

function tabla(
  encabezados: (string | TableCell)[],
  filas: TableCell[][],
  anchos?: (string | number)[],
): Content {
  return {
    table: {
      headerRows: 1,
      widths: anchos ?? encabezados.map(() => "*"),
      body: [
        encabezados.map((h) => (typeof h === "string" ? { text: h, bold: true, fontSize: 9 } : h)),
        ...filas,
      ],
    },
    layout: "lightHorizontalLines",
    fontSize: 9,
    margin: [0, 2, 0, 8],
  };
}

/**
 * Roboto (la fuente del PDF) no trae la flecha «→», que viene en los datos del caso («sur→norte»):
 * en el PDF se escribe «a» («sur a norte») en lugar de un cuadro vacío.
 */
function conGlifosDeRoboto<T>(c: T): T {
  if (typeof c === "string") return c.replace(/\s*→\s*/g, " a ") as T;
  if (Array.isArray(c)) return c.map(conGlifosDeRoboto) as T;
  if (c && typeof c === "object" && !(c instanceof Uint8Array)) {
    return Object.fromEntries(
      Object.entries(c).map(([k, v]) => [k, k === "image" ? v : conGlifosDeRoboto(v)]),
    ) as T;
  }
  return c;
}

export interface IncluirDictamen {
  croquisAmbas: boolean;
  calculos: boolean;
  tablaDatos: boolean;
  notasInternas: boolean;
}
export const INCLUIR_POR_OMISION: IncluirDictamen = {
  croquisAmbas: true,
  calculos: true,
  tablaDatos: true,
  notasInternas: false,
};

/** El contenido del dictamen, en el orden de los reportes de CESVI. */
export function dictamenContenido(d: DatosDictamen): Content[] {
  const c = d.caso;
  const incluir = { ...INCLUIR_POR_OMISION, ...d.incluir };
  soloResultados = !incluir.calculos;
  const validado = d.validacion !== null;
  const modalidad = c.modalidad_dictaminada.toUpperCase();
  const vehiculos = [c.vehiculos.A, c.vehiculos.B];
  const encabezadoVehiculos: TableCell[] = (["A", "B"] as const).map((l) => ({
    text: [cuadro(l), nombreVehiculo(c, l)],
    bold: true,
    fontSize: 9,
  }));
  const out: Content[] = [];

  if (!validado) {
    out.push({
      text: "BORRADOR: falta la validación del perito",
      bold: true,
      color: "#b45309",
      margin: [0, 0, 0, 8],
    });
  }
  out.push({
    text: `DICTAMEN TÉCNICO DEL HECHO DE TRÁNSITO EN SU MODALIDAD DE ${modalidad}`,
    bold: true,
    fontSize: 14,
  });
  out.push(
    parrafo(
      `Siniestro ${c.id} (${c.aseguradora}). Vehículos: ${vehiculos
        .map((v, i) => `${i === 0 ? "A" : "B"}, ${v.marca} ${v.tipo} ${v.modelo}, color ${v.color}`)
        .join("; ")}. ${c.lugar.descripcion}`,
    ),
  );

  out.push(titulo("Objetivos del dictamen"));
  out.push(parrafo(c.objetivo.valor));

  out.push(titulo("Fundamentos del estudio"));
  out.push(
    parrafo(
      `Observación de los daños de los vehículos y del lugar de los hechos registrada en el expediente ${c.id}, y el método de cálculo de CESVI (energía de deformación de McHenry, velocidad equivalente de barrera y velocidad por desplazamiento), reproducido con Croquis.`,
    ),
  );

  out.push(titulo("Características de los vehículos"));
  out.push(
    tabla(
      ["", ...encabezadoVehiculos],
      [
        ["Marca", ...vehiculos.map((v) => v.marca)],
        ["Tipo", ...vehiculos.map((v) => v.tipo)],
        ["Modelo", ...vehiculos.map((v) => String(v.modelo))],
        ["Color", ...vehiculos.map((v) => v.color)],
        ["Placas", ...vehiculos.map((v) => v.placas)],
        ["Servicio", ...vehiculos.map((v) => v.servicio)],
      ],
      [70, "*", "*"],
    ),
  );

  out.push(titulo("Observación de daños en los vehículos"));
  (["A", "B"] as const).forEach((letra, i) => {
    const v = vehiculos[i]!;
    out.push({
      text: [cuadro(letra), `${nombreVehiculo(c, letra)}: ${v.marca} ${v.tipo}`],
      bold: true,
      margin: [0, 8, 0, 4],
    });
    for (const dn of v.danos) {
      out.push(
        parrafo(
          `${dn.zona}${dn.acento ? ` (acentuación a la ${dn.acento})` : ""}: ${dn.descripcion}`,
        ),
      );
    }
    const zonas = d.zonas[letra];
    out.push(
      parrafo(
        `Zonas de daño: ${zonas.length ? zonas.map((z) => NOMBRE_ZONA[z]).join(", ") : "sin marcar"}.`,
      ),
    );
  });

  out.push(titulo("Lugar de los hechos"));
  out.push(parrafo(`${c.lugar.descripcion} ${c.lugar.separacion.valor} ${c.lugar.carpeta.valor}`));
  out.push(
    parrafo(
      `${c.evidencia.restos.descripcion} Separación entre el primero y el último: ${
        d.distanciaRestos
          ? `${d.distanciaRestos.valor} m (${d.distanciaRestos.fuente})`
          : "sin medir"
      }.`,
    ),
  );
  if (d.croquis) {
    out.push({ image: d.croquis.imagen, width: 515, margin: [0, 4, 0, 2] });
    out.push({
      text: [
        `Croquis a escala sobre el mapa: ${d.croquis.version}. `,
        cuadro("A"),
        `${nombreVehiculo(c, "A")}, `,
        cuadro("B"),
        `${nombreVehiculo(c, "B")}. Mapa © OpenStreetMap (ODbL), mosaicos OpenFreeMap / OpenMapTiles.`,
        ...(d.croquis.punto
          ? [
              ` Punto de impacto: ${d.croquis.punto.lat.toFixed(5)}, ${d.croquis.punto.lon.toFixed(5)}${
                d.croquis.punto.ilustrativo
                  ? ` (ubicación ilustrativa: el reporte de CESVI no da coordenadas del km ${c.lugar.kilometro}; no es el lugar real).`
                  : " (marcado por el perito)."
              }`,
            ]
          : []),
      ],
      fontSize: 8,
      color: "#444444",
      margin: [0, 0, 0, 8],
    });
  } else {
    out.push(parrafo("[El perito no marcó el croquis sobre el mapa.]"));
  }
  const cv = d.croquisVersiones;
  if (incluir.croquisAmbas && cv && (cv.declarada || cv.evidencia)) {
    out.push(subtitulo("Croquis de ambas versiones, a escala"));
    out.push({
      columns: (
        [
          ["Reconstrucción de Croquis", cv.evidencia],
          ["Versión declarada", cv.declarada],
        ] as const
      ).map(([nombre, img]) =>
        img
          ? {
              stack: [
                { image: img, width: 250 },
                { text: nombre, fontSize: 8, color: "#444444" },
              ],
            }
          : { text: `${nombre}: sin croquis.`, fontSize: 9 },
      ),
      columnGap: 12,
      margin: [0, 0, 0, 8],
    });
  }
  if (incluir.tablaDatos && d.datosHecho?.length) {
    out.push(subtitulo("Datos del hecho y su fuente"));
    out.push(
      tabla(
        ["Dato", "Valor", "Fuente", "Versión"],
        d.datosHecho.map((x) => [x.etiqueta, x.valor, x.fuente, x.version]),
        [110, "*", 70, 70],
      ),
    );
  }

  out.push(titulo("Consideraciones"));
  out.push(subtitulo("1. Declaración y dinámica declarada"));
  out.push(
    parrafo(
      `Declaración del conductor del vehículo ${c.declaracion.conductor}, que a la letra dice: «${c.declaracion.texto}».`,
    ),
  );
  out.push(subtitulo("2. Análisis de las deformaciones (método de McHenry)"));
  if (d.calculos.mcHenry)
    out.push(formula(d.calculos.mcHenry, "Energía de deformación de la Tacoma"));
  if (d.calculos.ebsReporte)
    out.push(
      formula(
        d.calculos.ebsReporte,
        "Velocidad de impacto partiendo de la energía del reporte de CESVI",
      ),
    );
  if (d.calculos.ebsDatos)
    out.push(formula(d.calculos.ebsDatos, "Velocidad de impacto con la energía calculada arriba"));
  out.push(subtitulo("3. Velocidad por desplazamiento"));
  if (d.calculos.v3) out.push(formula(d.calculos.v3));
  if (d.calculos.comparacionTexto) out.push(parrafo(d.calculos.comparacionTexto));
  out.push(subtitulo("Reproducción de los números del reporte de CESVI"));
  out.push(
    tabla(
      ["Concepto", "Original", "Croquis", "Diferencia", "%"],
      d.reproduccion.map((f) => [
        `${f.concepto} (${f.partida.toLowerCase()})`,
        `${f.reporte.toFixed(f.decimalesReporte)} ${f.unidad}`,
        `${f.croquis.toFixed(Math.min(f.decimalesReporte + 2, 4))} ${f.unidad}`,
        f.diferencia.toFixed(Math.min(f.decimalesReporte + 2, 4)),
        `${f.diferenciaPct.toFixed(Math.abs(f.diferenciaPct) < 0.01 ? 4 : 2)} %`,
      ]),
      ["*", 70, 70, 55, 45],
    ),
  );
  out.push(subtitulo("4. Correspondencia de daños"));
  out.push(
    tabla(
      ["Criterio", ...encabezadoVehiculos],
      CRITERIOS.map((cr) => [
        cr.nombre,
        ...(["A", "B"] as const).map((l) => {
          const m = d.criterios[l][cr.clave];
          const marca = m.marca ? MARCA[m.marca]! : "Sin marcar";
          return m.nota ? `${marca}. ${m.nota}` : marca;
        }),
      ]),
      [110, "*", "*"],
    ),
  );
  if (d.consideraciones) {
    out.push(
      subtitulo(
        d.consideraciones.revisadas
          ? "Redacción de las consideraciones (revisada por el perito)"
          : "Redacción de las consideraciones (BORRADOR redactado con apoyo de Claude, sin revisar)",
      ),
    );
    for (const p of d.consideraciones.texto.split(/\n{2,}/)) out.push(parrafo(p.trim()));
  }

  out.push(titulo("Conclusiones"));
  const conclusiones = [
    d.calculos.ebsReporte
      ? `De acuerdo con la magnitud y profundidad de los daños del vehículo B, su velocidad de impacto es de ${d.calculos.ebsReporte.calculo.kmh.toFixed(2)} km/h (partiendo de la energía del reporte de CESVI; con los datos impresos, ${d.calculos.ebsDatos ? `${d.calculos.ebsDatos.calculo.kmh.toFixed(2)} km/h` : "sin calcular"}).`
      : null,
    d.calculos.v3
      ? `De acuerdo con la separación de los restos, el vehículo A fue desplazado con una velocidad de ${d.calculos.v3.calculo.kmh.toFixed(2)} km/h.`
      : null,
    validado
      ? d.validacion!.conclusion
      : "Pendiente de validación del perito: la conclusión es del perito.",
  ].filter((x): x is string => x !== null);
  out.push({ ol: conclusiones, margin: [0, 0, 0, 8] });
  const cd = d.contraDictamen;
  if (cd) {
    out.push(subtitulo("Reconstrucción de Croquis contra el reporte de CESVI"));
    out.push(
      tabla(
        ["Punto", "Concluyó CESVI", "Obtuvo Croquis", "Diferencia"],
        cd.filas.map((f) => [
          f.concepto,
          f.cesvi,
          f.croquis,
          f.coincide === null
            ? "—"
            : f.diferenciaPct === null
              ? f.coincide
                ? "Coincide"
                : "Difiere"
              : `${f.diferenciaPct >= 0 ? "+" : "−"}${Math.abs(f.diferenciaPct).toFixed(2)} %`,
        ]),
        ["*", 95, 95, 60],
      ),
    );
    if (cd.energia) {
      out.push({
        text: `Diferencia de energía: con los datos impresos la energía de deformación es ${cd.energia.croquis.toFixed(3)} y el reporte de CESVI imprime ${cd.energia.dictamen.toFixed(3)} (${cd.energia.diferenciaPct >= 0 ? "+" : "−"}${Math.abs(cd.energia.diferenciaPct).toFixed(2)} %). ${cd.energia.lectura}`,
        fontSize: 8,
        color: "#444444",
        margin: [0, 4, 0, 8],
      });
    }
  }
  if (d.compararDeclaracion) {
    out.push(subtitulo("Comparación con la declaración del conductor (complemento)"));
    out.push({
      ul: d.sugerencia.razones.map((r) => `${r.texto} (${r.evidencia}).`),
      fontSize: 9,
    });
    out.push({
      text: "Indicadores para el perito: Croquis no determina si la declaración se sostiene.",
      fontSize: 8,
      color: "#444444",
      margin: [0, 4, 0, 8],
    });
  }

  out.push(titulo("Validación del perito"));
  if (d.validacion) {
    const decision = { aceptada: "aceptó", editada: "editó", rechazada: "rechazó" }[
      d.validacion.decision
    ];
    out.push(
      parrafo(
        `El perito ${d.validacion.perito} ${decision} la comparación de Croquis con el reporte de CESVI el ${new Date(d.validacion.fecha).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}.`,
      ),
    );
  } else {
    out.push(parrafo("Sin validar."));
  }
  out.push({ text: "\n\n______________________________\nFirma del perito", margin: [0, 16, 0, 0] });
  if (incluir.notasInternas && d.notasInternas?.trim()) {
    out.push(titulo("Notas internas del perito"));
    out.push(parrafo(d.notasInternas.trim()));
  }
  if (d.trazabilidad) {
    const t = d.trazabilidad;
    out.push({
      text: `Trazabilidad: método ${t.metodo} · huella de entradas ${t.huella} · comparación ${t.comparacion} · validó ${t.valido}.`,
      fontSize: 7,
      color: "#555555",
      margin: [0, 12, 0, 0],
    });
  }
  return out.map(conGlifosDeRoboto);
}

export function dictamenDefinicion(d: DatosDictamen): TDocumentDefinitions {
  return {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 50],
    info: {
      title: `Dictamen ${d.caso.id}${d.validacion ? "" : " (borrador)"}`,
      subject: LEYENDA_DICTAMEN,
      keywords: "dictamen; CESVI; Croquis",
      creator: "Croquis",
      producer: "Croquis (pdfmake)",
    },
    defaultStyle: { font: "Roboto", fontSize: 10 },
    footer: (pagina: number, paginas: number): Content => ({
      margin: [40, 10, 40, 0],
      columns: [
        { width: "*", text: LEYENDA_DICTAMEN, fontSize: 8, color: "#333333" },
        { width: "auto", text: `${pagina} / ${paginas}`, fontSize: 8, color: "#555555" },
      ],
    }),
    content: dictamenContenido(d),
  };
}

export function dictamenPdf(d: DatosDictamen): Promise<Uint8Array<ArrayBuffer>> {
  return pdfBytes(dictamenDefinicion(d));
}
