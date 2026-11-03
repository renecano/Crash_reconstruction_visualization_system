import { describe, expect, it } from "vitest";
import { PAINT_LOOK, paintLookFor, paintMaterial } from "./paint-material";

describe("pintura con hojuelas (T1.4)", () => {
  it("cada estado de pintura es más rugoso y con menos barniz que el anterior", () => {
    expect(PAINT_LOOK.nueva.roughness).toBeLessThan(PAINT_LOOK.normal.roughness);
    expect(PAINT_LOOK.normal.roughness).toBeLessThan(PAINT_LOOK.desgastada.roughness);
    expect(PAINT_LOOK.desgastada.clearcoat).toBeLessThan(PAINT_LOOK.normal.clearcoat);
    expect(paintLookFor(undefined)).toBe(PAINT_LOOK.normal);
  });

  it("el material lleva el color plano del caso y los nodos de hojuelas", () => {
    const m = paintMaterial("#c0392b", "nueva");
    expect(m.color.getHexString()).toBe("c0392b");
    expect(m.clearcoat).toBe(1);
    expect(m.normalNode).not.toBeNull();
    expect(m.metalnessNode).not.toBeNull();
    expect(m.colorNode).not.toBeNull();
    const worn = paintMaterial("#c0392b", "desgastada");
    expect(worn.roughness).toBeGreaterThan(m.roughness);
  });
});
