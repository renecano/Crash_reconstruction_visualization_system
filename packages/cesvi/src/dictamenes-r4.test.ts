import { describe, expect, it } from "vitest";
import type { Expediente } from "./corpus";
import {
  comparar,
  lineasBase,
  modalidadInferida,
  resumen,
  zonasCroquis,
  type Conclusiones,
} from "./dictamenes-r4";

type Dano = NonNullable<Expediente["danos"]>[number];
const dano = (vehiculo: string, cara: string, extra: Partial<Dano> = {}): Dano =>
  ({ vehiculo, zona: { cara }, fuente: "perito", ...extra }) as Dano;
const exp = (e: Partial<Expediente> & { n?: number }): Expediente =>
  ({
    caso: {},
    vehiculos: Array.from({ length: e.n ?? 2 }, (_, k) => ({ id: `V${k + 1}` })),
    ...e,
  }) as unknown as Expediente;
const sin: Conclusiones = {
  modalidad: null,
  zonas_contacto: [],
  secuencia: [],
  velocidades: [],
  posiciones_finales: [],
};

describe("modalidad que infiere Croquis (R4)", () => {
  it("frente contra parte posterior es un alcance; frente contra frente, una frontal", () => {
    const alcance = exp({ danos: [dano("V1", "frontal"), dano("V2", "posterior")] });
    expect(modalidadInferida(alcance, "").modalidad).toBe("alcance");
    const frontal = exp({ danos: [dano("V1", "frontal"), dano("V2", "frontal")] });
    expect(modalidadInferida(frontal, "").modalidad).toBe("frontal");
    const lat = exp({ danos: [dano("V1", "frontal"), dano("V2", "lateral_derecho")] });
    expect(modalidadInferida(lat, "").modalidad).toBe("lateral");
  });

  it("los daños previos no cuentan y la cara declarada del impacto manda", () => {
    const e = exp({
      danos: [
        dano("V1", "frontal"),
        dano("V2", "frontal", { dano_previo: true }),
        dano("V2", "posterior"),
      ],
    });
    expect(modalidadInferida(e, "").modalidad).toBe("alcance");
    const conZonas = exp({
      danos: [dano("V1", "frontal"), dano("V2", "posterior")],
      impactos: [
        {
          orden: 1,
          vehiculos: ["V1", "V2"],
          zonas: [
            { vehiculo: "V1", zona: { cara: "frontal" } },
            { vehiculo: "V2", zona: { cara: "lateral_izquierdo" } },
          ],
          fuente: "perito",
        },
      ],
    });
    expect(modalidadInferida(conZonas, "").modalidad).toBe("lateral");
  });

  it("un vehículo: objeto fijo o salida del camino según la narración", () => {
    expect(modalidadInferida(exp({ n: 1 }), "Impactó contra un poste de concreto.").modalidad).toBe(
      "objeto_fijo",
    );
    expect(
      modalidadInferida(exp({ n: 1 }), "El vehículo salió del camino hacia la cuneta.").modalidad,
    ).toBe("salida_de_camino");
    expect(modalidadInferida(exp({ n: 1 }), "Sin más datos.").modalidad).toBeNull();
  });

  it("el techo dañado o un vuelco narrado es volcadura; una reversa narrada, reversa", () => {
    expect(modalidadInferida(exp({ n: 1, danos: [dano("V1", "techo")] }), "").modalidad).toBe(
      "volcadura",
    );
    expect(modalidadInferida(exp({}), "El vehículo volcó sobre su costado.").modalidad).toBe(
      "volcadura",
    );
    expect(
      modalidadInferida(exp({}), "El vehículo A realizaba maniobra de reversa.").modalidad,
    ).toBe("reversa");
  });
});

