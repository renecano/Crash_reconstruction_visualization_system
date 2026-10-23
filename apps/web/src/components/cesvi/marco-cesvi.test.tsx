import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarcoCesvi, SECCIONES, useModoCesvi } from "./marco-cesvi";

function Modo() {
  const { modo, tema } = useModoCesvi();
  return (
    <span data-testid="hijo">
      {modo} · {tema}
    </span>
  );
}

describe("el marco de las pantallas de CESVI (R9)", () => {
  it("lleva a los casos y a la reproducción, y marca la actual (ADR 0079)", () => {
    render(
      <MarcoCesvi seccion="reproduccion">
        <Modo />
      </MarcoCesvi>,
    );
    expect(SECCIONES.map((s) => s.ruta)).toEqual(["/cesvi", "/cesvi/reproduccion"]);
    expect(screen.getByTestId("seccion-reproduccion").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("seccion-casos").getAttribute("aria-current")).toBeNull();
  });

  it("Trabajar por omisión, claro; Presentar, oscuro, y los hijos lo saben", () => {
    render(
      <MarcoCesvi seccion="casos">
        <Modo />
      </MarcoCesvi>,
    );
    const marco = screen.getByTestId("marco-cesvi");
    expect(marco.dataset.modo).toBe("trabajar");
    expect(marco.dataset.tema).toBe("claro");
    expect(screen.getByTestId("hijo").textContent).toBe("trabajar · claro");
    fireEvent.click(screen.getByTestId("modo-presentar"));
    expect(marco.dataset.modo).toBe("presentar");
    expect(marco.dataset.tema).toBe("oscuro");
    expect(screen.getByTestId("hijo").textContent).toBe("presentar · oscuro");
  });

  it("sin modos (una pantalla que solo se consulta) queda solo el tema", () => {
    render(
      <MarcoCesvi seccion="reproduccion" modoInicial="presentar" conModos={false}>
        <Modo />
      </MarcoCesvi>,
    );
    expect(screen.queryByTestId("modo-trabajar")).toBeNull();
    expect(screen.getByTestId("tema")).toBeTruthy();
  });
});
