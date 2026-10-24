import { loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { DOWNED_SLIDE_CLASSES, downedMotorcycleFriction, sources } from "./friction";
import { reconstruct } from "./reconstruct";

describe("arrastre de la moto caída (port de croquis_solver.friction, ADR 0017)", () => {
  it("medido en asfalto; en otra superficie, supuesto con el mismo rango", () => {
    const asfalto = downedMotorcycleFriction("asfalto");
    expect([asfalto.low, asfalto.nominal, asfalto.high]).toEqual([0.36, 0.45, 0.56]);
    expect(asfalto.tipo).toBe("primaria");
    expect(sources()[asfalto.fuente]).toBeTruthy();
    for (const sup of ["concreto", "adoquin", "empedrado", "terraceria", "_nota"]) {
      const otro = downedMotorcycleFriction(sup);
      expect(otro.tipo).toBe("supuesto");
      expect([otro.low, otro.high]).toEqual([asfalto.low, asfalto.high]);
    }
    expect([...DOWNED_SLIDE_CLASSES].sort()).toEqual(["motocicleta", "scooter"]);
  });

  it("con más arrastre la moto se desliza menos y el auto casi no cambia", () => {
    const spec = loadFixture("motociclista") as Record<string, unknown>;
    const nominal = reconstruct(spec, { dt: 0.05 });
    const alto = reconstruct(spec, { dt: 0.05, downedMu: 0.56 });
    const bajo = reconstruct(spec, { dt: 0.05, downedMu: 0.36 });
    const post = (r: typeof nominal, clase: string) =>
      r.vehiculos.find((v) => v.clase === clase)!.distancePostM;
    expect(post(alto, "motocicleta")).toBeLessThan(post(nominal, "motocicleta"));
    expect(post(nominal, "motocicleta")).toBeLessThan(post(bajo, "motocicleta"));
    // El auto casi no cambia: solo lo une a la moto la separación de sus contornos en los 0.04 s
    // después del impacto (ADR 0089), que reparte el encaje según cómo se mueve cada uno.
    expect(Math.abs(post(alto, "sedan_compacto") - post(nominal, "sedan_compacto"))).toBeLessThan(
      1e-3,
    );
    expect((nominal.parametros.friccion_moto_caida as { valor: number }).valor).toBe(0.45);
    expect((alto.parametros.friccion_moto_caida as { valor: number }).valor).toBe(0.56);
  });
});
