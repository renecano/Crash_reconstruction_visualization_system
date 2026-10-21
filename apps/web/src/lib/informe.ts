/**
 * Informe PDF de la reconstrucción (F9, PLAN §7.9): croquis, línea de tiempo, resultados con sus
 * rangos, lo que dice la evidencia, banderas, parámetros con su fuente, supuestos, semilla, hash de
 * entradas y la marca de reconstrucción ilustrativa en cada página (PLAN §10). Dice lo mismo que los
 * paneles del visor (`textos-resultado.ts`) y nunca asigna culpa ni estima lesiones.
 *
 * Se escribe en el idioma de la página (PLAN §11.5): en español, como siempre, con `LEGEND_TEXT`;
 * en inglés, todo el informe y la marca en inglés. Los avisos y las inconsistencias del solver se
 * traducen con `mensaje`; lo que no tenga traducción conocida queda en español.
 */
import { legendFor, type EscenaSpec, type Resultado } from "@croquis/scene-schema";
import { eventMarkers } from "@croquis/viewer";
import type { Content, TableCell } from "pdfmake/interfaces";
import { textos, textosEn, type Lang } from "@/i18n";
import { fmtNumber as fmt } from "./format-number";
import { mensaje } from "./mensajes";
import { pdfBytes, pdfDefinition } from "./pdf";
import {
  campoIncierto,
  claseTexto,
  clockHour,
  estimacionTexto,
  eventoEtiqueta,
  evidenceLabel,
  inicialTexto,
  leyendaIdioma,
  textosCroquisEn,
  lineasLeyenda,
  paramTexto,
  parametroInversion,
  rigidezTexto,
  supuestoEntorno,
  tipoTexto,
  unidadInversion,
} from "./textos-resultado";

export interface InformeDatos {
  spec: EscenaSpec;
  resultado: Resultado;
  supuestosEntorno: string[];
  /** SVG del croquis (`croquisSvg`). */
  croquisSvg: string;
  /** SHA-256 de la escena que recibió el solver (sus entradas). */
  hashEscena: string;
  generado: Date;
  /** Idioma del informe; español por omisión. */
  lang?: Lang;
}

