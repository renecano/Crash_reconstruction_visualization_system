import { describe, expect, it } from "vitest";
import {
  agrupar,
  conEntradasDeCalculo,
  dividirLote,
  ESQUEMA_CORPUS,
  expedienteDeSalida,
  medidasDeDeformacion,
  numeroEscrito,
  numerosEnCita,
  numerosEscritos,
  particionPrueba,
  problemasExpediente,
  redactar,
  unidadEscrita,
  type Expediente,
  type FilaCorpus,
} from "./corpus";

const DICTAMEN = `INFORME TÉCNICO DEL HECHO DE TRÁNSITO EN SU MODALIDAD DE ALCANCE.
El vehículo marca Mercedes Benz, tipo Sprinter, modelo 2015, con una masa de 1,450 kg.
Presenta daños en la parte posterior izquierda a una altura de 45 a 95 cm del piso, en dirección de atrás hacia adelante.
Las deformaciones medidas son C1 = 96 cm, C2 = 86 cm, C3 = 52 cm y C4 = 20 cm, con un ancho L = 168.9 cm.
La energía de deformación calculada por McHenry es de 220.19 kJ.
El conductor declaró: «di reversa unos metros y me pegó».
Se concluye que los daños no corresponden con la mecánica declarada.`;

const fila = (
  f: Partial<FilaCorpus> & Pick<FilaCorpus, "seccion" | "campo" | "valor">,
): FilaCorpus => ({
  n: 1,
  vehiculo: "ninguno",
  cita: "",
  ...f,
});

const SALIDA: FilaCorpus[] = [
  fila({
    seccion: "caso",
    campo: "modalidad",
    valor: "alcance",
    cita: "EN SU MODALIDAD DE ALCANCE",
  }),
  fila({
    seccion: "vehiculo",
    vehiculo: "V1",
    campo: "marca",
    valor: "Mercedes Benz",
    cita: "El vehículo marca Mercedes Benz, tipo Sprinter, modelo 2015",
  }),
  fila({ seccion: "vehiculo", vehiculo: "V1", campo: "anio", valor: "2015" }),
  fila({
    seccion: "vehiculo",
    vehiculo: "V1",
    campo: "masa",
    valor: "1,450 kg",
    cita: "con una masa de 1,450 kg",
  }),
  fila({
    seccion: "dano",
    vehiculo: "V1",
    campo: "cara",
    valor: "posterior",
    cita: "a una altura de 45 a 95 cm del piso, en dirección de atrás hacia adelante",
  }),
  fila({ seccion: "dano", vehiculo: "V1", campo: "tercio", valor: "izquierdo" }),
  fila({ seccion: "dano", vehiculo: "V1", campo: "altura", valor: "45 a 95 cm" }),
  fila({ seccion: "dano", vehiculo: "V1", campo: "direccion", valor: "de_atras_hacia_adelante" }),
  fila({
    seccion: "dano",
    vehiculo: "V1",
    campo: "medidas",
    valor: "C1 96, C2 86, C3 52, C4 20, L 168.9 cm",
    cita: "C1 = 96 cm, C2 = 86 cm, C3 = 52 cm y C4 = 20 cm, con un ancho L = 168.9 cm",
  }),
  fila({ seccion: "impacto", campo: "participante", valor: "V2", cita: "El conductor declaró" }),
  fila({ seccion: "impacto", campo: "participante", valor: "V1" }),
  fila({
    seccion: "calculo",
    vehiculo: "V2",
    campo: "metodo",
    valor: "mchenry",
    cita: "La energía de deformación calculada por McHenry es de 220.19 kJ",
  }),
  fila({ seccion: "calculo", vehiculo: "V2", campo: "resultado", valor: "220.19 kJ" }),
  fila({
    seccion: "declaracion",
    vehiculo: "V1",
    campo: "version",
    valor: "",
    cita: "di reversa unos metros y me pegó",
  }),
  fila({ seccion: "declaracion", vehiculo: "V1", campo: "maniobra", valor: "reversa" }),
  fila({
    seccion: "conclusion",
    campo: "veredicto",
    valor: "no_se_sostiene",
    cita: "los daños no corresponden con la mecánica declarada",
  }),
];

