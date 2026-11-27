import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  enMetros,
  escenaDeNarracion,
  impactosEncimados,
  type Expediente,
  type SalidaCorpus,
} from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  carreteraNarrada,
  mismaCalleNarrada,
  nombreComparable,
  poseDe,
  proponerChoque,
  sentidoEnElCaso,
} from "./escena-facil";
import { proponerEscena } from "./escena-propuesta";
import { impactosAColocar } from "./pasos-caso";

/**
 * Las causas que encontró la revisión sistemática de la cadena (René, 2026-11-24), con un caso cada
 * una: lo que la escena propuesta sola tiene que hacer bien.
 */
const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(aqui, "../../../..");
const grabada = (ruta: string) => {
  const g = JSON.parse(readFileSync(resolve(RAIZ, ruta), "utf8")) as {
    narracion: string;
    salida: SalidaCorpus;
  };
  return { ...escenaDeNarracion(g.salida, g.narracion), narracion: g.narracion };
};

describe("«en sentido contrario»: el contrario del otro vehículo", () => {
  const { expediente: e, narracion } = grabada("data/cesvi/grabaciones/ronda4/ronda4-subida.json");

  it("el Tsuru que «bajaba en sentido contrario» a la Ranger (de norte a sur) va de sur a norte", () => {
    const ranger = sentidoEnElCaso(narracion, e.vehiculos[0]!, e.vehiculos);
    const tsuru = sentidoEnElCaso(narracion, e.vehiculos[1]!, e.vehiculos);
    expect(ranger?.rumbo).toBe(180);
    expect(tsuru?.rumbo).toBe(0);
    expect(tsuru?.cita).toMatch(/sentido contrario/);
  });
});

describe("el segundo choque de una carambola, propuesto por las zonas", () => {
  const c = JSON.parse(
    readFileSync(resolve(RAIZ, "data/cesvi/casos/rene-carambola-semaforo.croquis"), "utf8"),
  ) as { expediente: Expediente; narracion: string };
  // Como llega a La escena: sin posiciones.
  const e0: Expediente = {
    ...c.expediente,
    versiones: (c.expediente.versiones ?? []).map((v) => ({ ...v, posiciones: [] })),
  };
  const P = { lat: 19.2795, lon: -99.6417 };
  const p = proponerEscena({
    expediente: e0,
    impactos: impactosAColocar(e0),
    calles: [],
    narracion: c.narracion,
    lugar: P,
    nombreDe: (id) => id,
  })!;

  it("coloca a los tres, sin encimarse en ningún choque", () => {
    for (const v of ["V1", "V2", "V3"]) expect(poseDe(p.expediente, v, "impacto")).toBeTruthy();
    expect(impactosEncimados(p.expediente)).toEqual([]);
    expect(p.propuestos.some((x) => x.clave === "choque-2")).toBe(true);
    expect(p.faltan.some((x) => x.clave === "choque-2")).toBe(false);
  });

  it("la Rio queda delante del Aveo, en su mismo rumbo (el Aveo la golpeó con su frente)", () => {
    const b = poseDe(p.expediente, "V2", "impacto")!;
    const cc = poseDe(p.expediente, "V3", "impacto")!;
    const dif = Math.abs(((b.rumbo - cc.rumbo + 540) % 360) - 180);
    expect(dif).toBeLessThan(1);
  });
});

describe("el choque en un paso a desnivel y los nombres largos de las calles", () => {
  const P0 = { lat: 19.4, lon: -99.17 };
  const m = (este: number, norte: number): [number, number] => [
    P0.lon + este / (111320 * Math.cos((P0.lat * Math.PI) / 180)),
    P0.lat + norte / 111320,
  ];
  // El Viaducto va de este a oeste por y = 0; Insurgentes, de sur a norte por x = 0, sin nodo común.
  const calles = [
    {
      id: 1,
      nombre: "Viaducto Presidente Miguel Alemán Valdés",
      puntos: [m(-200, 0), m(-5, 0), m(5, 0), m(200, 0)],
      ancho: 20,
      nodos: [1, 2, 3, 4],
    },
    {
      id: 2,
      nombre: "Avenida Insurgentes Sur",
      puntos: [m(0, -200), m(0, -8), m(0, 8), m(0, 200)],
      ancho: 20,
      nodos: [5, 6, 7, 8],
    },
    {
      id: 3,
      nombre: "Calle Nuevo León",
      puntos: [m(150, -100), m(150, 100)],
      ancho: 10,
      nodos: [9, 10],
    },
    {
      id: 4,
      nombre: "Avenida Insurgentes Sur",
      puntos: [m(0, 200), m(150, 100)],
      ancho: 10,
      nodos: [8, 10],
    },
  ];

  it("«Viaducto Miguel Alemán» es «Viaducto Presidente Miguel Alemán Valdés»", () => {
    expect(
      mismaCalleNarrada(
        "Viaducto Presidente Miguel Alemán Valdés",
        nombreComparable("Viaducto Miguel Alemán"),
      ),
    ).toBe(true);
    expect(mismaCalleNarrada("Calle Nuevo León", nombreComparable("Viaducto Miguel Alemán"))).toBe(
      false,
    );
  });

  it("sin cruce a nivel, el choque va sobre el Viaducto, a la altura de Insurgentes", () => {
    const p = proponerChoque(
      calles,
      "El hecho se ubica sobre el Viaducto Miguel Alemán, a la altura de la Avenida de los Insurgentes Sur.",
      { lat: P0.lat, lon: P0.lon },
    )!;
    expect(p.segun).toBe("a_la_altura");
    const d = enMetros([p.punto.lon, p.punto.lat], [P0.lon, P0.lat]);
    expect(Math.hypot(d.este, d.norte)).toBeLessThan(10);
  });
});

describe("la carretera que dice la narración (revisión de la cadena, 2026-11-24)", () => {
  it("se busca si la lectura no trajo el lugar", () => {
    expect(
      carreteraNarrada(
        "El hecho de tránsito se ubica en el kilómetro 77 de la carretera Pijijiapan–Tonalá, en el estado de Chiapas, el día 16.",
      ),
    ).toBe("kilómetro 77 de la carretera Pijijiapan–Tonalá");
    expect(carreteraNarrada("Circulaba por la calle Hidalgo y frenó.")).toBeNull();
  });
});
