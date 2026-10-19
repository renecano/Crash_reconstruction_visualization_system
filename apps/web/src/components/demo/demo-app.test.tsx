import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import datos from "@/data/demo.json";
import { DemoApp, type CasoDemo } from "./demo-app";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const casos = datos.casos as CasoDemo[];

describe("DemoApp", () => {
  it("muestra los casos y, al elegir uno, el relato, lo que entendió la IA y sus preguntas", () => {
    render(<DemoApp casos={casos} metodo={datos.metodo} fuente={datos.fuente} />);
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(casos.length);
    fireEvent.click(screen.getByTestId("demo-caso-rmx-d001"));
    expect(screen.getByTestId("demo-relato").textContent).toContain("Paseo Tollocan");
    expect(screen.getByTestId("preguntas")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("No es un peritaje");
  });

  it("contesta una ronda sin servidor: la respuesta entra a la escena y no se vuelve a preguntar", () => {
    render(<DemoApp casos={casos} metodo={datos.metodo} fuente={datos.fuente} />);
    fireEvent.click(screen.getByTestId("demo-caso-rmx-d001"));
    const preguntas = screen.getByTestId("preguntas");
    const velocidad = within(preguntas)
      .getAllByRole("listitem")
      .find((li) => li.textContent?.includes("velocidad"));
    expect(velocidad).toBeTruthy();
    const id = velocidad!.getAttribute("data-testid")!.slice("pregunta-".length);
    fireEvent.change(within(velocidad!).getByRole("textbox"), { target: { value: "20" } });
    fireEvent.click(screen.getByTestId("responder"));
    expect(screen.getByTestId("demo-rondas").textContent).toContain("Rondas contestadas: 1");
    expect(screen.queryByTestId(`pregunta-${id}`)).toBeNull();
  });

  it("guarda la escena y abre el visor para verla en 3D", () => {
    render(<DemoApp casos={casos} metodo={datos.metodo} fuente={datos.fuente} />);
    fireEvent.click(screen.getByTestId("demo-caso-rmx-d004"));
    fireEvent.click(screen.getByTestId("demo-3d"));
    expect(push).toHaveBeenCalledWith("/visor?escena=propia");
    expect(sessionStorage.getItem("croquis:escena-propia")).toContain("demo-rmx-d004");
  });
});
