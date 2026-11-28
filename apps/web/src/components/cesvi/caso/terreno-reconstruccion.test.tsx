import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { Expediente, SalidaCorpus } from "@croquis/cesvi";
import { reconstruct, reconstructionToDict } from "@croquis/solver-ts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { escenaComoPerito } from "@/lib/ejemplo-como-perito";
import { conLugarDelEjemplo } from "@/lib/ejemplos-narracion";
import { RECETAS_PERITO } from "@/lib/recetas-perito";
import { TerrenoReconstruccion } from "./terreno-reconstruccion";

// El cálculo del navegador corre en un worker; aquí, el mismo solver en el proceso.
vi.mock("@/lib/reconstruct-client", () => ({
  reconstruirEnNavegador: (spec: unknown) =>
    Promise.resolve(reconstructionToDict(reconstruct(spec as never))),
}));

/**
 * Los cruces de un tope con su velocidad, en un caso que da cifra (René, 2026-11-27): la reversa de
 * los ejemplos, «12 metros al Sur de ese acceso se encuentra un reductor de velocidad tipo tope»,
 * armada como la arma el perito. La E2E del terreno (W5) ya no da cifra con lo medido como
 * restricción (el candado), así que el panel de los cruces se prueba aquí.
 */
describe("los cruces del tope en la reconstrucción", () => {
  it("la reversa: el Versa cruza el tope, con su velocidad y lo que se supone al cruzarlo", async () => {
    const RAIZ = resolve(__dirname, "../../../../../..");
    const clave = "reversa-pendiente";
    const receta = RECETAS_PERITO.find((r) => r.clave === clave)!;
    const g = JSON.parse(
      readFileSync(resolve(RAIZ, `data/cesvi/grabaciones/ejemplos/${clave}.json`), "utf8"),
    ) as { narracion: string; salida: SalidaCorpus };
    const leida = cesvi.escenaDeNarracion(g.salida, g.narracion);
    const e0 = conLugarDelEjemplo(g.narracion, leida.expediente as never) as unknown as Expediente;
    const armada = escenaComoPerito(e0, g.narracion, leida.posiciones, receta);
    const r = cesvi.reconstruirExpediente(armada.expediente, "caso-nuevo", {
      samples: 8,
      mcSamples: 8,
    });
    expect(r.noCuadra).toBeFalsy();
    render(<TerrenoReconstruccion r={r} nombres={{ V1: "A · CR-V", V2: "B · Versa" }} />);
    const cruces = await screen.findByTestId("cruces-tope", {}, { timeout: 60_000 });
    expect(cruces.textContent).toMatch(/B · Versa/);
    expect(cruces.textContent).toMatch(/km\/h/);
    expect(screen.getByTestId("supuestos-tope")).toBeTruthy();
  }, 300_000);
});
