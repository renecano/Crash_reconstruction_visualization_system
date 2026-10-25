import { describe, expect, it } from "vitest";
import type { Expediente } from "./corpus";
import { reconstruccionContraCesvi } from "./contra-metodos";
import type { Reconstruccion } from "./reconstruccion";

/** Los cálculos de AXA A2010930 como los lee el importador (reporte de CESVI). */
const expediente = {
  calculos: [
    { metodo: "mchenry", vehiculo: "V2" },
    {
      metodo: "ebs",
      vehiculo: "V2",
      entradas: [{ nombre: "m", valor: { valor: 1431.083, unidad: "kg" } }],
      resultado: { valor: 63.15, unidad: "km/h", fuente: "dictamen_importado" },
    },
    {
      metodo: "desplazamiento",
      vehiculo: "V1",
      entradas: [
        { nombre: "D", valor: { valor: 15.89, unidad: "m" } },
        { nombre: "a", valor: { valor: 0.9, unidad: "-" } },
      ],
      resultado: { valor: 60.27, unidad: "km/h", fuente: "dictamen_importado" },
    },
  ],
} as unknown as Expediente;

/** Una reconstrucción de prueba: V2 = veh-a a 43.39 km/h; V1 = veh-b sale del impacto a 11 m/s. */
function reconstruccion(conBandera: boolean): Reconstruccion {
  return {
    ids: { "veh-a": "V2", "veh-b": "V1" },
    velocidades: [
      { vehiculo: "V2", previa: { mejor: 43.39 }, impacto: null },
      { vehiculo: "V1", previa: { mejor: 38.69 }, impacto: null },
    ],
    resultado: {
      vehiculos: [
        { id: "veh-b", trayectoria: { t: [-0.02, 0, 0.02], vx: [9, 9, 11], vy: [0, 0, 0] } },
      ],
      parametros: { arrastre_post_impacto: { valor: 0.35 } },
      consistencia: conBandera
        ? [
            {
              codigo: "dano_no_alcanzado",
              mensaje: "…",
              datos: {
                vehiculo: "veh-a",
                dano_minimo_kmh: [29.71, 81.62],
                reconstruccion_kmh: 2.95,
              },
            },
          ]
        : [],
    },
  } as unknown as Reconstruccion;
}

describe("la reconstrucción contra los métodos del reporte de CESVI (ADR 0091)", () => {
  it("cada velocidad del reporte con la de la reconstrucción, su diferencia y su porcentaje", () => {
    const r = reconstruccion(false);
    // Las trayectorias con las velocidades ajustadas, como las del 3D (aquí, las de prueba).
    const { filas } = reconstruccionContraCesvi(expediente, r, r.resultado);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({
      vehiculo: "V2",
      metodo: "Deformación (EBS)",
      cesviKmh: 63.15,
      croquisKmh: 43.39,
      diferenciaKmh: -19.76,
      diferenciaPct: -31.29,
    });
    // Los restos dan la velocidad de V1 al salir del impacto: se compara con esa, no con la previa.
    expect(filas[1]).toMatchObject({
      vehiculo: "V1",
      cesviKmh: 60.27,
      croquisKmh: 39.6,
      diferenciaKmh: -20.67,
      diferenciaPct: -34.3,
    });
    expect(filas[1]!.porQue).toContain("15.89 m con a = 0.9");
    expect(filas[1]!.porQue).toContain("arrastre de 0.35");
  });

  it("sin la velocidad en la reconstrucción no hay diferencia que mostrar", () => {
    const r = reconstruccion(false);
    r.velocidades[0]!.previa = null;
    const [def] = reconstruccionContraCesvi(expediente, r, r.resultado).filas;
    expect(def).toMatchObject({ croquisKmh: null, diferenciaKmh: null, diferenciaPct: null });
  });

  it("si el solver no alcanza la deformación medida, lo avisa con sus números y el vehículo del perito", () => {
    expect(reconstruccionContraCesvi(expediente, reconstruccion(false), {}).avisos).toEqual([]);
    const [aviso] = reconstruccionContraCesvi(expediente, reconstruccion(true), {}).avisos;
    expect(aviso).toContain("deformación medida de V2");
    expect(aviso).toContain("30–82 km/h");
    expect(aviso).toContain("es de 3 km/h");
  });
});
