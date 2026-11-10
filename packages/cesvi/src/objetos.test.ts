/**
 * C2 (W4): los objetos que coloca el perito. La edición sobre el expediente (agregar, mover, girar,
 * cambiar de tamaño, quitar y los empalmes) y cómo llegan a la `EscenaSpec`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEscena } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import type { Expediente, SalidaCorpus } from "./corpus";
import { conPosicion, escenaDeNarracion } from "./escena-narracion";
import { enMetros } from "./geo";
import {
  agregarObjeto,
  cambiarTamano,
  empalmesDeObjetos,
  girarObjeto,
  moverObjeto,
  objetosDe,
  quitarObjeto,
} from "./objetos";
import { especDeExpediente } from "./reconstruccion";

type Json = Record<string, unknown>;

/** El crucero de E-R1 (narración de desarrollo, lectura grabada), el mismo de la prueba de C1. */
const grabacion = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json",
    ),
    "utf8",
  ),
) as { narracion: string; salida: SalidaCorpus };
const base = escenaDeNarracion(grabacion.salida, grabacion.narracion).expediente;

/** Un punto a `norte` y `este` metros de un origen fijo (entrada de prueba, no un dato del caso). */
const P = { lat: 19.3576, lon: -99.0625 };
const m = (norte: number, este: number) => ({
  lat: P.lat + norte / 111320,
  lon: P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)),
});

/** Los dos vehículos colocados en el impacto: el origen de la escena queda en (norte −1, este 1). */
function colocado(): Expediente {
  const e = conPosicion(base, { vehiculo: "V1", fase: "impacto", punto: m(-2, 0), rumbo: 0 });
  return conPosicion(e, { vehiculo: "V2", fase: "impacto", punto: m(0, 2), rumbo: 90 });
}

const objetosEscena = (e: Expediente) =>
  ((especDeExpediente(e).spec.entorno as Json).objetos ?? []) as Json[];

describe("C2: editar un objeto", () => {
  it("agrega con id propio, con las medidas típicas y como dato del perito", () => {
    const a = agregarObjeto(colocado(), "poste", m(10, 5));
    const b = agregarObjeto(a.expediente, "muro", m(-10, 5), 90);
    expect([a.id, b.id]).toEqual(["obj-1", "obj-2"]);
    const [poste, muro] = objetosDe(b.expediente);
    expect(poste).toMatchObject({ tipo: "poste", largo: 0.3, ancho: 0.3, medido: false, rumbo: 0 });
    expect(muro).toMatchObject({ tipo: "muro", largo: 6, ancho: 0.2, rumbo: 90 });
    expect(b.expediente.objetos![0]!.fuente).toBe("perito");
  });

  it("mueve, gira (con la vuelta completa) y quita sin tocar a los demás", () => {
    let { expediente: e } = agregarObjeto(colocado(), "barrera", m(10, 5), 350);
    e = agregarObjeto(e, "arbol", m(20, 5)).expediente;
    e = moverObjeto(e, "obj-1", m(12, 6));
    e = girarObjeto(e, "obj-1", 15);
    const [barrera, arbol] = objetosDe(e);
    expect(barrera!.punto).toEqual(m(12, 6));
    expect(barrera!.rumbo).toBe(5);
    expect(arbol!.punto).toEqual(m(20, 5));
    e = quitarObjeto(e, "obj-1");
    expect(objetosDe(e).map((o) => o.id)).toEqual(["obj-2"]);
    e = quitarObjeto(e, "obj-2");
    expect(e.objetos).toBeUndefined();
  });

  it("cambia el largo de un tramo y el grosor de un poste, dentro de los límites del contrato", () => {
    let { expediente: e } = agregarObjeto(colocado(), "muro", m(10, 5));
    e = agregarObjeto(e, "poste", m(20, 5)).expediente;
    e = cambiarTamano(e, "obj-1", 1.5);
    e = cambiarTamano(e, "obj-2", 2);
    const [muro, poste] = objetosDe(e);
    expect(muro).toMatchObject({ largo: 9, ancho: 0.2, medido: true });
    expect(poste).toMatchObject({ largo: 0.6, ancho: 0.6, medido: true });
    for (let k = 0; k < 20; k++) e = cambiarTamano(e, "obj-1", 2);
    expect(objetosDe(e)[0]!.largo).toBe(60);
  });

  it("un id que no existe deja el expediente igual", () => {
    const e = colocado();
    expect(moverObjeto(e, "obj-9", m(1, 1))).toBe(e);
    expect(girarObjeto(e, "obj-9", 15)).toBe(e);
  });
});

