import { describe, expect, it } from "vitest";
import semantic from "../fixtures/semantic/cases.json";
import { boxesOverlap, checkEscena, type TablaClases } from "./check";
import { FIXTURE_NAMES, RAW_FIXTURES, loadFixture, type FixtureName } from "./fixtures";
import { EscenaSpecSchema } from "./generated/escena.zod";
import { applyMutation, type MutationCase } from "./mutations";
import { isValidEscena } from "./validate";

interface SemanticCase {
  nombre: string;
  base: FixtureName;
  mutaciones: MutationCase[];
  errores: [string, string][];
  advertencias: [string, string][];
}

const clases = semantic.clases_de_prueba as unknown as TablaClases;
const casos = semantic.casos as unknown as SemanticCase[];

describe("checkEscena", () => {
  for (const name of FIXTURE_NAMES) {
    it(`la escena canónica ${name} no tiene errores semánticos`, () => {
      const problemas = checkEscena(loadFixture(name), { clases });
      expect(problemas.filter((p) => p.severidad === "error")).toEqual([]);
    });
  }

  for (const c of casos) {
    it(`caso compartido: ${c.nombre}`, () => {
      let doc: unknown = RAW_FIXTURES[c.base];
      for (const m of c.mutaciones) doc = applyMutation(doc, m);
      expect(isValidEscena(doc)).toBe(true); // el esquema acepta; la semántica decide
      const spec = EscenaSpecSchema.parse(doc);
      const problemas = checkEscena(spec, { clases });
      const errores = problemas
        .filter((p) => p.severidad === "error")
        .map((p) => [p.codigo, p.ruta]);
      const advertencias = problemas
        .filter((p) => p.severidad === "advertencia")
        .map((p) => [p.codigo, p.ruta]);
      expect(errores).toEqual([...c.errores].sort(byRutaCodigo));
      expect(advertencias).toEqual([...c.advertencias].sort(byRutaCodigo));
      for (const p of problemas) {
        expect(p.mensaje.toLowerCase()).not.toMatch(/culpa|responsable/);
      }
    });
  }

  it("sin tabla de clases omite las comprobaciones por clase", () => {
    let doc: unknown = RAW_FIXTURES.alcance;
    doc = applyMutation(doc, {
      op: "set",
      ruta: "/vehiculos/0/masa",
      valor: { valor: 8, unidad: "t", fuente: "usuario", confianza: 1 },
    });
    const problemas = checkEscena(EscenaSpecSchema.parse(doc), { clases: {} });
    expect(problemas.map((p) => p.codigo)).not.toContain("E006");
  });
});

describe("boxesOverlap", () => {
  const box = (x: number, y: number, l: number, w: number, deg: number) => {
    const th = (deg * Math.PI) / 180;
    const c = Math.cos(th);
    const s = Math.sin(th);
    return (
      [
        [l / 2, w / 2],
        [l / 2, -w / 2],
        [-l / 2, -w / 2],
        [-l / 2, w / 2],
      ] as [number, number][]
    ).map(([px, py]) => [x + px * c - py * s, y + px * s + py * c] as [number, number]);
  };

  it("detecta traslape y separación, incluso rotados", () => {
    expect(boxesOverlap(box(0, 0, 4, 2, 0), box(3, 0, 4, 2, 0))).toBe(true);
    expect(boxesOverlap(box(0, 0, 4, 2, 0), box(4.01, 0, 4, 2, 0))).toBe(false);
    expect(boxesOverlap(box(0, 0, 4, 2, 0), box(0, 2.5, 4, 2, 90))).toBe(true);
    expect(boxesOverlap(box(0, 0, 4, 2, 45), box(5, 5, 4, 2, 45))).toBe(false);
  });
});

function byRutaCodigo(a: [string, string], b: [string, string]): number {
  return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}
