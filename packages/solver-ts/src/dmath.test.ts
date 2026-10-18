import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as dmath from "./dmath";

/**
 * Funciones trascendentes deterministas (E8, ADR 0029). La tabla fija los bits exactos de fdlibm
 * (no depende de la versión de Node); las propiedades comparan con `Math` de V8, que también usa
 * fdlibm: la diferencia debe ser como mucho de 1 ulp aunque V8 cambie de implementación.
 */

const view = new DataView(new ArrayBuffer(8));
function hex(x: number): string {
  view.setFloat64(0, x);
  return view.getBigUint64(0).toString(16).padStart(16, "0");
}
function ulps(a: number, b: number): number {
  if (Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b))) return 0;
  view.setFloat64(0, a);
  let x = view.getBigInt64(0);
  view.setFloat64(0, b);
  let y = view.getBigInt64(0);
  if (x < 0n) x = -(x & 0x7fffffffffffffffn);
  if (y < 0n) y = -(y & 0x7fffffffffffffffn);
  return Number(x > y ? x - y : y - x);
}

type Unaria = "sin" | "cos" | "tan" | "atan" | "acos" | "exp" | "log";
const UNARIAS: [Unaria, number, string][] = [
  ["acos", 0.1, "3ff787b22ce3f590"],
  ["acos", 0.49, "3ff0f0764decac8b"],
  ["acos", 0.5, "3ff0c152382d7366"],
  ["acos", 0.75, "3fe720a392c1d955"],
  ["acos", 0.9999, "3f8cf69d216bd74b"],
  ["acos", -0.3, "3ffe0200bbc96ad8"],
  ["acos", -0.5, "4000c152382d7366"],
  ["acos", -0.9, "400586476251e745"],
  ["acos", 1e-10, "3ff921fb543d4de0"],
  ["sin", 0.5, "3fdeaee8744b05f0"],
  ["sin", 1, "3feaed548f090cee"],
  ["sin", 2.5, "3fe326af0dcfcab0"],
  ["sin", -3, "bfc210386db6d55b"],
  ["sin", 10, "bfe1689ef5f34f52"],
  ["sin", 1000000, "bfd6664b2568d867"],
  ["sin", 1e22, "bfeb453ab76bf397"],
  ["sin", 1e300, "bfea2c16b010e385"],
  ["sin", 0.7853981633974483, "3fe6a09e667f3bcc"],
  ["sin", 3.141592653589793, "3ca1a62633145c07"],
  ["cos", 0.5, "3fec1528065b7d50"],
  ["cos", 1, "3fe14a280fb5068c"],
  ["cos", 2.5, "bfe9a2f7ef858b7d"],
  ["cos", -3, "bfefae04be85e5d2"],
  ["cos", 10, "bfead9ac890c6b1f"],
  ["cos", 1000000, "3fedf9df9906d32c"],
  ["cos", 1e22, "3fe0be2cef01c8f4"],
  ["cos", 1e300, "bfe2699022adc4c1"],
  ["cos", 1.5707963267948966, "3c91a62633145c07"],
  ["tan", 0.5, "3fe17b4f5bf3474a"],
  ["tan", 1, "3ff8eb245cbee3a6"],
  ["tan", 1.5, "402c33ed50b88777"],
  ["tan", -2.5, "3fe7e79b4e00bb15"],
  ["tan", 100, "bfe2ca74d62b5d38"],
  ["tan", 10000000000, "bfe1de000f443f50"],
  ["tan", 0.7853981633974483, "3fefffffffffffff"],
  ["atan", 0.3, "3fd2a73a661eaf06"],
  ["atan", 0.5, "3fddac670561bb4f"],
  ["atan", 1, "3fe921fb54442d18"],
  ["atan", 1.7, "3ff0a00a3bce369f"],
  ["atan", 3, "3ff3fc176b7a8560"],
  ["atan", -40, "bff8bb9a63718f45"],
  ["atan", 1e20, "3ff921fb54442d18"],
  ["exp", -700, "00d14f2b0fb9307f"],
  ["exp", -1, "3fd78b56362cef38"],
  ["exp", 0.1, "3ff1aec7b35a00d4"],
  ["exp", 0.5, "3ffa61298e1e069c"],
  ["exp", 1, "4005bf0a8b145769"],
  ["exp", 2.5, "40285d6fd931e0bb"],
  ["exp", 20, "41bceb088b68e804"],
  ["exp", 700, "7f0d945df4f8ec8e"],
  ["log", 1e-310, "c0864e69394d9508"],
  ["log", 1e-5, "c027069e2aa2aa5b"],
  ["log", 0.5, "bfe62e42fefa39ef"],
  ["log", 0.9999999, "be7ad7f2b1049b9f"],
  ["log", 1.0000001, "3e7ad7f2847b6492"],
  ["log", 2, "3fe62e42fefa39ef"],
  ["log", 10, "40026bb1bbb55516"],
  ["log", 1e300, "4085963447f87fb5"],
];
const BINARIAS: ["atan2" | "hypot", number, number, string][] = [
  ["atan2", 1, 2, "3fddac670561bb4f"],
  ["atan2", -1, 2, "bfddac670561bb4f"],
  ["atan2", 1, -2, "40056c6e7397f5ae"],
  ["atan2", -1, -2, "c0056c6e7397f5ae"],
  ["atan2", 3, 0.001, "3ff9209dcdc8c77a"],
  ["atan2", 1e-300, 1e300, "0000000000000000"],
  ["hypot", 3, 4, "4014000000000000"],
  ["hypot", 1e-200, 1e-200, "167151f68876f410"],
  ["hypot", 1e200, 3e200, "69908669e596b4f8"],
  ["hypot", 0.1, 0.2, "3fcc9f25c5bfedda"],
];

