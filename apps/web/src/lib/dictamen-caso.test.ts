import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formato as F,
  compararDeclarada,
  conPosicion,
  escenaDeNarracion,
  especDeclarada,
  limiteDeCobertura,
  especDeExpediente,
  reconstruirExpediente,
  verificacionCesvi,
  versionDeclarada,
  type Expediente,
  type SalidaCorpus,
} from "@croquis/cesvi";
import { fullResult } from "@croquis/solver-ts";
import { describe, expect, it } from "vitest";
import {
  dictamenCasoContenido,
  dictamenCasoWord,
  LEYENDA_3D,
  type DatosDictamenCaso,
} from "./dictamen-caso";
import { terminosProhibidos } from "./terminologia";

/** Todo el texto de un contenido de pdfmake, en orden. */
function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if ("image" in o) return "[imagen]";
    return ["text", "stack", "ul", "ol", "columns", "table", "body"]
      .filter((k) => k in o)
      .map((k) => textOf(o[k]))
      .join(" ");
  }
  return "";
}

const aqui = dirname(fileURLToPath(import.meta.url));
const leer = <T>(ruta: string) => JSON.parse(readFileSync(resolve(aqui, ruta), "utf8")) as T;
const escena = leer<{ narracion: string; salida: SalidaCorpus }>(
  "../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json",
);
const decl = leer<{ declaracion: string; salida: SalidaCorpus }>(
  "../../../../data/cesvi/grabaciones/declaracion/declaracion-e2e.json",
);
const P = { lat: 19.3576, lon: -99.0625 };
const m = (n: number, e: number) => ({
  lat: P.lat + n / 111320,
  lon: P.lon + e / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});
let e: Expediente = escenaDeNarracion(escena.salida, escena.narracion).expediente;
e = conPosicion(e, { vehiculo: "V1", fase: "impacto", punto: m(-2, 0), rumbo: 0 });
e = conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(0, 2), rumbo: 90 });
e = conPosicion(e, { vehiculo: "V1", fase: "final", punto: m(4, 5), rumbo: 30 });
e = conPosicion(e, { vehiculo: "V2", fase: "final", punto: m(3, 9), rumbo: 80 });
const r = reconstruirExpediente(e, "r8");
const v = versionDeclarada(decl.salida, decl.declaracion, "V2", ["V1", "V2"]);
const filas = compararDeclarada({
  expediente: e,
  reconstruccion: r,
  declarada: v,
  resultadoDeclarado: fullResult(especDeclarada(especDeExpediente(e, "r8"), v).spec),
});

const datos = (extra: Partial<DatosDictamenCaso> = {}): DatosDictamenCaso => ({
  expediente: e,
  narracion: escena.narracion,
  reconstruccion: r,
  verificacion: verificacionCesvi(e),
  croquis: null,
  cuadros3d: [],
  declarada: null,
  validacion: null,
  estructuraCesvi: false,
  trazabilidad: { metodo: "solver de Croquis 1.9.0", huella: "abc123def456" },
  ...extra,
});
const texto = (d: DatosDictamenCaso) => textOf(dictamenCasoContenido(d)).replace(/\s+/g, " ");
const enOrden = (t: string, partes: string[]) => {
  let desde = 0;
  for (const p of partes) {
    const i = t.indexOf(p, desde);
    expect(i, p).toBeGreaterThanOrEqual(0);
    desde = i;
  }
};

