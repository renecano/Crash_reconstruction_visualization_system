/**
 * W4 «Corregir después»: lo que el perito ya colocó en la escena fácil se corrige sin rehacer lo
 * demás (el primer golpe, los choques intermedios, los puntos de paso y los objetos del lugar), y la
 * `EscenaSpec` que sale de `especDeExpediente` cambia con la corrección.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agregarObjeto,
  escenaDeNarracion,
  especDeExpediente,
  type SalidaCorpus,
} from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  agregarChoqueIntermedio,
  agregarPuntoDePaso,
  choquesIntermedios,
  elegirDireccion,
  marcarChoque,
  marcarPrimerGolpe,
  moverChoqueIntermedio,
  moverPuntoDePaso,
  primerGolpe,
  puntosDePaso,
  quedoJuntoAlChoque,
  quitarPrimerGolpe,
  quitarPuntoDePaso,
  resumenC1,
  resumenEscena,
} from "./escena-facil";
import { impactosAColocar } from "./pasos-caso";

type Json = Record<string, unknown>;
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
const nombres = { V1: "Jetta", V2: "Camaro" };

function colocados() {
  let e = marcarChoque(e0, impactos, 1, C, 0);
  e = elegirDireccion(e, impactos, "V1", 0, () => C);
  e = elegirDireccion(e, impactos, "V2", 90, () => C);
  e = quedoJuntoAlChoque(e, "V1");
  return quedoJuntoAlChoque(e, "V2");
}

const evento = (e: ReturnType<typeof colocados>, id: string) =>
  (especDeExpediente(e).spec.eventos as Json[]).find((x) => x.id === id);

describe("corregir el primer golpe", () => {
  it("moverlo lo cambia en la escena; quitarlo vuelve al lugar del choque", () => {
    let e = marcarPrimerGolpe(colocados(), impactos, m(1, 0));
    const antes = evento(e, "ev-impacto-1") ?? (especDeExpediente(e).spec.eventos as Json[])[0]!;
    e = marcarPrimerGolpe(e, impactos, m(3, 0));
    expect(primerGolpe(e)).toEqual(m(3, 0));
    const despues = (especDeExpediente(e).spec.eventos as Json[])[0]!;
    const y = (x: Json) => (x.punto_impacto as { y: number }).y;
    expect(y(despues) - y(antes)).toBeCloseTo(2, 1);
    e = quitarPrimerGolpe(e);
    expect(primerGolpe(e)).toBeNull();
    expect((especDeExpediente(e).spec.eventos as Json[])[0]!.procedencia).not.toMatchObject({
      fuente: "usuario",
    });
  });
});

describe("corregir un choque intermedio", () => {
  it("moverlo mueve el objeto y el evento de la escena; los demás quedan igual", () => {
    let e = agregarChoqueIntermedio(colocados(), "V1", "poste", m(15, 0));
    e = agregarChoqueIntermedio(e, "V2", "muro", m(0, 15));
    const [poste, muro] = choquesIntermedios(e);
    const posicion = (x: typeof e) =>
      (((especDeExpediente(x).spec.entorno as Json).objetos as Json[]).find(
        (o) => o.id === `obj-choque-${poste!.orden}`,
      )!.posicion ?? {}) as { x: number; y: number };
    const antes = posicion(e);
    e = moverChoqueIntermedio(e, poste!.orden, m(18, 1));
    const [poste2, muro2] = choquesIntermedios(e);
    expect(poste2!.punto).toEqual(m(18, 1));
    expect(muro2).toEqual(muro);
    const despues = posicion(e);
    expect(despues.y - antes.y).toBeCloseTo(3, 1);
    expect(despues.x - antes.x).toBeCloseTo(1, 1);
    // Un orden que no es un choque intermedio no cambia nada.
    expect(moverChoqueIntermedio(e, 1, m(9, 9))).toBe(e);
  });
});

describe("corregir los puntos de paso", () => {
  it("mover uno lo cambia solo a él; quitar uno renumera los que siguen", () => {
    let e = agregarPuntoDePaso(colocados(), "V1", m(-30, 0));
    e = agregarPuntoDePaso(e, "V1", m(-20, 0));
    e = agregarPuntoDePaso(e, "V1", m(-10, 0));
    e = agregarPuntoDePaso(e, "V2", m(0, -20));
    e = moverPuntoDePaso(e, "V1", 2, m(-21, 1));
    expect(puntosDePaso(e, "V1").map((q) => q.punto)).toEqual([m(-30, 0), m(-21, 1), m(-10, 0)]);
    e = quitarPuntoDePaso(e, "V1", 1);
    expect(puntosDePaso(e, "V1")).toEqual([
      { vehiculo: "V1", orden: 1, punto: m(-21, 1) },
      { vehiculo: "V1", orden: 2, punto: m(-10, 0) },
    ]);
    expect(puntosDePaso(e, "V2")).toHaveLength(1);
    const sv = (especDeExpediente(e).spec.vehiculos as Json[])[0]!;
    expect((sv.puntos_paso as Json[]).map((q) => q.orden)).toEqual([1, 2]);
  });
});

describe("el resumen lleva a qué regresar en cada línea", () => {
  it("el choque y los choques intermedios con su orden; los objetos con su id", () => {
    let e = agregarChoqueIntermedio(colocados(), "V1", "poste", m(15, 0));
    e = agregarObjeto(e, "barrera", m(20, 5)).expediente;
    const lineas = [
      ...resumenEscena({
        e,
        impactos,
        puntos: { 1: C },
        callesChoque: {},
        nombres,
        desconocidos: [],
        direccionesNoSe: [],
        juntoAlChoque: ["V1", "V2"],
      }),
      ...resumenC1({ e, nombres, c1: {} }),
    ];
    expect(lineas.find((l) => l.tipo === "choque")).toMatchObject({ orden: 1 });
    expect(lineas.find((l) => l.tipo === "objeto")).toMatchObject({ orden: 2, vehiculo: "V1" });
    expect(lineas.find((l) => l.tipo === "lugar")).toMatchObject({
      objeto: "obj-1",
      texto: "Una barrera, donde lo colocaste",
    });
  });
});
