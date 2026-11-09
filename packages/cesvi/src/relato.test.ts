import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SalidaCorpus } from "./corpus";
import { escenaDeNarracion } from "./escena-narracion";
import {
  conVocabulario,
  EJEMPLO_RELATO,
  minimoParaReconstruir,
  revisarRelato,
  supuestosDeClase,
  vehiculosMencionados,
} from "./relato";

/** Lecturas reales de producción (claude-sonnet-5-5, escena-narracion-v2), grabadas el 2026-11-09. */
const GRABADAS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../data/cesvi/grabaciones/relatos-w2",
);
const grabada = (n: string) =>
  JSON.parse(readFileSync(join(GRABADAS, `${n}.json`), "utf8")) as {
    narracion: string;
    salida: SalidaCorpus;
  };

describe("revisarRelato: contenido real, no solo longitud (O1)", () => {
  it("rechaza «gggg…» sin gastar API, con un mensaje amable y un ejemplo", () => {
    const r = revisarRelato("gggggggggggggggggggggggggggggggggggggggg");
    expect(r.suficiente).toBe(false);
    expect(r.mensaje).toContain("Por ejemplo");
    expect(r.mensaje).toContain(EJEMPLO_RELATO);
  });

  it.each([
    ["gggg gggg gggg gggg gggg gggg gggg gggg", "sin_palabras"],
    ["asdf qwer zxcv uiop hjkl bnm asdf qwer zxcv", "sin_palabras"],
    ["choque choque choque choque choque choque choque choque choque choque", "repetido"],
    ["12345 67890 !!!! ???? #### $$$$ 1234 5678 %%%%", "simbolos"],
    ["hola", "corto"],
    ["jajajajajaja jejejeje jijijiji jojojojo jujujuju lalalala", "sin_frases"],
  ])("rechaza %j por %s", (texto, motivo) => {
    const r = revisarRelato(texto);
    expect(r.suficiente).toBe(false);
    expect(r.motivo).toBe(motivo);
  });

  it.each([
    "En el zócalo de la Ciudad de México una combi colisiona con un pickup lobo en su parte trasera derecha",
    EJEMPLO_RELATO,
    "V1 circulaba a 60 km/h por la Av. Tollocan, km 4+200, y fue impactado por V2 en su costado izquierdo.",
    "un vocho le pegó por atrás a un pesero en insurgentes",
  ])("acepta un relato real: %j", (texto) => {
    expect(revisarRelato(texto).suficiente).toBe(true);
  });

  it("acepta las 6 narraciones grabadas", () => {
    for (const n of [
      "zocalo",
      "vocho-pesero",
      "torton-motoneta",
      "pipa-taxi",
      "trailer-urvan",
      "micro-volteo",
    ])
      expect(revisarRelato(grabada(n).narracion).suficiente, n).toBe(true);
  });
});

describe("vocabulario mexicano de vehículos (O5)", () => {
  it("reconoce las palabras del plan con su clase", () => {
    const clases = Object.fromEntries(
      vehiculosMencionados(
        "combi pesero micro microbús vocho urvan torton rabón tráiler pipa volteo motoneta taxi",
      ).map((m) => [m.texto, m.clase]),
    );
    expect(clases).toEqual({
      combi: "microbus_combi",
      pesero: "microbus_combi",
      micro: "microbus_combi",
      microbús: "microbus_combi",
      vocho: "sedan_compacto",
      urvan: "van",
      torton: "camion_unitario",
      rabón: "camion_unitario",
      tráiler: "tractocamion",
      pipa: "camion_unitario",
      volteo: "camion_unitario",
      motoneta: "motocicleta",
      taxi: "sedan_compacto",
    });
  });

  it("los nombres comerciales no son clases: «lobo» no se reconoce", () => {
    const m = vehiculosMencionados("una combi colisiona con un pickup lobo");
    expect(m.map((x) => x.texto)).toEqual(["combi", "pickup"]);
  });

  it("no ve vehículos dentro de otras palabras", () => {
    expect(vehiculosMencionados("el microscopio y la participación del automovilista")).toEqual([]);
  });
});

