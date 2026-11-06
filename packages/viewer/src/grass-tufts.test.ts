import { Color } from "three";
import { describe, expect, it } from "vitest";
import { buildGrassTufts, GRASS_RADIUS_M } from "./grass-tufts";

const base = {
  seed: 7,
  center: { x: 0, y: 0 },
  count: 40,
  allowed: () => true,
  heightAt: () => 0,
  groundColor: "#5d6b4a",
};

describe("matas de pasto (T1.3b)", () => {
  it("se reparten con la semilla dentro del radio", () => {
    const a = buildGrassTufts({ ...base, night: false })!;
    const b = buildGrassTufts({ ...base, night: false })!;
    expect(a.count).toBe(40);
    expect(Array.from(a.instanceMatrix.array)).toEqual(Array.from(b.instanceMatrix.array));
    for (let i = 0; i < a.count; i++) {
      const [x, , z] = [12, 13, 14].map((k) => a.instanceMatrix.array[i * 16 + k]!);
      expect(Math.hypot(x!, z!)).toBeLessThanOrEqual(GRASS_RADIUS_M + 1e-6);
    }
  });

  it("el material lleva el color del suelo y lo que necesita Blender para rearmar las hojas (R11)", () => {
    const m = buildGrassTufts({ ...base, night: true })!.material as unknown as {
      color: Color;
      userData: Record<string, unknown>;
    };
    // Sin color, el glTF las pintaba blancas.
    expect(m.color.getHexString()).toBe(new Color("#5d6b4a").getHexString());
    expect(m.userData.croquisPasto).toEqual({ color: "#5d6b4a", noche: true });
  });

  it("sin lugar para el pasto no hay matas", () => {
    expect(buildGrassTufts({ ...base, night: false, allowed: () => false })).toBeNull();
  });
});