describe("dmath: bits exactos de fdlibm", () => {
  it.each(UNARIAS)("%s(%s)", (f, x, bits) => {
    expect(hex(dmath[f](x))).toBe(bits);
  });
  it.each(BINARIAS)("%s(%s, %s)", (f, a, b, bits) => {
    expect(hex(dmath[f](a, b))).toBe(bits);
  });
  it.each([
    [[1, 2, 3], "400deeea11683f48"],
    [[0.1, -0.2, 0.3, 0.4], "3fe186f174f88473"],
    [[1e-200, 2e-200, 3e-200], "1686e994ecad50fe"],
  ] as const)("hypotN(%j)", (xs, bits) => {
    expect(hex(dmath.hypotN(xs))).toBe(bits);
  });
});

describe("dmath: casos especiales de IEEE 754", () => {
  it("ceros con signo, infinitos y NaN", () => {
    expect(Object.is(dmath.sin(-0), -0)).toBe(true);
    expect(Object.is(dmath.tan(-0), -0)).toBe(true);
    expect(Object.is(dmath.atan(-0), -0)).toBe(true);
    expect(dmath.cos(0)).toBe(1);
    expect(dmath.exp(0)).toBe(1);
    expect(dmath.exp(1)).toBe(Math.E);
    expect(dmath.exp(-Infinity)).toBe(0);
    expect(dmath.exp(Infinity)).toBe(Infinity);
    expect(dmath.exp(710)).toBe(Infinity);
    expect(dmath.exp(-746)).toBe(0);
    expect(dmath.log(1)).toBe(0);
    expect(dmath.log(0)).toBe(-Infinity);
    expect(dmath.log(Infinity)).toBe(Infinity);
    expect(dmath.atan(Infinity)).toBe(Math.PI / 2);
    for (const f of ["sin", "cos", "tan"] as const) {
      expect(dmath[f](Infinity)).toBeNaN();
      expect(dmath[f](NaN)).toBeNaN();
    }
    expect(dmath.log(-1)).toBeNaN();
    expect(dmath.exp(NaN)).toBeNaN();
  });
  it("atan2 en los ejes y con infinitos", () => {
    expect(Object.is(dmath.atan2(0, 0), 0)).toBe(true);
    expect(Object.is(dmath.atan2(-0, 0), -0)).toBe(true);
    expect(dmath.atan2(0, -0)).toBe(Math.PI);
    expect(dmath.atan2(-0, -0)).toBe(-Math.PI);
    expect(dmath.atan2(1, 0)).toBe(Math.PI / 2);
    expect(dmath.atan2(-1, -0)).toBe(-Math.PI / 2);
    expect(dmath.atan2(Infinity, Infinity)).toBe(Math.PI / 4);
    expect(dmath.atan2(-Infinity, -Infinity)).toBe((-3 * Math.PI) / 4);
    expect(dmath.atan2(1, -Infinity)).toBe(Math.PI);
    expect(dmath.atan2(NaN, 1)).toBeNaN();
  });
  it("acos en los extremos y fuera del dominio", () => {
    expect(dmath.acos(1)).toBe(0);
    expect(dmath.acos(-1)).toBe(Math.PI);
    expect(dmath.acos(0)).toBe(Math.PI / 2);
    expect(dmath.acos(1.0000001)).toBeNaN();
    expect(dmath.acos(-2)).toBeNaN();
    expect(dmath.acos(NaN)).toBeNaN();
  });
  it("hypotN con ceros, infinitos y NaN", () => {
    expect(dmath.hypotN([])).toBe(0);
    expect(dmath.hypotN([-0, 0, -0])).toBe(0);
    expect(dmath.hypotN([NaN, Infinity, 1])).toBe(Infinity);
    expect(dmath.hypotN([NaN, 1, 2])).toBeNaN();
    expect(dmath.hypotN([2, 3, 6])).toBe(7);
  });
  it("hypot con ceros, infinitos y NaN", () => {
    expect(dmath.hypot(0, 0)).toBe(0);
    expect(dmath.hypot(-0, -0)).toBe(0);
    expect(dmath.hypot(Infinity, NaN)).toBe(Infinity);
    expect(dmath.hypot(NaN, -Infinity)).toBe(Infinity);
    expect(dmath.hypot(NaN, 1)).toBeNaN();
    expect(dmath.hypot(-5, 12)).toBe(13);
  });
  it("pow2 es exacto en todo el rango y rechaza exponentes no enteros", () => {
    for (let k = -1074; k <= 1023; k++) expect(dmath.pow2(k)).toBe(2 ** k);
    expect(dmath.pow2(1024)).toBe(Infinity);
    expect(() => dmath.pow2(0.5)).toThrow();
  });
});

