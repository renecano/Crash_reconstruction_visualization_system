import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnRanura, MarcoVista, useMarco } from "./marco-vista";

function Control() {
  const { enMarco } = useMarco();
  return (
    <EnRanura ranura="abajo" fuera={<button type="button">encima</button>}>
      <button type="button" data-reproducir>
        {enMarco ? "en la barra" : "?"}
      </button>
    </EnRanura>
  );
}

describe("el marco de las vistas del caso (René, 2026-11-17)", () => {
  let pedir: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    pedir = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: pedir,
    });
    // jsdom no calcula cajas: el marco se da por visible.
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
      {} as DOMRect,
    ] as unknown as DOMRectList);
  });
  afterEach(() => vi.restoreAllMocks());

  it("con barras, los controles van en su ranura, fuera del lienzo", () => {
    render(
      <MarcoVista conBarras>
        <Control />
      </MarcoVista>,
    );
    const abajo = screen.getByTestId("marco-barra-inferior");
    expect(abajo.textContent).toContain("en la barra");
    expect(screen.getByTestId("marco-lienzo").textContent).not.toContain("en la barra");
  });

  it("sin barras, cada control queda donde estaba (encima de la escena)", () => {
    render(
      <MarcoVista conBarras={false}>
        <Control />
      </MarcoVista>,
    );
    expect(screen.queryByTestId("marco-barra-inferior")).toBeNull();
    expect(screen.getByTestId("marco-lienzo").textContent).toContain("encima");
  });

  it("las notas van en «Supuestos y notas del cálculo», cerrado al abrir", () => {
    render(
      <MarcoVista conBarras notas={<p>Supuestos declarados: masa de V1.</p>}>
        <div />
      </MarcoVista>,
    );
    const notas = screen.getByTestId("supuestos-y-notas") as HTMLDetailsElement;
    expect(notas.open).toBe(false);
    expect(notas.querySelector("summary")?.textContent).toBe("Supuestos y notas del cálculo");
    expect(notas.textContent).toContain("masa de V1");
  });

  it("F y el botón piden pantalla completa del marco; F en un campo de texto no", () => {
    render(
      <MarcoVista conBarras>
        <input aria-label="campo" />
      </MarcoVista>,
    );
    fireEvent.keyDown(screen.getByLabelText("campo"), { key: "f" });
    expect(pedir).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "f" });
    expect(pedir).toHaveBeenCalledTimes(1);
    act(() => screen.getByTestId("pantalla-completa").click());
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("pantalla-completa").getAttribute("aria-keyshortcuts")).toBe("F");
  });

  it("a pantalla completa, los controles se esconden a los 3 s y Espacio reproduce o pausa", () => {
    vi.useFakeTimers();
    const reproducir = vi.fn();
    render(
      <MarcoVista conBarras>
        <EnRanura ranura="abajo">
          <button type="button" data-reproducir onClick={reproducir}>
            reproducir
          </button>
        </EnRanura>
      </MarcoVista>,
    );
    const marco = screen.getByTestId("marco-vista");
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: marco });
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(marco.dataset.completa).toBe("si");
    expect(marco.dataset.controles).toBe("visibles");
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(marco.dataset.controles).toBe("ocultos");
    act(() => {
      fireEvent.pointerMove(marco);
    });
    expect(marco.dataset.controles).toBe("visibles");
    fireEvent.keyDown(document.body, { key: " " });
    expect(reproducir).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    vi.useRealTimers();
  });
});
