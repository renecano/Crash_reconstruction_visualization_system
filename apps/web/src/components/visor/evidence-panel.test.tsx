import { loadResultado } from "@croquis/scene-schema";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IdiomaProvider } from "@/i18n/cliente";
import { EvidencePanel, evidenceLabel } from "./evidence-panel";

const BLAME = /culpa|culpable|responsable|imprudente|debió|mintió/i;

describe("<EvidencePanel />", () => {
  it("peatón: la velocidad que fija la evidencia y el dato que no cuadra", async () => {
    const r = await loadResultado("peaton_cruce");
    render(<EvidencePanel resultado={r} />);
    const panel = screen.getByTestId("evidencia");
    expect(panel.textContent).toContain("marcas de frenado (vehículo A)");
    expect(panel.textContent).toMatch(/Velocidad previa/);
    expect(panel.textContent).toMatch(/\d+–\d+ km\/h/);
    const flags = screen.getByTestId("consistencia");
    expect(flags.textContent).toContain("antes de frenar");
    expect(flags.textContent).not.toMatch(BLAME);
  });

  it("poste: dice que la evidencia no basta en vez de dar un intervalo", async () => {
    const r = await loadResultado("poste");
    render(<EvidencePanel resultado={r} />);
    expect(screen.getByTestId("evidencia").textContent).toContain(
      "La evidencia no basta para estimarlo",
    );
    expect(screen.queryByTestId("consistencia")).toBeNull();
  });

  it("sin evidencia física lo explica", async () => {
    const r = await loadResultado("nocturno_lluvia");
    render(<EvidencePanel resultado={r} />);
    expect(screen.getByTestId("evidencia").textContent).toContain("no declara posiciones finales");
  });

  it("etiquetas de evidencia en palabras llanas", () => {
    const roles = new Map([["veh-a", "A"]]);
    expect(evidenceLabel("reposo:veh-a", roles)).toBe("dónde quedó (vehículo A)");
    expect(evidenceLabel("proyeccion:per-1", roles)).toBe(
      "distancia a la que quedó la persona (persona)",
    );
  });
});

describe("<EvidencePanel /> en inglés", () => {
  it("la evidencia y los datos que no cuadran en inglés, marcados con su idioma", async () => {
    const r = await loadResultado("peaton_cruce");
    render(
      <IdiomaProvider lang="en">
        <EvidencePanel resultado={r} />
      </IdiomaProvider>,
    );
    const panel = screen.getByRole("region", { name: "What the physical evidence says" });
    expect(panel.textContent).toContain("skid marks (vehicle A)");
    expect(panel.textContent).toMatch(/Initial speed/);
    expect(panel.textContent).toMatch(/best fit/);
    expect(panel.textContent).toMatch(/\d+–\d+ km\/h/);
    const flags = screen.getByTestId("consistencia");
    expect(flags.textContent).toContain("before braking");
    expect(flags.querySelector("li")?.getAttribute("lang")).toBe("en");
    expect(panel.textContent).not.toMatch(/Evidencia declarada|Velocidad previa|mejor ajuste/);
  });
});
