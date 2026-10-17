import { describe, expect, it } from "vitest";
import { fmtNumber } from "./format-number";

describe("fmtNumber", () => {
  it("da exactamente lo mismo que toLocaleString es-MX con decimales fijos", () => {
    const values = [0, -0, 1, -1.5, 0.004, 2.5, 12.345, 1234.5678, -98765.4321, 1e7, 0.1 + 0.2];
    for (const d of [0, 1, 2, 3]) {
      for (const v of values) {
        expect(fmtNumber(v, d)).toBe(
          v.toLocaleString("es-MX", { maximumFractionDigits: d, minimumFractionDigits: d }),
        );
      }
    }
  });

  it("sin decimales por omisión y con separador de miles", () => {
    expect(fmtNumber(1234.6)).toBe("1,235");
    expect(fmtNumber(3.14159, 2)).toBe("3.14");
  });
});
