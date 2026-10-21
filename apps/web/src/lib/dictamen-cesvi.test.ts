import {
  caso,
  compararVelocidades,
  criteriosVacios,
  formulaDesplazamiento,
  formulaEbs,
  formulaMcHenry,
  reproducir,
  sugerir,
  zonasDeDanos,
} from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  dictamenContenido,
  dictamenDefinicion,
  LEYENDA_DICTAMEN,
  type DatosDictamen,
} from "./dictamen-cesvi";

/** Todo el texto de un contenido de pdfmake, en orden. */
function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if ("image" in o) return "[croquis]";
    return ["text", "stack", "ul", "ol", "columns", "table", "body"]
      .filter((k) => k in o)
      .map((k) => textOf(o[k]))
      .join(" ");
  }
  return "";
}

const c = caso("A2010930");
const d = c.calculos.deformacion_B;
const zonas = { A: zonasDeDanos(c.vehiculos.A.danos), B: zonasDeDanos(c.vehiculos.B.danos) };
const ebsReporte = formulaEbs(d.reporte.energia.valor, 1.431083);
const v3 = formulaDesplazamiento(0.9, 9.8, 15.89);
const sugerencia = sugerir({
  comparacion: compararVelocidades(ebsReporte.calculo.kmh, v3.calculo.kmh, 10),
  distanciaRestos: 15.89,
  fuenteDistancia: "del dictamen",
  zonasA: zonas.A,
  zonasB: zonas.B,
});

function datos(extra: Partial<DatosDictamen> = {}): DatosDictamen {
  const mc = formulaMcHenry(
    { L: d.L_m.valor, A: d.A.valor, B: d.B.valor, C: d.C_m.map((x) => x.valor) },
    "kJ",
  );
  return {
    caso: c,
    calculos: {
      mcHenry: mc,
      ebsReporte,
      ebsDatos: formulaEbs(mc.calculo.energia, 1.431083),
      v3,
      comparacionTexto: "Las velocidades difieren 4.56 %: no significativa con el umbral de 10 %.",
    },
    distanciaRestos: { valor: 15.89, fuente: "del dictamen" },
    reproduccion: reproducir(c).filas,
    croquis: { imagen: "data:image/png;base64,AAAA", version: "versión de la evidencia" },
    criterios: { A: criteriosVacios(), B: criteriosVacios() },
    zonas,
    sugerencia,
    validacion: null,
    consideraciones: null,
    ...extra,
  };
}

describe("dictamen en PDF con la estructura de CESVI", () => {
  it("lleva las secciones en el orden de los dictámenes de CESVI", () => {
    const t = textOf(dictamenContenido(datos())).replace(/\s+/g, " ");
    const orden = [
      "DICTAMEN TÉCNICO DEL HECHO DE TRÁNSITO EN SU MODALIDAD DE ALCANCE",
      "Objetivos del dictamen",
      "Fundamentos del estudio",
      "Características de los vehículos",
      "Observación de daños en los vehículos",
      "Lugar de los hechos",
      "Consideraciones",
      "Conclusiones",
      "Validación del perito",
    ];
    let desde = 0;
    for (const s of orden) {
      const i = t.indexOf(s, desde);
      expect(i, s).toBeGreaterThanOrEqual(0);
      desde = i;
    }
  });

  it("los cálculos van sustituidos y las conclusiones con los números del módulo", () => {
    const t = textOf(dictamenContenido(datos())).replace(/\s+/g, " ");
    expect(t).toContain("EBS = 17.5421 m/s = 63.15 km/h");
    expect(t).toContain("V3 = 16.74 m/s = 60.27 km/h");
    expect(t).toContain("E = 225.454 kJ");
    expect(t).toContain("su velocidad de impacto es de 63.15 km/h");
    expect(t).toContain("[croquis]");
  });

  it("sin validación sale como borrador; validado, con el perito, la decisión y la conclusión", () => {
    const borrador = textOf(dictamenContenido(datos()));
    expect(borrador).toContain("BORRADOR");
    expect(borrador).toContain("Pendiente de validación del perito");
    const validado = textOf(
      dictamenContenido(
        datos({
          validacion: {
            decision: "aceptada",
            conclusion: sugerencia.texto,
            perito: "Perito de prueba",
            fecha: "2026-10-21T10:00:00Z",
          },
        }),
      ),
    );
    expect(validado).not.toContain("BORRADOR");
    expect(validado).toContain("El perito Perito de prueba aceptó la sugerencia");
    expect(validado).toContain(sugerencia.texto);
  });

  it("sin placas en el documento y con la leyenda de responsabilidad del perito en cada página", () => {
    const t = textOf(dictamenContenido(datos()));
    expect(t).not.toMatch(/[A-Z]{2}-?\d{5}/);
    expect(t).toContain("omitidas");
    const pie = dictamenDefinicion(datos()).footer as (p: number, n: number) => unknown;
    expect(textOf(pie(1, 3))).toContain(LEYENDA_DICTAMEN);
  });
});
