import { loadResultado } from "@croquis/scene-schema";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { causeWords, directionWords, PeoplePanel } from "./people-panel";

describe("<PeoplePanel />", () => {
  it("peatón: proyección con banda de Searle, resultado del ragdoll y visibilidad tapada", async () => {
    const r = await loadResultado("peaton_cruce");
    render(
      <PeoplePanel
        resultado={r}
        people={{
          bodies: 2,
          markers: 3,
          ragdolls: [
            {
              personId: "per-peaton",
              kind: "peaton",
              target: 4.78,
              band: [3.74, 5.89],
              distance: 4.88,
              inBand: true,
              k: 0.98,
              iterations: 2,
              uncalibrated: 4.99,
            },
          ],
        }}
      />,
    );
    const personas = screen.getByTestId("personas").textContent ?? "";
    expect(personas).toMatch(/Proyección \(Searle\)/);
    expect(personas).toMatch(/dentro de la banda/);
    const vis = screen.getByTestId("visibilidad").textContent ?? "";
    expect(vis).toMatch(/el vehículo estacionado/);
    expect(vis).toMatch(/se veía desde/);
    // Lenguaje neutro: sin culpa ni lesiones.
    expect(document.body.textContent ?? "").not.toMatch(/culpa|responsable|lesi[oó]n grave|herid/i);
  });

  it("ocupantes: asiento, cinturón no declarado con ambas variantes y zona de contacto", async () => {
    const r = await loadResultado("lateral_interseccion");
    render(<PeoplePanel resultado={r} />);
    const t = screen.getByTestId("personas").textContent ?? "";
    expect(t).toMatch(/al volante/);
    expect(t).toMatch(/no dice si llevaba cinturón/);
    expect(t).toMatch(/Con cinturón/);
    expect(t).toMatch(/Sin cinturón/);
    expect(t).toMatch(/puerta y ventana/);
  });

  it("dirección del ocupante y causas en palabras", async () => {
    expect(directionWords(0)).toBe("hacia adelante");
    expect(directionWords(90)).toBe("hacia la izquierda");
    expect(directionWords(-90)).toBe("hacia la derecha");
    expect(directionWords(180)).toBe("hacia atrás");
    const r = await loadResultado("peaton_cruce");
    expect(causeWords(r, "noche")).toMatch(/faros/);
    expect(causeWords(r, "objeto:camion-estacionado")).toBe("el vehículo estacionado");
  });
});
