import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agregarTope,
  distanciaM,
  escenaDeNarracion,
  especDeExpediente,
  type SalidaCorpus,
  usaRelieve,
} from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import { describe, expect, it } from "vitest";
import {
  ajustarACalle,
  callesDe,
  limiteEnElChoque,
  type Calle,
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
  marcaYModelo,
  nombreVehiculo,
  PALETA_VEHICULOS,
  pasoActual,
  pasosEscena,
  terrenoMarcado,
  poseDe,
  ponerEnLaCalle,
  proponerChoque,
  quedoJuntoAlChoque,
  resumenEscena,
  sentidoNarrado,
  calleDeLlegadaNarrada,
  tramoDelVehiculo,
  sinFinal,
  textoChoqueListo,
  textoFlecha,
  avisarSinCalles,
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

  it("cada vehículo se llama por su marca y su modelo, nunca «V1» ni «3» (René, 2026-11-18)", () => {
    const v1 = e0.vehiculos[0]!;
    const v2 = e0.vehiculos[1]!;
    const marca1 = v1.marca?.valor?.trim();
    expect(nombreVehiculo(v1, e0.vehiculos)).toBe(marca1 ? `${marca1} Jetta` : "Jetta");
    expect(nombreVehiculo(v2, e0.vehiculos)).toContain("Camaro");
    const dos = [v1, { ...v2, marca: v1.marca, modelo: v1.modelo }];
    expect(nombreVehiculo(dos[1]!, dos)).toBe(`${nombreVehiculo(v1, [v1])} B`);
  });

  it("marca y modelo: «Mazda 3», sin repetir la marca", () => {
    expect(marcaYModelo("Mazda", "3")).toBe("Mazda 3");
    expect(marcaYModelo("Nissan", "Nissan Tsuru")).toBe("Nissan Tsuru");
    expect(marcaYModelo("", "Jetta")).toBe("Jetta");
    expect(marcaYModelo("Ford", undefined)).toBe("Ford");
    expect(marcaYModelo(null, null)).toBe("");
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
    // Si solo una de las calles está en el mapa, lo dice: no presenta otro cruce como el narrado.
    const otra = grabada.narracion.replace(/Av\. Reforma/g, "Av. Insurgentes");
    const u = proponerChoque(calles, otra, C)!;
    expect(u.segun).toBe("una_calle");
    expect(u.encontrada).toBe("calle Azucena");
    expect(u.faltante).toBe("Av. Insurgentes");
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

describe("el terreno que narra la pendiente (René, 2026-11-21)", () => {
  it("el relieve real de la narración no da por contestado el terreno: el tope todavía se marca", () => {
    const conRelieve = { ...e0, terreno: { relieve: { fuente: "dem" } } } as typeof e0;
    expect(terrenoMarcado(conRelieve)).toBe(false);
    const conTope = {
      ...e0,
      terreno: { relieve: { fuente: "dem" }, topes: [{ id: "t1" }] },
    } as unknown as typeof e0;
    expect(terrenoMarcado(conTope)).toBe(true);
    const paso = (e: typeof e0) =>
      pasosEscena(e, impactos, { desconocidos: [], direccionesNoSe: [], c1: {} }).find(
        (p) => p.tipo === "terreno",
      );
    expect(paso(conRelieve)).toMatchObject({ hecho: false });
    expect(paso(conTope)).toMatchObject({ hecho: true });
  });

  it("la reversa de ejemplo: con el relieve encendido pregunta el terreno y el tope llega a la física", () => {
    const g = JSON.parse(
      readFileSync(
        resolve(aqui, "../../../../data/cesvi/grabaciones/ejemplos/reversa-pendiente.json"),
        "utf8",
      ),
    ) as { narracion: string; salida: SalidaCorpus };
    const leida = escenaDeNarracion(g.salida, g.narracion).expediente;
    // La narración dice «pendiente»: el relieve real va encendido.
    expect(usaRelieve(leida)).toBe(true);
    const imp = impactosAColocar(leida);
    let e = marcarChoque(leida, imp, 1, C, 0);
    const paso = (x: typeof e) =>
      pasosEscena(x, imp, { desconocidos: [], direccionesNoSe: [], c1: {} }).find(
        (p) => p.tipo === "terreno",
      );
    // Antes del arreglo el relieve lo daba por contestado y el tope nunca se preguntaba.
    expect(paso(e)).toMatchObject({ hecho: false });
    e = agregarTope(e, { lat: C.lat - 12 / 111320, lon: C.lon }, 0).expediente;
    expect(paso(e)).toMatchObject({ hecho: true });
    // Y la física lo recibe: el tope va en el terreno del lugar de la escena.
    const lugar = especDeExpediente(e, "reversa").spec.lugar as {
      terreno?: { topes?: unknown[] };
    };
    expect(lugar.terreno?.topes).toHaveLength(1);
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
    e = elegirDireccion(e, impactos, "V1", 0, () => C);
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
    e = elegirDireccion(e, impactos, "V2", 270, () => C);
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

  it("en una carambola, la dirección del primero de un choque acomoda a los demás de ese choque", () => {
    // B es el primero del segundo choque: su dirección orienta a C en ese choque.
    const imp = [
      { orden: 1, vehiculos: ["V1", "V2"] },
      { orden: 2, vehiculos: ["V2", "V3"] },
    ];
    const v3 = { ...e0.vehiculos[1]!, id: "V3" as (typeof e0.vehiculos)[number]["id"] };
    const e3 = {
      ...e0,
      vehiculos: [...e0.vehiculos, v3],
      impactos: [
        ...(e0.impactos ?? []),
        { orden: 2, vehiculos: ["V2", "V3"] as never, fuente: "perito" as const },
      ],
    };
    const P2 = { lat: C.lat, lon: C.lon + 0.00005 };
    const puntos = (o: number) => (o === 1 ? C : P2);
    let e = marcarChoque(e3, imp, 1, C, 0);
    e = marcarChoque(e, imp, 2, P2, 0);
    const antes = poseDe(e, "V3", "impacto")!;
    e = elegirDireccion(e, imp, "V2", 90, puntos);
    const despues = poseDe(e, "V3", "impacto")!;
    expect(despues.rumbo).not.toBe(antes.rumbo);
    expect(poseDe(e, "V2", "impacto")).toMatchObject({ rumbo: 90, fuente: "perito" });
  });

  it("«No sé por dónde venía» deja la de Croquis como supuesto; «No sé dónde quedó», sin posición", () => {
    let e = marcarChoque(e0, impactos, 1, C, 90);
    const propuesta = poseDe(e, "V1", "impacto")!.rumbo;
    e = elegirDireccion(e, impactos, "V1", propuesta, () => C, true);
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
    e = elegirDireccion(e, impactos, "V1", 0, () => C);
    e = marcarFinal(e, "V1", { lat: C.lat + 0.0001, lon: C.lon + 0.0001 }, 45);
    e = elegirDireccion(e, impactos, "V2", 90, () => C);
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

describe("el aviso de calles (ronda 4, René)", () => {
  const base = {
    overpassFallo: true,
    hayCalles: false,
    teselasLeidasDe: "lugar-1",
    lugar: "lugar-1",
    yaVisto: false,
    descartado: false,
  };
  it("sale solo si de verdad no hay calles de ninguna fuente, ya leídas las teselas del lugar", () => {
    expect(avisarSinCalles(base)).toBe(true);
    // Al regresar a La escena con las calles del recorrido (o guardadas con el caso): no sale.
    expect(avisarSinCalles({ ...base, hayCalles: true })).toBe(false);
    // Todavía sin leer las teselas de este lugar (recién montada): no sale.
    expect(avisarSinCalles({ ...base, teselasLeidasDe: null })).toBe(false);
    expect(avisarSinCalles({ ...base, teselasLeidasDe: "otro" })).toBe(false);
    // Overpass respondió: no sale.
    expect(avisarSinCalles({ ...base, overpassFallo: false })).toBe(false);
  });
  it("una sola vez por lugar en la sesión, y no si el perito lo cerró", () => {
    expect(avisarSinCalles({ ...base, yaVisto: true })).toBe(false);
    expect(avisarSinCalles({ ...base, descartado: true })).toBe(false);
  });
});

describe("el límite de la vía por donde circulaba (René, 2026-11-23)", () => {
  // Paseo Tollocan (oriente–poniente) pasa a 20 m del choque; una calle secundaria (norte–sur), a 6 m.
  const ll = (este: number, norte: number): [number, number] => [
    C.lon + este / (111320 * Math.cos((C.lat * Math.PI) / 180)),
    C.lat + norte / 111320,
  ];
  const calles: Calle[] = [
    {
      id: 1,
      nombre: "Paseo Tollocan",
      puntos: [ll(-200, 20), ll(200, 20)],
      ancho: 14,
      nodos: [1, 2],
      tipo: "primary",
      maxspeed: "70",
    },
    {
      id: 2,
      nombre: "Calle Isidro Fabela",
      puntos: [ll(6, -200), ll(6, 200)],
      ancho: 7,
      nodos: [3, 4],
      tipo: "residential",
    },
  ];
  const lugar = "Paseo Tollocan, a la altura de la calle Isidro Fabela";

  it("la vía del lugar narrado y en el rumbo del vehículo, no la calle más cercana", () => {
    expect(limiteEnElChoque(calles, C, { rumbo: 270, lugar })).toMatchObject({
      kmh: 70,
      fuente: expect.stringContaining("Paseo Tollocan"),
    });
  });

  it("sin lugar narrado, la que va en su rumbo; sin nada, la más cercana (como antes)", () => {
    expect(limiteEnElChoque(calles, C, { rumbo: 90 })!.fuente).toContain("Paseo Tollocan");
    expect(limiteEnElChoque(calles, C)!.fuente).toContain("Isidro Fabela");
  });

  it("con «claseDeSuNombre», cada vehículo toma la clase de SU vía, no la del lugar completo (René, 2026-11-26)", () => {
    // El crucero: «calle Azucena esquina con Avenida del Árbol», las dos sin límite publicado.
    const crucero: Calle[] = [
      { ...calles[0]!, nombre: "Avenida del Árbol", tipo: "tertiary", maxspeed: undefined },
      { ...calles[1]!, nombre: "Calle Azucena", tipo: "residential" },
    ];
    const lugarCrucero = "crucero de la calle Azucena esquina con Avenida del Árbol";
    // El que circulaba por la calle Azucena (norte–sur): 30 km/h, de «calle», con su nombre.
    expect(
      limiteEnElChoque(crucero, C, { rumbo: 0, lugar: lugarCrucero, claseDeSuNombre: true }),
    ).toMatchObject({ kmh: 30, fuente: expect.stringContaining("Calle Azucena") });
    // El de la Avenida del Árbol (oriente–poniente): 50 km/h, de «avenida».
    expect(
      limiteEnElChoque(crucero, C, { rumbo: 90, lugar: lugarCrucero, claseDeSuNombre: true }),
    ).toMatchObject({ kmh: 50, fuente: expect.stringContaining("Avenida del Árbol") });
    // Sin la opción (la velocidad narrada relativa al límite, como antes), la calle salía de «avenida».
    expect(limiteEnElChoque(crucero, C, { rumbo: 0, lugar: lugarCrucero })!.kmh).toBe(50);
  });

  it("la vía narrada sin límite en el mapa toma la clase del lugar narrado, no la del tipo de OpenStreetMap", () => {
    // Así está Tollocan en OpenStreetMap junto al árbol: «secondary» y sin maxspeed.
    const sinLimite = calles.map((c) =>
      c.id === 1 ? { ...c, tipo: "secondary", maxspeed: undefined } : c,
    );
    expect(limiteEnElChoque(sinLimite, C, { rumbo: 270, lugar })).toMatchObject({
      kmh: 50,
      fuente: expect.stringContaining("avenidas primarias"),
    });
  });

  it("si el vehículo iba por la otra calle nombrada, esa", () => {
    expect(limiteEnElChoque(calles, C, { rumbo: 0, lugar })!.fuente).toContain("Isidro Fabela");
  });
});

describe("lo que una oración dice de cada vehículo (René, 2026-11-26: el poste en Tianguismanalco)", () => {
  const narracion =
    "El hecho se ubica en el cruce de la Calle 16 de Septiembre con la Avenida de la Compañía, en San Pedro Atlixco. Se examinan el vehículo A, marca Mazda, tipo 3, modelo 2014, que circulaba por la Avenida de la Compañía de Sur a Norte, y el vehículo B, marca Nissan, tipo Sentra, modelo 2018, que circulaba por la Calle 16 de Septiembre de Poniente a Oriente.";
  const mazda = { id: "V1", marca: { valor: "Mazda" }, modelo: { valor: "3" } };
  const sentra = { id: "V2", marca: { valor: "Nissan" }, modelo: { valor: "Sentra" } };
  const todos = [mazda, sentra] as unknown as Parameters<typeof calleDeLlegadaNarrada>[2];

  it("el tramo de cada uno: desde que lo nombra hasta que nombra a otro", () => {
    const o = narracion.split(/(?<=[.;])\s+/)[1]!;
    expect(tramoDelVehiculo(o, ["Sentra", "Nissan", "vehículo B"])).toMatch(
      /^vehiculo b, marca nissan.*de poniente a oriente\.$/,
    );
    expect(tramoDelVehiculo(o, ["3", "Mazda", "vehículo A"])).not.toMatch(/poniente/);
  });

  it("el Sentra venía del poniente por la Calle 16 de Septiembre; el Mazda, del sur por la Avenida", () => {
    expect(sentidoNarrado(narracion, ["Sentra", "Nissan", "vehículo B"])).toMatchObject({
      rumbo: 90,
      desde: "oeste",
    });
    expect(sentidoNarrado(narracion, ["3", "Mazda", "vehículo A"])).toMatchObject({ rumbo: 0 });
    expect(calleDeLlegadaNarrada(narracion, todos[1]!, todos)).toBe("Calle 16 de Septiembre");
    expect(calleDeLlegadaNarrada(narracion, todos[0]!, todos)).toBe("Avenida de la Compañía");
  });
});
