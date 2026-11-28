import type { Reconstruccion } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { velocidadEnDictamen } from "./dictamen-caso";

/** La velocidad previa en la tabla del dictamen (René, 2026-11-27). */
const r = (previa: Record<string, unknown>, narrada: Record<string, unknown>) =>
  ({
    velocidades: [{ vehiculo: "V1", previa, impacto: null }],
    narradas: { V1: { kmh: 50, rango_kmh: [45, 55], origen: "perito", ...narrada } },
    limites: [],
    evidencia: [],
    ids: { "veh-a": "V1" },
  }) as unknown as Reconstruccion;

describe("la velocidad previa en el dictamen", () => {
  it("medida: la cifra con su instrumento", () => {
    const x = r({ mejor: 50, medida: true }, { como_se_sabe: "medida", medio: "gps" });
    expect(velocidadEnDictamen(x, x.velocidades[0]!, "fisica")).toBe("50 (medida por el GPS)");
  });
  it("declarada y elegida: la declarada, con la física al lado", () => {
    const x = r({ mejor: 19, p10: 15, p90: 25 }, { como_se_sabe: "declarada", medio: "conductor" });
    expect(velocidadEnDictamen(x, x.velocidades[0]!, "declarada")).toBe(
      "50 (declarada por el conductor); la física da 15–25",
    );
  });
  it("la física elegida: la física, con lo que declaró al lado", () => {
    const x = r({ mejor: 19, p10: 15, p90: 25 }, { como_se_sabe: "declarada", medio: "testigo" });
    expect(velocidadEnDictamen(x, x.velocidades[0]!, "fisica")).toBe(
      "19 (15–25); declaró 50 (un testigo)",
    );
  });
});
