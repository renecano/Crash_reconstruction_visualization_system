import { describe, expect, it } from "vitest";
import { temaPorDefecto } from "./preferencias-cesvi";

describe("el tema de /cesvi la primera vez (Laboratorio §3)", () => {
  it("al trabajar sigue al sistema; al presentar abre en noche", () => {
    expect(temaPorDefecto("trabajar", false)).toBe("claro");
    expect(temaPorDefecto("trabajar", true)).toBe("oscuro");
    expect(temaPorDefecto("presentar", false)).toBe("oscuro");
    expect(temaPorDefecto("presentar", true)).toBe("oscuro");
  });
});
