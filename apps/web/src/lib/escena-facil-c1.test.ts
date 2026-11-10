/**
 * C1 (W3): las tres preguntas de después de colocar los vehículos («¿Dónde fue el primer golpe?»,
 * «¿Chocó contra algo más?» y «¿Sabes por dónde pasó?») y cómo guardan su respuesta en el expediente.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escenaDeNarracion, especDeExpediente, type SalidaCorpus } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  agregarChoqueIntermedio,
  agregarPuntoDePaso,
  choquesIntermedios,
  elegirDireccion,
  marcarChoque,
  marcarPrimerGolpe,
  OBJETOS_C1,
  pasoActual,
  pasosEscena,
  primerGolpe,
  puntosDePaso,
  quedoJuntoAlChoque,
  quitarChoqueIntermedio,
  quitarUltimoPuntoDePaso,
  resumenC1,
} from "./escena-facil";
import { faltaDelLugar, impactosAColocar } from "./pasos-caso";

const aqui = dirname(fileURLToPath(import.meta.url));
const grabada = JSON.parse(
  readFileSync(
    resolve(aqui, "../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const e0 = escenaDeNarracion(grabada.salida, grabada.narracion).expediente;
const impactos = impactosAColocar(e0);
const C = { lat: 19.3576, lon: -99.0625 };
const m = (norte: number, este: number) => ({
  lat: C.lat + norte / 111320,
  lon: C.lon + este / (111320 * Math.cos((C.lat * Math.PI) / 180)),
});
const base = { desconocidos: [] as string[], direccionesNoSe: [] as string[] };
const nombres = { V1: "Jetta", V2: "Camaro" };

/** Los dos vehículos colocados: el choque, por dónde venían y «quedó junto al choque». */
function colocados() {
  let e = marcarChoque(e0, impactos, 1, C, 0);
  e = elegirDireccion(e, impactos, "V1", 0, () => C);
  e = elegirDireccion(e, impactos, "V2", 90, () => C);
  e = quedoJuntoAlChoque(e, "V1");
  return quedoJuntoAlChoque(e, "V2");
}

describe("las preguntas de C1 van después de los vehículos", () => {
  it("sin `c1`, los pasos son los de siempre", () => {
    expect(pasosEscena(e0, impactos, base).map((p) => p.tipo)).toEqual([
      "choque",
      "vehiculo",
      "vehiculo",
    ]);
  });

  it("con `c1`, se agregan las tres, y se preguntan en orden al terminar los vehículos", () => {
    const antes = pasosEscena(e0, impactos, { ...base, c1: {} });
    expect(antes.map((p) => p.tipo)).toEqual([
      "choque",
      "vehiculo",
      "vehiculo",
      "golpe",
      "otros",
      "paso",
    ]);
    expect(pasoActual(antes)!.tipo).toBe("choque");
    const e = colocados();
    expect(pasoActual(pasosEscena(e, impactos, base))).toBeNull();
    expect(pasoActual(pasosEscena(e, impactos, { ...base, c1: {} }))!.tipo).toBe("golpe");
    expect(pasoActual(pasosEscena(e, impactos, { ...base, c1: { golpeNoSe: true } }))!.tipo).toBe(
      "otros",
    );
    expect(
      pasoActual(
        pasosEscena(e, impactos, { ...base, c1: { golpeNoSe: true, choquesListos: true } }),
      )!.tipo,
    ).toBe("paso");
    expect(
      pasoActual(
        pasosEscena(e, impactos, {
          ...base,
          c1: { golpeNoSe: true, choquesListos: true, pasosListos: true },
        }),
      ),
    ).toBeNull();
  });

  it("una escena que llega completa no las pregunta, y no bloquean «Siguiente»", () => {
    const e = colocados();
    expect(pasoActual(pasosEscena(e, impactos, { ...base, c1: { omitidas: true } }))).toBeNull();
    const falta = faltaDelLugar(e, []);
    expect(falta.impactos).toEqual([]);
    expect(falta.finales).toEqual([]);
  });
});

describe("«¿Dónde fue el primer golpe?»", () => {
  it("un toque guarda el punto en el primer impacto, y llega al solver como medición", () => {
    const e1 = colocados();
    expect(primerGolpe(e1)).toBeNull();
    const e = marcarPrimerGolpe(e1, impactos, m(0.5, 0.5));
    expect(primerGolpe(e)).toEqual(m(0.5, 0.5));
    // No agrega un impacto: es el mismo primer choque, y los que se marcan en el mapa no cambian.
    expect(impactosAColocar(e)).toEqual(impactos);
    expect(pasoActual(pasosEscena(e, impactos, { ...base, c1: {} }))!.tipo).toBe("otros");
    const { spec } = especDeExpediente(e);
    expect((spec.eventos as { procedencia: { fuente: string } }[])[0]!.procedencia.fuente).toBe(
      "usuario",
    );
  });

  it("si el caso no traía impactos, crea el primero con los vehículos del choque", () => {
    const sin = { ...colocados(), impactos: [] };
    const e = marcarPrimerGolpe(sin, impactos, C);
    expect(e.impactos).toEqual([
      { orden: 1, vehiculos: impactos[0]!.vehiculos, punto: C, fuente: "perito" },
    ]);
  });

  it("«No sé» no marca nada y se dice como supuesto en el resumen", () => {
    const lineas = resumenC1({ e: colocados(), nombres, c1: { golpeNoSe: true } });
    expect(lineas).toHaveLength(1);
    expect(lineas[0]!.supuesto).toContain("No sabías dónde fue el primer golpe");
  });
});

