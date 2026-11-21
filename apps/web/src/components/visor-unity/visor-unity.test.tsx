import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Las carreras de la web con Unity (René, 2026-11-20, después de Tollocan): una carga a la vez. Una
 * escena nueva mientras Unity carga la anterior espera; de varias, va solo la última.
 */
const cargas: { escena: unknown; terminar: () => void }[] = [];
const puenteFalso = {
  version: "1.3.0",
  despertar: vi.fn(),
  dormir: vi.fn(),
  enviar: vi.fn(),
  minimapa: vi.fn(),
  cerrar: vi.fn(async () => undefined),
  capturar: vi.fn(async () => "data:image/png;base64,"),
  cargar: vi.fn(
    (paquete: { escena: unknown }) =>
      new Promise<string[]>((ok) =>
        cargas.push({ escena: paquete.escena, terminar: () => ok([]) }),
      ),
  ),
};

vi.mock("@/lib/visor-unity/puente", async (original) => {
  const real = await original<typeof import("@/lib/visor-unity/puente")>();
  return {
    ...real,
    PuenteUnity: { arrancar: vi.fn(async () => puenteFalso) },
  };
});
vi.mock("@/lib/reconstruct-client", () => ({
  reconstruirCompletoEnNavegador: vi.fn(
    async (escena: unknown, alParcial?: (r: unknown) => void) => {
      const r = { escena, t_inicio: 0, t_fin: 5, vehiculos: [] };
      alParcial?.(r);
      return r;
    },
  ),
}));
vi.mock("@/lib/visor-unity/paquete", () => ({
  paqueteDelCaso: (escena: unknown) => ({ escena }),
}));

const { VisorUnity } = await import("./visor-unity");

const escena = (id: string) => ({ meta: { id } }) as never;
const vueltas = async () => {
  for (let i = 0; i < 10; i++) await act(async () => await Promise.resolve());
};

beforeEach(() => {
  cargas.length = 0;
  puenteFalso.cargar.mockClear();
});
afterEach(cleanup);

describe("el visor de Unity en la web: una carga a la vez", () => {
  it("una escena que llega mientras Unity carga espera, y de varias va solo la última", async () => {
    const { rerender } = render(<VisorUnity escena={escena("sin-calles")} respaldo={<div />} />);
    await vueltas();
    expect(cargas.map((c) => (c.escena as { meta: { id: string } }).meta.id)).toEqual([
      "sin-calles",
    ]);
    // Llegan las calles del mapa (y luego los objetos) mientras Unity sigue con la primera.
    rerender(<VisorUnity escena={escena("con-calles")} respaldo={<div />} />);
    await vueltas();
    rerender(<VisorUnity escena={escena("con-calles-y-objetos")} respaldo={<div />} />);
    await vueltas();
    expect(cargas).toHaveLength(1);
    await act(async () => cargas[0]!.terminar());
    await vueltas();
    expect(cargas.map((c) => (c.escena as { meta: { id: string } }).meta.id)).toEqual([
      "sin-calles",
      "con-calles-y-objetos",
    ]);
    await act(async () => cargas[1]!.terminar());
    await vueltas();
    expect(cargas).toHaveLength(2);
  });
});
