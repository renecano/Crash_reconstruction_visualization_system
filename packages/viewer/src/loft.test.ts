import { Box3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { loftGeometry, sectionPoints, stationsAlong } from "./loft";

const box = (len = 4, w = 0.9, h = 0.8) =>
  stationsAlong(-len / 2, len / 2, 0.06, () => ({ y0: 0.2, y1: 0.2 + h, w0: w, w1: w }));

describe("loft", () => {
  it("la caja envolvente coincide con las estaciones", () => {
    const g = loftGeometry(box(), { step: 0.06, radius: 0.05, capRings: 6 });
    g.computeBoundingBox();
    const size = (g.boundingBox as Box3).getSize(new Vector3());
    expect(size.x).toBeCloseTo(4, 6);
    expect(size.y).toBeCloseTo(0.8, 2);
    expect(size.z).toBeCloseTo(1.8, 2);
  });

  it("las normales apuntan hacia afuera", () => {
    const g = loftGeometry(box(), { step: 0.06, radius: 0.05, capRings: 6 });
    const pos = g.getAttribute("position");
    const idx = g.getIndex();
    expect(idx).not.toBeNull();
    if (!idx) return;
    const center = new Vector3(0, 0.6, 0);
    let outward = 0;
    let total = 0;
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(pos, idx.getX(i));
      b.fromBufferAttribute(pos, idx.getX(i + 1));
      c.fromBufferAttribute(pos, idx.getX(i + 2));
      const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
      if (n.lengthSq() < 1e-14) continue;
      const mid = a.clone().add(b).add(c).divideScalar(3).sub(center);
      total++;
      if (n.dot(mid) > 0) outward++;
    }
    expect(outward / total).toBeGreaterThan(0.999);
  });

  it("hay vértices interiores en el costado y en el frente (para deformarlos)", () => {
    const g = loftGeometry(box(), { step: 0.06, radius: 0.05, capRings: 6 });
    const pos = g.getAttribute("position");
    let side = 0;
    let front = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (Math.abs(z - 0.9) < 1e-6 && Math.abs(x) < 1.5 && y > 0.4 && y < 0.8) side++;
      if (Math.abs(x - 2) < 1e-6 && Math.abs(z) < 0.5 && y > 0.3 && y < 0.9) front++;
    }
    expect(side).toBeGreaterThan(100);
    expect(front).toBeGreaterThan(20);
  });

  it("la sección se muestrea a paso uniforme y respeta su trapecio", () => {
    const pts = sectionPoints({ x: 0, y0: 0, y1: 1, w0: 1, w1: 0.6 }, 64, 0.05);
    expect(pts).toHaveLength(64);
    for (const [y, z] of pts) {
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(z)).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(() =>
      loftGeometry(box().slice(0, 1), { step: 0.06, radius: 0.05, capRings: 2 }),
    ).toThrow();
  });
});
