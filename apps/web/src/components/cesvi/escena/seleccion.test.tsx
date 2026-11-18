/**
 * La corrección con lo ya colocado (René, 2026-11-17): la barra de lo seleccionado con su nombre,
 * sus botones con nombre accesible y los atajos que aplican; la lista para elegir sin tocar el mapa;
 * y el aviso de que la escena cambió después de reconstruir, con «Reconstruir de nuevo».
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AVISO_ESCENA_CAMBIO } from "@/lib/seleccion-escena";
import { AvisoEscenaCambio } from "./aviso-escena-cambio";
import { BarraSeleccion, PanelCorregir, atajosDe } from "./correccion";

describe("el aviso de que la escena cambió", () => {
  it("lo dice y ofrece reconstruir de nuevo", () => {
    const onReconstruir = vi.fn();
    render(<AvisoEscenaCambio estado="vieja" onReconstruir={onReconstruir} />);
    const aviso = screen.getByTestId("aviso-escena-cambio");
    expect(aviso.textContent).toContain(AVISO_ESCENA_CAMBIO);
    expect(aviso.getAttribute("role")).toBe("status");
    fireEvent.click(screen.getByRole("button", { name: "Reconstruir de nuevo" }));
    expect(onReconstruir).toHaveBeenCalledTimes(1);
  });

  it("mientras reconstruye no ofrece otra vez el botón; al día no dice nada", () => {
    const { rerender } = render(<AvisoEscenaCambio estado="calculando" onReconstruir={() => {}} />);
    expect(screen.getByTestId("aviso-escena-cambio").dataset.estado).toBe("calculando");
    expect(screen.queryByTestId("reconstruir-de-nuevo")).toBeNull();
    rerender(<AvisoEscenaCambio estado="al_dia" onReconstruir={() => {}} />);
    expect(screen.queryByTestId("aviso-escena-cambio")).toBeNull();
    rerender(<AvisoEscenaCambio estado={null} onReconstruir={() => {}} />);
    expect(screen.queryByTestId("aviso-escena-cambio")).toBeNull();
  });

  it("si la última reconstrucción falló, dice por qué", () => {
    render(
      <AvisoEscenaCambio
        estado="vieja"
        onReconstruir={() => {}}
        error="Croquis no pudo reconstruir la escena: sin red."
      />,
    );
    expect(screen.getByTestId("aviso-escena-error").textContent).toContain("sin red");
  });
});

describe("la barra de lo seleccionado", () => {
  it("lleva su nombre, botones con nombre accesible y los atajos que aplican", () => {
    const girar = vi.fn();
    const quitar = vi.fn();
    const listo = vi.fn();
    render(
      <BarraSeleccion
        nombre="El Jetta"
        capacidades={{ mover: true, girar: "absoluto", quitar: true }}
        acciones={[
          {
            id: "girar-izq",
            texto: "Girar −15°",
            etiqueta: "Girar El Jetta 15° a la izquierda",
            hacer: girar,
          },
          {
            id: "quitar",
            texto: "Quitar",
            etiqueta: "Quitar: El Jetta",
            hacer: quitar,
            peligro: true,
          },
        ]}
        onListo={listo}
      />,
    );
    expect(screen.getByTestId("seleccion-nombre").textContent).toBe("El Jetta");
    expect(screen.getByRole("toolbar", { name: "Corregir: El Jetta" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Girar El Jetta 15° a la izquierda" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar: El Jetta" }));
    fireEvent.click(screen.getByTestId("sel-listo"));
    expect([girar, quitar, listo].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    const atajos = screen.getByTestId("seleccion-atajos").textContent ?? "";
    expect(atajos).toContain("Flechas: mover");
    expect(atajos).toContain("Q / E: girar");
    expect(atajos).toContain("Supr: quitar");
    expect(atajos).toContain("gíralo con su anillo");
    // El botón de quitar usa el color de error del tema (con su versión de noche), no uno fijo.
    expect(screen.getByTestId("sel-quitar").className).toContain("text-[var(--error)]");
  });

  it("sin el foco en ningún lado (se eligió de la lista), la barra lo toma", () => {
    render(<BarraSeleccion nombre="Poste" acciones={[]} onListo={() => {}} />);
    expect(document.activeElement).toBe(screen.getByTestId("seleccion"));
  });

  it("solo anuncia los atajos que sirven", () => {
    expect(atajosDe({ mover: true, girar: null, quitar: true })).not.toContain("Q / E: girar");
    expect(atajosDe({ mover: false, girar: null, quitar: false })).toEqual([
      "Ctrl+Z: deshacer",
      "Esc: soltar",
    ]);
    expect(atajosDe(undefined)).toEqual([]);
  });
});

describe("la lista de lo que hay en la escena", () => {
  it("cada cosa colocada se elige con un botón (teclado y lector de pantalla)", () => {
    const elegir = vi.fn();
    render(
      <PanelCorregir
        poniendo={null}
        onElegir={() => {}}
        enLaEscena={[
          { clave: "coche:V1", nombre: "El Jetta" },
          { clave: "objeto:obj-1", nombre: "Poste" },
        ]}
        onSeleccionar={elegir}
        onListo={() => {}}
      />,
    );
    const lista = screen.getByRole("list", { name: "En la escena" });
    expect(lista.querySelectorAll("button")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("elegir-objeto-obj-1"));
    fireEvent.click(screen.getByRole("button", { name: "El Jetta" }));
    expect(elegir.mock.calls).toEqual([["objeto:obj-1"], ["coche:V1"]]);
  });
});