const T = textos(
  {
    titulo: "Informe de reconstrucción ilustrativa",
    generado: (fecha: string) => `Generado en este dispositivo el ${fecha}.`,
    locale: "es-MX",
    alcance:
      "Muestra lo que el modelo físico reproduce con lo que se contó y con los supuestos marcados como tales. No asigna culpas ni estima lesiones, y no sustituye a un peritaje.",
    croquis: "Croquis",
    lineaTiempo: "Línea de tiempo",
    notaTiempo: "t = 0 es el momento del impacto; los tiempos negativos son antes del impacto.",
    evento: "Evento",
    peaton: "peatón",
    vehiculos: "Vehículos",
    vehiculo: "Vehículo",
    velocidadImpacto: "Velocidad al impacto",
    deltaV: "Cambio de velocidad (ΔV)",
    direccionFuerza: "Dirección de la fuerza",
    energia: "Energía de deformación",
    rigidez: "Rigidez usada",
    noParticipa: " (no participa en el impacto)",
    notaRangos: (validas: number, semilla: number | string) =>
      `Valor nominal del modelo físico y, debajo, el rango donde cae el 80 % de ${validas} reconstrucciones con los datos inciertos muestreados (semilla ${semilla}).`,
    nominales: "Valores nominales del modelo físico.",
    volcadura: "Volcadura (criterio de tropiezo)",
    volcaduraTexto: (rol: string, lateral: string, critica: string, ssf: string, inicia: boolean) =>
      `Vehículo ${rol}: llega a la orilla con ${lateral} km/h hacia ella; el tropiezo necesita ${critica} km/h (factor de estabilidad ${ssf}). ${inicia ? "Alcanza para volcar." : "No alcanza para volcar."}`,
    evidencia: "Lo que dice la evidencia física",
    evidenciaDeclarada: (lista: string) => `Evidencia declarada: ${lista}.`,
    dato: "Dato",
    valorPartida: "Valor de partida",
    segunEvidencia: "Según la evidencia (80 %)",
    notaInversion: (muestras: number, semilla: number | string) =>
      `Velocidades y direcciones con las que el solver reproduce la evidencia (mínimos cuadrados robustos), repetidas ${muestras} veces con la fricción, las masas y la evidencia dentro de su incertidumbre (semilla ${semilla}).`,
    sinEvidencia:
      "La escena no declara posiciones finales, marcas de frenado, distancia de proyección ni daño medible: las velocidades salen de lo dicho y de los supuestos.",
    noCuadran: "Datos que no cuadran",
    avisos: "Avisos de la reconstrucción",
    parametros: "Parámetros y su fuente",
    parametro: "Parámetro",
    valor: "Valor",
    tipo: "Tipo",
    fuente: "Fuente",
    rango: (a: string, b: string) => ` (rango ${a}–${b})`,
    supuestos: "Supuestos y datos inciertos",
    entorno: (s: string) => `Entorno: ${s}`,
    sinSupuestos: "La escena no tiene supuestos de entorno ni datos inciertos muestreados.",
    identificacion: "Identificación",
    escena: "Escena",
    semilla: "Semilla",
    hashRelato: "Hash del relato (entradas)",
    sinRelato: "— (escena sin relato)",
    shaEscena: "SHA-256 de la escena que recibió el solver",
    version: "Versión del resultado",
    datosMapa: "Datos del mapa",
    tituloDoc: (nombre: string) => `Informe — ${nombre}`,
    palabrasClave: "reconstrucción ilustrativa; no es un peritaje",
  },
  {
    titulo: "Illustrative reconstruction report",
    generado: (fecha: string) => `Generated on this device on ${fecha}.`,
    locale: "en-US",
    alcance:
      "It shows what the physical model reproduces from what was told and from the assumptions marked as such. It does not assign blame or estimate injuries, and it does not replace a forensic report.",
    croquis: "Sketch",
    lineaTiempo: "Timeline",
    notaTiempo: "t = 0 is the moment of impact; negative times are before the impact.",
    evento: "Event",
    peaton: "pedestrian",
    vehiculos: "Vehicles",
    vehiculo: "Vehicle",
    velocidadImpacto: "Impact speed",
    deltaV: "Change in speed (ΔV)",
    direccionFuerza: "Direction of force",
    energia: "Deformation energy",
    rigidez: "Stiffness used",
    noParticipa: " (not part of the impact)",
    notaRangos: (validas: number, semilla: number | string) =>
      `Nominal value from the physical model and, below it, the range where 80 % of ${validas} reconstructions fall with the uncertain data sampled (seed ${semilla}).`,
    nominales: "Nominal values from the physical model.",
    volcadura: "Rollover (tripping criterion)",
    volcaduraTexto: (rol: string, lateral: string, critica: string, ssf: string, inicia: boolean) =>
      `Vehicle ${rol}: it reaches the edge at ${lateral} km/h toward it; tripping needs ${critica} km/h (stability factor ${ssf}). ${inicia ? "It is enough to roll over." : "It is not enough to roll over."}`,
    evidencia: "What the physical evidence says",
    evidenciaDeclarada: (lista: string) => `Stated evidence: ${lista}.`,
    dato: "Value",
    valorPartida: "Starting value",
    segunEvidencia: "According to the evidence (80 %)",
    notaInversion: (muestras: number, semilla: number | string) =>
      `Speeds and directions with which the solver reproduces the evidence (robust least squares), repeated ${muestras} times with friction, masses and evidence within their uncertainty (seed ${semilla}).`,
    sinEvidencia:
      "The scene does not state final positions, skid marks, throw distance or measurable damage: the speeds come from what was told and from the assumptions.",
    noCuadran: "Data that do not fit",
    avisos: "Reconstruction notices",
    parametros: "Parameters and their source",
    parametro: "Parameter",
    valor: "Value",
    tipo: "Type",
    fuente: "Source",
    rango: (a: string, b: string) => ` (range ${a}–${b})`,
    supuestos: "Assumptions and uncertain data",
    entorno: (s: string) => `Environment: ${s}`,
    sinSupuestos: "The scene has no environment assumptions and no sampled uncertain data.",
    identificacion: "Identification",
    escena: "Scene",
    semilla: "Seed",
    hashRelato: "Narrative hash (inputs)",
    sinRelato: "— (scene without a narrative)",
    shaEscena: "SHA-256 of the scene the solver received",
    version: "Result version",
    datosMapa: "Map data",
    tituloDoc: (nombre: string) => `Report — ${nombre}`,
    palabrasClave: "illustrative reconstruction; not a forensic report",
  },
);

