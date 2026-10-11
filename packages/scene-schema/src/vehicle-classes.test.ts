import { describe, expect, it } from "vitest";
import { checkEscena } from "./check";
import { loadFixture } from "./fixtures";
import { CampoClaseVehiculo } from "./generated/escena.zod";
import { VEHICLE_CLASSES, VEHICLE_CLASSES_META } from "./vehicle-classes";

const CLASES_DEL_CONTRATO = CampoClaseVehiculo.shape.valor.options;

describe("vehicle_classes.json", () => {
  it("cubre todas las clases del contrato con rangos coherentes", () => {
    for (const clase of CLASES_DEL_CONTRATO) {
      const c = VEHICLE_CLASSES[clase];
      expect(c, clase).toBeDefined();
      if (!c) continue;
      for (const key of [
        "masa_kg",
        "largo_m",
        "ancho_m",
        "alto_m",
        "distancia_entre_ejes_m",
      ] as const) {
        const [lo, hi] = c[key];
        expect(lo, `${clase}.${key}`).toBeLessThan(hi);
        expect(c.tipico[key], `${clase}.${key}.tipico`).toBeGreaterThanOrEqual(lo);
        expect(c.tipico[key], `${clase}.${key}.tipico`).toBeLessThanOrEqual(hi);
        expect(["ficha", "secundaria", "derivado_pbv", "supuesto"]).toContain(c.origen[key]);
      }
      expect(c.velocidad_max_kmh).toBeGreaterThan(0);
      expect(c.origen.velocidad_max_kmh).toBe("supuesto");
    }
    expect(Object.keys(VEHICLE_CLASSES).sort()).toEqual([...CLASES_DEL_CONTRATO].sort());
  });

  it("declara su procedencia", () => {
    expect(VEHICLE_CLASSES_META.fuente).toContain("models_raw.json");
    expect(VEHICLE_CLASSES_META.generado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("es la tabla por defecto de checkEscena", () => {
    const spec = loadFixture("alcance");
    spec.vehiculos[0]!.masa = { valor: 9, unidad: "t", fuente: "usuario", confianza: 1 };
    expect(checkEscena(spec).map((p) => p.codigo)).toContain("E006");
    expect(checkEscena(spec, { clases: {} }).map((p) => p.codigo)).not.toContain("E006");
  });
});
