import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SALIDA_MS, TrazoInicio } from "./trazo-inicio";

afterEach(() => {
  vi.useRealTimers();
});

function montar(animar: boolean) {
  const onEscribir = vi.fn();
  const onEjemplo = vi.fn();
  render(
    <TrazoInicio
      animar={animar}
      onEscribir={onEscribir}
      onEjemplo={onEjemplo}
      abrir={<span>Abrir un caso guardado (.croquis)</span>}
    />,
  );
  return { onEscribir, onEjemplo };
}

describe("El trazo (A1)", () => {
  it("dice qué hace Croquis, los cinco pasos con quién actúa y un solo botón principal", () => {
    montar(false);
    expect(screen.getByTestId("titulo-caso").textContent).toBe(
      "Narra el hecho. Croquis lo reconstruye.",
    );
    const pasos = screen.getAllByRole("listitem");
    expect(pasos).toHaveLength(5);
    expect(pasos.map((li) => li.querySelector(".tz-quien")?.textContent)).toEqual([
      "Tú",
      "Tú",
      "Croquis",
      "Tú",
      "Tú",
    ]);
    expect(pasos.map((li) => li.querySelector(".tz-verbo")?.textContent)).toEqual([
      "Narras",
      "Colocas",
      "Reconstruye",
      "Comparas",
      "Firmas",
    ]);
    expect(document.querySelectorAll(".boton-principal")).toHaveLength(1);
    // Ninguna cifra fija en las viñetas: un número aquí no saldría del cálculo.
    expect(screen.getByTestId("trazo-inicio").textContent).not.toMatch(/\d/);
  });

  it("sin animación, empieza en el acto", () => {
    const { onEscribir, onEjemplo } = montar(false);
    fireEvent.click(screen.getByTestId("siguiente"));
    expect(onEscribir).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("usar-ejemplo-inicio"));
    expect(onEjemplo).toHaveBeenCalledTimes(1);
  });

  it("con animación, el trazo se recoge y después pasa a la narración, una sola vez", () => {
    vi.useFakeTimers();
    const { onEscribir } = montar(true);
    const boton = screen.getByTestId("siguiente");
    fireEvent.click(boton);
    fireEvent.click(boton);
    expect(onEscribir).not.toHaveBeenCalled();
    expect(screen.getByTestId("trazo-inicio").dataset.saliendo).toBe("si");
    act(() => {
      vi.advanceTimersByTime(SALIDA_MS);
    });
    expect(onEscribir).toHaveBeenCalledTimes(1);
  });
});
