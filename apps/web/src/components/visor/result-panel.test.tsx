import { loadResultado } from "@croquis/scene-schema";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clockHour, ResultPanel } from "./result-panel";

describe("<ResultPanel />", () => {
  it("muestra cada vehículo con ΔV, dirección de la fuerza y el origen de la rigidez", async () => {
    const r = await loadResultado("lateral_interseccion");
    render(<ResultPanel resultado={r} supuestosEntorno={["Ubicación no declarada."]} />);
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(r.vehiculos.length + 1);
    expect(screen.getAllByText(/km\/h/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("medida (pruebas de NHTSA)").length).toBeGreaterThan(0);
    expect(screen.getByText(/Ubicación no declarada/)).toBeDefined();
    // Ningún texto asigna culpa.
    expect(document.body.textContent ?? "").not.toMatch(/culpa|responsable/i);
  });

  it("los avisos del solver se listan cuando existen", async () => {
    const r = await loadResultado("peaton_cruce");
    render(<ResultPanel resultado={r} supuestosEntorno={[]} />);
    expect(screen.getByTestId("banderas").children.length).toBe(r.banderas.length);
  });

  it("expresa la dirección de la fuerza en horas de reloj", () => {
    expect(clockHour(0.02)).toBe("a las 12");
    expect(clockHour(2.9)).toBe("a las 3");
    expect(clockHour(11.8)).toBe("a las 12");
    expect(clockHour(9.4)).toBe("a las 9");
  });

  it("con la escena muestra la decisión de bolsas de aire y su fuente", async () => {
    const { loadFixture } = await import("@croquis/scene-schema");
    const r = await loadResultado("frontal_curva");
    render(<ResultPanel resultado={r} supuestosEntorno={[]} spec={loadFixture("frontal_curva")} />);
    expect(screen.getAllByText(/Frontal (desplegada|sin desplegar)/).length).toBeGreaterThan(0);
    expect(screen.getByText(/IIHS/)).toBeDefined();
  });
});

describe("<ResultPanel /> con incertidumbre", () => {
  it("muestra el rango del 80 % y los datos muestreados", async () => {
    const r = await loadResultado("alcance");
    expect(r.incertidumbre?.validas).toBeGreaterThan(0);
    render(<ResultPanel resultado={r} supuestosEntorno={[]} />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/80 %: \d+–\d+ km\/h/);
    expect(screen.getByTestId("incertidumbre").textContent).toMatch(/velocidad_previa/);
  });
});