describe("corpus de dictámenes de CESVI (C0)", () => {
  it("el esquema es una lista plana sin uniones (cabe en la gramática de la API)", () => {
    const item = ESQUEMA_CORPUS.properties.datos.items;
    expect(item.required).toEqual(["seccion", "n", "vehiculo", "campo", "valor", "cita"]);
    expect(JSON.stringify(ESQUEMA_CORPUS)).not.toContain("anyOf");
  });

  it("lee números como están escritos: coma de miles o decimal y su unidad", () => {
    expect(numeroEscrito("1,450 kg")).toBe(1450);
    expect(numeroEscrito("0,45 m")).toBe(0.45);
    expect(numeroEscrito("")).toBeNull();
    expect(numerosEscritos("45 a 95 cm")).toEqual([45, 95]);
    expect(unidadEscrita("220.19 kJ")).toBe("kJ");
    // Miles con espacio, como en «50 600 kgs»; dos números separados no se juntan.
    expect(numeroEscrito("50 600 kgs")).toBe(50600);
    expect(unidadEscrita("50 600 kgs")).toBe("kgs");
    expect(numerosEscritos("45 95 cm")).toEqual([45, 95]);
    expect(numerosEscritos("2015 120 km")).toEqual([2015, 120]);
    expect(numerosEnCita("una masa de 1,450 kg y 0,45 m")).toEqual(
      expect.arrayContaining([1450, 0.45, 45]),
    );
  });

  it("descarta campos fuera de su sección y valores fuera del contrato", () => {
    const { grupos, invalidos } = agrupar([
      fila({ seccion: "dano", vehiculo: "V1", campo: "cara", valor: "costado" }),
      fila({ seccion: "caso", campo: "cara", valor: "frontal" }),
      fila({ seccion: "dano", vehiculo: "V1", campo: "cara", valor: "frontal" }),
    ]);
    expect(invalidos).toBe(2);
    expect(grupos).toHaveLength(1);
  });

  it("arma un expediente válido, con unidades convertidas y citas revisadas", () => {
    const { expediente: e, conteos } = expedienteDeSalida({ datos: SALIDA }, DICTAMEN);
    expect(problemasExpediente(e)).toEqual([]);
    expect(conteos).toMatchObject({ citas_fuera: 0, numeros_fuera: 0, valores_invalidos: 0 });
    // V2 solo aparece en el impacto y el cálculo: se agrega sin datos.
    expect(e.vehiculos.map((v) => v.id)).toEqual(["V1", "V2"]);
    expect(e.vehiculos[0]).toMatchObject({ anio: 2015, masa: { valor: 1450, unidad: "kg" } });
    // La marca no se redacta, aunque «Mercedes» sea también un nombre de persona.
    expect(e.vehiculos[0]!.marca!.valor).toBe("Mercedes Benz");
    const d = e.danos![0]!;
    expect(d.zona).toEqual({ cara: "posterior", tercio: "izquierdo" });
    expect(d.altura_cm).toEqual({ min: 45, max: 95 });
    expect(d.magnitud).toEqual({ c_m: [0.96, 0.86, 0.52, 0.2], l_m: 1.689 });
    expect(e.calculos![0]).toMatchObject({
      metodo: "mchenry",
      resultado: { valor: 220.19, unidad: "kJ" },
    });
    expect(e.versiones![0]).toMatchObject({
      declarante: "V1",
      maniobras: [{ vehiculo: "V1", tipo: "reversa" }],
    });
    expect(e.resultado!.conclusion!.veredicto).toBe("no_se_sostiene");
  });

  it("quita la cita que no está en el dictamen y el número que no está en su cita", () => {
    const { expediente: e, conteos } = expedienteDeSalida(
      {
        datos: [
          fila({
            seccion: "vehiculo",
            vehiculo: "V1",
            campo: "masa",
            valor: "1,500 kg",
            cita: "con una masa de 1,450 kg",
          }),
          fila({
            seccion: "conclusion",
            campo: "veredicto",
            valor: "se_sostiene",
            cita: "los daños sí corresponden",
          }),
        ],
      },
      DICTAMEN,
    );
    expect(conteos).toMatchObject({ citas: 2, citas_fuera: 1, numeros: 1, numeros_fuera: 1 });
    expect(e.vehiculos[0]!.masa).toBeUndefined();
    expect(e.resultado!.conclusion).toEqual({
      veredicto: "se_sostiene",
      fuente: "dictamen_importado",
    });
  });

  it("redacta placas y nombres en las citas, pero no la marca después de «marca»", () => {
    expect(redactar("el vehículo marca Mercedes Benz, placas ABC-123-D")).toBe(
      "el vehículo marca Mercedes Benz, placas [PLACA]",
    );
    expect(redactar("el conductor Juan Pérez García declaró")).not.toContain("Juan");
    // Placas con guion largo o en formatos que el módulo general no ve, y el número de serie.
    expect(redactar("placas MAV–1144, 263-HT-8 y 974-1P6; serie 2BEK6X2B013523787")).toBe(
      "placas [PLACA], [PLACA] y [PLACA]; serie [VIN]",
    );
    expect(redactar("con placas de circulación 12-34-ABC; otra 7437-MDB")).toBe(
      "con placas de circulación [PLACA]; otra [PLACA]",
    );
    expect(redactar("la matrícula (123-AB), No. Siniestro N12-3456-78")).toBe(
      "la matrícula ([PLACA]), No. Siniestro [NUMERO]",
    );
    // Modelos y normas que parecen placa se conservan.
    expect(redactar("tractocamión tipo FLD-120, según la NOM-012-SCT")).toBe(
      "tractocamión tipo FLD-120, según la NOM-012-SCT",
    );
  });

  it("un impacto con un solo participante queda como problema", () => {
    const { expediente } = expedienteDeSalida(
      { datos: [fila({ seccion: "impacto", campo: "participante", valor: "V1" })] },
      DICTAMEN,
    );
    expect(problemasExpediente(expediente).join()).toContain("X004");
  });

  it("divide un lote por documento, con id por huella del archivo", () => {
    const docs = dividirLote("# Document: a.pdf\n\nuno\n# Document: b.pdf\n\ndos\n");
    expect(docs.map((d) => [d.archivo, d.texto])).toEqual([
      ["a.pdf", "uno"],
      ["b.pdf", "dos"],
    ]);
    expect(docs[0]!.id).toMatch(/^cesvi-[0-9a-f]{10}$/);
  });

  it("la partición toma 30 % de cada estrato y no depende del orden de entrada", () => {
    const docs = Array.from({ length: 40 }, (_, i) => ({
      id: `d${i}`,
      modalidad: i < 20 ? "alcance" : "lateral",
      veredicto: i % 2 ? "se_sostiene" : "no_se_sostiene",
    }));
    const p = particionPrueba(docs, 7);
    expect(p).toHaveLength(12);
    expect(particionPrueba([...docs].reverse(), 7)).toEqual(p);
    expect(particionPrueba(docs, 8)).not.toEqual(p);
  });
});

