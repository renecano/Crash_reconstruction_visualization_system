import { describe, expect, it } from "vitest";
import legacy from "../fixtures/migrations/v0_9_0_alcance.json";
import { RAW_FIXTURES } from "./fixtures";
import { SCHEMA_VERSION } from "./generated/escena.zod";
import { MIGRATIONS, migrateEscena, type Migration } from "./migrate";
import { isValidEscena, schemaErrors } from "./validate";

/** Migración de prueba: 0.9.0 → 1.0.0 (renombra velocidad y añade sentidos). Misma lógica que en Python. */
const TEST_REGISTRY: Migration[] = [
  {
    desde: "0.9.0",
    hasta: "1.0.0",
    descripcion: "velocidad → velocidad_previa; lugar.sentidos por defecto",
    aplicar: (doc) => {
      const out = structuredClone(doc);
      const vehiculos = (out.vehiculos as Record<string, unknown>[] | undefined) ?? [];
      for (const v of vehiculos) {
        if ("velocidad" in v && !("velocidad_previa" in v)) {
          v.velocidad_previa = v.velocidad;
          delete v.velocidad;
        }
      }
      const lugar = (out.lugar as Record<string, unknown> | undefined) ?? {};
      lugar.sentidos ??= { valor: "doble_sentido", fuente: "default", confianza: 0.5 };
      out.lugar = lugar;
      return out;
    },
  },
  ...MIGRATIONS,
];

describe("migrateEscena", () => {
  it("una escena vigente no cambia", () => {
    const r = migrateEscena(RAW_FIXTURES.alcance);
    expect(r.aplicadas).toEqual([]);
    expect(r.desde).toBe(SCHEMA_VERSION);
    expect(r.doc).toEqual(RAW_FIXTURES.alcance);
    expect(r.doc).not.toBe(RAW_FIXTURES.alcance);
  });

  it("encadena migraciones hasta la versión vigente y el resultado valida", () => {
    const { _descripcion: _d, ...doc } = legacy as Record<string, unknown>;
    void _d;
    expect(isValidEscena(doc)).toBe(false);
    const r = migrateEscena(doc, TEST_REGISTRY);
    expect(r.aplicadas).toEqual([
      "0.9.0→1.0.0",
      "1.0.0→1.1.0",
      "1.1.0→1.2.0",
      "1.2.0→1.3.0",
      "1.3.0→2.0.0",
      "2.0.0→2.1.0",
      "2.1.0→2.2.0",
    ]);
    expect(schemaErrors(r.doc)).toEqual([]);
    expect((r.doc.meta as Record<string, unknown>).version_esquema).toBe(SCHEMA_VERSION);
  });

  it("una escena 1.0.0 migra sin cambios a la vigente (solo hay campos opcionales nuevos)", () => {
    const viejo = structuredClone(RAW_FIXTURES.alcance) as {
      meta: Record<string, unknown>;
      evidencias?: Record<string, unknown>[];
    };
    viejo.meta.version_esquema = "1.0.0";
    for (const e of viejo.evidencias ?? []) delete e.fase;
    const r = migrateEscena(viejo);
    expect(r.aplicadas).toEqual([
      "1.0.0→1.1.0",
      "1.1.0→1.2.0",
      "1.2.0→1.3.0",
      "1.3.0→2.0.0",
      "2.0.0→2.1.0",
      "2.1.0→2.2.0",
    ]);
    expect(schemaErrors(r.doc)).toEqual([]);
    expect(r.doc.meta).toEqual((RAW_FIXTURES.alcance as { meta: unknown }).meta);
  });

  it("falla con versiones desconocidas, futuras o ausentes", () => {
    const { _descripcion: _d, ...doc } = legacy as Record<string, unknown>;
    void _d;
    expect(() => migrateEscena(doc)).toThrow(/No hay migración registrada desde la versión 0.9.0/);
    const futuro = structuredClone(RAW_FIXTURES.alcance) as { meta: Record<string, unknown> };
    futuro.meta.version_esquema = "9.0.0";
    expect(() => migrateEscena(futuro)).toThrow(/más nueva/);
    expect(() => migrateEscena({})).toThrow(/version_esquema/);
    expect(() => migrateEscena(null)).toThrow(/objeto/);
  });
});
