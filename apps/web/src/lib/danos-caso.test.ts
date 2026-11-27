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

  it(
    "lo medido junto a lo calculado, con el aviso neutral si pide más energía de la que el choque da",
    { timeout: 60_000 },
    () => {
      const v2 = filasDano(e, resultadoAjustado(r), r.ids).find((f) => f.vehiculo === "V2")!;
      expect(v2.calculado.tipo).toBe("calculado");
      if (v2.calculado.tipo !== "calculado") return;
      expect(v2.calculado.medidoCm).toEqual([96, 90, 79, 59, 39, 20]);
      expect(v2.calculado.rigidez).toBe("rigidez del reporte");
      expect(v2.calculado.rigidezNota).toMatch(/imprime N\/m y J.*kN\/m y kJ/);
      expect(v2.calculado.energiaMedidaKj).toBeGreaterThan(220);
      expect(v2.calculado.maxDisipableKj).toBeLessThan(70);
      expect(v2.calculado.aviso).toMatch(
        /^La deformación medida, con la rigidez del reporte, equivale a 22\d kJ; un choque a estas velocidades puede disipar a lo más \d+ kJ: revisa la rigidez o las medidas\.$/,
      );
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
