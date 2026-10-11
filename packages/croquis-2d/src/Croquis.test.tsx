import { loadFixture, type EscenaSpec } from "@croquis/scene-schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CROQUIS_LEGEND, Croquis } from "./Croquis";
import { sceneLayout } from "./layout";
import { makeViewport, worldToSvg } from "./viewport";

function mockRect(svg: Element, width: number, height: number) {
  Object.defineProperty(svg, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }),
    configurable: true,
  });
}

describe("<Croquis />", () => {
  it("dibuja la vía, los vehículos, la leyenda y la flecha de norte", () => {
    const spec = loadFixture("alcance");
    render(<Croquis spec={spec} />);
    expect(screen.getByTestId("road")).toBeTruthy();
    expect(screen.getByTestId("vehicle-veh-a-inicial")).toBeTruthy();
    expect(screen.getByTestId("vehicle-veh-b-inicial")).toBeTruthy();
    expect(screen.getByTestId("vehicle-veh-a-final")).toBeTruthy();
    expect(screen.getByTestId("north")).toBeTruthy();
    expect(screen.getByTestId("croquis").textContent).toContain(CROQUIS_LEGEND);
    expect(screen.getByTestId("croquis").textContent).toContain("semilla 101");
  });

  it("oculta las posiciones finales y las asas de giro en modo solo lectura", () => {
    const spec = loadFixture("alcance");
    render(<Croquis spec={spec} readOnly showFinal={false} />);
    expect(screen.queryByTestId("vehicle-veh-a-final")).toBeNull();
    expect(screen.queryByTestId("vehicle-veh-a-inicial-rotate")).toBeNull();
  });

  it("arrastrar un vehículo emite una escena nueva con la posición movida y procedencia de usuario", () => {
    const spec = loadFixture("alcance");
    const onChange = vi.fn<(s: EscenaSpec) => void>();
    const scale = 10;
    render(<Croquis spec={spec} onChange={onChange} scale={scale} />);
    const svg = screen.getByTestId("croquis");
    const vp = makeViewport(sceneLayout(spec).bounds, scale);
    mockRect(svg, vp.viewBox.width, vp.viewBox.height); // 1 px de pantalla = 1 unidad de SVG
    const start = worldToSvg(vp, spec.vehiculos[0]!.posicion_inicial);
    const body = screen.getByTestId("vehicle-veh-a-inicial").querySelector("rect")!;
    fireEvent.pointerDown(body, { clientX: start.x, clientY: start.y, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: start.x + 25, clientY: start.y - 10, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: start.x + 25, clientY: start.y - 10, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0];
    const moved = next.vehiculos[0]!.posicion_inicial;
    expect(moved.x).toBeCloseTo(-30 + 2.5, 5);
    expect(moved.y).toBeCloseTo(0 + 1.0, 5);
    expect(moved.procedencia.fuente).toBe("usuario");
    expect(next.vehiculos[1]).toEqual(spec.vehiculos[1]); // B intacto
  });

  it("el asa de giro cambia el rumbo hacia el puntero", () => {
    const spec = loadFixture("alcance");
    const onChange = vi.fn<(s: EscenaSpec) => void>();
    render(<Croquis spec={spec} onChange={onChange} scale={10} />);
    const svg = screen.getByTestId("croquis");
    const vp = makeViewport(sceneLayout(spec).bounds, 10);
    mockRect(svg, vp.viewBox.width, vp.viewBox.height);
    const center = worldToSvg(vp, spec.vehiculos[0]!.posicion_inicial);
    const handle = screen.getByTestId("vehicle-veh-a-inicial-rotate");
    fireEvent.pointerDown(handle, { clientX: center.x + 20, clientY: center.y, pointerId: 2 });
    // Puntero hacia el norte (arriba en pantalla) ⇒ rumbo 90°.
    fireEvent.pointerUp(svg, { clientX: center.x, clientY: center.y - 30, pointerId: 2 });
    expect(onChange.mock.calls[0]![0].vehiculos[0]!.posicion_inicial.rumbo_deg).toBe(90);
  });

  it("en modo solo lectura no emite cambios", () => {
    const spec = loadFixture("alcance");
    const onChange = vi.fn();
    render(<Croquis spec={spec} onChange={onChange} readOnly />);
    const svg = screen.getByTestId("croquis");
    const body = screen.getByTestId("vehicle-veh-a-inicial").querySelector("rect")!;
    fireEvent.pointerDown(body, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