describe("el dictamen de una reconstrucción (R8)", () => {
  it("en el orden de la reconstrucción: narración, resultados con rangos, verificación y trazabilidad", () => {
    const t = texto(datos());
    enOrden(t, [
      "Dictamen de la reconstrucción del hecho",
      "Narración del perito",
      "Vehículos y daños",
      "Reconstrucción física",
      "Verificación con el método de CESVI",
      "Conclusión del perito",
      "Validación",
      "huella de las entradas abc123def456",
    ]);
    expect(t).toContain("vehículo A, marca VW, tipo Jetta");
    const v1 = r.velocidades.find((x) => x.vehiculo === "V1")!.previa!;
    // La conclusión de la reconstrucción va en enteros, con su rango.
    expect(t).toContain(
      `${F.kmh(v1.mejor, "reconstruccion")} (${F.rangoKmh(v1.p10, v1.p90, "reconstruccion")})`,
    );
    expect(t).toContain("BORRADOR");
    expect(t).toContain("[el perito debe concluir]");
  }, 60_000);

  it("lleva el límite de cobertura del rango, con la cifra del índice único (Tanda 3)", () => {
    // La cifra no se escribe aquí: sale de eval/results/cifras.json y cambia sola con cada corrida.
    expect(r.limites).toContain(limiteDeCobertura());
    expect(texto(datos())).toContain(limiteDeCobertura().replace(/\s+/g, " "));
    expect(limiteDeCobertura()).toMatch(/\d+ de \d+ \(\d+\.\d %\)/);
  });

  it("con un cálculo del reporte, la reconstrucción contra él con su diferencia y su porcentaje (ADR 0091)", () => {
    expect(texto(datos())).not.toContain("La reconstrucción contra el reporte de CESVI");
    // Entrada de prueba: un EBS del reporte para V1 (no es un dato de este caso).
    const conCalculo: Expediente = {
      ...e,
      calculos: [
        {
          metodo: "ebs",
          vehiculo: "V1",
          resultado: { valor: 50, unidad: "km/h", fuente: "dictamen_importado" },
        },
      ],
    };
    const t = texto(datos({ expediente: conCalculo }));
    const v1 = r.velocidades.find((x) => x.vehiculo === "V1")!.previa!.mejor;
    enOrden(t, [
      "Reconstrucción física",
      "La reconstrucción contra el reporte de CESVI",
      `${F.diferenciaKmh(v1 - 50, "reconstruccion")} (${F.diferenciaPct(((v1 - 50) / 50) * 100, "reconstruccion")})`,
      "CESVI convierte la energía de la deformación de V1",
      "Verificación con el método de CESVI",
    ]);
  }, 60_000);

  it("con la estructura de los reportes de CESVI, cuando el perito la pide", () => {
    const conContra = texto(
      datos({
        verificacion: [{ vehiculo: "V2", pasos: [], falta: [] }] as never,
        contraDeformacion: {
          vehiculo: "V2",
          croquis: 63.9,
          cesvi: 63.15,
          difKmh: 0.75,
          difPct: 1.1876,
        },
      }),
    );
    expect(conContra).toContain(
      "Croquis 63.90 km/h y el reporte 63.15 km/h, con las mismas medidas y el mismo método; diferencia de +0.75 km/h (+1.19 %).",
    );
    const t = texto(datos({ estructuraCesvi: true }));
    enOrden(t, [
      "DICTAMEN TÉCNICO DEL HECHO DE TRÁNSITO",
      "Objetivos del dictamen",
      "Fundamentos del estudio",
      "Características de los vehículos",
      "Observación de daños en los vehículos",
      "Lugar de los hechos",
      "Consideraciones",
      "Conclusiones",
      "Validación del perito",
    ]);
  });

  it("cada cuadro del 3D dice que es ilustrativo y que el entorno no es el lugar real", () => {
    // Auditoría del 2026-11-15, I2: la leyenda del visor no sale en la captura.
    expect(LEYENDA_3D).toMatch(/ilustrativa/);
    expect(LEYENDA_3D).toMatch(/procedural/);
    expect(LEYENDA_3D).toMatch(/no es el lugar real/);
    const cuadros3d = ["Antes del impacto (−1 s)", "En el impacto (0 s)", "En reposo (+3.2 s)"].map(
      (etiqueta) => ({ etiqueta, imagen: "data:image/png;base64,AAAA" }),
    );
    const t = texto(datos({ cuadros3d }));
    for (const c of cuadros3d) expect(t).toContain(`${c.etiqueta}. ${LEYENDA_3D}`);
    expect(texto(datos())).not.toContain(LEYENDA_3D);
  });

  it("el lugar, las zonas y las direcciones van bien escritos", () => {
    // Las erratas del dictamen de AXA: «…no da coordenadas., Ahome», «de atras» y «posterior,
    // posterior izquierdo».
    const conLugar: Expediente = {
      ...e,
      caso: {
        ...e.caso,
        lugar: {
          ...e.caso.lugar,
          descripcion: {
            valor: "Ubicación ilustrativa sobre MEX 15D: el reporte no da coordenadas.",
            fuente: "supuesto",
          },
          municipio: { valor: "Ahome", fuente: "narracion" },
          estado: { valor: "Sinaloa", fuente: "narracion" },
        },
      },
      danos: [
        {
          vehiculo: "V1",
          zona: { cara: "posterior", tercio: "izquierdo", vertice: "posterior_izquierdo" },
          direcciones: ["de_atras_hacia_adelante"],
        },
      ],
    } as unknown as Expediente;
    const t = texto(datos({ expediente: conLugar }));
    expect(t).toContain(
      "Ahome, Sinaloa. Ubicación ilustrativa sobre MEX 15D: el reporte no da coordenadas.",
    );
    expect(t).not.toMatch(/\.,/);
    expect(t).toContain("posterior, tercio izquierdo, vértice posterior izquierdo");
    expect(t).toContain("de atrás hacia adelante");
    expect(t).not.toContain("atras");
  });

  it("con cuadros del 3D, la atribución CC-BY de los vehículos de Sketchfab (R10)", () => {
    const t = texto(
      datos({
        cuadros3d: [{ etiqueta: "Instante del impacto", imagen: "data:image/png;base64,AAAA" }],
        modelos3d: [
          {
            modelo: "Kiri '10",
            autor: "Daniel Zhabotinsky",
            licencia: "CC-BY 4.0",
            url: "https://sketchfab.com/3d-models/7fd6e15785fa4aa9bfd6e31eb7c97ba6",
          },
        ],
      }),
    );
    expect(t).toContain(
      "Vehículos 3D: «Kiri '10» de Daniel Zhabotinsky (CC-BY 4.0, https://sketchfab.com/",
    );
    // Sin cuadros del 3D, no hay atribución que dar.
    expect(texto(datos())).not.toContain("Vehículos 3D");
  });

  it("validado: la conclusión y el nombre del perito, sin borrador", () => {
    const t = texto(
      datos({
        validacion: {
          perito: "Perito de prueba",
          conclusion: "Conclusión de prueba del perito.",
          fecha: "2026-10-23T10:00:00Z",
        },
      }),
    );
    expect(t).not.toContain("BORRADOR");
    expect(t).toContain("Conclusión de prueba del perito.");
    expect(t).toContain("Validó: Perito de prueba");
  });

  it("lleva la comparación con la declaración si se usó, y la sugerencia solo si se pidió", () => {
    const sin = texto(datos({ declarada: { declarante: "V2", filas, sugerencia: null } }));
    expect(sin).toContain("Comparación con la declaración del conductor");
    expect(sin).toContain("Es lo que dice el conductor, no evidencia.");
    expect(sin).not.toContain("Sugerencia de Croquis");
    const con = texto(
      datos({
        declarada: {
          declarante: "V2",
          filas,
          sugerencia: { texto: "Texto de la sugerencia.", decision: "descartada" },
        },
      }),
    );
    expect(con).toContain("Sugerencia de Croquis, pedida por el perito: Texto de la sugerencia.");
    expect(con).toContain("El perito descartó la sugerencia.");
    expect(texto(datos())).not.toContain("Comparación con la declaración del conductor");
  });

  it("no llama dictamen al reporte de CESVI y el Word sale con el mismo contenido", async () => {
    for (const estructuraCesvi of [false, true])
      expect(terminosProhibidos(texto(datos({ estructuraCesvi })))).toEqual([]);
    const docx = await dictamenCasoWord(datos());
    expect(String.fromCharCode(docx[0]!, docx[1]!)).toBe("PK");
  });

  it("el croquis dice si va sobre las calles del mapa o a escala sin mapa (R8b)", () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    expect(texto(datos({ croquis: png, croquisSobreMapa: true }))).toContain(
      "sobre el mapa (calles de OpenStreetMap)",
    );
    expect(texto(datos({ croquis: png }))).toContain("Croquis a escala de la reconstrucción");
    expect(texto(datos())).not.toContain("Croquis a escala");
  });

  it("lleva los supuestos declarados con su justificación y su incertidumbre (ADR 0091)", () => {
    const supuestos = [
      {
        clave: "reposo-V2",
        que: "Posición final de V2",
        valor: "la que se colocó en el mapa",
        justificacion: "Supuesto del método de restos de CESVI.",
        incertidumbre: "±10 m: 10 veces la de una posición medida.",
      },
    ];
    const t = texto(datos({ supuestos }));
    enOrden(t, [
      "Reconstrucción física",
      "Supuestos declarados",
      "Posición final de V2: la que se colocó en el mapa",
      "Supuesto del método de restos de CESVI.",
      "±10 m",
    ]);
    expect(t).not.toMatch(/falta pedir|dato pendiente/i);
    expect(texto(datos())).not.toContain("Supuestos declarados");
  });

  it("lleva la bitácora de los agentes en la trazabilidad (R12b), en orden", () => {
    const bitacora = [
      {
        n: 1,
        de: "lector" as const,
        para: "pizarra" as const,
        tipo: "escribe" as const,
        texto: "Lectura: 30 filas con su cita.",
      },
      {
        n: 2,
        de: "fisico" as const,
        para: "preguntador" as const,
        tipo: "pide" as const,
        texto: "La física no cuadra (velocidad_vs_evidencia): pide evidencia al perito.",
      },
    ];
    const t = texto(datos({ bitacora }));
    enOrden(t, [
      "huella de las entradas abc123def456",
      "Bitácora de los agentes",
      "1 · Lector IA (escribe): Lectura: 30 filas con su cita.",
      "2 · Físico a Preguntador (pide): La física no cuadra",
    ]);
    // La fuente del PDF (Roboto) no trae flechas: salían como un hueco («Físico  Preguntador»).
    expect(t).not.toMatch(/[\u2190-\u21ff]/);
    expect(texto(datos())).not.toContain("Bitácora de los agentes");
  });
});
