/**
 * Corregir después con lo ya colocado en la mano (René, 2026-11-17): seleccionar, mover, girar y
 * quitar cualquier cosa de la escena, las veces que sea, con el ratón o con el teclado; y el aviso
 * de que la escena cambió después de reconstruir. Nada de esto cambia cómo se calcula: lo que llega
 * al solver es lo mismo que si el perito lo hubiera colocado así desde el principio.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agregarObjeto,
  agregarPersona,
  agregarZona,
  distanciaProyeccion,
  escenaDeNarracion,
  marcarFinalPersona,
  especDeExpediente,
  objetosDe,
  piezasTerreno,
  type SalidaCorpus,
} from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  agregarChoqueIntermedio,
  agregarPuntoDePaso,
  elegirDireccion,
  marcarChoque,
  marcarPrimerGolpe,
  poseDe,
  primerGolpe,
  puntosDePaso,
  quedoJuntoAlChoque,
  resumenPersonas,
} from "./escena-facil";
import { impactosAColocar } from "./pasos-caso";
import {
  AVISO_ESCENA_CAMBIO,
  PASO_FLECHA_GRANDE_M,
  PASO_FLECHA_M,
  accionDeTecla,
  alinearConLaCalle,
  voltear,
  capacidadesDe,
  deClave,
  desplazar,
  enCampoDeTexto,
  estadoFrenteAEscena,
  existe,
  fijarRumbo,
  girarSeleccion,
  moverA,
  personaFaltante,
  posicionDe,
  quitarSeleccion,
  seleccionables,
} from "./seleccion-escena";

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
/** Metros entre dos puntos cercanos (aprox. plana, basta a unos metros). */
const metros = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot(
    (a.lat - b.lat) * 111320,
    (a.lon - b.lon) * 111320 * Math.cos((C.lat * Math.PI) / 180),
  );

/** La escena lista: el choque, por dónde venía cada uno y dónde quedó. */
function colocados() {
  let e = marcarChoque(e0, impactos, 1, C, 0);
  e = elegirDireccion(e, impactos, "V1", 0, () => C);
  e = elegirDireccion(e, impactos, "V2", 90, () => C);
  e = quedoJuntoAlChoque(e, "V1");
  return quedoJuntoAlChoque(e, "V2");
}

/** Con un poco de todo: un objeto, una zona, el primer golpe, un choque intermedio y un punto de paso. */
function conTodo() {
  let e = agregarObjeto(colocados(), "poste", m(12, 4), 0).expediente;
  e = agregarZona(e, "grava", m(-8, 0), 0).expediente;
  e = marcarPrimerGolpe(e, impactos, m(0.5, 0));
  e = agregarChoqueIntermedio(e, "V2", "poste", m(18, 3));
  return agregarPuntoDePaso(e, "V1", m(-20, 0));
}

const idObjeto = (e: ReturnType<typeof conTodo>) => objetosDe(e)[0]!.id;
const idZona = (e: ReturnType<typeof conTodo>) => piezasTerreno(e)[0]!.id;
const ordenIntermedio = (e: ReturnType<typeof conTodo>) =>
  seleccionables(e)
    .find((k) => /^marca:objeto-\d+$/.test(k))!
    .replace("marca:objeto-", "");

