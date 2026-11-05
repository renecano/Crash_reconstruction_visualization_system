import { describe, expect, it } from "vitest";
import { METODO, plural, textoPosicionesFinales } from "./textos-caso";

describe("textos del caso (prompt del rediseño §0)", () => {
  it("pluraliza: «1 mensaje», «2 mensajes», «0 mensajes»", () => {
    expect(plural(1, "mensaje")).toBe("1 mensaje");
    expect(plural(2, "mensaje")).toBe("2 mensajes");
    expect(plural(0, "mensaje")).toBe("0 mensajes");
    expect(plural(1, "vehículo", "vehículos")).toBe("1 vehículo");
  });

  it("posiciones finales: sin dato en el reporte no se compara (antes, «0 de 0»)", () => {
    expect(textoPosicionesFinales({ cesvi: 0, croquis_las_tiene: 0 })).toBe(
      "Sin dato en el reporte · no comparable",
    );
    expect(textoPosicionesFinales({ cesvi: 2, croquis_las_tiene: 1 })).toBe("Croquis tiene 1 de 2");
  });

  it("los dos métodos tienen nombres distintos", () => {
    expect(METODO.reconstruccion).not.toBe(METODO.cesvi);
  });
});
