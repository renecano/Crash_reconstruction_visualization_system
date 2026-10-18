import { loadFixture } from "@croquis/scene-schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExtraerRespuesta, ResponderRespuesta } from "@/lib/relato-api";
import { RelatoApp } from "./relato-app";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const spec = loadFixture("lateral_interseccion");
const extraida: ExtraerRespuesta = {
  spec,
  texto: "x",
  metodo: "reglas",
  motivo: null,
  redacciones_servidor: 0,
  verificador: { revisados: 10, corregidos: 0, degradados: 0 },
  glosario: [],
  preguntas: [
    {
      id: "velocidad:veh-b",
      texto: "¿A qué velocidad crees que iba la camioneta (B)?",
      motivo: "sensibilidad",
      campo: "vehiculos.1.velocidad_previa",
      reduccion: 0.4,
    },
    {
      id: "estado_superficie",
      texto: "¿El piso estaba seco o mojado?",
      motivo: "sensibilidad",
      campo: "lugar.estado_superficie",
      opciones: ["seco", "mojado", "encharcado"],
    },
  ],
};

/** Doble del servidor: la extracción responde en NDJSON (inicio y resultado); el resto, JSON. */
function fakeFetch(responses: unknown[]) {
  const calls: { url: string; body: unknown }[] = [];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    const next = responses.shift();
    const body = url.endsWith("/extraer")
      ? [
          { tipo: "inicio", metodo: "reglas" },
          { tipo: "resultado", datos: next },
        ]
          .map((e) => JSON.stringify(e) + "\n")
          .join("")
      : JSON.stringify(next);
    return Promise.resolve(new Response(body, { status: 200 }));
  });
  return { fetcher: fn as unknown as typeof fetch, calls };
}

describe("<RelatoApp />", () => {
  it("redacta en el dispositivo: el texto enviado no lleva el nombre ni la placa", async () => {
    const { fetcher, calls } = fakeFetch([extraida]);
    render(<RelatoApp fetcher={fetcher} />);
    fireEvent.change(screen.getByTestId("relato"), {
      target: { value: "Me llamo Ana López, placas ABC-123-D. Se me cerró una camioneta." },
    });
    expect(screen.getByTestId("texto-redactado").textContent).toBe(
      "Me llamo [NOMBRE], placas [PLACA]. Se me cerró una camioneta.",
    );
    expect(screen.getByTestId("privacidad").textContent).toMatch(/1 nombre, 1 placa/);
    expect(screen.getByTestId("glosario").textContent).toMatch(/Se me cerró/);
    fireEvent.click(screen.getByTestId("entender"));
    await screen.findByTestId("hechos");
    const sent = calls[0]!.body as { texto: string };
    expect(sent.texto).not.toMatch(/Ana|López|ABC-123-D/);
    expect(sent.texto).toMatch(/\[NOMBRE\]/);
  });

  it("muestra los hechos con su fuente y responde las preguntas", async () => {
    const respondida: ResponderRespuesta = { spec, aplicadas: ["velocidad:veh-b"], preguntas: [] };
    const { fetcher, calls } = fakeFetch([extraida, respondida]);
    render(<RelatoApp fetcher={fetcher} />);
    fireEvent.change(screen.getByTestId("relato"), { target: { value: "Choqué en el cruce." } });
    fireEvent.click(screen.getByTestId("entender"));
    await screen.findByTestId("preguntas");
    expect(screen.getByTestId("metodo").textContent).toMatch(/reglas/);
    expect(screen.getByTestId("hechos").textContent).toMatch(/del relato/);
    fireEvent.change(screen.getByLabelText(/velocidad crees/), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("radio", { name: "mojado" }));
    fireEvent.click(screen.getByTestId("responder"));
    await screen.findByTestId("sin-preguntas");
    const body = calls[1]!.body as { respuestas: Record<string, string>; contestadas: string[] };
    expect(body.respuestas).toEqual({ "velocidad:veh-b": "45", estado_superficie: "mojado" });
    expect(body.contestadas).toEqual(["velocidad:veh-b", "estado_superficie"]);
    expect(document.body.textContent ?? "").not.toMatch(/culpa|culpable|responsable/i);
  });

  it("abre el croquis con la escena guardada en sessionStorage", async () => {
    const { fetcher } = fakeFetch([extraida]);
    render(<RelatoApp fetcher={fetcher} />);
    fireEvent.change(screen.getByTestId("relato"), { target: { value: "Choqué." } });
    fireEvent.click(screen.getByTestId("entender"));
    fireEvent.click(await screen.findByTestId("abrir-croquis"));
    expect(JSON.parse(sessionStorage.getItem("croquis:relato-spec") ?? "{}").meta.id).toBe(
      spec.meta.id,
    );
    expect(push).toHaveBeenCalledWith("/croquis?fuente=relato");
  });

  it("explica si el servidor no está disponible", async () => {
    const fetcher = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    render(<RelatoApp fetcher={fetcher as unknown as typeof fetch} />);
    fireEvent.change(screen.getByTestId("relato"), { target: { value: "Choqué." } });
    fireEvent.click(screen.getByTestId("entender"));
    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toMatch(/No se pudo conectar/),
    );
  });

  it("sin red avisa que entender el relato necesita internet y lo reactiva al volver", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try {
      render(<RelatoApp fetcher={vi.fn() as unknown as typeof fetch} />);
      fireEvent.change(screen.getByTestId("relato"), { target: { value: "Choqué." } });
      expect(screen.getByTestId("sin-red").textContent).toMatch(/Sin conexión/);
      expect(screen.getByTestId("entender")).toHaveProperty("disabled", true);
      online.mockReturnValue(true);
      fireEvent(window, new Event("online"));
      await waitFor(() => expect(screen.queryByTestId("sin-red")).toBeNull());
      expect(screen.getByTestId("entender")).toHaveProperty("disabled", false);
    } finally {
      online.mockRestore();
    }
  });
});
