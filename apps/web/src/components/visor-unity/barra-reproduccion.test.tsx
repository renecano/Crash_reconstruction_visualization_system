import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ESTADO_INICIAL, type Accion } from "@/lib/visor-unity/reproduccion";
import { BarraReproduccion } from "./barra-reproduccion";

afterEach(cleanup);

/** Auditoría del 2026-11-15, I3: los controles de reproducción del 3D de Unity. */
describe("la barra de reproducción del 3D", () => {
  const intervalo = { inicio: -3, fin: 6 };
  const monta = (corre = true) => {
    const acciones: Accion[] = [];
    const onAccion = vi.fn((a: Accion) => acciones.push(a));
    render(
      <BarraReproduccion
        estado={{ ...ESTADO_INICIAL, t: 1.5, pausado: !corre }}
        intervalo={intervalo}
        corre={corre}
        onAccion={onAccion}
      />,
    );
    return acciones;
  };

  it("tiene reproducir, el deslizador, las tres velocidades, «Ir al impacto», «Ver todo» y «Repetir»", () => {
    const acciones = monta();
    expect(screen.getByTestId("reproducir-unity").getAttribute("aria-label")).toBe("Pausar");
    fireEvent.click(screen.getByTestId("reproducir-unity"));
    fireEvent.change(screen.getByTestId("tiempo-unity"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByTestId("velocidad-unity-0.25"));
    fireEvent.click(screen.getByTestId("velocidad-unity-0.5"));
    fireEvent.click(screen.getByTestId("ir-al-impacto-unity"));
    fireEvent.click(screen.getByTestId("ver-todo-unity"));
    fireEvent.click(screen.getByTestId("repetir-unity"));
    expect(acciones).toEqual([
      { tipo: "alternar" },
      { tipo: "ir", t: 2.5 },
      { tipo: "velocidad", x: 0.25 },
      { tipo: "velocidad", x: 0.5 },
      { tipo: "impacto" },
      { tipo: "todo" },
      { tipo: "repetir" },
    ]);
  });

  it("dice el instante respecto al impacto y marca la velocidad elegida", () => {
    monta(false);
    const barra = screen.getByTestId("controles-unity");
    expect(barra.textContent).toContain("Impacto · t +1.50 s");
    expect(barra.getAttribute("data-pausado")).toBe("si");
    expect(screen.getByTestId("reproducir-unity").getAttribute("aria-label")).toBe("Reproducir");
    expect(screen.getByTestId("velocidad-unity-1").getAttribute("aria-pressed")).toBe("true");
    const deslizador = screen.getByTestId("tiempo-unity") as HTMLInputElement;
    expect([deslizador.min, deslizador.max, deslizador.value]).toEqual(["-3", "6", "1.5"]);
  });
});