describe("«¿Chocó contra algo más?»", () => {
  it("cada choque va al final del orden, con su vehículo, su objeto y su punto", () => {
    let e = marcarPrimerGolpe(colocados(), impactos, C);
    e = agregarChoqueIntermedio(e, "V2", "poste", m(0, 14));
    e = agregarChoqueIntermedio(e, "V2", "pared", m(2, 22));
    expect(choquesIntermedios(e)).toEqual([
      { orden: 2, vehiculo: "V2", objeto: "poste", punto: m(0, 14) },
      { orden: 3, vehiculo: "V2", objeto: "pared", punto: m(2, 22) },
    ]);
    // No son choques entre vehículos: no se suman a los que se marcan al principio.
    expect(impactosAColocar(e)).toEqual(impactos);
    expect(primerGolpe(e)).toEqual(C);
    const { spec, limites } = especDeExpediente(e);
    const objetos = (spec.entorno as { objetos: { id: string; tipo: string }[] }).objetos;
    expect(objetos.map((o) => [o.id, o.tipo])).toEqual([
      ["obj-choque-2", "poste"],
      ["obj-choque-3", "muro"],
    ]);
    expect(limites.some((l) => l.includes("no lo calcula"))).toBe(false);
    e = quitarChoqueIntermedio(e, 2);
    expect(choquesIntermedios(e).map((c) => c.objeto)).toEqual(["pared"]);
  });

  it("nunca toma el orden 1, aunque el caso no traiga impactos", () => {
    const e = agregarChoqueIntermedio({ ...colocados(), impactos: [] }, "V1", "árbol", m(3, 3));
    expect(e.impactos![0]!.orden).toBe(2);
    expect(choquesIntermedios(e)).toHaveLength(1);
  });

  it("todo objeto de la lista lo entiende la escena del solver", () => {
    for (const o of OBJETOS_C1) {
      const e = agregarChoqueIntermedio(colocados(), "V2", o.id, m(0, 14));
      const { spec } = especDeExpediente(e);
      const tipo = (spec.entorno as { objetos: { tipo: string }[] }).objetos[0]!.tipo;
      expect(tipo, o.id).not.toBe("otro");
    }
  });

  it("el resumen lo dice con el nombre del vehículo y del objeto", () => {
    const e = agregarChoqueIntermedio(
      marcarPrimerGolpe(colocados(), impactos, C),
      "V2",
      "poste",
      m(0, 14),
    );
    const lineas = resumenC1({ e, nombres, c1: {} });
    expect(lineas.map((l) => l.texto)).toEqual([
      "El primer golpe, donde lo marcaste",
      "Después, el Camaro chocó contra un poste",
    ]);
  });
});

describe("«¿Sabes por dónde pasó?»", () => {
  it("cada toque agrega el siguiente punto de ese vehículo, y se puede quitar el último", () => {
    let e = agregarPuntoDePaso(colocados(), "V2", m(0, 6));
    e = agregarPuntoDePaso(e, "V1", m(4, 0));
    e = agregarPuntoDePaso(e, "V2", m(1, 12));
    expect(puntosDePaso(e, "V2")).toEqual([
      { vehiculo: "V2", orden: 1, punto: m(0, 6) },
      { vehiculo: "V2", orden: 2, punto: m(1, 12) },
    ]);
    expect(puntosDePaso(e)).toHaveLength(3);
    const { spec, ids } = especDeExpediente(e);
    const v2 = (spec.vehiculos as { id: string; puntos_paso?: unknown[] }[]).find(
      (v) => ids[v.id] === "V2",
    )!;
    expect(v2.puntos_paso).toHaveLength(2);
    e = quitarUltimoPuntoDePaso(e, "V2");
    expect(puntosDePaso(e, "V2")).toEqual([{ vehiculo: "V2", orden: 1, punto: m(0, 6) }]);
    expect(puntosDePaso(e, "V1")).toHaveLength(1);
    const lineas = resumenC1({ e, nombres, c1: { omitidas: true } });
    expect(lineas.map((l) => l.texto)).toEqual([
      "El Jetta pasó por el punto que marcaste",
      "El Camaro pasó por el punto que marcaste",
    ]);
  });

  it("es opcional: sin puntos, el resumen no dice nada de ellos", () => {
    expect(resumenC1({ e: colocados(), nombres, c1: { omitidas: true } })).toEqual([]);
  });
});
