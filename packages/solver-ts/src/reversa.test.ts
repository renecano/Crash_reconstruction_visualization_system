/**
 * Reversa (R4b, ADR 0069); espejo de `solver/tests/test_reversa.py`. El vehículo avanza con la
 * parte posterior por delante y el rumbo del frente es el que dejó el perito.
 */
import { loadFixture } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { wrapAngle } from "./models";
import { ReversePath, StraightPath, travelHeading } from "./preimpact";
import { reconstruct } from "./reconstruct";

describe("reversa", () => {
  it("la trayectoria en reversa conserva el rumbo del frente", () => {
    const p = new ReversePath(new StraightPath([0, 0], Math.PI, 50));
    const pose = p.pose(10);
    expect(pose.x).toBeCloseTo(-10, 12);
    expect(wrapAngle(pose.heading)).toBeCloseTo(0, 12);
    expect(travelHeading(p, pose.heading)).toBeCloseTo(Math.PI, 12);
    expect(travelHeading(new StraightPath([0, 0], 0.3, 1), 0.3)).toBe(0.3);
  });

  it("en la escena canónica, el que retrocede choca con su parte posterior", () => {
    const r = reconstruct(loadFixture("reversa"));
    const vs = new Map(r.vehiculos.map((v) => [v.id, v]));
    const a = vs.get("veh-a")!;
    const tr = a.trajectory;
    const antes = tr.t.map((t, i) => i).filter((i) => tr.t[i]! < -0.05);
    expect(antes.length).toBeGreaterThan(0);
    for (const i of antes) {
      // Mira al oriente y se mueve al poniente.
      expect(Math.abs(wrapAngle(tr.yaw[i]!))).toBeLessThan(1e-9);
      expect(tr.vx[i]!).toBeLessThan(0);
    }
    expect(a.cdc?.lado).toBe("B");
    expect(vs.get("veh-b")!.cdc?.lado).toBe("F");
    // El golpe empuja a B hacia atrás (al poniente de donde estaba detenida, en x = −3).
    expect(vs.get("veh-b")!.restPose[0]).toBeLessThan(-3);
  });
});