describe("qué se puede seleccionar", () => {
  it("todo lo colocado, en el orden de la lista: vehículos, objetos, terreno y marcas", () => {
    const e = conTodo();
    const claves = seleccionables(e);
    expect(claves.slice(0, 2)).toEqual(["coche:V1", "coche:V2"]);
    expect(claves).toContain(`objeto:${idObjeto(e)}`);
    expect(claves).toContain(`terreno:${idZona(e)}`);
    expect(claves).toContain("marca:golpe");
    expect(claves).toContain(`marca:objeto-${ordenIntermedio(e)}`);
    expect(claves).toContain("marca:paso-V1-1");
    expect(claves.every((k) => existe(e, k))).toBe(true);
    expect(existe(e, "objeto:no-existe")).toBe(false);
  });

  it("cada clave dice qué admite", () => {
    const e = conTodo();
    expect(capacidadesDe(e, "coche:V1")).toEqual({ mover: true, girar: "absoluto", quitar: true });
    expect(capacidadesDe(e, `objeto:${idObjeto(e)}`).girar).toBe("absoluto");
    // El terreno no guarda un rumbo propio: se gira desde donde está.
    expect(capacidadesDe(e, `terreno:${idZona(e)}`).girar).toBe("relativo");
    expect(capacidadesDe(e, "marca:golpe")).toEqual({ mover: true, girar: null, quitar: true });
    expect(capacidadesDe(e, "marca:paso-V1-1").girar).toBeNull();
    // Un coche sin reposo (solo su pose de impacto) se corrige con su pregunta.
    const sinReposo = quitarSeleccion(e, "coche:V1")!;
    expect(capacidadesDe(sinReposo, "coche:V1")).toEqual({
      mover: false,
      girar: null,
      quitar: false,
    });
    expect(seleccionables(sinReposo)).toContain("coche:V1");
  });

  it("las claves se leen aunque el id lleve guiones", () => {
    expect(deClave("marca:paso-V1-2")).toEqual({ tipo: "marca", id: "paso-V1-2" });
    expect(deClave("terreno:zona-1")).toEqual({ tipo: "terreno", id: "zona-1" });
  });
});

describe("mover lo seleccionado", () => {
  it("un coche en reposo va al punto y conserva su rumbo", () => {
    const e = conTodo();
    const antes = poseDe(e, "V1", "final")!;
    const x = moverA(e, impactos, "coche:V1", m(9, 9))!;
    expect(poseDe(x, "V1", "final")).toMatchObject({ punto: m(9, 9), rumbo: antes.rumbo });
    // Lo demás queda igual.
    expect(poseDe(x, "V2", "final")).toEqual(poseDe(e, "V2", "final"));
  });

  it("cada clase de cosa se mueve con su propia edición", () => {
    const e = conTodo();
    expect(
      posicionDe(moverA(e, impactos, `objeto:${idObjeto(e)}`, m(1, 1))!, `objeto:${idObjeto(e)}`),
    ).toMatchObject({ punto: m(1, 1) });
    const zona = `terreno:${idZona(e)}`;
    const z = moverA(e, impactos, zona, m(-3, 2))!;
    expect(metros(posicionDe(z, zona)!.punto, m(-3, 2))).toBeLessThan(0.01);
    expect(primerGolpe(moverA(e, impactos, "marca:golpe", m(1, 0))!)).toEqual(m(1, 0));
    expect(
      puntosDePaso(moverA(e, impactos, "marca:paso-V1-1", m(-22, 1))!, "V1")[0]!.punto,
    ).toEqual(m(-22, 1));
    const inter = `marca:objeto-${ordenIntermedio(e)}`;
    expect(posicionDe(moverA(e, impactos, inter, m(20, 0))!, inter)!.punto).toEqual(m(20, 0));
  });

  it("lo que ya no está o no se mueve no cambia nada", () => {
    const e = conTodo();
    expect(moverA(e, impactos, "objeto:no-existe", m(1, 1))).toBeNull();
    const sinReposo = quitarSeleccion(e, "coche:V2")!;
    expect(moverA(sinReposo, impactos, "coche:V2", m(1, 1))).toBeNull();
  });

  it("las flechas mueven medio metro (dos con Shift) con el norte arriba", () => {
    const p = m(0, 0);
    const norte = desplazar(p, 0, PASO_FLECHA_M);
    expect(norte.lat).toBeGreaterThan(p.lat);
    expect(metros(norte, p)).toBeCloseTo(PASO_FLECHA_M, 2);
    const este = desplazar(p, 90, PASO_FLECHA_GRANDE_M);
    expect(este.lon).toBeGreaterThan(p.lon);
    expect(metros(este, p)).toBeCloseTo(PASO_FLECHA_GRANDE_M, 2);
    // Ida y vuelta: queda donde estaba.
    const vuelta = desplazar(desplazar(p, 270, 2), 90, 2);
    expect(metros(vuelta, p)).toBeLessThan(1e-6);
  });
});

