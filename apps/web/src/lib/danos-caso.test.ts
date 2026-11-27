import { reconstruirExpediente, resultadoAjustado } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { expedienteAxaReconstruccion, SPEC_ID_APP } from "./axa-reconstruccion";
import { filasDano, roceBajoElUmbral } from "./danos-caso";

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

describe("el roce bajo el umbral de CRASH3 (René, 2026-11-26, la reversa)", () => {
  // La parte posterior de una SUV compacta (NHTSA): A²/2B = 5590 J/m; en 0.72 m, 4.0 kJ.
  const rigidez = { a_n_m: 97012, b_n_m2: 841777 };
  it("con el perfil en cero y menos energía que el umbral, dice las dos energías", () => {
    expect(
      roceBajoElUmbral(1300, { perfil_m: [0, 0, 0, 0, 0, 0], ancho_m: 0.72, rigidez }),
    ).toEqual({ energiaKj: 1.3, umbralKj: 4, anchoM: 0.7 });
  });
  it("si hay deformación, si pasa el umbral o si falta la rigidez, no es un roce", () => {
    expect(
      roceBajoElUmbral(1300, { perfil_m: [0, 0.01, 0, 0, 0, 0], ancho_m: 0.72, rigidez }),
    ).toBeNull();
    expect(
      roceBajoElUmbral(5000, { perfil_m: [0, 0, 0, 0, 0, 0], ancho_m: 0.72, rigidez }),
    ).toBeNull();
    expect(roceBajoElUmbral(1300, { perfil_m: [0, 0, 0, 0, 0, 0], ancho_m: 0.72 })).toBeNull();
  });
});