describe("comparación con lo que concluyó CESVI", () => {
  const e = exp({
    danos: [dano("V1", "frontal"), dano("V2", "posterior")],
    impactos: [
      {
        orden: 1,
        vehiculos: ["V1", "V2"],
        zonas: [{ vehiculo: "V1", zona: { cara: "frontal", tercio: "derecho" } }],
        fuente: "perito",
      },
    ],
  });

  it("zonas: las del impacto y, si no, la cara principal de cada vehículo", () => {
    expect(zonasCroquis(e)).toEqual([
      { vehiculo: "V1", cara: "frontal", tercio: "derecho" },
      { vehiculo: "V2", cara: "posterior", tercio: null },
    ]);
  });

  it("cuenta modalidad, zonas, tercios, secuencia y posiciones finales", () => {
    const c: Conclusiones = {
      ...sin,
      modalidad: "alcance",
      zonas_contacto: [
        { vehiculo: "V1", cara: "frontal", tercio: "izquierdo", cita: "" },
        { vehiculo: "V2", cara: "posterior", tercio: null, cita: "" },
        { vehiculo: "V2", cara: "lateral_derecho", tercio: null, cita: "" },
      ],
      secuencia: [{ orden: 1, participantes: ["V2", "V1"], objeto_fijo: null, cita: "" }],
      posiciones_finales: [
        { vehiculo: "V1", descripcion: "", cita: "" },
        { vehiculo: "V2", descripcion: "", cita: "" },
      ],
    };
    const r = comparar(
      c,
      e,
      [{ vehiculo: "V2", fase: "final", descripcion: "en la banqueta" }],
      "",
    );
    expect(r.modalidad).toMatchObject({ cesvi: "alcance", croquis: "alcance", coincide: true });
    expect(r.zonas).toEqual({
      cesvi: 3,
      croquis: 2,
      coinciden: 2,
      tercios_comparables: 1,
      tercios_coinciden: 0,
    });
    expect(r.secuencia).toEqual({
      cesvi: 1,
      croquis: 1,
      primero_coincide: true,
      completa_coincide: true,
    });
    expect(r.posiciones).toEqual({ cesvi: 2, croquis_las_tiene: 1 });
  });

  it("velocidades: solo las del dictamen por deformación, y sin medidas Croquis no inventa", () => {
    const c: Conclusiones = {
      ...sin,
      velocidades: [
        { vehiculo: "V1", kmh: 40, que: "velocidad equivalente de barrera por energía", cita: "" },
        { vehiculo: "V1", kmh: 60, que: "velocidad de circulación", cita: "" },
      ],
    };
    const r = comparar(c, e, [], "");
    expect(r.velocidades).toEqual([
      {
        vehiculo: "V1",
        cesvi_kmh: 40,
        que: "velocidad equivalente de barrera por energía",
        croquis_kmh: null,
        error_kmh: null,
        error_pct: null,
      },
    ]);
  });
});

describe("líneas base y resumen", () => {
  it("la modalidad más frecuente y la velocidad promedio por deformación de desarrollo", () => {
    const b = lineasBase([
      { ...sin, modalidad: "otra" },
      { ...sin, modalidad: "otra" },
      {
        ...sin,
        modalidad: "alcance",
        velocidades: [
          { vehiculo: "V1", kmh: 30, que: "por deformación", cita: "" },
          { vehiculo: "V2", kmh: 50, que: "EBS", cita: "" },
          { vehiculo: "V2", kmh: 90, que: "de circulación", cita: "" },
        ],
      },
    ]);
    expect(b).toEqual({ modalidad: "otra", velocidad_kmh: 40 });
  });

  it("el resumen pone a Croquis junto a la línea base", () => {
    const c: Conclusiones = { ...sin, modalidad: "alcance" };
    const e = exp({ danos: [dano("V1", "frontal"), dano("V2", "posterior")] });
    const r = resumen([{ conclusiones: c, comparacion: comparar(c, e, [], "") }], {
      modalidad: "otra",
      velocidad_kmh: 40,
    });
    expect(r.modalidad.croquis).toEqual({ k: 1, n: 1, pct: 100 });
    expect(r.modalidad.linea_base).toEqual({ modalidad: "otra", k: 0, n: 1, pct: 0 });
  });
});