const h2 = (text: string): Content => ({ text, fontSize: 13, bold: true, margin: [0, 14, 0, 6] });
const nota = (text: string): Content => ({
  text,
  fontSize: 8,
  color: "#555555",
  margin: [0, 3, 0, 0],
});
const th = (text: string): TableCell => ({ text, bold: true, fillColor: "#eeeeee" });

function tabla(headers: string[], rows: TableCell[][], widths?: (string | number)[]): Content {
  return {
    table: {
      headerRows: 1,
      widths: widths ?? headers.map(() => "*"),
      body: [headers.map(th), ...rows],
    },
    layout: "lightHorizontalLines",
    fontSize: 9,
  };
}

/** Valor nominal con su rango del 80 % de Monte Carlo, si existe. */
function conRango(valor: number, unidad: string, pct?: { p10: number; p90: number }): TableCell {
  return {
    stack: [
      `${fmt(valor)} ${unidad}`,
      ...(pct
        ? [
            {
              text: `80 %: ${fmt(pct.p10)}–${fmt(pct.p90)} ${unidad}`,
              fontSize: 7,
              color: "#555555",
            },
          ]
        : []),
    ],
  };
}

/** Un texto del sistema (escrito en español) en el idioma del informe. */
const enIdioma = (es: string, lang: Lang): string => mensaje(es, lang).texto;

