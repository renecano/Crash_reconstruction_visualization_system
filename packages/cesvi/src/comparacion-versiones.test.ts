import { describe, expect, it } from "vitest";
import { compararVersiones, zonasEsperadasDeclarada } from "./comparacion-versiones";
import { caso } from "./caso";
import { zonasDeDanos } from "./correspondencia";

const c = caso("A2010930");
const zonas = { A: zonasDeDanos(c.vehiculos.A.danos), B: zonasDeDanos(c.vehiculos.B.danos) };

describe("qué cambia entre versiones (ADR 0057)", () => {
  it("una reversa dejaría los daños al centro de la parte posterior de A y del frente de B", () => {
    expect(zonasEsperadasDeclarada("reversa")).toEqual({
      A: ["posterior_centro"],
      B: ["frontal_centro"],
    });
    expect(zonasEsperadasDeclarada(null)).toEqual({ A: [], B: [] });
  });

  it("caso A2010930: restos y daños no coinciden; la velocidad de B no se declara", () => {
    const r = compararVersiones({
      restos: { declarada: 0, evidencia: 15.89 },
      zonas,
      esperadas: zonasEsperadasDeclarada("reversa"),
      velocidades: { deformacion: 63.15, desplazamiento: 60.27 },
      velocidadDeclarada: null,
    });
    expect(r.filas.map((f) => [f.clave, f.estado])).toEqual([
      ["restos", "no_coincide"],
      ["danos_a", "no_coincide"],
      ["danos_b", "no_coincide"],
      ["velocidad_b", "sin_dato"],
    ]);
    expect(r.filas[0]).toMatchObject({ declarada: "0.00 m", evidencia: "15.89 m" });
    expect(r.filas[1]!.evidencia).toBe("posterior izquierda");
    expect(r.filas[3]!.evidencia).toBe("60–63 km/h");
    expect(r.resumen).toBe("3 de 4 no coinciden con la versión declarada.");
  });

  it("si las versiones coinciden, lo dice; sin croquis, la fila de restos queda sin dato", () => {
    const iguales = compararVersiones({
      restos: { declarada: 15.6, evidencia: 15.89 },
      zonas: { A: ["posterior_centro"], B: ["frontal_centro"] },
      esperadas: zonasEsperadasDeclarada("reversa"),
      velocidades: null,
      velocidadDeclarada: null,
    });
    expect(iguales.noCoinciden).toBe(0);
    const sin = compararVersiones({
      restos: null,
      zonas,
      esperadas: zonasEsperadasDeclarada("reversa"),
      velocidades: null,
      velocidadDeclarada: null,
    });
    expect(sin.filas[0]!.estado).toBe("sin_dato");
  });
});