describe("medidas de deformación (R4b)", () => {
  const m = (t: string) => medidasDeDeformacion(t).map((x) => [x.clave, x.valor]);

  it("lee cada C con el último número de su tramo: el resultado de la cuenta, no la referencia", () => {
    // Formatos de los reportes del corpus.
    expect(m("C1 = 85 – 45 = 45 cm = 0.45 m; C2 = 87 – 45 = 42 cm = 0.42 m")).toEqual([
      ["C1", 0.45],
      ["C2", 0.42],
    ]);
    expect(m("C1 = 74 cm – 54 cm = 20 cm, C2 = 89 cm – 54 cm = 35 cm")).toEqual([
      ["C1", 0.2],
      ["C2", 0.35],
    ]);
    expect(m("C1 0.96, C2 0.86, L 1.689 m")).toEqual([
      ["C1", 0.96],
      ["C2", 0.86],
      ["L", 1.689],
    ]);
  });

  it("sin unidad, una C mayor que 3 está en cm; una resta sin resultado no da medida", () => {
    expect(m("C1 = 47; C2 = 37")).toEqual([
      ["C1", 0.47],
      ["C2", 0.37],
    ]);
    expect(m("C1 = 85 – 45")).toEqual([]);
  });

  it("el tramo termina en el separador: lo que sigue no es medida", () => {
    expect(m("L = 1.689 m, C1 = 0.96 m y una masa de 1431.083 kg")).toEqual([
      ["L", 1.689],
      ["C1", 0.96],
    ]);
  });
});

