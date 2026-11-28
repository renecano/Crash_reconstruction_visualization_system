import { avisoSobreElLimite, type Reconstruccion } from "@croquis/cesvi";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CifraReconstruccion } from "./hoja-reconstruccion";

/** Una reconstrucción mínima con la velocidad de un vehículo y sus simulaciones. */
function reconstruccion(mejor: number, p10: number, p90: number): Reconstruccion {
  const valores = Array.from({ length: 32 }, (_, k) => p10 + ((p90 - p10) * k) / 31);
  return {
    velocidades: [
      {
        vehiculo: "V2",
        previa: { mejor, p10, p50: (p10 + p90) / 2, p90, muestras: 32 },
        impacto: { p10, p50: (p10 + p90) / 2, p90, valores },
      },
    ],
    evidencia: ["reposo:veh-b"],
    ids: { "veh-b": "V2" },
    limites: [],
  } as unknown as Reconstruccion;
}

const pintar = (r: Reconstruccion) =>
  render(
    <CifraReconstruccion
      r={r}
      nombres={{ V2: "B · Camaro" }}
      decisiones={[]}
      onRepetir={() => undefined}
    />,
  );

/** Hallado el 2026-11-15 en el caso de ejemplo con poste: «102 km/h, rango 72–99» sin explicación. */
describe("la cifra de la reconstrucción y su rango", () => {
  it("si el mejor ajuste queda fuera del rango, se dice junto a la cifra", () => {
    pintar(reconstruccion(102.07, 71.68, 99.05));
    expect(screen.getByTestId("cifra-rango").textContent).toContain("72–99");
    expect(screen.getByTestId("mejor-fuera-del-rango").textContent).toContain(
      "por arriba del rango",
    );
  });

  it("si queda dentro (AXA: 56.87 en 55.11–78.06), no hay aviso", () => {
    pintar(reconstruccion(56.87, 55.11, 78.06));
    expect(screen.getByTestId("cifra-rango").textContent).toContain("55–78");
    expect(screen.queryByTestId("mejor-fuera-del-rango")).toBeNull();
  });
});

describe("las posiciones contra lo narrado (René, 2026-11-22)", () => {
  it("se dice junto a la cifra, con el nombre del vehículo, aunque no sea el que encabeza", () => {
    const r = reconstruccion(36, 31, 38);
    r.limites = [
      "V3: la narración dice más de 80 km/h («a alta velocidad»); las posiciones dan 10 km/h (7–14). No se fuerza ninguna de las dos: revisa las posiciones marcadas y lo que dice la narración.",
      "V2: la narración dice «60 km/h»; entra como supuesto de 54 a 66 km/h. Solo pesa si la evidencia no la fija.",
    ];
    render(
      <CifraReconstruccion
        r={r}
        nombres={{ V2: "B · Camaro", V3: "C · CR-V" }}
        decisiones={[]}
        onRepetir={() => undefined}
      />,
    );
    const notas = screen.getAllByTestId("contra-narracion");
    expect(notas).toHaveLength(1);
    expect(notas[0]!.textContent).toBe(
      "C · CR-V: la narración dice más de 80 km/h («a alta velocidad»); las posiciones dan 10 km/h (7–14). No se fuerza ninguna de las dos: revisa las posiciones marcadas y lo que dice la narración.",
    );
  });
});

describe("la velocidad que dio el perito junto a la cifra (René, 2026-11-27)", () => {
  it("declarada: lo que declaró y lo que da la física", () => {
    const r = reconstruccion(19, 15, 25) as unknown as Record<string, unknown>;
    r.narradas = {
      V2: {
        kmh: 50,
        rango_kmh: [45, 55],
        origen: "perito",
        como_se_sabe: "declarada",
        medio: "conductor",
      },
    };
    pintar(r as unknown as Reconstruccion);
    expect(screen.getByTestId("declarada-vs-fisica").textContent).toBe(
      "B · Camaro: declaró 50 km/h (el conductor); la física da 15–25 km/h.",
    );
    expect(screen.queryByTestId("velocidad-medida")).toBeNull();
  });

  it("medida: la cifra es la medida, sin rango ni «mejor ajuste»", () => {
    const r = {
      velocidades: [{ vehiculo: "V2", previa: { mejor: 50, medida: true }, impacto: null }],
      evidencia: ["reposo:veh-b"],
      ids: { "veh-b": "V2" },
      limites: [],
      narradas: {
        V2: {
          kmh: 50,
          rango_kmh: [45, 55],
          origen: "perito",
          como_se_sabe: "medida",
          medio: "camara",
        },
      },
    } as unknown as Reconstruccion;
    pintar(r);
    expect(screen.getByTestId("velocidad-medida").textContent).toBe(
      "B · Camaro: 50 km/h medida por la cámara; la física no la ajusta.",
    );
    expect(screen.getByTestId("metodo-cifra").textContent).toBe("Velocidad medida, no ajustada");
    expect(screen.queryByTestId("cifra-rango")).toBeNull();
  });
});

describe("la cifra muy por arriba del límite de la vía (René, 2026-11-26)", () => {
  it("se dice junto a la cifra, con el nombre del vehículo", () => {
    const aviso = avisoSobreElLimite("V2", 95, { kmh: 50, fuente: "OpenStreetMap" })!;
    pintar({ ...reconstruccion(95, 90, 99), limites: [aviso] } as Reconstruccion);
    const nota = screen.getByTestId("sobre-el-limite").textContent!;
    expect(nota).toMatch(/^B · Camaro: la cifra/);
    expect(nota).toContain("queda más de 40 km/h arriba del límite de esta vía");
    expect(nota).toContain("revisa las posiciones finales y las medidas antes de usarla");
  });

  it("dentro del margen, no hay aviso", () => {
    expect(avisoSobreElLimite("V2", 85, { kmh: 50, fuente: "OpenStreetMap" })).toBeNull();
    pintar(reconstruccion(85, 80, 90));
    expect(screen.queryByTestId("sobre-el-limite")).toBeNull();
  });
});
