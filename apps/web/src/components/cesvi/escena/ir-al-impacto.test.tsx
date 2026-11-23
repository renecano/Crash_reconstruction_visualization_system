/**
 * «Ir al impacto» en el mapa de La escena (René, 2026-11-22): con el choque marcado, el botón y la
 * tecla I regresan al primer choque con el zoom de trabajo; sin choque no aparece; en un campo de
 * texto la I se escribe.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapaFacil, ZOOM_TRABAJO } from "./mapa-facil";

const easeTo = vi.fn();
/** Un mapa de MapLibre de mentira: lo que pide el componente y nada más. */
const falso = new Proxy(
  {
    easeTo,
    getCenter: () => ({ lat: 19.3576, lng: -99.0625 }),
    getZoom: () => 15,
    getCanvas: () => ({ style: {} }),
    getContainer: () => ({ clientWidth: 800, clientHeight: 600 }),
    getSource: () => undefined,
    getLayer: () => undefined,
    project: () => ({ x: 0, y: 0 }),
  } as Record<string | symbol, unknown>,
  { get: (t, k) => (k in t ? t[k] : () => undefined) },
);
vi.mock("@/lib/mapa-compartido", () => ({
  tomarMapa: async (_a: unknown, _o: unknown, alListo: (m: unknown) => void) =>
    alListo({ mapa: falso, oir: () => {}, soltar: () => {} }),
}));
vi.mock("maplibre-gl", () => ({
  Marker: class {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
    getElement() {
      return document.createElement("div");
    }
  },
}));
globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
  unobserve() {}
} as never;

const C1 = { lat: 19.3576, lon: -99.0625 };
const C2 = { lat: 19.358, lon: -99.062 };
const base = {
  tema: "claro" as const,
  encuadre: [C1],
  marcas: [],
  flechas: [],
  coches: [],
  lineas: [],
};

describe("«Ir al impacto» en el mapa de La escena", () => {
  it("sin choque marcado no aparece", async () => {
    await act(async () => {
      render(<MapaFacil {...base} choques={[]} />);
    });
    expect(screen.queryByTestId("mapa-ir-impacto")).toBeNull();
  });

  it("el botón y la tecla I llevan al primer choque con el zoom de trabajo", async () => {
    await act(async () => {
      render(
        <>
          <input data-testid="campo" />
          <MapaFacil
            {...base}
            choques={[
              { orden: 2, punto: C2 },
              { orden: 1, punto: C1 },
            ]}
          />
        </>,
      );
    });
    const boton = screen.getByTestId("mapa-ir-impacto");
    expect(boton.textContent).toContain("Ir al impacto");
    expect(boton.getAttribute("aria-keyshortcuts")).toBe("I");
    easeTo.mockClear();
    fireEvent.click(boton);
    expect(easeTo).toHaveBeenLastCalledWith({ center: [C1.lon, C1.lat], zoom: ZOOM_TRABAJO });
    easeTo.mockClear();
    fireEvent.keyDown(window, { key: "i" });
    expect(easeTo).toHaveBeenCalledTimes(1);
    easeTo.mockClear();
    fireEvent.keyDown(screen.getByTestId("campo"), { key: "i" });
    expect(easeTo).not.toHaveBeenCalled();
  });
});
