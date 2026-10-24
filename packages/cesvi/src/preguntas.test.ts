/**
 * Las preguntas del hecho (comentario de René, 2026-10-24): una pregunta = un solo dato, cada una con
 * su control (opciones, número con unidad, sí o no, colocar en el mapa) y «No sé» solo como opción
 * secundaria. La masa típica sale de datos con fuente y queda como supuesto.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Conteos, Expediente, SalidaCorpus } from "./corpus";
import {
  CLASES_PREGUNTA,
  conClase,
  conMasaTipica,
  conPrimerImpacto,
  conZonaImpacto,
  escenaDeConversion,
  escenaDeNarracion,
  masaTipica,
  preguntaPendiente,
  sinImpactoSupuesto,
  type PreguntaEscena,
} from "./escena-narracion";
import MASAS from "./data/masas-tipicas.json";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const GRABACIONES = join(RAIZ, "data/cesvi/grabaciones/escenas");

/** Todas las lecturas grabadas del repositorio. */
const leidas = readdirSync(GRABACIONES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const g = JSON.parse(readFileSync(join(GRABACIONES, f), "utf8")) as {
      narracion: string;
      salida: SalidaCorpus;
    };
    return { nombre: f, escena: escenaDeNarracion(g.salida, g.narracion) };
  });

/** Un expediente al que le falta todo: fuerza cada tipo de pregunta. */
const vacio: Expediente = {
  caso: {},
  vehiculos: [{ id: "V1" }, { id: "V2" }],
} as unknown as Expediente;
const sinNada = escenaDeConversion({
  expediente: vacio,
  conteos: {} as Conteos,
  posiciones: [],
});

const todas: { nombre: string; p: PreguntaEscena }[] = [
  ...leidas.flatMap(({ nombre, escena }) => escena.preguntas.map((p) => ({ nombre, p }))),
  ...sinNada.preguntas.map((p) => ({ nombre: "sin nada", p })),
];

describe("preguntas del hecho: un dato y su control", () => {
  it("hay lecturas y preguntas que revisar", () => {
    expect(leidas.length).toBeGreaterThanOrEqual(10);
    // El expediente vacío pregunta cada tipo: impactos, clase, masa, restos y posición final.
    const claves = sinNada.preguntas.map((p) => p.clave);
    for (const c of ["impactos", "clase-V1", "masa-V1", "restos", "final-V1"])
      expect(claves).toContain(c);
  });

  it.each(todas.map((x) => [`${x.nombre}: ${x.p.clave}`, x.p] as const))(
    "%s tiene un control de respuesta además de «No sé» y pide un solo dato",
    (_n, p) => {
      const c = p.control;
      expect(["sino", "opciones", "numero", "mapa"]).toContain(c.tipo);
      if (c.tipo === "opciones") {
        expect(c.opciones.length).toBeGreaterThanOrEqual(2);
        expect(
          c.opciones.every((o) => o.valor && o.etiqueta && !/no s[eé]/i.test(o.etiqueta)),
        ).toBe(true);
      }
      if (c.tipo === "numero") expect(["kg", "m"]).toContain(c.unidad);
      // Un solo dato: una sola pregunta, sin «y cuál», «y qué», «y en qué»…
      expect(p.texto.split("?").length - 1).toBe(1);
      expect(p.texto).not.toMatch(/ y (cu[aá]l|qu[eé]|en qu[eé]|d[oó]nde|c[oó]mo)\b/i);
    },
  );

  it("la clase va aparte de la masa, con las opciones de René", () => {
    const etiquetas = CLASES_PREGUNTA.map((o) => o.etiqueta);
    expect(etiquetas).toEqual(["Sedán", "Hatchback", "SUV", "Pickup", "Camión", "Moto", "Otro"]);
    const clase = sinNada.preguntas.find((p) => p.clave === "clase-V1")!;
    const masa = sinNada.preguntas.find((p) => p.clave === "masa-V1")!;
    expect(clase.control.tipo).toBe("opciones");
    // Sin clase no hay masa típica que ofrecer; con la clase, sí, y queda como supuesto.
    expect(masa.control).toEqual({ tipo: "numero", unidad: "kg" });
    const e = conClase(vacio, "V1", "pickup");
    expect(preguntaPendiente(clase, e, [])).toBe(false);
    const conTipica = conMasaTipica(e, "V1")!;
    expect(conTipica.vehiculos[0]!.masa).toEqual({
      valor: MASAS.masas.pickup.kg,
      unidad: "kg",
      fuente: "supuesto",
    });
    expect(preguntaPendiente(masa, conTipica, [])).toBe(false);
    // «Otro» no cambia la clase y la masa se pregunta sin típica.
    expect(conClase(vacio, "V1", "otro")).toBe(vacio);
    expect(conMasaTipica(vacio, "V1")).toBeNull();
  });

  it("la masa típica sale de E2 (y la moto, de las fichas), con su fuente", () => {
    const e2 = JSON.parse(readFileSync(join(RAIZ, "eval/results/e2_barrier.json"), "utf8")) as {
      clases: Record<string, { masa_media_kg: number; n: number }>;
    };
    for (const [clase, c] of Object.entries(e2.clases)) {
      const t = masaTipica(clase);
      expect(t?.valor).toBe(c.masa_media_kg);
      expect(t?.fuente).toContain(`${c.n} pruebas de NHTSA`);
    }
    expect(masaTipica("motocicleta")?.fuente).toMatch(/fichas de fabricante/);
    expect(masaTipica(undefined)).toBeNull();
  });

  it("cada respuesta deja de estar pendiente", () => {
    const impactos = sinNada.preguntas.find((p) => p.clave === "impactos")!;
    const e = conPrimerImpacto(vacio, "V1|V2");
    expect(e.impactos).toEqual([{ orden: 1, vehiculos: ["V1", "V2"], fuente: "perito" }]);
    expect(preguntaPendiente(impactos, e, [])).toBe(false);
    const zona: PreguntaEscena = {
      clave: "zona-1-V2",
      texto: "",
      porQue: "",
      control: { tipo: "opciones", opciones: [] },
      vehiculo: "V2",
      impacto: 1,
    };
    expect(preguntaPendiente(zona, e, [])).toBe(true);
    expect(preguntaPendiente(zona, conZonaImpacto(e, 1, "V2", "posterior"), [])).toBe(false);
    const final = sinNada.preguntas.find((p) => p.clave === "final-V1")!;
    expect(final.control).toEqual({ tipo: "mapa" });
    expect(preguntaPendiente(final, e, [{ vehiculo: "V1" }])).toBe(false);
    // «No es correcto» al impacto supuesto: se quita y vuelve a preguntarse cuáles chocaron.
    const supuesto = {
      ...e,
      impactos: [{ ...e.impactos![0]!, fuente: "supuesto" as const }],
    };
    expect(preguntaPendiente(impactos, sinImpactoSupuesto(supuesto), [])).toBe(true);
  });
});
