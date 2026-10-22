import { describe, expect, it } from "vitest";
import {
  aKmh,
  soloConclusiones,
  ESQUEMA_NARRACION,
  fugas,
  narracionDeSalida,
  type SalidaNarracion,
} from "./narracion";

const DICTAMEN = `Sobre la carretera federal 15, el vehículo tipo Tacoma presenta daños en su parte frontal derecha.
Los restos se localizan a una distancia de separación entre ellos de 15.89 metros.
La velocidad de impacto es de 63.15 km/h, y la Silverado fue impactada por alcance a 60.27 km/h.
Se concluye que la modalidad del hecho de tránsito en estudio es un alcance.
La Silverado quedó sobre el acotamiento derecho, en sentido sur a norte.`;

const salida = (c: Partial<SalidaNarracion["conclusiones"]> = {}): SalidaNarracion => ({
  descripcion:
    "El vehículo B (Tacoma) presenta daños en su parte frontal derecha. Los restos se localizan en una zona de 15.89 m.",
  conclusiones: {
    modalidad: "alcance",
    modalidad_cita: "la modalidad del hecho de tránsito en estudio es un alcance",
    zonas_contacto: [
      {
        vehiculo: "V2",
        cara: "frontal",
        tercio: "derecho",
        cita: "presenta daños en su parte frontal derecha",
      },
    ],
    secuencia: [
      { orden: 1, participantes: ["V2", "V1"], objeto_fijo: "", cita: "fue impactada por alcance" },
    ],
    velocidades: [
      {
        vehiculo: "V2",
        valor: "63.15 km/h",
        que: "velocidad de impacto",
        cita: "La velocidad de impacto es de 63.15 km/h",
      },
    ],
    posiciones_finales: [
      {
        vehiculo: "V1",
        descripcion: "sobre el acotamiento derecho",
        cita: "quedó sobre el acotamiento derecho",
      },
    ],
    ...c,
  },
});

const doc = { id: "cesvi-0000000000", archivo: "x.pdf", texto: DICTAMEN };

describe("narración sin conclusiones y conclusiones de CESVI (R0)", () => {
  it("el esquema no usa uniones (cabe en la gramática de la API)", () => {
    expect(JSON.stringify(ESQUEMA_NARRACION)).not.toContain("anyOf");
  });

  it("la revisión de fuga marca velocidades, energías, métodos y frases de conclusión", () => {
    expect(fugas("Los restos cubren 15.89 m y la altura es de 45 a 95 cm.")).toEqual([]);
    expect(fugas("Circulaba a 63.15 km/h.")).toEqual(["velocidad"]);
    expect(fugas("Una energía de 220.19 kJ por McHenry.")).toEqual(["energia", "metodo"]);
    expect(fugas("Se concluye que los daños no corresponden.")).toEqual([
      "conclusion",
      "correspondencia",
    ]);
    expect(fugas("El conductor declaró que retrocedía.")).toEqual(["declaracion"]);
    // Lo revisado a mano en la primera lectura: no adelantan ninguna conclusión del dictamen.
    expect(fugas("Hay un señalamiento restrictivo de velocidad de 40 km/h máximo.")).toEqual([]);
    expect(fugas("Una señal SR 09 (limitada a 80 km/h) antes del cruce.")).toEqual([]);
    expect(
      fugas("Hay letreros a la orilla de la carretera, que marcan 40Km/h como máximo."),
    ).toEqual([]);
    expect(
      fugas("El lugar corresponde a una curva; el vehículo se sostiene por su estructura."),
    ).toEqual([]);
    expect(fugas("El texto contiene únicamente el apartado de conclusiones.")).toEqual([]);
    // Y lo que sí adelanta el análisis.
    expect(fugas("El velocímetro registró 38 Km/h.")).toEqual(["velocidad"]);
    expect(fugas("La pintura azul corresponde en color con las impregnaciones.")).toEqual([
      "correspondencia",
    ]);
    expect(fugas("Los daños no corresponden entre sí.")).toEqual(["correspondencia"]);
  });

  it("reconoce el dictamen que solo trae las conclusiones", () => {
    expect(
      soloConclusiones("El dictamen disponible contiene únicamente el apartado de conclusiones."),
    ).toBe(true);
    expect(soloConclusiones("Los restos cubren 15.89 m.")).toBe(false);
  });

  it("lee la velocidad con su unidad y la pasa a km/h", () => {
    expect(aKmh("63.15 km/h")).toBe(63.15);
    expect(aKmh("17.5 m/s")).toBeCloseTo(63, 9);
    expect(aKmh("15.89 m")).toBeNull();
  });

  it("conserva lo citado y descarta la cita o el número que no están en el dictamen", () => {
    const n = narracionDeSalida(salida(), doc);
    expect(n.fugas).toEqual([]);
    expect(n.conclusiones).toMatchObject({
      modalidad: "alcance",
      zonas_contacto: [{ vehiculo: "V2", cara: "frontal", tercio: "derecho" }],
      secuencia: [{ orden: 1, participantes: ["V2", "V1"], objeto_fijo: null }],
      velocidades: [{ vehiculo: "V2", kmh: 63.15 }],
      posiciones_finales: [{ vehiculo: "V1" }],
    });
    const mal = narracionDeSalida(
      salida({
        modalidad_cita: "una frase que no está",
        velocidades: [
          {
            vehiculo: "V2",
            valor: "70 km/h",
            que: "impacto",
            cita: "La velocidad de impacto es de 63.15 km/h",
          },
        ],
      }),
      doc,
    );
    expect(mal.conclusiones.modalidad).toBeNull();
    expect(mal.conclusiones.velocidades).toEqual([]);
    expect(mal.conteos).toMatchObject({ citas_fuera: 1, velocidades_fuera: 1 });
  });

  it("una narración que filtra una conclusión queda marcada", () => {
    const n = narracionDeSalida(
      { ...salida(), descripcion: "La Tacoma impactó a 63.15 km/h; se concluye un alcance." },
      doc,
    );
    expect(n.fugas).toEqual(["velocidad", "conclusion"]);
  });
});