describe("las entradas de los cálculos pasan a sus campos (R4b)", () => {
  const base: Expediente = {
    caso: {},
    vehiculos: [{ id: "V1" }, { id: "V2", masa: { valor: 1500, unidad: "kg", fuente: "perito" } }],
    danos: [
      { vehiculo: "V1", zona: { cara: "frontal" }, dano_previo: true, fuente: "perito" },
      { vehiculo: "V1", zona: { cara: "frontal" }, fuente: "perito" },
    ],
    calculos: [
      {
        metodo: "mchenry",
        vehiculo: "V1",
        cita: { texto: "L = 1.689 m; C1 = 96 cm; C2 = 86 cm" },
        entradas: [
          { nombre: "L", valor: { valor: 1.689, unidad: "m", fuente: "perito" } },
          { nombre: "C2", valor: { valor: 86, unidad: "cm", fuente: "perito" } },
          { nombre: "C1", valor: { valor: 96, unidad: "cm", fuente: "perito" } },
          { nombre: "m", valor: { valor: 1.431, unidad: "ton", fuente: "perito" } },
          { nombre: "A", valor: { valor: 52, unidad: "kN/m", fuente: "perito" } },
          { nombre: "B", valor: { valor: 345, unidad: "kN/m²", fuente: "perito" } },
        ],
      },
      {
        metodo: "ebs",
        vehiculo: "V2",
        entradas: [{ nombre: "m", valor: { valor: 900, unidad: "kg", fuente: "perito" } }],
      },
    ],
  } as unknown as Expediente;

  it("C y L van al primer daño que no es previo; la masa y la rigidez, al vehículo", () => {
    const e = conEntradasDeCalculo(base);
    expect(e.danos![0]!.magnitud).toBeUndefined();
    expect(e.danos![1]!.magnitud).toEqual({ c_m: [0.96, 0.86], l_m: 1.689 });
    const v1 = e.vehiculos[0]!;
    expect(v1.masa).toMatchObject({ valor: 1431, unidad: "kg" });
    expect(v1.rigidez).toMatchObject({ A: 52, B: 345, fuente: "perito" });
  });

  it("no pisa lo que el texto ya dice en su lugar", () => {
    const e = conEntradasDeCalculo(base);
    expect(e.vehiculos[1]!.masa!.valor).toBe(1500);
  });
});

describe("la masa en kg (R4b)", () => {
  it("«1,200 Kg» y «1.4 toneladas» quedan en kg para la verificación CESVI", () => {
    const texto = "El vehículo A pesa 1,200 Kg. El vehículo B, 1.4 toneladas.";
    const s = {
      datos: [
        fila({
          seccion: "vehiculo",
          vehiculo: "V1",
          campo: "masa",
          valor: "1,200 Kg",
          cita: "El vehículo A pesa 1,200 Kg",
        }),
        fila({
          seccion: "vehiculo",
          n: 2,
          vehiculo: "V2",
          campo: "masa",
          valor: "1.4 toneladas",
          cita: "El vehículo B, 1.4 toneladas",
        }),
      ],
    };
    const e = expedienteDeSalida(s, texto, "perito").expediente;
    expect(e.vehiculos.map((v) => v.masa && [v.masa.valor, v.masa.unidad])).toEqual([
      [1200, "kg"],
      [1400, "kg"],
    ]);
  });
});
