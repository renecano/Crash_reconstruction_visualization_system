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

  it("un vehículo: vuelco, objeto golpeado, salida del camino o golpe por detrás", () => {
    const uno = (danos: Dano[] = []) => exp({ n: 1, danos });
    expect(modalidadInferida(uno(), "El vehículo volcó sobre su costado.").modalidad).toBe(
      "volcadura",
    );
    expect(modalidadInferida(uno(), "Impactó contra un poste de concreto.").modalidad).toBe(
      "objeto_fijo",
    );
    expect(
      modalidadInferida(uno(), "El vehículo salió del camino hacia la cuneta.").modalidad,
    ).toBe("salida_de_camino");
    expect(modalidadInferida(uno([dano("V1", "posterior")]), "").modalidad).toBe("alcance");
    expect(modalidadInferida(uno(), "Sin más datos.").modalidad).toBeNull();
    // Un objeto que solo se nombra (los postes del camellón) no dice que se golpeó: en R4b es el
    // último recurso, con su motivo, y su precisión se publica aparte (ADR 0069).
    expect(modalidadInferida(uno(), "La avenida tiene un camellón central con postes.")).toEqual({
      modalidad: "objeto_fijo",
      motivo: "un vehículo y un objeto fijo nombrado",
    });
    // El techo en la narración de un solo vehículo apunta a un vuelco (R4b, desarrollo).
    expect(modalidadInferida(uno(), "El toldo presenta hundimiento.").modalidad).toBe("volcadura");
  });

  it("la dirección de la deformación decide la cara de contacto; el techo solo no es vuelco", () => {
    // V2: daño frontal leve y uno en la parte posterior que entra de atrás hacia adelante.
    const e = exp({
      danos: [
        dano("V1", "frontal", { direcciones: ["de_adelante_hacia_atras"] }),
        dano("V2", "frontal"),
        dano("V2", "posterior", { direcciones: ["de_atras_hacia_adelante"] }),
        dano("V2", "techo"),
      ],
    });
    expect(modalidadInferida(e, "").modalidad).toBe("alcance");
  });

  it("frente contra frente con una parte posterior dañada es un alcance con empuje", () => {
    const e = exp({
      danos: [dano("V1", "frontal"), dano("V2", "frontal"), dano("V2", "posterior")],
    });
    expect(modalidadInferida(e, "").modalidad).toBe("alcance");
    const frontal = exp({ danos: [dano("V1", "frontal"), dano("V2", "frontal")] });
    expect(modalidadInferida(frontal, "").modalidad).toBe("frontal");
    // Solo se conoce la cara de uno.
    expect(modalidadInferida(exp({ danos: [dano("V2", "posterior")] }), "").modalidad).toBe(
      "alcance",
    );
  });

  it("una reversa narrada con la parte posterior en el contacto", () => {
    const e = exp({ danos: [dano("V1", "posterior"), dano("V2", "frontal")] });
    expect(modalidadInferida(e, "El vehículo A realizaba maniobra de reversa.").modalidad).toBe(
      "reversa",
    );
    const sinPosterior = exp({ danos: [dano("V1", "frontal"), dano("V2", "lateral_derecho")] });
    expect(modalidadInferida(sinPosterior, "Había hecho reversa antes.").modalidad).toBe("lateral");
  });

  it("R4d: la pieza «de reversa» o «el reverso» no es una maniobra en reversa", () => {
    const e = exp({ danos: [dano("V1", "posterior"), dano("V2", "frontal")] });
    for (const t of [
      "El sensor de reversa central no está en su posición.",
      "La luz de reversa está rota.",
      "Color negro en el reverso de la moldura.",
    ])
      expect(modalidadInferida(e, t).modalidad).toBe("alcance");
    expect(modalidadInferida(e, "El vehículo A retrocedió hacia la calle.").modalidad).toBe(
      "reversa",
    );
    expect(modalidadInferida(e, "Circulaba en reversa.").modalidad).toBe("reversa");
  });

  it("R4d: un vehículo con incendio o daño mecánico del motor es «otra»", () => {
    const uno = (danos: Dano[] = []) => exp({ n: 1, danos });
    // El incendio va antes que el techo dañado por el fuego.
    expect(
      modalidadInferida(uno([dano("V1", "techo")]), "Se observa el vehículo calcinado.").modalidad,
    ).toBe("otra");
    expect(modalidadInferida(uno(), "El motor presenta daños en la biela.")).toEqual({
      modalidad: "otra",
      motivo: "un vehículo con un daño mecánico del motor",
    });
    // Un vuelco descrito o un golpe contra un objeto mandan sobre la mención del motor.
    expect(modalidadInferida(uno(), "El vehículo volcó; hay daños en el motor.").modalidad).toBe(
      "volcadura",
    );
    expect(
      modalidadInferida(uno(), "Impactó contra un poste; el motor presenta daños.").modalidad,
    ).toBe("objeto_fijo");
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
    expect(b).toEqual({ modalidad: "otra", modalidad_fisica: "alcance", velocidad_kmh: 40 });
  });

  it("el resumen pone a Croquis junto a la línea base", () => {
    const c: Conclusiones = { ...sin, modalidad: "alcance" };
    const e = exp({ danos: [dano("V1", "frontal"), dano("V2", "posterior")] });
    const r = resumen([{ conclusiones: c, comparacion: comparar(c, e, [], "") }], {
      modalidad: "otra",
      modalidad_fisica: "alcance",
      velocidad_kmh: 40,
    });
    expect(r.modalidad.croquis).toEqual({ k: 1, n: 1, pct: 100 });
    expect(r.modalidad.linea_base).toEqual({ modalidad: "otra", k: 0, n: 1, pct: 0 });
    expect(r.modalidad.fisicas.linea_base).toEqual({ modalidad: "alcance", k: 1, n: 1, pct: 100 });
  });
});

describe("reglas de R4b (ADR 0069)", () => {
  it("la reversa sale de la maniobra que narra la lectura, aunque el texto no diga «reversa»", () => {
    const e = exp({
      danos: [dano("V1", "posterior"), dano("V2", "frontal")],
      versiones: [{ tipo: "evidencia", maniobras: [{ vehiculo: "V1", tipo: "reversa" }] }],
    });
    expect(modalidadInferida(e, "").modalidad).toBe("reversa");
    // Sin la maniobra, la misma configuración es un alcance.
    expect(modalidadInferida({ ...e, versiones: undefined }, "").modalidad).toBe("alcance");
  });

  it("«otra» solo con evidencia de un hecho sin choque, nunca por descarte", () => {
    const incendio = exp({ n: 1, danos: [dano("V1", "frontal")] });
    expect(
      modalidadInferida(incendio, "El vehículo resultó calcinado por el incendio.").modalidad,
    ).toBe("otra");
    expect(
      modalidadInferida(incendio, "El vehículo presenta daños en el frente.").modalidad,
    ).toBeNull();
  });

  it("el resumen cuenta cada «otra» que predice Croquis, acierte o no", () => {
    const fila = (cesvi: string, texto: string) => {
      const e = exp({ n: 1, danos: [dano("V1", "frontal")] });
      const c = { ...sin, modalidad: cesvi };
      return { conclusiones: c, comparacion: comparar(c, e, [], texto) };
    };
    const r = resumen(
      [fila("otra", "incendio"), fila("objeto_fijo", "incendio"), fila("otra", "sin nada")],
      lineasBase([{ ...sin, modalidad: "otra" }]),
    );
    expect(r.modalidad.otra_predicha).toEqual({ k: 1, n: 2, pct: 50 });
  });
});