describe("girar lo seleccionado", () => {
  it("con Q/E o los botones: desde donde está", () => {
    const e = conTodo();
    const antes = poseDe(e, "V1", "final")!.rumbo;
    const x = girarSeleccion(e, "coche:V1", 15)!;
    expect(poseDe(x, "V1", "final")!.rumbo).toBeCloseTo((antes + 15) % 360, 6);
    const o = `objeto:${idObjeto(e)}`;
    expect(posicionDe(girarSeleccion(e, o, -5)!, o)!.rumbo).toBe(355);
    // El terreno también gira (su polígono), aunque no guarde un rumbo.
    const zona = `terreno:${idZona(e)}`;
    const z = girarSeleccion(e, zona, 30)!;
    expect(piezasTerreno(z)[0]!.puntos).not.toEqual(piezasTerreno(e)[0]!.puntos);
    // Un punto no se gira; cero grados no es un cambio.
    expect(girarSeleccion(e, "marca:golpe", 15)).toBeNull();
    expect(girarSeleccion(e, "coche:V1", 0)).toBeNull();
  });

  it("con el anillo: queda con el rumbo que marca, por el lado corto", () => {
    const e = conTodo();
    const o = `objeto:${idObjeto(e)}`;
    const x = fijarRumbo(e, o, 345)!;
    expect(posicionDe(x, o)!.rumbo).toBe(345);
    const coche = fijarRumbo(e, "coche:V2", 120)!;
    expect(poseDe(coche, "V2", "final")!.rumbo).toBeCloseTo(120, 6);
    // El terreno no tiene rumbo absoluto; el mismo rumbo no es un cambio.
    expect(fijarRumbo(e, `terreno:${idZona(e)}`, 90)).toBeNull();
    expect(fijarRumbo(x, o, 345)).toBeNull();
  });
  it("ronda 4: «Alinear con la calle» (A) y «Voltear 180°» (F)", () => {
    const e = conTodo();
    // La calle va a 30°: queda en el sentido que más se parece al que ya tenía.
    const calle = (_p: unknown, preferido: number) => (Math.abs(preferido - 210) < 90 ? 210 : 30);
    const x = alinearConLaCalle(e, "coche:V1", calle)!;
    expect([30, 210]).toContain(Math.round(poseDe(x, "V1", "final")!.rumbo));
    expect(alinearConLaCalle(e, "coche:V1", () => null)).toBeNull();
    expect(alinearConLaCalle(e, "marca:golpe", calle)).toBeNull();
    const antes = poseDe(e, "V2", "final")!.rumbo;
    expect(poseDe(voltear(e, "coche:V2")!, "V2", "final")!.rumbo).toBeCloseTo(
      (antes + 180) % 360,
      6,
    );
    expect(accionDeTecla({ key: "a" }, true)).toEqual({ tipo: "alinear" });
    expect(accionDeTecla({ key: "F" }, true)).toEqual({ tipo: "voltear" });
    expect(accionDeTecla({ key: "a" }, false)).toBeNull();
  });
});

describe("quitar lo seleccionado", () => {
  it("cada cosa sale de la escena; un coche solo pierde dónde quedó", () => {
    const e = conTodo();
    const sinCoche = quitarSeleccion(e, "coche:V1")!;
    expect(poseDe(sinCoche, "V1", "final")).toBeNull();
    expect(poseDe(sinCoche, "V1", "impacto")).not.toBeNull();
    expect(sinCoche.vehiculos).toHaveLength(e.vehiculos.length);
    for (const k of seleccionables(e).filter((k) => !k.startsWith("coche:"))) {
      const x = quitarSeleccion(e, k)!;
      expect(existe(x, k), k).toBe(false);
    }
    expect(quitarSeleccion(e, "objeto:no-existe")).toBeNull();
  });
});