export function informeContenido(d: InformeDatos): Content[] {
  const { spec, resultado: r } = d;
  const lang = d.lang ?? "es";
  const t = textosEn(T, lang);
  const legend = leyendaIdioma(legendFor(spec), lang);
  const roles = new Map(r.vehiculos.map((v) => [v.id, v.rol]));
  const rolOf = new Map<string, string>([
    ...r.vehiculos.map((v) => [v.id, v.rol] as const),
    ...r.personas.map((p) => [p.id, t.peaton] as const),
  ]);
  const inc = r.incertidumbre;
  const incV = new Map((inc?.vehiculos ?? []).map((v) => [v.id, v]));
  const inv = r.inversion;
  const flags = r.consistencia ?? [];
  const out: Content[] = [];

  out.push(
    { text: t.titulo, fontSize: 18, bold: true },
    { text: spec.meta.titulo ?? spec.meta.id, fontSize: 12, margin: [0, 2, 0, 2] },
    nota(
      t.generado(
        d.generado
          .toLocaleString(t.locale, { dateStyle: "long", timeStyle: "short" })
          .replace(/\.$/, ""),
      ),
    ),
    {
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                { text: legend.texto, bold: true },
                {
                  text: t.alcance,
                  fontSize: 9,
                  margin: [0, 3, 0, 0],
                },
              ],
              fillColor: "#fff7e0",
              margin: [6, 6, 6, 6],
            },
          ],
        ],
      },
      layout: "noBorders",
      margin: [0, 10, 0, 0],
    },
  );

  out.push(h2(t.croquis), { svg: d.croquisSvg, fit: [515, 340] });

  out.push(
    h2(t.lineaTiempo),
    nota(t.notaTiempo),
    tabla(
      ["t (s)", t.evento],
      eventMarkers(r.eventos, r.t_inicio, r.t_fin, (id) => rolOf.get(id)).map((m) => {
        const actor = r.eventos.find((e) => e.id === m.id)?.actores[0];
        return [fmt(m.t, 2), eventoEtiqueta(m, actor ? rolOf.get(actor) : undefined, lang)];
      }),
      [50, "*"],
    ),
  );

  out.push(
    h2(t.vehiculos),
    tabla(
      [t.vehiculo, t.velocidadImpacto, t.deltaV, t.direccionFuerza, t.energia, t.rigidez],
      r.vehiculos.map((v) => [
        `${v.rol} · ${claseTexto(v.clase, lang)}${v.involucrado ? "" : t.noParticipa}`,
        conRango(v.v_impacto_kmh, "km/h", incV.get(v.id)?.v_impacto_kmh),
        conRango(v.delta_v_kmh, "km/h", incV.get(v.id)?.delta_v_kmh),
        v.pdof_horas !== undefined ? clockHour(v.pdof_horas, lang) : "—",
        `${fmt(v.dano.energia_j / 1000, 1)} kJ`,
        rigidezTexto(v.dano.origen_rigidez, lang),
      ]),
    ),
    nota(inc ? t.notaRangos(inc.validas, inc.semilla) : t.nominales),
  );

  const volcaduras = r.vehiculos.filter((v) => v.volcadura);
  if (volcaduras.length > 0) {
    out.push(h2(t.volcadura), {
      ul: volcaduras.map((v) => {
        const vol = v.volcadura!;
        return t.volcaduraTexto(
          v.rol,
          fmt(vol.velocidad_lateral_kmh),
          fmt(vol.velocidad_critica_kmh),
          fmt(vol.ssf, 2),
          vol.inicia,
        );
      }),
    });
  }

  out.push(h2(t.evidencia));
  if (inv && inv.evidencia.length > 0) {
    out.push(
      {
        text: t.evidenciaDeclarada(
          inv.evidencia.map((l) => evidenceLabel(l, roles, lang)).join(", "),
        ),
      },
      tabla(
        [t.vehiculo, t.dato, t.valorPartida, t.segunEvidencia],
        inv.parametros.map((p) => [
          roles.get(p.vehiculo) ?? p.vehiculo,
          parametroInversion(p, lang),
          `${fmt(p.inicial)}${unidadInversion(p)} (${inicialTexto(p.inicial_declarado, lang)})`,
          estimacionTexto(p, lang),
        ]),
      ),
      nota(t.notaInversion(inv.muestras, inv.semilla)),
    );
  } else {
    out.push({ text: t.sinEvidencia });
  }
  if (flags.length > 0) {
    out.push(
      { text: t.noCuadran, bold: true, margin: [0, 6, 0, 2] },
      { ul: flags.map((f) => enIdioma(f.mensaje, lang)) },
    );
  }

  if (r.banderas.length > 0) {
    out.push(h2(t.avisos), { ul: r.banderas.map((b) => enIdioma(b, lang)) });
  }

  out.push(
    h2(t.parametros),
    tabla(
      [t.parametro, t.valor, t.tipo, t.fuente],
      Object.entries(r.parametros).flatMap(([k, p]) =>
        p
          ? [
              [
                paramTexto(k, lang),
                `${fmt(p.valor, 2)}${p.rango ? t.rango(fmt(p.rango[0], 2), fmt(p.rango[1], 2)) : ""}`,
                tipoTexto(p.tipo, lang),
                { text: p.fuente ?? "—", fontSize: 7 },
              ],
            ]
          : [],
      ),
      ["*", 90, 70, "*"],
    ),
  );

  const supuestos = [
    ...d.supuestosEntorno.map((s) => t.entorno(supuestoEntorno(s, lang).texto)),
    ...(inc?.campos ?? []).map((c) => campoIncierto(c, r, lang)),
  ];
  out.push(h2(t.supuestos), supuestos.length > 0 ? { ul: supuestos } : { text: t.sinSupuestos });

  out.push(
    h2(t.identificacion),
    tabla(
      [t.dato, t.valor],
      [
        [t.escena, spec.meta.id],
        [t.semilla, legend.semilla],
        [t.hashRelato, legend.hash ?? t.sinRelato],
        [t.shaEscena, { text: d.hashEscena, fontSize: 7 }],
        [t.version, r.version_resultado],
        ...(legend.atribucion ? [[t.datosMapa, legend.atribucion] as TableCell[]] : []),
      ],
      [150, "*"],
    ),
  );
  return out;
}

/** SHA-256 (hex) del JSON de la escena. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function informePdf(
  spec: EscenaSpec,
  resultado: Resultado,
  supuestosEntorno: string[],
  lang: Lang = "es",
): Promise<Uint8Array<ArrayBuffer>> {
  const { croquisSvg } = await import("@croquis/croquis-2d/export");
  const t = textosEn(T, lang);
  const content = informeContenido({
    spec,
    resultado,
    supuestosEntorno,
    croquisSvg: croquisSvg(spec, {
      textos: lang === "en" ? textosCroquisEn(spec) : undefined,
    }).markup,
    hashEscena: await sha256Hex(JSON.stringify(spec)),
    generado: new Date(),
    lang,
  });
  const legend = legendFor(spec);
  return pdfBytes(
    pdfDefinition({
      title: t.tituloDoc(spec.meta.titulo ?? spec.meta.id),
      legend,
      content,
      ...(lang === "es" ? {} : { lines: lineasLeyenda(legend, lang), keywords: t.palabrasClave }),
    }),
  );
}
