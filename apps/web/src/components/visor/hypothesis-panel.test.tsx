import { loadFixture, loadResultado, type EscenaSpec, type Resultado } from "@croquis/scene-schema";
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HypothesisPanel, withSpeed } from "./hypothesis-panel";

/** El solver TS sin Web Worker (jsdom no tiene workers): el mismo cálculo que hace el navegador. */
const solverTs = (spec: EscenaSpec): Promise<Resultado> =>
  Promise.resolve(
    reconstructionToDict(
      reconstruct(spec as unknown as Record<string, unknown>),
    ) as unknown as Resultado,
  );

describe("<HypothesisPanel />", () => {
  it("withSpeed cambia solo la velocidad del vehículo elegido, como dato de la persona", () => {
    const spec = loadFixture("lateral_interseccion");
    const next = withSpeed(spec, "veh-b", 60);
    expect(next.vehiculos[1]!.velocidad_previa).toMatchObject({ valor: 60, fuente: "usuario" });
    expect(next.vehiculos[0]).toEqual(spec.vehiculos[0]);
    expect(spec.vehiculos[1]!.velocidad_previa?.valor).not.toBe(60);
  });

  it("reconstruye la otra velocidad con el solver TS y muestra la diferencia", async () => {
    const spec = loadFixture("lateral_interseccion");
    const base = await loadResultado("lateral_interseccion");
    const onChange = vi.fn();
    const seen: EscenaSpec[] = [];
    const reconstructor = (s: EscenaSpec) => {
      seen.push(s);
      return solverTs(s);
    };
    const { rerender } = render(
      <HypothesisPanel
        spec={spec}
        resultado={base}
        hipotesis={[]}
        onChange={onChange}
        reconstructor={reconstructor}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "veh-b" } });
    fireEvent.change(screen.getByTestId("hipotesis-velocidad"), { target: { value: "60" } });
    fireEvent.click(screen.getByTestId("hipotesis-comparar"));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1), { timeout: 15_000 });
    expect(seen[0]!.vehiculos[1]!.velocidad_previa?.valor).toBe(60);
    const [lista] = onChange.mock.calls[0] as [{ etiqueta: string; resultado: Resultado }[]];
    expect(lista[0]!.etiqueta).toBe("B a 60 km/h");
    // A 60 km/h el vehículo B llega más rápido que en la reconstrucción principal.
    const vB = (r: Resultado) => r.vehiculos.find((v) => v.id === "veh-b")!.v_impacto_kmh;
    expect(vB(lista[0]!.resultado)).toBeGreaterThan(vB(base));
    rerender(
      <HypothesisPanel spec={spec} resultado={base} hipotesis={lista} onChange={onChange} />,
    );
    expect(screen.getByTestId("hipotesis-0").textContent).toMatch(/B a 60 km\/h.*→/);
    fireEvent.click(screen.getAllByRole("button", { name: "Quitar" })[0]!);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("no deja agregar más de tres hipótesis", async () => {
    const spec = loadFixture("lateral_interseccion");
    const base = await loadResultado("lateral_interseccion");
    const lista = [40, 50, 60].map((v) => ({ etiqueta: `A a ${v} km/h`, resultado: base }));
    render(
      <HypothesisPanel spec={spec} resultado={base} hipotesis={lista} onChange={() => undefined} />,
    );
    fireEvent.change(screen.getByTestId("hipotesis-velocidad"), { target: { value: "70" } });
    expect(screen.getByTestId("hipotesis-comparar")).toHaveProperty("disabled", true);
    expect(screen.getByText(/hasta 3 hipótesis/)).toBeTruthy();
  });

  it("valida la velocidad y explica si el solver falla", async () => {
    const spec = loadFixture("lateral_interseccion");
    const base = await loadResultado("lateral_interseccion");
    render(
      <HypothesisPanel
        spec={spec}
        resultado={base}
        hipotesis={[]}
        onChange={() => undefined}
        reconstructor={() => Promise.reject(new Error("sin memoria"))}
      />,
    );
    fireEvent.change(screen.getByTestId("hipotesis-velocidad"), { target: { value: "500" } });
    fireEvent.click(screen.getByTestId("hipotesis-comparar"));
    expect(screen.getByRole("alert").textContent).toMatch(/entre 0 y 200/);
    fireEvent.change(screen.getByTestId("hipotesis-velocidad"), { target: { value: "50" } });
    fireEvent.click(screen.getByTestId("hipotesis-comparar"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/No se pudo reconstruir.*sin memoria/),
    );
  });
});