describe("C2: empalmes", () => {
  it("avisa de un poste encima de un vehículo en reposo y propone sacarlo lo justo", () => {
    let e = conPosicion(colocado(), { vehiculo: "V1", fase: "final", punto: m(8, 0), rumbo: 0 });
    e = agregarObjeto(e, "poste", m(8.5, 0.2)).expediente;
    const [emp] = empalmesDeObjetos(e);
    expect(emp).toMatchObject({ objeto: "obj-1", con: "V1", conVehiculo: true });
    // Separado, ya no se empalma, y no se fue lejos.
    const separado = moverObjeto(e, "obj-1", emp!.propuesta);
    expect(empalmesDeObjetos(separado)).toEqual([]);
    const d = enMetros(
      [emp!.propuesta.lon, emp!.propuesta.lat],
      [m(8.5, 0.2).lon, m(8.5, 0.2).lat],
    );
    expect(Math.hypot(d.este, d.norte)).toBeLessThan(1.5);
  });

  it("avisa de dos objetos encimados y no de los que están separados", () => {
    let { expediente: e } = agregarObjeto(colocado(), "muro", m(30, 0), 90);
    e = agregarObjeto(e, "poste", m(30, 1)).expediente;
    e = agregarObjeto(e, "arbol", m(40, 0)).expediente;
    expect(empalmesDeObjetos(e).map((x) => [x.objeto, x.con, x.conVehiculo])).toEqual([
      ["obj-2", "obj-1", false],
    ]);
  });
});

describe("C2: los objetos llegan a la escena", () => {
  it("con su lugar, su rumbo de escena y sus medidas (típicas como supuesto)", () => {
    let { expediente: e } = agregarObjeto(colocado(), "muro", m(9, 1), 90);
    e = agregarObjeto(e, "poste", m(-1, 11)).expediente;
    const { spec } = especDeExpediente(e);
    expect(validateEscena(spec).ok).toBe(true);
    const [muro, poste] = objetosEscena(e);
    // Origen de la escena en (norte −1, este 1).
    expect(muro).toMatchObject({ id: "obj-1", tipo: "muro", rumbo_deg: 0 });
    const pm = muro!.posicion as { x: number; y: number };
    expect(pm.x).toBeCloseTo(0, 1);
    expect(pm.y).toBeCloseTo(10, 1);
    expect(muro!.largo).toMatchObject({ valor: 6, fuente: "default" });
    expect(poste).toMatchObject({ id: "obj-2", tipo: "poste" });
    expect(poste!.diametro_tronco).toMatchObject({ valor: 0.3, fuente: "default" });
    expect((poste!.posicion as { x: number }).x).toBeCloseTo(10, 1);
  });

  it("con las medidas que dio el perito como dato suyo", () => {
    let { expediente: e } = agregarObjeto(colocado(), "barrera", m(9, 1));
    e = cambiarTamano(e, "obj-1", 2);
    const [barrera] = objetosEscena(e);
    expect(barrera!.largo).toMatchObject({ valor: 12, fuente: "usuario" });
  });

  it("mover un objeto mueve el de la escena", () => {
    let { expediente: e } = agregarObjeto(colocado(), "poste", m(9, 1));
    const antes = objetosEscena(e)[0]!.posicion as { y: number };
    e = moverObjeto(e, "obj-1", m(19, 1));
    const despues = objetosEscena(e)[0]!.posicion as { y: number };
    expect(despues.y - antes.y).toBeCloseTo(10, 1);
  });
});
