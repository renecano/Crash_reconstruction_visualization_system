import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import invalidCases from "../fixtures/invalid/cases.json";
import { FIXTURE_NAMES, RAW_FIXTURES, loadFixture } from "./fixtures";
import { EscenaSpecSchema, SCHEMA_VERSION } from "./generated/escena.zod";
import { leafPaths, mutate } from "./fuzz";
import { applyMutation, type MutationCase } from "./mutations";
import { escenaSchema, isValidEscena, schemaErrors, validateEscena } from "./validate";

interface Evidencia {
  inicio: number;
  fin: number;
  texto: string;
}

function collectEvidencias(node: unknown, out: Evidencia[]): void {
  if (Array.isArray(node)) {
    for (const v of node) collectEvidencias(v, out);
  } else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.inicio === "number" && typeof o.fin === "number" && typeof o.texto === "string") {
      out.push({ inicio: o.inicio, fin: o.fin, texto: o.texto });
      return;
    }
    for (const v of Object.values(o)) collectEvidencias(v, out);
  }
}

describe("escena.schema.json", () => {
  it("declara la versión vigente y compila en Ajv estricto", () => {
    expect(escenaSchema.$defs.Meta.properties.version_esquema.const).toBe(SCHEMA_VERSION);
    expect(schemaErrors({})).not.toHaveLength(0);
  });

  it("el Zod generado está al día con el esquema", async () => {
    const { generate } = await import("../scripts/generate");
    const expected = await generate();
    const current = readFileSync(
      fileURLToPath(new URL("./generated/escena.zod.ts", import.meta.url)),
      "utf8",
    ).replaceAll("\r\n", "\n");
    expect(current).toBe(expected);
  });
});

describe("escenas canónicas", () => {
  it("son las diez de F1, la de Toluca con vía de OSM, la carambola y la reversa, con ids únicos", () => {
    expect(FIXTURE_NAMES).toHaveLength(13);
    expect(FIXTURE_NAMES).toContain("interseccion_toluca");
    expect(FIXTURE_NAMES).toContain("carambola");
    expect(FIXTURE_NAMES).toContain("reversa");
    const ids = FIXTURE_NAMES.map((n) => loadFixture(n).meta.id);
    expect(new Set(ids).size).toBe(13);
  });

  for (const name of FIXTURE_NAMES) {
    describe(name, () => {
      it("valida con Ajv y con Zod", () => {
        const raw = RAW_FIXTURES[name];
        expect(schemaErrors(raw)).toEqual([]);
        const result = validateEscena(raw);
        expect(result.ok).toBe(true);
      });

      it("está marcada como sintética y lleva relato con hash opcional", () => {
        const spec = loadFixture(name);
        expect(spec.meta.sintetico).toBe(true);
        expect(spec.meta.relato?.length ?? 0).toBeGreaterThan(50);
      });

      it("cada evidencia cita literalmente el relato", () => {
        const spec = loadFixture(name);
        const relato = spec.meta.relato ?? "";
        const evidencias: Evidencia[] = [];
        collectEvidencias(spec, evidencias);
        expect(evidencias.length).toBeGreaterThan(5);
        for (const e of evidencias) {
          expect(e.fin).toBeGreaterThan(e.inicio);
          expect(relato.slice(e.inicio, e.fin)).toBe(e.texto);
        }
      });

      it("todo campo con fuente 'relato' trae evidencia", () => {
        const spec = loadFixture(name);
        const faltantes: string[] = [];
        const walk = (node: unknown, path: string): void => {
          if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}/${i}`));
          else if (node && typeof node === "object") {
            const o = node as Record<string, unknown>;
            if (o.fuente === "relato" && !(Array.isArray(o.evidencia) && o.evidencia.length > 0)) {
              faltantes.push(path);
            }
            for (const [k, v] of Object.entries(o)) walk(v, `${path}/${k}`);
          }
        };
        walk(spec, "");
        expect(faltantes).toEqual([]);
      });

      it("sobrevive un viaje de ida y vuelta por JSON sin cambios", () => {
        const spec = loadFixture(name);
        const again = EscenaSpecSchema.parse(JSON.parse(JSON.stringify(spec)));
        expect(again).toEqual(spec);
      });
    });
  }
});

describe("casos inválidos compartidos con Python", () => {
  const base = RAW_FIXTURES.alcance;
  for (const c of invalidCases.casos as MutationCase[]) {
    it(`rechaza: ${c.nombre}`, () => {
      const doc = applyMutation(base, c);
      expect(isValidEscena(doc)).toBe(false);
      expect(EscenaSpecSchema.safeParse(doc).success).toBe(false);
    });
  }
});

describe("equivalencia Ajv ↔ Zod bajo mutaciones aleatorias", () => {
  it("ambos validadores coinciden en 300 documentos mutados", () => {
    const fixtures = FIXTURE_NAMES.map((n) => RAW_FIXTURES[n]);
    const paths = fixtures.map((f) => leafPaths(f));
    fc.assert(
      fc.property(
        fc.nat({ max: fixtures.length - 1 }),
        fc.nat({ max: 5000 }),
        fc.nat({ max: 11 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (fi, pi, kind, payload) => {
          const list = paths[fi] ?? [];
          const path = list[pi % list.length];
          if (!path) return;
          const doc = mutate(fixtures[fi], path, kind, payload);
          expect(EscenaSpecSchema.safeParse(doc).success).toBe(isValidEscena(doc));
        },
      ),
      { numRuns: 300, seed: 20261010 },
    );
  });
});
