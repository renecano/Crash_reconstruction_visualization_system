import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { FilaCorpus, SalidaCorpus } from "./corpus";
import {
  confirmarImpacto,
  conMasa,
  conPosicion,
  conRestos,
  escenaDeNarracion,
  problemasExpediente,
} from "./escena-narracion";

const GRABACIONES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../data/cesvi/grabaciones/escenas",
);

const fila = (
  f: Partial<FilaCorpus> & Pick<FilaCorpus, "seccion" | "campo" | "valor">,
): FilaCorpus => ({ n: 1, vehiculo: "ninguno", cita: "", ...f });

const NARRACION = `El vehículo A, tipo Tsuru, presenta daños en su parte frontal. El vehículo B, tipo Sentra, presenta daños en su costado derecho. Los restos se localizan en una zona de 12.4 m. El vehículo B queda sobre la banqueta norte.`;

const datos = (extra: FilaCorpus[] = []): SalidaCorpus => ({
  datos: [
    fila({
      seccion: "vehiculo",
      vehiculo: "V1",
      campo: "modelo",
      valor: "Tsuru",
      cita: "El vehículo A, tipo Tsuru",
    }),
    fila({
      seccion: "vehiculo",
      n: 2,
      vehiculo: "V2",
      campo: "modelo",
      valor: "Sentra",
      cita: "El vehículo B, tipo Sentra",
    }),
    fila({
      seccion: "dano",
      vehiculo: "V1",
      campo: "cara",
      valor: "frontal",
      cita: "presenta daños en su parte frontal",
    }),
    fila({
      seccion: "dano",
      n: 2,
      vehiculo: "V2",
      campo: "cara",
      valor: "lateral_derecho",
      cita: "presenta daños en su costado derecho",
    }),
    fila({
      seccion: "restos",
      campo: "longitud",
      valor: "12.4 m",
      cita: "Los restos se localizan en una zona de 12.4 m",
    }),
    fila({
      seccion: "posicion",
      vehiculo: "V2",
      campo: "fase",
      valor: "final",
      cita: "El vehículo B queda sobre la banqueta norte",
    }),
    fila({
      seccion: "posicion",
      vehiculo: "V2",
      campo: "descripcion",
      valor: "sobre la banqueta norte",
    }),
    ...extra,
  ],
});

describe("de la narración del perito a la escena (R1)", () => {
  it("todo sale con fuente perito, y la posición final queda en palabras para el mapa", () => {
    const e = escenaDeNarracion(datos(), NARRACION);
    expect(e.problemas).toEqual([]);
    expect(e.expediente.danos!.every((d) => d.fuente === "perito")).toBe(true);
    expect(e.expediente.evidencias!.restos!.longitud).toMatchObject({
      valor: 12.4,
      fuente: "perito",
    });
    expect(e.posiciones).toEqual([
      expect.objectContaining({
        vehiculo: "V2",
        fase: "final",
        descripcion: "sobre la banqueta norte",
      }),
    ]);
  });

  it("sin impacto narrado, propone el único posible como supuesto y pide confirmarlo", () => {
    const e = escenaDeNarracion(datos(), NARRACION);
    expect(e.expediente.impactos).toEqual([
      {
        orden: 1,
        vehiculos: ["V1", "V2"],
        zonas: [
          { vehiculo: "V1", zona: { cara: "frontal" } },
          { vehiculo: "V2", zona: { cara: "lateral_derecho" } },
        ],
        fuente: "supuesto",
      },
    ]);
    expect(e.preguntas[0]!.clave).toBe("impacto-propuesto");
    // Lo demás que falta, en orden: masas y la posición final de A (la de B sí está).
    expect(e.preguntas.map((p) => p.clave)).toEqual([
      "impacto-propuesto",
      "masa-V1",
      "masa-V2",
      "final-V1",
    ]);
  });

  it("con daños en dos caras no supone nada: pregunta", () => {
    const e = escenaDeNarracion(
      datos([
        fila({
          seccion: "dano",
          n: 3,
          vehiculo: "V1",
          campo: "cara",
          valor: "posterior",
          cita: "El vehículo A, tipo Tsuru",
        }),
      ]),
      NARRACION,
    );
    expect(e.expediente.impactos).toBeUndefined();
    expect(e.preguntas[0]!.clave).toBe("impactos");
  });

  it("un impacto narrado toma la zona de cada participante si no es ambigua", () => {
    const e = escenaDeNarracion(
      datos([
        fila({
          seccion: "impacto",
          campo: "participante",
          valor: "V1",
          cita: "El vehículo A, tipo Tsuru",
        }),
        fila({ seccion: "impacto", campo: "participante", valor: "V2" }),
      ]),
      NARRACION,
    );
    expect(e.expediente.impactos![0]!.zonas).toHaveLength(2);
    expect(e.expediente.impactos![0]!.fuente).toBe("perito");
    expect(e.preguntas.some((p) => p.clave.startsWith("zona-"))).toBe(false);
  });

  it("las 10 narraciones grabadas de E-R1 dan escenas válidas (sin la API)", () => {
    const archivos = readdirSync(GRABACIONES).filter((f) => f.endsWith(".json"));
    expect(archivos).toHaveLength(10);
    const modalidades = new Set<string>();
    for (const f of archivos) {
      const g = JSON.parse(readFileSync(join(GRABACIONES, f), "utf8")) as {
        modalidad_c0: string;
        narracion: string;
        salida: SalidaCorpus;
      };
      modalidades.add(g.modalidad_c0);
      const e = escenaDeNarracion(g.salida, g.narracion);
      expect(e.problemas, f).toEqual([]);
      expect(e.expediente.vehiculos.length, f).toBeGreaterThan(0);
    }
    expect(modalidades.size).toBe(10);
  });
});

describe("lo que corrige el perito en la escena", () => {
  const base = escenaDeNarracion(datos(), NARRACION).expediente;

  it("coloca cada vehículo por fase en la versión de la evidencia, con fuente perito", () => {
    let e = conPosicion(base, {
      vehiculo: "V1",
      fase: "final",
      punto: { lat: 19.3, lon: -99.1 },
      rumbo: 370,
    });
    e = conPosicion(e, {
      vehiculo: "V1",
      fase: "final",
      punto: { lat: 19.31, lon: -99.1 },
      rumbo: 90,
    });
    e = conPosicion(e, {
      vehiculo: "V2",
      fase: "impacto",
      punto: { lat: 19.3, lon: -99.11 },
      rumbo: 0,
    });
    const v = e.versiones!.find((x) => x.tipo === "evidencia")!;
    expect(v.posiciones).toEqual([
      {
        vehiculo: "V1",
        fase: "final",
        punto: { lat: 19.31, lon: -99.1 },
        rumbo: 90,
        fuente: "perito",
      },
      {
        vehiculo: "V2",
        fase: "impacto",
        punto: { lat: 19.3, lon: -99.11 },
        rumbo: 0,
        fuente: "perito",
      },
    ]);
    expect(problemasExpediente(e)).toEqual([]);
  });

  it("masa, restos y la confirmación del impacto supuesto quedan con fuente perito", () => {
    const e = confirmarImpacto(conRestos(conMasa(base, "V2", 1350), 14), 1);
    expect(e.vehiculos.find((v) => v.id === "V2")!.masa).toEqual({
      valor: 1350,
      unidad: "kg",
      fuente: "perito",
    });
    expect(e.evidencias!.restos!.longitud).toEqual({ valor: 14, unidad: "m", fuente: "perito" });
    expect(e.impactos![0]!.fuente).toBe("perito");
    expect(problemasExpediente(e)).toEqual([]);
  });
});
