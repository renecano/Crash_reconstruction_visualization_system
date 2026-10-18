import fc from "fast-check";
import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { applyAxisAngle, quatFromAxisAngle, slerp } from "./dthree";

/**
 * Los ayudantes deterministas siguen las fórmulas de three.js r186 con dmath (fdlibm, como V8): en
 * Node (V8) deben dar exactamente lo mismo que three.js.
 */
const fin = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
const unit = fc
  .tuple(fin(-1, 1), fin(-1, 1), fin(-1, 1))
  .filter(([x, y, z]) => x * x + y * y + z * z > 1e-6)
  .map(([x, y, z]) => new Vector3(x, y, z).normalize());
const quat = fc
  .tuple(fin(-1, 1), fin(-1, 1), fin(-1, 1), fin(-1, 1))
  .filter(([x, y, z, w]) => x * x + y * y + z * z + w * w > 1e-6)
  .map(([x, y, z, w]) => new Quaternion(x, y, z, w).normalize());
const same = (a: Quaternion, b: Quaternion): boolean =>
  Object.is(a.x, b.x) && Object.is(a.y, b.y) && Object.is(a.z, b.z) && Object.is(a.w, b.w);

describe("dthree: igual a three.js en V8", () => {
  it("quatFromAxisAngle", () => {
    fc.assert(
      fc.property(unit, fin(-50, 50), (axis, angle) =>
        same(quatFromAxisAngle(axis, angle), new Quaternion().setFromAxisAngle(axis, angle)),
      ),
      { numRuns: 5000, seed: 20261017 },
    );
  });
  it("applyAxisAngle", () => {
    fc.assert(
      fc.property(unit, unit, fin(-50, 50), (v, axis, angle) => {
        const a = applyAxisAngle(v.clone(), axis, angle);
        const b = v.clone().applyAxisAngle(axis, angle);
        return Object.is(a.x, b.x) && Object.is(a.y, b.y) && Object.is(a.z, b.z);
      }),
      { numRuns: 5000, seed: 20261017 },
    );
  });
  it("slerp (incluidos ángulos pequeños y t fuera de [0, 1])", () => {
    fc.assert(
      fc.property(quat, quat, fin(-0.5, 1.5), (qa, qb, t) =>
        same(slerp(qa.clone(), qb, t), qa.clone().slerp(qb, t)),
      ),
      { numRuns: 5000, seed: 20261017 },
    );
    const q = new Quaternion(0.1, 0.2, 0.3, 0.9).normalize();
    const near = q.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1e-4));
    expect(same(slerp(q.clone(), near, 0.3), q.clone().slerp(near, 0.3))).toBe(true);
  });
  it("devuelven el objeto de salida", () => {
    const out = new Quaternion();
    expect(quatFromAxisAngle(new Vector3(0, 1, 0), 1, out)).toBe(out);
    const v = new Vector3(1, 0, 0);
    expect(applyAxisAngle(v, new Vector3(0, 1, 0), 1)).toBe(v);
  });
});
