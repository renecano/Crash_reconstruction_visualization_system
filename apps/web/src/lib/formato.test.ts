import { describe, expect, it } from "vitest";
import { numero, ordinal, pct } from "./formato";

describe("formato", () => {
  it("números, porcentajes y lugares en español de México", () => {
    expect(numero(380391)).toBe("380,391");
    expect(pct(0.5842)).toBe("58.4 %");
    expect(ordinal(1)).toBe("primer");
    expect(ordinal(3)).toBe("tercer");
    expect(ordinal(12)).toBe("12.º");
  });

  it("porcentajes y lugares en inglés", () => {
    expect(pct(0.5842, "en")).toBe("58.4%");
    expect(ordinal(1, "en")).toBe("1st");
    expect(ordinal(2, "en")).toBe("2nd");
    expect(ordinal(3, "en")).toBe("3rd");
    expect(ordinal(4, "en")).toBe("4th");
    expect(ordinal(11, "en")).toBe("11th");
    expect(ordinal(12, "en")).toBe("12th");
    expect(ordinal(13, "en")).toBe("13th");
    expect(ordinal(21, "en")).toBe("21st");
    expect(ordinal(22, "en")).toBe("22nd");
  });
});