describe("las veces que sea", () => {
  it("mover, girar, quitar y agregar en cadena no toca lo demás; volver atrás deja la misma escena", () => {
    const e = conTodo();
    const historia = [e];
    const o = `objeto:${idObjeto(e)}`;
    let x = e;
    for (let i = 0; i < 10; i++) {
      x = moverA(x, impactos, o, desplazar(posicionDe(x, o)!.punto, 0, PASO_FLECHA_M))!;
      historia.push(x);
    }
    x = girarSeleccion(x, o, 15)!;
    historia.push(x);
    x = quitarSeleccion(x, "marca:paso-V1-1")!;
    historia.push(x);
    x = agregarObjeto(x, "arbol", m(-5, -5), 0).expediente;
    historia.push(x);
    expect(metros(posicionDe(historia[10]!, o)!.punto, posicionDe(e, o)!.punto)).toBeCloseTo(5, 1);
    // Lo que no se tocó llega igual al solver.
    const vehiculos = (y: typeof e) => especDeExpediente(y).spec.vehiculos;
    expect(vehiculos(historia[12]!)).not.toEqual(vehiculos(e)); // el punto de paso salió
    expect(poseDe(x, "V1", "final")).toEqual(poseDe(e, "V1", "final"));
    expect(poseDe(x, "V2", "final")).toEqual(poseDe(e, "V2", "final"));
    // Deshacer es volver al estado anterior: el primero de la historia es la escena de antes, tal cual.
    expect(especDeExpediente(historia[0]!)).toEqual(especDeExpediente(e));
  });
});

