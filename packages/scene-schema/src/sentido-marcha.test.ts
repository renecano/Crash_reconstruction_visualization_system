/**
 * T3.3 (W8): el sentido de marcha va aparte del rumbo del frente y de la forma de la maniobra, en la
 * escena, en la maniobra del expediente y en el vehículo del resultado. Es opcional.
 */
import { describe, expect, it } from "vitest";
import { loadFixture } from "./fixtures";
import { expedienteErrors, validateEscena } from "./index";
import { RESULT_LOADERS, validateResultado } from "./resultado";

type Json = Record<string, unknown>;

describe("sentido de marcha en el contrato", () => {
  it("la escena lo acepta junto a cualquier maniobra y rechaza otros valores", () => {
    const spec = structuredClone(loadFixture("lateral_interseccion")) as unknown as {
      vehiculos: Json[];
    };
    expect(validateEscena(spec).ok).toBe(true);
    spec.vehiculos[0]!.maniobra = { valor: "vuelta_izquierda", fuente: "usuario", confianza: 0.8 };
    spec.vehiculos[0]!.sentido_marcha = { valor: "reversa", fuente: "usuario", confianza: 0.8 };
    expect(validateEscena(spec).ok).toBe(true);
    spec.vehiculos[0]!.sentido_marcha = { valor: "adelante", fuente: "supuesto", confianza: 0.5 };
    expect(validateEscena(spec).ok).toBe(true);
    spec.vehiculos[0]!.sentido_marcha = { valor: "atras", fuente: "usuario", confianza: 0.8 };
    expect(validateEscena(spec).ok).toBe(false);
  });

  it("la maniobra del expediente lo acepta", () => {
    const e = (sentido: string) => ({
      caso: { modalidades: ["reversa"] },
      vehiculos: [{ id: "V1" }, { id: "V2" }],
      versiones: [
        {
          tipo: "evidencia",
          maniobras: [{ vehiculo: "V1", tipo: "vira_izquierda", sentido_marcha: sentido }],
        },
      ],
    });
    expect(expedienteErrors(e("reversa"))).toEqual([]);
    expect(expedienteErrors(e("adelante"))).toEqual([]);
    expect(expedienteErrors(e("atras")).join("\n")).toContain("sentido_marcha");
  });

  it("el vehículo del resultado lo acepta", async () => {
    const r = structuredClone(await RESULT_LOADERS.reversa()) as { vehiculos: Json[] };
    r.vehiculos[0]!.sentido_marcha = "reversa";
    expect(validateResultado(r).ok).toBe(true);
    r.vehiculos[0]!.sentido_marcha = "atras";
    expect(validateResultado(r).ok).toBe(false);
  });
});
