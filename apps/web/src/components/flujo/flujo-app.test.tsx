import { loadFixture } from "@croquis/scene-schema";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdiomaProvider } from "@/i18n/cliente";
import type { ExtraerRespuesta, ResponderRespuesta } from "@/lib/relato-api";
import { FlujoApp, FLUJO_KEY } from "./flujo-app";

// El paso vive en la URL: el doble del router la cambia y vuelve a dibujar.
let search = new URLSearchParams();
const push = vi.fn((url: string) => {
  search = new URLSearchParams(url.split("?")[1] ?? "");
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push }),
  useSearchParams: () => search,
}));
// El paso Simula monta el visor 3D: aquí basta con saber que se abrió.
vi.mock("./paso-simula", () => ({ PasoSimula: () => <div data-testid="visor-simula" /> }));

const spec = loadFixture("lateral_interseccion");
const extraida: ExtraerRespuesta = {
  spec,
  texto: "x",
  metodo: "reglas",
  motivo: null,
  redacciones_servidor: 0,
  verificador: { revisados: 10, corregidos: 0, degradados: 0 },
  glosario: [
    { id: "se_me_cerro", texto: "Se me cerró", inicio: 0, fin: 11, ambiguo: true, pregunta: "¿De qué lado?" },
  ],
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

function renderFlujo(fetcher: typeof fetch, lang: "es" | "en" = "es") {
  const view = (): ReactElement => (
    <IdiomaProvider lang={lang}>
      <FlujoApp ejemplos={[{ id: "ej", titulo: "Ejemplo", texto: "Choqué en el cruce." }]} fetcher={fetcher} />
    </IdiomaProvider>
  );
  const r = render(view());
  // Cada cambio de URL vuelve a dibujar el flujo, como haría Next.
  push.mockImplementation((url: string) => {
    search = new URLSearchParams(url.split("?")[1] ?? "");
    r.rerender(view());
  });
  return r;
}

beforeEach(() => {
  search = new URLSearchParams();
  sessionStorage.clear();
  push.mockClear();
});

describe("flujo guiado /cuenta", () => {
  it("redacta en el dispositivo: el texto enviado no lleva el nombre ni la placa", async () => {
    const { fetcher, calls } = fakeFetch([extraida]);
    renderFlujo(fetcher);
    fireEvent.change(screen.getByTestId("relato"), {
      target: { value: "Me llamo Ana López, placas ABC-123-D. Se me cerró una camioneta." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ver lo que se envía" }));
    expect(screen.getByTestId("texto-redactado").textContent).toBe(
      "Me llamo [NOMBRE], placas [PLACA]. Se me cerró una camioneta.",
    );
    expect(screen.getByTestId("privacidad").textContent).toMatch(/1 nombre, 1 placa/);
    fireEvent.click(screen.getByTestId("entender"));
    await screen.findByTestId("hechos");
    const sent = calls[0]!.body as { texto: string };
    expect(sent.texto).not.toMatch(/Ana|López|ABC-123-D/);
    expect(sent.texto).toMatch(/\[NOMBRE\]/);
    expect(screen.getByTestId("glosario").textContent).toMatch(/Se me cerró/);
  });

  it("entiende con reglas en el dispositivo mientras se escribe, cada dato con su cita", () => {
    renderFlujo(fakeFetch([]).fetcher);
    fireEvent.change(screen.getByTestId("relato"), {
      target: { value: "Iba en mi Aveo como a 50 y el piso estaba mojado." },
    });
    const entendido = screen.getByTestId("entendido");
    expect(entendido.textContent).toMatch(/50 km\/h/);
    expect(entendido.textContent).toMatch(/como a 50/);
    expect(entendido.textContent).toMatch(/mojado/);
  });

  it("muestra los hechos con su fuente, responde las preguntas y pasa al croquis", async () => {
    const respondida: ResponderRespuesta = { spec, aplicadas: ["velocidad:veh-b"], preguntas: [] };
    const { fetcher, calls } = fakeFetch([extraida, respondida]);
    renderFlujo(fetcher);
    fireEvent.change(screen.getByTestId("relato"), { target: { value: "Choqué en el cruce." } });
    fireEvent.click(screen.getByTestId("entender"));
    await screen.findByTestId("preguntas");
    expect(push).toHaveBeenLastCalledWith("/cuenta?paso=falta", { scroll: true });
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
    fireEvent.click(screen.getByTestId("abrir-croquis"));
    expect(await screen.findByTestId("croquis-flujo")).toBeTruthy();
    // Ver la reconstrucción guarda la escena propia y abre el paso Simula.
    fireEvent.click(screen.getByTestId("ver-3d"));
    expect(await screen.findByTestId("visor-simula")).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem("croquis:escena-propia") ?? "{}").meta?.id).toBe(spec.meta.id);
    // Todo el flujo queda en esta pestaña: se puede volver a cualquier paso sin perder nada.
    expect(JSON.parse(sessionStorage.getItem(FLUJO_KEY) ?? "{}").spec.meta.id).toBe(spec.meta.id);
    act(() => {
      fireEvent.click(screen.getByTestId("paso-cuenta"));
    });
    expect((screen.getByTestId("relato") as HTMLTextAreaElement).value).toBe("Choqué en el cruce.");
  });

  it("en inglés, la pregunta de velocidad se hace en inglés y la opción se envía en español", async () => {
    const respondida: ResponderRespuesta = { spec, aplicadas: [], preguntas: [] };
    const { fetcher, calls } = fakeFetch([extraida, respondida]);
    renderFlujo(fetcher, "en");
    fireEvent.change(screen.getByTestId("relato"), { target: { value: "Choqué en el cruce." } });
    fireEvent.click(screen.getByTestId("entender"));
    await screen.findByTestId("preguntas");
    // La clase de B está declarada en la escena: se nombra por su clase, como en español.
    expect(screen.getByText(/^How fast do you think the .+ \(B\) was going\?$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "wet" }));
    fireEvent.click(screen.getByTestId("responder"));
    await screen.findByTestId("sin-preguntas");
    const body = calls[1]!.body as { respuestas: Record<string, string> };
    expect(body.respuestas).toEqual({ estado_superficie: "mojado" });
  });

  it("explica si el servidor no está disponible", async () => {
    const fetcher = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    renderFlujo(fetcher as unknown as typeof fetch);
    fireEvent.change(screen.getByTestId("relato"), { target: { value: "Choqué." } });
    fireEvent.click(screen.getByTestId("entender"));
    await waitFor(() => expect(screen.getByTestId("error").textContent).toMatch(/No se pudo conectar/));
  });

  it("sin red avisa que leer el relato necesita internet y lo reactiva al volver", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try {
      renderFlujo(vi.fn() as unknown as typeof fetch);
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
