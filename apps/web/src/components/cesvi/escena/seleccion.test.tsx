/**
 * La corrección con lo ya colocado (René, 2026-11-17): la barra de lo seleccionado con su nombre,
 * sus botones con nombre accesible y los atajos que aplican; la lista para elegir sin tocar el mapa;
 * y el aviso de que la escena cambió después de reconstruir, con «Reconstruir de nuevo».
 */
import { agregarPersona, nombrePersona, type Expediente, type RolPersona } from "@croquis/cesvi";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AVISO_ESCENA_CAMBIO,
  capacidadesDe,
  deClave,
  personaFaltante,
  quitarSeleccion,
  seleccionables,
} from "@/lib/seleccion-escena";
import { AvisoEscenaCambio } from "./aviso-escena-cambio";
import { AvisoFaltaPersona, BarraSeleccion, PanelCorregir, atajosDe } from "./correccion";

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

describe("peatones y ciclistas en la corrección (A3)", () => {
  const C = { lat: 19.3576, lon: -99.0625 };
  const base = {
    vehiculos: [],
    impactos: [{ orden: 1, vehiculos: ["V1"], objeto_fijo: "peatón" }],
  } as unknown as Expediente;

  /** El panel y la barra con un expediente vivo: colocar, elegir de la lista y quitar. */
  function Arnes() {
    const [e, setE] = useState(base);
    const [poniendo, setPoniendo] = useState<RolPersona | null>(null);
    const [sel, setSel] = useState<string | null>(null);
    if (sel)
      return (
        <BarraSeleccion
          nombre={nombrePersona(e, deClave(sel).id)}
          capacidades={capacidadesDe(e, sel)}
          acciones={[
            {
              id: "marcar-final",
              testId: "marcar-final-persona",
              texto: "Marcar dónde quedó",
              presionado: false,
              hacer: () => {},
            },
            {
              id: "quitar",
              texto: "Quitar",
              peligro: true,
              hacer: () => {
                setE(quitarSeleccion(e, sel)!);
                setSel(null);
              },
            },
          ]}
          onListo={() => setSel(null)}
        />
      );
    return (
      <>
        <PanelCorregir
          poniendo={null}
          onElegir={() => {}}
          poniendoPersona={poniendo}
          onElegirPersona={setPoniendo}
          faltaPersona={personaFaltante(e)}
          onCentro={() => {
            // Lo mismo que un toque en el centro del mapa.
            setE(agregarPersona(e, poniendo!, C).expediente);
            setPoniendo(null);
          }}
          enLaEscena={seleccionables(e).map((clave) => ({ clave, nombre: clave }))}
          onSeleccionar={setSel}
          onListo={() => {}}
        />
        <output data-testid="personas">{(e.personas ?? []).length}</output>
      </>
    );
  }

  it("se coloca desde la paleta, se elige de la lista y se quita", () => {
    render(<Arnes />);
    // El impacto fue contra un peatón y no hay nadie: la escena lo pide.
    expect(screen.getByTestId("falta-persona").textContent).toContain(
      "El impacto fue contra un peatón: colócalo donde lo golpearon",
    );
    const peaton = screen.getByTestId("agregar-peaton");
    expect(screen.getByTestId("agregar-ciclista").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(peaton);
    expect(peaton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("paleta-pista").textContent).toContain(
      "Toca el mapa donde golpearon al peatón.",
    );
    fireEvent.click(screen.getByTestId("poner-al-centro"));
    expect(screen.getByTestId("personas").textContent).toBe("1");
    expect(screen.queryByTestId("falta-persona")).toBeNull();
    fireEvent.click(screen.getByTestId("elegir-persona-per-1"));
    expect(screen.getByTestId("seleccion-nombre").textContent).toBe("Peatón");
    expect(screen.getByTestId("marcar-final-persona")).toBeTruthy();
    expect(screen.getByTestId("seleccion-atajos").textContent).toContain("Q / E: girar");
    fireEvent.click(screen.getByTestId("sel-quitar"));
    expect(screen.getByTestId("personas").textContent).toBe("0");
    expect(screen.getByTestId("falta-persona")).toBeTruthy();
  });

  it("el aviso de la persona que falta dice si es un ciclista y la pone con un botón", () => {
    const colocar = vi.fn();
    render(<AvisoFaltaPersona rol="ciclista" onColocar={colocar} />);
    expect(screen.getByTestId("falta-persona").textContent).toContain(
      "El impacto fue contra un ciclista",
    );
    fireEvent.click(screen.getByRole("button", { name: /Colocar al ciclista/ }));
    expect(colocar).toHaveBeenCalledTimes(1);
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
