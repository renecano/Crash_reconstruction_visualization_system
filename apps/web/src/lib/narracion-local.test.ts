import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectarEnNarracion,
  MAX_NARRACION,
  piezasDetectadas,
  textoConteo,
} from "./narracion-local";

const EJEMPLO = (
  JSON.parse(
    readFileSync(
      join(__dirname, "../../../../data/cesvi/grabaciones/escenas/cesvi-e814f085db.json"),
      "utf8",
    ),
  ) as { narracion: string }
).narracion;

describe("la narración sin IA (A2)", () => {
  it("el conteo dice cuánto falta y el tope", () => {
    expect(textoConteo(7)).toBe("Escribe al menos 20 caracteres (llevas 7).");
    expect(textoConteo(1500)).toBe("1,500 de 12,000 caracteres");
    expect(MAX_NARRACION).toBe(12_000);
  });

  it("en la narración de ejemplo ve los dos vehículos, el lugar, la hora y las medidas", () => {
    const d = detectarEnNarracion(EJEMPLO);
    expect(d.vehiculos).toEqual(["A (VW Jetta 2002)", "B (GM Camaro 1995)"]);
    expect(d.lugar).toBe(true);
    expect(d.hora).toBe("22:30");
    expect(d.medidas).toBeGreaterThan(0);
    expect(piezasDetectadas(d)[0]).toBe("2 vehículos: A (VW Jetta 2002), B (GM Camaro 1995)");
  });

  it("un texto sin datos no inventa nada", () => {
    const d = detectarEnNarracion("Hubo un choque leve entre dos autos.");
    expect(piezasDetectadas(d)).toEqual([]);
  });

  it("velocidades y huellas", () => {
    const d = detectarEnNarracion("Circulaba a 60 km/h y dejó huellas de frenado de 12.5 m.");
    expect(d.velocidades).toBe(1);
    expect(d.huellas).toBe(true);
    expect(d.medidas).toBe(1);
  });
});
