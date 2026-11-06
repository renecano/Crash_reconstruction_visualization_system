import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { distanciaM, escenaDeNarracion, type SalidaCorpus } from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import { describe, expect, it } from "vitest";
import {
  ajustarACalle,
  callesDe,
  callesEn,
  callesNarradas,
  cardinal,
  choqueLejosDeCalles,
  colorNarrado,
  coloresVehiculos,
  contraNarracion,
  cruceNarrado,
  elegirDireccion,
  flechaPropuesta,
  flechasDeLlegada,
  fueraDeLaCalle,
  girar,
  marcarChoque,
  marcarFinal,
  nombreComparable,
  nombreVehiculo,
  PALETA_VEHICULOS,
  pasoActual,
  pasosEscena,
  poseDe,
  ponerEnLaCalle,
  proponerChoque,
  quedoJuntoAlChoque,
  resumenEscena,
  sentidoNarrado,
  sinFinal,
  textoChoqueListo,
  textoFlecha,
} from "./escena-facil";
import { impactosAColocar } from "./pasos-caso";

const aqui = dirname(fileURLToPath(import.meta.url));
const grabada = JSON.parse(
  readFileSync(
    resolve(aqui, "../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const e0 = escenaDeNarracion(grabada.salida, grabada.narracion).expediente;
const impactos = impactosAColocar(e0);

/**
 * Un cruce de prueba: la calle Azucena (oeste–este) y la Av. Reforma (sur–norte) se cruzan en el
 * nodo 1; a 300 m al norte hay otro cruce, Reforma con la calle Moras. ~1e-3° ≈ 105 m de longitud y
 * 111 m de latitud a esta altura.
 */
const C = { lat: 19.3576, lon: -99.0625 };
const n = (id: number, dlat: number, dlon: number) => ({
  type: "node" as const,
  id,
  lat: C.lat + dlat,
  lon: C.lon + dlon,
});
const OSM: OverpassResponse = {
  elements: [
    n(1, 0, 0),
    n(2, 0, -0.001),
    n(3, 0, 0.001),
    n(4, -0.001, 0),
    n(5, 0.001, 0),
    n(6, 0.0027, 0),
    n(7, 0.0027, 0.001),
    n(8, 0.0027, -0.001),
    {
      type: "way",
      id: 10,
      nodes: [2, 1, 3],
      tags: { highway: "residential", name: "Calle Azucena" },
    },
    {
      type: "way",
      id: 11,
      nodes: [4, 1, 5, 6],
      tags: { highway: "primary", name: "Avenida Reforma", lanes: "4" },
    },
    {
      type: "way",
      id: 12,
      nodes: [8, 6, 7],
      tags: { highway: "residential", name: "Calle Moras" },
    },
  ],
};
const calles = callesDe(OSM);
const cerca = (a: { lat: number; lon: number }, b: { lat: number; lon: number }, m = 1) =>
  distanciaM([a.lon, a.lat], [b.lon, b.lat]) < m;

describe("lo que Croquis lee de la narración (escena fácil)", () => {
  it("las calles y el cruce que nombra, con su frase", () => {
    expect(
      callesNarradas(grabada.narracion)
        .map((c) => c.nombre)
        .slice(0, 2),
    ).toEqual(["calle Azucena", "Av. Reforma"]);
    const c = cruceNarrado(grabada.narracion)!;
    expect(c.calles).toEqual(["calle Azucena", "Av. Reforma"]);
    expect(c.cita).toContain("calle Azucena esquina con Av. Reforma");
    expect(cruceNarrado("Chocaron frente a la tienda.")).toBeNull();
    // «Calle», «Av.», acentos y mayúsculas no cuentan al comparar.
    expect(nombreComparable("Av. Reforma")).toBe(nombreComparable("AVENIDA REFORMA"));
    expect(nombreComparable("Calle Jazmín")).toBe("jazmin");
  });

  it("el sentido de cada vehículo, con su frase; si no lo dice, nada", () => {
    const t =
      "El Jetta circulaba de sur a norte por la calle Jazmín. El Camaro iba con dirección al poniente.";
    const a = sentidoNarrado(t, ["Jetta"])!;
    expect(a.rumbo).toBe(0);
    expect(a.desde).toBe("sur");
    expect(a.cita).toContain("de sur a norte");
    const b = sentidoNarrado(t, ["Camaro"])!;
    expect(b.rumbo).toBe(270);
    expect(b.desde).toBe("este");
    // La narración de ejemplo no dice el sentido de los vehículos (el de la calle no cuenta).
    expect(sentidoNarrado(grabada.narracion, ["Jetta", "VW", "vehículo A"])).toBeNull();
  });

  it("el color de cada vehículo si lo dice; si no, la paleta (nunca naranja)", () => {
    expect(colorNarrado(grabada.narracion, ["Jetta"])?.nombre).toBe("azul");
    expect(colorNarrado(grabada.narracion, ["Camaro"])?.nombre).toBe("rojo");
    const colores = coloresVehiculos(e0.vehiculos, grabada.narracion);
    expect(colores.V1!.nombre).toBe("azul");
    expect(colores.V2!.nombre).toBe("rojo");
    const sinColor = coloresVehiculos(e0.vehiculos, "Chocaron.");
    expect(sinColor.V1!.css).toBe(PALETA_VEHICULOS[0]);
    expect(sinColor.V2!.css).toBe(PALETA_VEHICULOS[1]);
    expect(PALETA_VEHICULOS.map((c) => c.toLowerCase())).not.toContain("#ff5a1f");
  });

  it("cada vehículo se llama por su modelo, nunca «V1»", () => {
    expect(nombreVehiculo(e0.vehiculos[0]!, e0.vehiculos)).toBe("Jetta");
    expect(nombreVehiculo(e0.vehiculos[1]!, e0.vehiculos)).toBe("Camaro");
    const dos = [e0.vehiculos[0]!, { ...e0.vehiculos[1]!, modelo: e0.vehiculos[0]!.modelo }];
    expect(nombreVehiculo(dos[1]!, dos)).toBe("Jetta B");
  });
});

describe("lo que sale de las calles del mapa", () => {
  it("propone el cruce que nombra la narración, aunque otro quede más cerca del lugar", () => {
    // El lugar del caso cae junto al cruce de Moras: manda la narración.
    const lugar = { lat: C.lat + 0.0026, lon: C.lon };
    const p = proponerChoque(calles, grabada.narracion, lugar)!;
    expect(p.segun).toBe("narracion");
    expect(cerca(p.punto, C)).toBe(true);
    expect(p.calles).toEqual(expect.arrayContaining(["Calle Azucena", "Avenida Reforma"]));
    expect(p.cita).toContain("Azucena");
    // Sin narración, el cruce más cercano al lugar.
    const q = proponerChoque(calles, null, lugar)!;
    expect(q.segun).toBe("cercania");
    expect(q.calles).toContain("Calle Moras");
    // Sin calles no hay propuesta.
    expect(proponerChoque([], grabada.narracion, lugar)).toBeNull();
  });

  it("un toque se ajusta a la calle más cercana; lejos de todas, no", () => {
    const toque = { lat: C.lat + 0.0003, lon: C.lon + 0.00004 };
    const a = ajustarACalle(calles, toque)!;
    expect(a.calle.nombre).toBe("Avenida Reforma");
    expect(Math.abs(a.punto.lon - C.lon)).toBeLessThan(1e-6);
    expect([0, 180]).toContain(Math.round(a.rumbo));
    const lejos = { lat: C.lat + 0.0005, lon: C.lon + 0.0005 };
    expect(ajustarACalle(calles, lejos)).toBeNull();
    expect(choqueLejosDeCalles(calles, lejos)).toBe(true);
    expect(choqueLejosDeCalles([], lejos)).toBe(false);
  });

  it("una flecha por cada calle que llega al cruce, con su punto cardinal y su nombre", () => {
    const f = flechasDeLlegada(calles, C);
    expect(f.map(textoFlecha).sort()).toEqual(
      [
        "Del este, por Calle Azucena",
        "Del norte, por Avenida Reforma",
        "Del oeste, por Calle Azucena",
        "Del sur, por Avenida Reforma",
      ].sort(),
    );
    const delSur = f.find((x) => x.desde === "sur")!;
    expect(Math.round(delSur.rumbo)).toBe(0);
    // La flecha va sobre la calle, antes del choque (al sur).
    expect(delSur.en.lat).toBeLessThan(C.lat);
    // Sin calles: los cuatro puntos cardinales, sin nombre.
    const sin = flechasDeLlegada([], C);
    expect(sin.map((x) => x.desde).sort()).toEqual(["este", "norte", "oeste", "sur"]);
    expect(sin.every((x) => x.calle === null)).toBe(true);
  });

  it("propone la flecha del sentido narrado; si no hay, la de las zonas de contacto", () => {
    const f = flechasDeLlegada(calles, C);
    const sentido = sentidoNarrado("El Jetta circulaba de sur a norte.", ["Jetta"]);
    expect(f[flechaPropuesta(f, sentido, 270)]!.desde).toBe("sur");
    expect(f[flechaPropuesta(f, null, 270)]!.desde).toBe("este");
    expect(flechaPropuesta(f, null, null)).toBe(-1);
    expect(contraNarracion(180, sentido)).toBe(true);
    expect(contraNarracion(10, sentido)).toBe(false);
    expect(contraNarracion(180, null)).toBe(false);
  });

  it("un coche fuera de la calle se avisa y se puede poner en ella, alineado", () => {
    expect(fueraDeLaCalle(calles, C)).toBe(false);
    const fuera = { lat: C.lat + 0.0004, lon: C.lon + 0.0003 };
    expect(fueraDeLaCalle(calles, fuera)).toBe(true);
    let e = marcarFinal(e0, "V1", fuera, 30);
    e = ponerEnLaCalle(e, calles, "V1");
    const p = poseDe(e, "V1", "final")!;
    expect(fueraDeLaCalle(calles, p.punto)).toBe(false);
    expect([0, 180]).toContain(Math.round(p.rumbo));
  });

  it("las calles de un punto: las de su cruce o la más cercana", () => {
    expect(callesEn(calles, C).sort()).toEqual(["Avenida Reforma", "Calle Azucena"]);
    expect(callesEn(calles, { lat: C.lat + 0.0005, lon: C.lon })).toEqual(["Avenida Reforma"]);
    expect(textoChoqueListo(["Calle Azucena", "Calle Jazmín"], false, 1)).toBe(
      "¡Listo! El choque quedó en Calle Azucena y Calle Jazmín.",
    );
  });

  it("los puntos cardinales", () => {
    expect([0, 44, 46, 90, 180, 269, 359].map(cardinal)).toEqual([
      "norte",
      "noreste",
      "noreste",
      "este",
      "sur",
      "oeste",
      "norte",
    ]);
  });
});

describe("cada respuesta se guarda en el expediente de siempre", () => {
  const vacio = { desconocidos: [] as string[], direccionesNoSe: [] as string[] };

  it("los pasos: el choque y luego cada vehículo; al final, nada pendiente", () => {
    let pasos = pasosEscena(e0, impactos, vacio);
    expect(pasos.map((p) => p.tipo)).toEqual(["choque", "vehiculo", "vehiculo"]);
    expect(pasoActual(pasos)).toEqual({ tipo: "choque", orden: 1, hecho: false });

    // «Sí, fue en ese cruce»: las poses de impacto, propuestas (supuesto) hasta confirmarlas.
    let e = marcarChoque(e0, impactos, 1, C, 0);
    expect(poseDe(e, "V1", "impacto")!.fuente).toBe("supuesto");
    expect(poseDe(e, "V2", "impacto")!.fuente).toBe("supuesto");
    pasos = pasosEscena(e, impactos, vacio);
    expect(pasoActual(pasos)).toMatchObject({ tipo: "vehiculo", vehiculo: "V1", direccion: false });

    // «Del sur»: el Jetta avanzaba al norte; queda como dato de la persona.
    e = elegirDireccion(e, impactos, "V1", 0, C);
    expect(poseDe(e, "V1", "impacto")).toMatchObject({ rumbo: 0, fuente: "perito" });
    pasos = pasosEscena(e, impactos, vacio);
    expect(pasoActual(pasos)).toMatchObject({ vehiculo: "V1", direccion: true, final: false });

    // «Lo marco en el mapa»: la posición final y su rumbo, como antes.
    e = marcarFinal(e, "V1", { lat: C.lat + 0.0001, lon: C.lon + 0.0001 }, 45);
    expect(poseDe(e, "V1", "final")).toMatchObject({ rumbo: 45, fuente: "perito" });
    // Los botones de 15°.
    e = girar(e, "V1", "final", -15);
    expect(poseDe(e, "V1", "final")!.rumbo).toBe(30);
    e = girar(e, "V1", "final", -45);
    expect(poseDe(e, "V1", "final")!.rumbo).toBe(345);

    // El Camaro: «Del este» y «Quedó junto al choque».
    e = elegirDireccion(e, impactos, "V2", 270, C);
    expect(poseDe(e, "V2", "impacto")).toMatchObject({ rumbo: 270, fuente: "perito" });
    // Girar el choque con el primer vehículo no le quita su dato al segundo.
    expect(poseDe(e, "V1", "impacto")!.fuente).toBe("perito");
    e = quedoJuntoAlChoque(e, "V2");
    const imp = poseDe(e, "V2", "impacto")!;
    const fin = poseDe(e, "V2", "final")!;
    expect(fin.rumbo).toBe(imp.rumbo);
    expect(distanciaM([imp.punto.lon, imp.punto.lat], [fin.punto.lon, fin.punto.lat])).toBeCloseTo(
      1.5,
      1,
    );
    expect(pasoActual(pasosEscena(e, impactos, vacio))).toBeNull();
  });

  it("«No sé por dónde venía» deja la de Croquis como supuesto; «No sé dónde quedó», sin posición", () => {
    let e = marcarChoque(e0, impactos, 1, C, 90);
    const propuesta = poseDe(e, "V1", "impacto")!.rumbo;
    e = elegirDireccion(e, impactos, "V1", propuesta, C, true);
    expect(poseDe(e, "V1", "impacto")!.fuente).toBe("supuesto");
    let pasos = pasosEscena(e, impactos, { desconocidos: [], direccionesNoSe: ["V1"] });
    expect(pasoActual(pasos)).toMatchObject({ vehiculo: "V1", direccion: true, final: false });

    e = marcarFinal(e, "V1", C, 0);
    e = sinFinal(e, "V1");
    expect(poseDe(e, "V1", "final")).toBeNull();
    pasos = pasosEscena(e, impactos, { desconocidos: ["V1"], direccionesNoSe: ["V1"] });
    expect(pasoActual(pasos)).toMatchObject({ vehiculo: "V2" });
  });

  it("el resumen dice lo marcado, y los supuestos con su explicación", () => {
    let e = marcarChoque(e0, impactos, 1, C, 0);
    e = elegirDireccion(e, impactos, "V1", 0, C);
    e = marcarFinal(e, "V1", { lat: C.lat + 0.0001, lon: C.lon + 0.0001 }, 45);
    e = elegirDireccion(e, impactos, "V2", 90, C);
    const lineas = resumenEscena({
      e,
      impactos,
      puntos: { 1: C },
      callesChoque: { 1: ["Calle Azucena", "Avenida Reforma"] },
      nombres: { V1: "Jetta", V2: "Camaro" },
      desconocidos: ["V2"],
      direccionesNoSe: [],
      juntoAlChoque: [],
    });
    expect(lineas[0]!.texto).toBe("El choque, en Calle Azucena y Avenida Reforma");
    expect(lineas[1]!.texto).toBe("El Jetta venía del sur");
    expect(lineas[1]!.detalle).toMatch(
      /^Quedó al noreste del choque, a 1[45] m, donde lo pusiste\.$/,
    );
    expect(lineas[1]!.supuesto).toBeNull();
    expect(lineas[2]!.texto).toBe("El Camaro venía del oeste");
    expect(lineas[2]!.supuesto).toBe(
      "No sabías dónde quedó: Croquis lo calcula y el dictamen lo dice.",
    );
  });
});