const fin = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

describe("dmath: a lo más 1 ulp de Math (V8)", () => {
  const props: [string, fc.Arbitrary<number>, (x: number) => number, (x: number) => number][] = [
    ["sin", fin(-1e9, 1e9), dmath.sin, Math.sin],
    ["cos", fin(-1e9, 1e9), dmath.cos, Math.cos],
    ["tan", fin(-1e6, 1e6), dmath.tan, Math.tan],
    ["atan", fin(-1e300, 1e300), dmath.atan, Math.atan],
    ["acos", fin(-1, 1), dmath.acos, Math.acos],
    ["exp", fin(-745, 709), dmath.exp, Math.exp],
    ["log", fin(0, 1e308), dmath.log, Math.log],
  ];
  it.each(props)("%s", (_, arb, d, m) => {
    fc.assert(
      fc.property(arb, (x) => ulps(d(x), m(x)) <= 1),
      { numRuns: 20000, seed: 20261017 },
    );
  });
  it("atan2 y hypot", () => {
    fc.assert(
      fc.property(fin(-1e200, 1e200), fin(-1e200, 1e200), (y, x) => {
        return (
          ulps(dmath.atan2(y, x), Math.atan2(y, x)) <= 1 &&
          ulps(dmath.hypot(x, y), Math.hypot(x, y)) <= 1
        );
      }),
      { numRuns: 20000, seed: 20261017 },
    );
  });
  it("hypotN de 3 y 4 valores", () => {
    const xs = fc.array(fin(-1e150, 1e150), { minLength: 3, maxLength: 4 });
    fc.assert(
      fc.property(xs, (v) => ulps(dmath.hypotN(v), Math.hypot(...v)) <= 1),
      { numRuns: 20000, seed: 20261017 },
    );
  });
});
