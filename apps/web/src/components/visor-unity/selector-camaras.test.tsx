import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { camarasDelCaso } from "@/lib/visor-unity/camaras";
import { SelectorCamaras } from "./selector-camaras";

const CAMARAS = camarasDelCaso(
  [
    { resId: "veh-a", nombre: "A · Jetta", letra: "A", cara: "frontal" },
    { resId: "veh-b", nombre: "B · Camaro", letra: "B", cara: "lateral_derecho" },
  ],
  [{ id: "per-1", rol: "peaton" }],
);

describe("el selector «Cámara» del 3D (A6)", () => {
  it("las generales y las personas van a un clic, con nombres cortos y sin ids", () => {
    const onElegir = vi.fn();
    render(<SelectorCamaras camaras={CAMARAS} elegida="cinematica" onElegir={onElegir} />);
    const caja = screen.getByTestId("selector-camara");
    expect(caja.textContent).toContain("Alrededor");
    expect(caja.textContent).toContain("Desde arriba");
    expect(caja.textContent).toContain("Cinematográfica");
    expect(caja.textContent).toContain("Desde la acera");
    expect(caja.textContent).toContain("Peatón");
    expect(caja.textContent).not.toMatch(/veh-|per-/);
    expect(screen.getByTestId("camara-cinematica").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("camara-cenital"));
    expect(onElegir).toHaveBeenLastCalledWith(expect.objectContaining({ modo: "cenital" }));
    fireEvent.click(screen.getByTestId("camara-persona:per-1"));
    expect(onElegir).toHaveBeenLastCalledWith(expect.objectContaining({ modo: "persona:per-1" }));
  });

  it("cada vehículo abre sus tres vistas: dos clics, y Esc cierra el menú", () => {
    const onElegir = vi.fn();
    render(<SelectorCamaras camaras={CAMARAS} elegida={null} onElegir={onElegir} />);
    const boton = screen.getByTestId("camaras-de-veh-b");
    expect(boton.textContent).toContain("B · Camaro");
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(boton);
    const vistas = screen.getAllByRole("menuitemradio").map((x) => x.textContent);
    expect(vistas).toEqual([
      "Detrás, siguiéndolo",
      "Lo que veía su conductor",
      "Su daño, en el impacto",
    ]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(boton);
    fireEvent.click(screen.getByText("Lo que veía su conductor"));
    expect(onElegir).toHaveBeenLastCalledWith(expect.objectContaining({ modo: "conductor:veh-b" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
