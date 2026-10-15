import { describe, expect, it } from "vitest";
import table from "./data/yaw_inertia.json";
import { bodyFor, yawInertia } from "./inertia";
import { Body2D } from "./models";

describe("inercia de guiñada (port de croquis_solver.inertia)", () => {
  it("usa el radio de giro medido del grupo de la clase", () => {
    const c = table.grupos.auto.c;
    const r = yawInertia("sedan_mediano", 1500, 4.8, 1.8);
    expect(r.origen).toBe("nhtsa");
    expect(r.radiusOverLength).toBe(c);
    expect(r.value).toBeCloseTo(1500 * (c * 4.8) ** 2, 9);
    expect(yawInertia("microbus_combi", 1800, 4.7, 1.8).radiusOverLength).toBe(table.grupos.van.c);
  });

  it("sin grupo usa la placa uniforme, marcada como supuesto", () => {
    const r = yawInertia("motocicleta", 200, 2.1, 0.8);
    expect(r.origen).toBe("supuesto");
    expect(r.value).toBeCloseTo(Body2D.boxInertia(200, 2.1, 0.8), 9);
    expect(bodyFor("autobus", 12000, 12, 2.5).inertia).toBeCloseTo(
      Body2D.boxInertia(12000, 12, 2.5),
      6,
    );
  });
});