describe("peatones y ciclistas (A3)", () => {
  function conPeaton() {
    const { expediente, id } = agregarPersona(colocados(), "peaton", m(6, 2), 90);
    return { e: expediente, id, clave: `persona:${id}` };
  }

  it("una persona se selecciona; dónde quedó también, en cuanto se marca", () => {
    const { e, id, clave } = conPeaton();
    expect(seleccionables(e)).toContain(clave);
    expect(seleccionables(e)).not.toContain(`${clave}:final`);
    expect(capacidadesDe(e, clave)).toEqual({ mover: true, girar: "absoluto", quitar: true });
    expect(posicionDe(e, clave)).toEqual({ punto: m(6, 2), rumbo: 90 });
    // Sin «dónde quedó», su clave no existe.
    expect(existe(e, `${clave}:final`)).toBe(false);
    expect(capacidadesDe(e, `${clave}:final`)).toEqual({
      mover: false,
      girar: null,
      quitar: false,
    });
    const conFinal = marcarFinalPersona(e, id, m(20, 2));
    const claves = seleccionables(conFinal);
    // Después de los vehículos y antes de los objetos, cada persona seguida de dónde quedó.
    expect(claves.slice(2, 4)).toEqual([clave, `${clave}:final`]);
    expect(capacidadesDe(conFinal, `${clave}:final`)).toEqual({
      mover: true,
      girar: null,
      quitar: true,
    });
    expect(posicionDe(conFinal, `${clave}:final`)).toEqual({ punto: m(20, 2), rumbo: null });
    expect(deClave(`${clave}:final`)).toEqual({ tipo: "persona", id: `${id}:final` });
  });

  it("se mueve, se gira y se quita como lo demás; dónde quedó se mueve y se borra aparte", () => {
    const { e, id, clave } = conPeaton();
    const movida = moverA(e, impactos, clave, m(7, 3))!;
    expect(posicionDe(movida, clave)!.punto).toEqual(m(7, 3));
    const flecha = moverA(e, impactos, clave, desplazar(m(6, 2), 0, PASO_FLECHA_M))!;
    expect(metros(posicionDe(flecha, clave)!.punto, m(6, 2))).toBeCloseTo(PASO_FLECHA_M, 2);
    // Q/E desde donde está; el anillo, al rumbo que marca, por el lado corto.
    expect(posicionDe(girarSeleccion(e, clave, -15)!, clave)!.rumbo).toBe(75);
    expect(posicionDe(fijarRumbo(e, clave, 300)!, clave)!.rumbo).toBe(300);
    expect(fijarRumbo(e, clave, 90)).toBeNull();
    // Dónde quedó: se mueve, la proyección cambia; no se gira; se borra sin quitar a la persona.
    const conFinal = marcarFinalPersona(e, id, m(20, 2));
    expect(distanciaProyeccion(conFinal.personas![0]!)).toBeCloseTo(14, 1);
    const lejos = moverA(conFinal, impactos, `${clave}:final`, m(26, 2))!;
    expect(distanciaProyeccion(lejos.personas![0]!)).toBeCloseTo(20, 1);
    expect(lejos.personas![0]!.punto).toEqual(m(6, 2));
    expect(girarSeleccion(conFinal, `${clave}:final`, 15)).toBeNull();
    const sinFinal = quitarSeleccion(conFinal, `${clave}:final`)!;
    expect(sinFinal.personas![0]!.final).toBeUndefined();
    expect(existe(sinFinal, clave)).toBe(true);
    // Quitar a la persona la saca de la escena (y de la lista).
    const sinNadie = quitarSeleccion(conFinal, clave)!;
    expect(sinNadie.personas).toBeUndefined();
    expect(seleccionables(sinNadie).some((k) => k.startsWith("persona:"))).toBe(false);
    expect(moverA(sinNadie, impactos, clave, m(1, 1))).toBeNull();
    // Nada de esto toca los vehículos.
    expect(poseDe(sinNadie, "V1", "final")).toEqual(poseDe(e, "V1", "final"));
  });

  it("las teclas de lo seleccionado sirven igual con una persona", () => {
    const { e, clave } = conPeaton();
    const accion = accionDeTecla({ key: "ArrowRight", shiftKey: true }, true)!;
    expect(accion).toEqual({ tipo: "mover", rumbo: 90, metros: PASO_FLECHA_GRANDE_M });
    const x = moverA(e, impactos, clave, desplazar(posicionDe(e, clave)!.punto, 90, 2))!;
    expect(metros(posicionDe(x, clave)!.punto, m(6, 4))).toBeLessThan(0.01);
    const q = accionDeTecla({ key: "e" }, true)!;
    expect(q).toEqual({ tipo: "girar", grados: 5 });
    expect(posicionDe(girarSeleccion(e, clave, 5)!, clave)!.rumbo).toBe(95);
    expect(accionDeTecla({ key: "Delete" }, true)).toEqual({ tipo: "quitar" });
    expect(existe(quitarSeleccion(e, clave)!, clave)).toBe(false);
  });

  it("el resumen dice dónde la golpearon y, si se marcó, la distancia de proyección", () => {
    const { e, id } = conPeaton();
    expect(resumenPersonas(e)).toEqual([
      {
        tipo: "persona",
        persona: id,
        texto: "Peatón, donde lo golpearon",
        detalle: "Falta marcar dónde quedó: con eso Croquis mide la distancia de proyección.",
        supuesto: null,
      },
    ]);
    const conFinal = marcarFinalPersona(e, id, m(20, 2));
    expect(resumenPersonas(conFinal)[0]!.detalle).toBe(
      "Quedó a 14.0 m de ahí: es la distancia de proyección.",
    );
    expect(resumenPersonas(colocados())).toEqual([]);
  });

  it("si el impacto fue contra un peatón y no hay nadie, la escena lo pide", () => {
    const base = colocados();
    expect(personaFaltante(base)).toBeNull();
    const contra = (objeto: string) => ({
      ...base,
      impactos: (base.impactos ?? []).map((i, k) => (k === 0 ? { ...i, objeto_fijo: objeto } : i)),
    });
    expect(base.impactos?.length).toBeGreaterThan(0);
    expect(personaFaltante(contra("peatón"))).toBe("peaton");
    expect(personaFaltante(contra("ciclista"))).toBe("ciclista");
    // Colocado, ya no falta (y queda ligado a ese impacto).
    const { expediente, id } = agregarPersona(contra("peatón"), "peaton", m(3, 0));
    expect(personaFaltante(expediente)).toBeNull();
    expect(expediente.impactos![0]!.persona).toBe(id);
  });
});

