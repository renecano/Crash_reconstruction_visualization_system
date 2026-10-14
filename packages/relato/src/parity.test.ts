import { describe, expect, it } from "vitest";
import golden from "../fixtures/golden.json";
import { findTerms, glossaryVersion } from "./glossary";
import { piiVersion, redact } from "./pii";
import { fold } from "./text";

interface Case {
  texto: string;
  redaccion: string;
  tramos: [string, number, number][];
  glosario: [string, number, number][];
}

const G = golden as {
  version_pii: string;
  version_glosario: string;
  plegado: { entrada: string; salida: string };
  casos: Case[];
};

/** Posición UTF-16 → punto de código (las de Python). */
function cp(text: string, i: number): number {
  return [...text.slice(0, i)].length;
}

describe("paridad con la referencia Python (packages/relato/fixtures/golden.json)", () => {
  it("usa las mismas versiones de datos", () => {
    expect(piiVersion()).toBe(G.version_pii);
    expect(glossaryVersion()).toBe(G.version_glosario);
  });

  it("pliega igual los bloques latinos, de puntuación y de espacios", () => {
    const got = fold(G.plegado.entrada);
    const want = G.plegado.salida;
    const diff = [...G.plegado.entrada].filter((ch, k) => [...got][k] !== [...want][k]);
    expect(diff).toEqual([]);
    expect(got).toBe(want);
  });

  for (const [k, c] of G.casos.entries()) {
    it(`caso ${k}: ${c.texto.slice(0, 48)}`, () => {
      const r = redact(c.texto);
      expect(r.text).toBe(c.redaccion);
      expect(r.spans.map((s) => [s.kind, cp(c.texto, s.start), cp(c.texto, s.end)])).toEqual(
        c.tramos,
      );
      expect(
        findTerms(c.texto).map((t) => [t.id, cp(c.texto, t.start), cp(c.texto, t.end)]),
      ).toEqual(c.glosario);
    });
  }
});