describe("conVocabulario, con lecturas grabadas", () => {
  it("zócalo: la combi es V1 y el pickup es V2, cada uno con su mención", () => {
    const g = grabada("zocalo");
    const { menciones } = conVocabulario(g.salida, g.narracion);
    expect(menciones.map((m) => [m.vehiculo, m.texto])).toEqual([
      ["V1", "combi"],
      ["V2", "pickup"],
    ]);
    expect(menciones.every((m) => !m.claseSupuesta)).toBe(true);
    const e = escenaDeNarracion(g.salida, g.narracion);
    expect(e.expediente.vehiculos.map((v) => [v.id, v.clase, v.modelo?.valor])).toEqual([
      ["V1", "microbus_combi", undefined],
      ["V2", "pickup", "lobo"],
    ]);
    expect(e.menciones?.map((m) => m.vehiculo)).toEqual(["V1", "V2"]);
  });

  it("vocho: la lectura no da su clase y entra la más cercana, como supuesto declarado", () => {
    const g = grabada("vocho-pesero");
    expect(g.salida.datos.some((d) => d.vehiculo === "V1" && d.campo === "clase")).toBe(false);
    const e = escenaDeNarracion(g.salida, g.narracion);
    expect(e.expediente.vehiculos.map((v) => v.clase)).toEqual([
      "sedan_compacto",
      "microbus_combi",
    ]);
    const s = supuestosDeClase(e.menciones ?? []);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ clave: "clase-V1", valor: "sedán compacto", vehiculo: "V1" });
    expect(s[0]!.justificacion).toContain("«vocho»");
    // Con la clase puesta ya no se pregunta por ella.
    expect(e.preguntas.some((p) => p.clave === "clase-V1")).toBe(false);
  });

  it("motoneta: manda el vocabulario sobre «scooter», que es el patín eléctrico", () => {
    const g = grabada("torton-motoneta");
    expect(g.salida.datos.find((d) => d.vehiculo === "V2" && d.campo === "clase")?.valor).toBe(
      "scooter",
    );
    const e = escenaDeNarracion(g.salida, g.narracion);
    expect(e.expediente.vehiculos.map((v) => v.clase)).toEqual(["camion_unitario", "motocicleta"]);
    expect(supuestosDeClase(e.menciones ?? []).map((s) => s.clave)).toEqual(["clase-V2"]);
  });

  it("taxi: la lectura lo nombra sin darle una sola fila, y aun así recibe su mención y su clase", () => {
    const g = grabada("pipa-taxi");
    expect(g.salida.datos.some((d) => d.seccion === "vehiculo" && d.vehiculo === "V2")).toBe(false);
    const e = escenaDeNarracion(g.salida, g.narracion);
    expect(e.expediente.vehiculos.map((v) => [v.id, v.clase])).toEqual([
      ["V1", "camion_unitario"],
      ["V2", "sedan_compacto"],
    ]);
    expect(e.menciones?.map((m) => [m.vehiculo, m.texto])).toEqual([
      ["V1", "pipa"],
      ["V2", "taxi"],
    ]);
    // La pipa trae clase de la lectura (no es supuesto del vocabulario); el taxi sí lo es.
    expect(supuestosDeClase(e.menciones ?? []).map((s) => s.clave)).toEqual(["clase-V2"]);
  });

  it("tres vehículos: tráiler, urvan y rabón, cada uno con la suya", () => {
    const g = grabada("trailer-urvan");
    const e = escenaDeNarracion(g.salida, g.narracion);
    expect(e.menciones?.map((m) => [m.vehiculo, m.texto])).toEqual([
      ["V1", "tráiler"],
      ["V2", "urvan"],
      ["V3", "rabón"],
    ]);
  });

  it("el micro que no chocó no se vuelve un vehículo", () => {
    const g = grabada("micro-volteo");
    const e = escenaDeNarracion(g.salida, g.narracion);
    expect(e.expediente.vehiculos).toHaveLength(2);
    expect(e.menciones?.map((m) => [m.vehiculo, m.texto])).toEqual([
      ["V1", "microbús"],
      ["V2", "camión de volteo"],
    ]);
  });

  it("no cambia la salida que recibe", () => {
    const g = grabada("pipa-taxi");
    const antes = JSON.stringify(g.salida);
    conVocabulario(g.salida, g.narracion);
    expect(JSON.stringify(g.salida)).toBe(antes);
  });
});

describe("lo mínimo para reconstruir", () => {
  it("sin vehículos no hay nada que reconstruir", () => {
    const e = escenaDeNarracion(
      { datos: [] },
      "El clima estaba despejado y la calle es de doble sentido.",
    );
    const m = minimoParaReconstruir(e.expediente);
    expect(m.nivel).toBe("nada");
    expect(m.faltan[0]).toBe("qué vehículo participó");
  });

  it("el zócalo alcanza: dos vehículos, zona de contacto y lugar", () => {
    const g = grabada("zocalo");
    const m = minimoParaReconstruir(escenaDeNarracion(g.salida, g.narracion).expediente);
    expect(m).toMatchObject({ nivel: "completo", faltan: [] });
  });

  it("un vehículo solo, sin lugar ni impacto, es parcial y dice qué falta", () => {
    const e = escenaDeNarracion(
      {
        datos: [
          { seccion: "vehiculo", n: 1, vehiculo: "V1", campo: "clase", valor: "pickup", cita: "" },
        ],
      },
      "Una pickup circulaba.",
    );
    const m = minimoParaReconstruir(e.expediente);
    expect(m.nivel).toBe("parcial");
    expect(m.faltan).toEqual([
      "contra qué o contra quién chocó",
      "cómo fue el impacto o en qué zona",
      "dónde fue",
    ]);
    expect(minimoParaReconstruir(e.expediente, { lugarEnMapa: true }).faltan).not.toContain(
      "dónde fue",
    );
  });
});