describe("el teclado", () => {
  const sel = (key: string, extra: Record<string, boolean> = {}) =>
    accionDeTecla({ key, ...extra }, true);
  it("flechas, Q/E, Supr y Esc actúan sobre lo seleccionado", () => {
    expect(sel("ArrowUp")).toEqual({ tipo: "mover", rumbo: 0, metros: PASO_FLECHA_M });
    expect(sel("ArrowRight", { shiftKey: true })).toEqual({
      tipo: "mover",
      rumbo: 90,
      metros: PASO_FLECHA_GRANDE_M,
    });
    expect(sel("ArrowDown")).toMatchObject({ rumbo: 180 });
    expect(sel("ArrowLeft")).toMatchObject({ rumbo: 270 });
    expect(sel("e")).toEqual({ tipo: "girar", grados: 5 });
    expect(sel("Q")).toEqual({ tipo: "girar", grados: -5 });
    expect(sel("E", { shiftKey: true })).toEqual({ tipo: "girar", grados: 15 });
    expect(sel("Delete")).toEqual({ tipo: "quitar" });
    expect(sel("Backspace")).toEqual({ tipo: "quitar" });
    expect(sel("Escape")).toEqual({ tipo: "soltar" });
    expect(sel("x")).toBeNull();
    expect(sel("ArrowUp", { altKey: true })).toBeNull();
  });

  it("deshacer y rehacer funcionan con o sin selección", () => {
    for (const haySeleccion of [true, false]) {
      expect(accionDeTecla({ key: "z", ctrlKey: true }, haySeleccion)).toEqual({
        tipo: "deshacer",
      });
      expect(accionDeTecla({ key: "z", metaKey: true }, haySeleccion)).toEqual({
        tipo: "deshacer",
      });
      expect(accionDeTecla({ key: "Z", ctrlKey: true, shiftKey: true }, haySeleccion)).toEqual({
        tipo: "rehacer",
      });
      expect(accionDeTecla({ key: "y", ctrlKey: true }, haySeleccion)).toEqual({ tipo: "rehacer" });
    }
    // Sin selección, las demás teclas no son de la escena (el mapa usa sus flechas).
    expect(accionDeTecla({ key: "ArrowUp" }, false)).toBeNull();
    expect(accionDeTecla({ key: "Delete" }, false)).toBeNull();
    expect(accionDeTecla({ key: "Escape" }, false)).toBeNull();
    // Ctrl con otra tecla (copiar, buscar) se deja al navegador.
    expect(accionDeTecla({ key: "c", ctrlKey: true }, true)).toBeNull();
  });

  it("en un campo de texto las teclas son para escribir", () => {
    const campo = document.createElement("input");
    const area = document.createElement("textarea");
    const boton = document.createElement("button");
    expect(enCampoDeTexto(campo)).toBe(true);
    expect(enCampoDeTexto(area)).toBe(true);
    expect(enCampoDeTexto(boton)).toBe(false);
    expect(enCampoDeTexto(null)).toBe(false);
  });
});

describe("la reconstrucción frente a la escena", () => {
  it("sin reconstruir no dice nada; si la escena cambió, lo dice", () => {
    expect(estadoFrenteAEscena({ hayResultado: false, vieja: false, recalculando: false })).toBe(
      null,
    );
    expect(estadoFrenteAEscena({ hayResultado: true, vieja: false, recalculando: false })).toBe(
      "al_dia",
    );
    expect(estadoFrenteAEscena({ hayResultado: true, vieja: true, recalculando: false })).toBe(
      "vieja",
    );
    expect(estadoFrenteAEscena({ hayResultado: true, vieja: true, recalculando: true })).toBe(
      "calculando",
    );
    expect(AVISO_ESCENA_CAMBIO).toMatch(/cambió después de reconstruir/);
  });
});
