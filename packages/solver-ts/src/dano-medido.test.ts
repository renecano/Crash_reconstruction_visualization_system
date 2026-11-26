import { loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { crushEnergy, Stiffness } from "./crash3";
import { reconstruct, reconstructionToDict } from "./reconstruct";

/**
 * Lo medido junto a lo calculado (René, 2026-11-26): con el daño medido en la cara del contacto, la
 * deformación se calcula con la rigidez del reporte y la forma y el ancho de lo medido; el resultado
 * lleva C1–C6 medidos, la energía que implican y la rigidez con su fuente.
 */
type Json = Record<string, unknown>;
const conMedido = (): Json => {
  const spec = structuredClone(loadFixture("alcance")) as unknown as Json & {
    danos_declarados: Json[];
  };
  spec.danos_declarados[0] = {
    ...spec.danos_declarados[0],
    profundidad_aplastamiento: { valor: 0.4, unidad: "m", fuente: "usuario", confianza: 0.9 },
    ancho_danado: { valor: 1.5, unidad: "m", fuente: "usuario", confianza: 0.9 },
    perfil_aplastamiento: {
      valor: [0.4, 0.3, 0.2, 0.1],
      unidad: "m",
      fuente: "usuario",
      confianza: 0.9,
    },
    rigidez: { a: 50000, b: 400000, fuente: "usuario", confianza: 0.9, nota: "Del reporte." },
  };
  return spec;
};
const dano = (spec: Json, id: string) =>
  ((reconstructionToDict(reconstruct(spec as never, {})) as { vehiculos: Json[] }).vehiculos.find(
    (v) => v.id === id,
  )!.dano ?? {}) as Json;

describe("el daño medido junto al calculado", () => {
  it("con la rigidez del reporte, la forma y el ancho de lo medido", () => {
    const d = dano(conMedido(), "veh-a");
    expect(d.origen_rigidez).toBe("reporte");
    expect(d.rigidez).toMatchObject({ a_n_m: 50000, b_n_m2: 400000, fuente: "reporte" });
    expect(d.ancho_m).toBe(1.5);
    expect(d.medido_m).toEqual([0.4, 0.34, 0.28, 0.22, 0.16, 0.1]);
    const e = crushEnergy([0.4, 0.34, 0.28, 0.22, 0.16, 0.1], 1.5, new Stiffness(50000, 400000));
    expect(d.energia_medida_j).toBeCloseTo(e, 2);
    // La forma calculada es la de lo medido: decrece de C1 a C6.
    const p = d.perfil_m as number[];
    expect(p[0]).toBeGreaterThan(p[5]!);
  });

  it("sin medidas, la rigidez de NHTSA de la clase, con su fuente, y nada medido", () => {
    const d = dano(loadFixture("alcance") as unknown as Json, "veh-b");
    expect((d.rigidez as Json).fuente).toBe("nhtsa");
    expect(String((d.rigidez as Json).nota)).toMatch(/NHTSA|FMVSS|pruebas/);
    expect(d.medido_m).toBeUndefined();
  });
});
