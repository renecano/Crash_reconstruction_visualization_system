import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import datos from "@/data/recorrido.json";
import { cifra, GraficaVista, mejorIndice, numero, type Grafica } from "./graficas";

describe("formato", () => {
  it("números en español de México, con hasta tres decimales", () => {
    expect(numero(68557)).toBe("68,557");
    expect(numero(0.92391)).toBe("0.924");
    expect(numero(8.1)).toBe("8.1");
  });
  it("cifras enteras, científicas y de texto", () => {
    const a = { es: "a", en: "a" };
    expect(cifra({ etiqueta: a, valor: 11, formato: "entero" })).toBe("11");
    expect(cifra({ etiqueta: a, valor: 4.1e-5, formato: "cientifico" })).toBe("4.1 × 10⁻⁵");
    const texto = { es: "11 de 11", en: "11 of 11" };
    expect(cifra({ etiqueta: a, valor: texto, formato: "texto" })).toBe("11 de 11");
    expect(cifra({ etiqueta: a, valor: texto, formato: "texto" }, "en")).toBe("11 of 11");
  });
  it("el mejor valor depende de si la métrica sube o baja", () => {
    const barras = [
      { etiqueta: { es: "Croquis", en: "Croquis" }, valor: 8.85, croquis: true },
      { etiqueta: { es: "WinSMASH", en: "WinSMASH" }, valor: 8.19, croquis: false },
    ];
    expect(mejorIndice(barras, "menor")).toBe(1);
    expect(mejorIndice(barras, "mayor")).toBe(0);
  });
});

describe("GraficaVista", () => {
  const g: Grafica = {
    tipo: "barras",
    titulo: { es: "Test CISS", en: "CISS test" },
    metrica: { es: "Error absoluto medio", en: "Mean absolute error" },
    mejor: "menor",
    unidad: "km/h",
    barras: [
      { etiqueta: { es: "Croquis", en: "Croquis" }, valor: 8.85, croquis: true },
      { etiqueta: { es: "WinSMASH", en: "WinSMASH" }, valor: 8.19, croquis: false },
    ],
  };

  it("muestra cada barra con su valor y marca la mejor, aunque no sea Croquis", () => {
    render(<GraficaVista g={g} />);
    const filas = screen.getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    expect(filas[0]!.textContent).toMatch(/8\.85\s*km\/h/);
    expect(within(filas[1]!).getByTitle("mejor valor")).toBeTruthy();
    expect(within(filas[0]!).queryByTitle("mejor valor")).toBeNull();
    expect(screen.getByText(/menos es mejor/)).toBeTruthy();
  });

  it("en inglés usa los textos generados en inglés", () => {
    render(<GraficaVista g={g} lang="en" />);
    expect(screen.getByText("CISS test")).toBeTruthy();
    expect(screen.getByText(/lower is better/)).toBeTruthy();
    expect(screen.getAllByTitle("best value")).toHaveLength(1);
  });

  it("todas las gráficas generadas desde eval/results se dibujan", () => {
    for (const e of datos.evaluaciones) {
      for (const graf of e.graficas as Grafica[]) {
        for (const lang of ["es", "en"] as const) {
          const { unmount } = render(<GraficaVista g={graf} lang={lang} />);
          unmount();
        }
      }
    }
    expect(datos.evaluaciones.map((e) => e.id)).toEqual([
      "E1",
      "E2",
      "E3",
      "E4",
      "E5",
      "E6",
      "E7",
      "E8",
      "E9",
    ]);
  });
});
