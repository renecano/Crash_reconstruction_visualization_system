import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { especDeExpediente, interpretarResultado } from "@croquis/cesvi";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expedienteAxaReconstruccion } from "@/lib/axa-reconstruccion";
import { ProbarConductores } from "./conductores";

type Json = Record<string, unknown>;
const aqui = dirname(fileURLToPath(import.meta.url));
/** El resultado de la referencia Python para «A frena 0.5 s antes» en un alcance (veh-a golpea). */
const agentes = JSON.parse(
  readFileSync(
    resolve(
      aqui,
      "../../../../../../packages/scene-schema/fixtures/agentes/resultados/alcance_frena_antes.json",
    ),
    "utf8",
  ),
) as Json;

function axa() {
  const base = especDeExpediente(expedienteAxaReconstruccion());
  const sinInversion = { evidencia: [], parametros: [], velocidad_impacto: [], residuos: [] };
  return interpretarResultado(base, { vehiculos: [], eventos: [], inversion: sinInversion });
}

describe("probar una hipótesis sobre un conductor (paso 6, R12a)", () => {
  it("manda la escena con el conductor elegido y muestra el contacto contra la reconstrucción", async () => {
    const r = axa();
    const sid = Object.keys(r.ids).find((k) => r.ids[k] === "V2")!;
    const probar = vi.fn<(spec: Json) => Promise<Json>>(() => Promise.resolve(agentes));
    render(<ProbarConductores r={r} probar={probar} />);
    fireEvent.change(screen.getByTestId("conductor-vehiculo"), { target: { value: "V2" } });
    fireEvent.change(screen.getByTestId("conductor-instante"), { target: { value: "1,5" } });
    fireEvent.click(screen.getByTestId("conductor-probar"));
    await waitFor(() => expect(screen.getByTestId("resultado-conductores")).toBeTruthy());

    const spec = probar.mock.calls[0]![0];
    const v = (spec.vehiculos as Json[]).find((x) => x.id === sid)!;
    expect(v.conductor).toMatchObject({
      decision: { valor: "frenar" },
      instante_decision: { valor: -1.5, unidad: "s" },
    });
    expect(screen.getByTestId("hipotesis-probada").textContent).toBe(
      "Si el conductor de V2 frena 1.50 s antes del impacto:",
    );
    expect(screen.getByTestId("diferencia-conductores").textContent).toBe(
      "−14.00 km/h (−36.36 %) de velocidad relativa al contacto",
    );
    expect(screen.getByTestId("contacto-sin").textContent).toMatch(/38\.51 km\/h/);
  });

  it("no deja probar un instante fuera de rango y dice por qué", () => {
    render(<ProbarConductores r={axa()} probar={() => Promise.resolve(agentes)} />);
    fireEvent.change(screen.getByTestId("conductor-instante"), { target: { value: "12" } });
    expect(screen.getByTestId("conductor-probar")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("probar-conductores").textContent).toMatch(
      /El instante va hasta 10 s antes del impacto/,
    );
  });
});
