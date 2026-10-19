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
});
