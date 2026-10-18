/**
 * Informe PDF de la reconstrucción (F9, PLAN §7.9): croquis, línea de tiempo, resultados con sus
 * rangos, lo que dice la evidencia, banderas, parámetros con su fuente, supuestos, semilla, hash de
 * entradas y la marca de reconstrucción ilustrativa en cada página (PLAN §10). Dice lo mismo que los
 * paneles del visor (`textos-resultado.ts`) y nunca asigna culpa ni estima lesiones.
 */
import { LEGEND_TEXT, legendFor, type EscenaSpec, type Resultado } from "@croquis/scene-schema";
import { eventMarkers } from "@croquis/viewer";
import type { Content, TableCell } from "pdfmake/interfaces";
import { fmtNumber as fmt } from "./format-number";
import { pdfBytes, pdfDefinition } from "./pdf";
import {
  campoIncierto,
  CLASE,
  clockHour,
  estimacionTexto,
  evidenceLabel,
  PARAM,
  parametroInversion,
  rigidezTexto,
  TIPO,
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
}

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

export function informeContenido(d: InformeDatos): Content[] {
  const { spec, resultado: r } = d;
  const legend = legendFor(spec);
  const roles = new Map(r.vehiculos.map((v) => [v.id, v.rol]));
  const rolOf = new Map<string, string>([
    ...r.vehiculos.map((v) => [v.id, v.rol] as const),
    ...r.personas.map((p) => [p.id, "peatón"] as const),
  ]);
  const inc = r.incertidumbre;
  const incV = new Map((inc?.vehiculos ?? []).map((v) => [v.id, v]));
  const inv = r.inversion;
  const flags = r.consistencia ?? [];
  const out: Content[] = [];

  out.push(
    { text: "Informe de reconstrucción ilustrativa", fontSize: 18, bold: true },
    { text: spec.meta.titulo ?? spec.meta.id, fontSize: 12, margin: [0, 2, 0, 2] },
    nota(
      `Generado en este dispositivo el ${d.generado
        .toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })
        .replace(/\.$/, "")}.`,
    ),
    {
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                { text: LEGEND_TEXT, bold: true },
                {
                  text: "Muestra lo que el modelo físico reproduce con lo que se contó y con los supuestos marcados como tales. No asigna culpas ni estima lesiones, y no sustituye a un peritaje.",
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

  out.push(h2("Croquis"), { svg: d.croquisSvg, fit: [515, 340] });

  out.push(
    h2("Línea de tiempo"),
    nota("t = 0 es el momento del impacto; los tiempos negativos son antes del impacto."),
    tabla(
      ["t (s)", "Evento"],
      eventMarkers(r.eventos, r.t_inicio, r.t_fin, (id) => rolOf.get(id)).map((m) => [
        fmt(m.t, 2),
        m.etiqueta,
      ]),
      [50, "*"],
    ),
  );

  out.push(
    h2("Vehículos"),
    tabla(
      [
        "Vehículo",
        "Velocidad al impacto",
        "Cambio de velocidad (ΔV)",
        "Dirección de la fuerza",
        "Energía de deformación",
        "Rigidez usada",
      ],
      r.vehiculos.map((v) => [
        `${v.rol} · ${CLASE[v.clase] ?? v.clase}${v.involucrado ? "" : " (no participa en el impacto)"}`,
        conRango(v.v_impacto_kmh, "km/h", incV.get(v.id)?.v_impacto_kmh),
        conRango(v.delta_v_kmh, "km/h", incV.get(v.id)?.delta_v_kmh),
        v.pdof_horas !== undefined ? clockHour(v.pdof_horas) : "—",
        `${fmt(v.dano.energia_j / 1000, 1)} kJ`,
        rigidezTexto(v.dano.origen_rigidez),
      ]),
    ),
    nota(
      inc
        ? `Valor nominal del modelo físico y, debajo, el rango donde cae el 80 % de ${inc.validas} reconstrucciones con los datos inciertos muestreados (semilla ${inc.semilla}).`
        : "Valores nominales del modelo físico.",
    ),
  );

  const volcaduras = r.vehiculos.filter((v) => v.volcadura);
  if (volcaduras.length > 0) {
    out.push(h2("Volcadura (criterio de tropiezo)"), {
      ul: volcaduras.map((v) => {
        const vol = v.volcadura!;
        return `Vehículo ${v.rol}: llega a la orilla con ${fmt(vol.velocidad_lateral_kmh)} km/h hacia ella; el tropiezo necesita ${fmt(vol.velocidad_critica_kmh)} km/h (factor de estabilidad ${fmt(vol.ssf, 2)}). ${vol.inicia ? "Alcanza para volcar." : "No alcanza para volcar."}`;
      }),
    });
  }

  out.push(h2("Lo que dice la evidencia física"));
  if (inv && inv.evidencia.length > 0) {
    out.push(
      {
        text: `Evidencia declarada: ${inv.evidencia.map((l) => evidenceLabel(l, roles)).join(", ")}.`,
      },
      tabla(
        ["Vehículo", "Dato", "Valor de partida", "Según la evidencia (80 %)"],
        inv.parametros.map((p) => [
          roles.get(p.vehiculo) ?? p.vehiculo,
          parametroInversion(p),
          `${fmt(p.inicial)}${unidadInversion(p)} (${p.inicial_declarado ? "dicho" : "supuesto"})`,
          estimacionTexto(p),
        ]),
      ),
      nota(
        `Velocidades y direcciones con las que el solver reproduce la evidencia (mínimos cuadrados robustos), repetidas ${inv.muestras} veces con la fricción, las masas y la evidencia dentro de su incertidumbre (semilla ${inv.semilla}).`,
      ),
    );
  } else {
    out.push({
      text: "La escena no declara posiciones finales, marcas de frenado, distancia de proyección ni daño medible: las velocidades salen de lo dicho y de los supuestos.",
    });
  }
  if (flags.length > 0) {
    out.push(
      { text: "Datos que no cuadran", bold: true, margin: [0, 6, 0, 2] },
      { ul: flags.map((f) => f.mensaje) },
    );
  }

  if (r.banderas.length > 0) {
    out.push(h2("Avisos de la reconstrucción"), { ul: [...r.banderas] });
  }

  out.push(
    h2("Parámetros y su fuente"),
    tabla(
      ["Parámetro", "Valor", "Tipo", "Fuente"],
      Object.entries(r.parametros).flatMap(([k, p]) =>
        p
          ? [
              [
                PARAM[k] ?? k,
                `${fmt(p.valor, 2)}${p.rango ? ` (rango ${fmt(p.rango[0], 2)}–${fmt(p.rango[1], 2)})` : ""}`,
                TIPO[p.tipo] ?? p.tipo,
                { text: p.fuente ?? "—", fontSize: 7 },
              ],
            ]
          : [],
      ),
      ["*", 90, 70, "*"],
    ),
  );

  const supuestos = [
    ...d.supuestosEntorno.map((s) => `Entorno: ${s}`),
    ...(inc?.campos ?? []).map((c) => campoIncierto(c, r)),
  ];
  out.push(
    h2("Supuestos y datos inciertos"),
    supuestos.length > 0
      ? { ul: supuestos }
      : { text: "La escena no tiene supuestos de entorno ni datos inciertos muestreados." },
  );

  out.push(
    h2("Identificación"),
    tabla(
      ["Dato", "Valor"],
      [
        ["Escena", spec.meta.id],
        ["Semilla", legend.semilla],
        ["Hash del relato (entradas)", legend.hash ?? "— (escena sin relato)"],
        ["SHA-256 de la escena que recibió el solver", { text: d.hashEscena, fontSize: 7 }],
        ["Versión del resultado", r.version_resultado],
        ...(legend.atribucion ? [["Datos del mapa", legend.atribucion] as TableCell[]] : []),
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
): Promise<Uint8Array<ArrayBuffer>> {
  const { croquisSvg } = await import("@croquis/croquis-2d/export");
  const content = informeContenido({
    spec,
    resultado,
    supuestosEntorno,
    croquisSvg: croquisSvg(spec).markup,
    hashEscena: await sha256Hex(JSON.stringify(spec)),
    generado: new Date(),
  });
  return pdfBytes(
    pdfDefinition({
      title: `Informe — ${spec.meta.titulo ?? spec.meta.id}`,
      legend: legendFor(spec),
      content,
    }),
  );
}
