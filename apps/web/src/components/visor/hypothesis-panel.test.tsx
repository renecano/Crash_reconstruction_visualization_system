import { loadFixture, loadResultado, type Resultado } from "@croquis/scene-schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HypothesisPanel, withSpeed } from "./hypothesis-panel";

describe("<HypothesisPanel />", () => {
  it("withSpeed cambia solo la velocidad del vehículo elegido, como dato de la persona", () => {
    const spec = loadFixture("lateral_interseccion");
    const next = withSpeed(spec, "veh-b", 60);
    expect(next.vehiculos[1]!.velocidad_previa).toMatchObject({ valor: 60, fuente: "usuario" });
    expect(next.vehiculos[0]).toEqual(spec.vehiculos[0]);
    expect(spec.vehiculos[1]!.velocidad_previa?.valor).not.toBe(60);
  });

  it("pide la reconstrucción con la otra velocidad y muestra la diferencia", async () => {
    const spec = loadFixture("lateral_interseccion");
    const base = await loadResultado("lateral_interseccion");
    const alt: Resultado = structuredClone(base);
    alt.vehiculos[1]!.v_impacto_kmh = base.vehiculos[1]!.v_impacto_kmh + 20;
    const bodies: unknown[] = [];
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      // Respuesta mínima: jsdom tarda en leer cuerpos de varios MB y aquí solo importa el flujo.
      return Promise.resolve(new Response(JSON.stringify({ marca: "hipotesis" }), { status: 200 }));
    });
    const onChange = vi.fn();
    const { rerender } = render(
      <HypothesisPanel
        spec={spec}
        resultado={base}
        hipotesis={[]}
        onChange={onChange}
        fetcher={fetcher as unknown as typeof fetch}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "veh-b" } });
    fireEvent.change(screen.getByTestId("hipotesis-velocidad"), { target: { value: "60" } });
    fireEvent.click(screen.getByTestId("hipotesis-comparar"));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        { etiqueta: "B a 60 km/h", resultado: { marca: "hipotesis" } },
      ]),
    );
    const sent = bodies[0] as { spec: typeof spec };
    expect(sent.spec.vehiculos[1]!.velocidad_previa?.valor).toBe(60);
    const lista = [
      { etiqueta: "B a 60 km/h", resultado: alt },
      { etiqueta: "B a 20 km/h", resultado: base },
    ];
    rerender(
      <HypothesisPanel spec={spec} resultado={base} hipotesis={lista} onChange={onChange} />,
    );
    expect(screen.getByTestId("hipotesis-0").textContent).toMatch(/B a 60 km\/h.*→/);
    expect(screen.getByTestId("hipotesis-1").textContent).toContain("queda a 0.0 m");
    fireEvent.click(screen.getAllByRole("button", { name: "Quitar" })[0]!);
    expect(onChange).toHaveBeenLastCalledWith([lista[1]]);
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

  it("valida la velocidad y explica si no hay servidor", async () => {
    const spec = loadFixture("lateral_interseccion");
    const base = await loadResultado("lateral_interseccion");
    const fetcher = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    render(
      <HypothesisPanel
        spec={spec}
        resultado={base}
        hipotesis={[]}
        onChange={() => undefined}
        fetcher={fetcher as unknown as typeof fetch}
      />,
    );
    fireEvent.change(screen.getByTestId("hipotesis-velocidad"), { target: { value: "500" } });
    fireEvent.click(screen.getByTestId("hipotesis-comparar"));
    expect(screen.getByRole("alert").textContent).toMatch(/entre 0 y 200/);
    fireEvent.change(screen.getByTestId("hipotesis-velocidad"), { target: { value: "50" } });
    fireEvent.click(screen.getByTestId("hipotesis-comparar"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/No se pudo conectar/),
    );
  });
});
