import { reconstruirExpediente, resultadoAjustado } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { expedienteAxaReconstruccion, SPEC_ID_APP } from "./axa-reconstruccion";
import { filasDano } from "./danos-caso";

describe("los daños de AXA A2010930 (prompt del rediseño §0.1)", () => {
  const e = expedienteAxaReconstruccion();
  const r = reconstruirExpediente(e, SPEC_ID_APP);

  it("V2 lleva el perfil medido del reporte; V1, «sin dato» con su motivo (nunca 0)", () => {
    const filas = filasDano(e, resultadoAjustado(r), r.ids);
    const v2 = filas.find((f) => f.vehiculo === "V2")!;
    const v1 = filas.find((f) => f.vehiculo === "V1")!;
    expect(v2.medido).toEqual({ tipo: "medido", cara: "frente", cCm: [96, 86, 52, 20], lM: 1.689 });
    expect(v1.medido.tipo).toBe("sin_dato");
    if (v1.medido.tipo === "sin_dato") expect(v1.medido.motivo).toMatch(/no trae la medida/);
  });

  it(
    "con las velocidades reconstruidas, energía y Δv no son 0 en ningún vehículo",
    { timeout: 60_000 },
    () => {
      for (const f of filasDano(e, resultadoAjustado(r), r.ids)) {
        expect(f.calculado.tipo).toBe("calculado");
        if (f.calculado.tipo === "calculado") {
          expect(f.calculado.energiaKj).toBeGreaterThan(0);
          expect(f.calculado.deltaVKmh).toBeGreaterThan(0);
        }
      }
    },
  );

  it("con el resultado de partida (velocidades supuestas, sin choque) dice «sin dato», no 0", () => {
    const filas = filasDano(e, r.resultado, r.ids);
    for (const f of filas) {
      expect(f.calculado.tipo).toBe("sin_dato");
      if (f.calculado.tipo === "sin_dato") expect(f.calculado.motivo).toMatch(/no absorbe energía/);
    }
  });
});
