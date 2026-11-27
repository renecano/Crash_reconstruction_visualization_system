import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cesvi from "@croquis/cesvi";
import type { Expediente, SalidaCorpus } from "@croquis/cesvi";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { escenaComoPerito } from "@/lib/ejemplo-como-perito";
import { conLugarDelEjemplo } from "@/lib/ejemplos-narracion";
import { RECETAS_PERITO } from "@/lib/recetas-perito";
import { useReconstruccion } from "./reconstruccion";

const solver = vi.hoisted(() =>
  vi.fn(() => Promise.reject(new Error("solo se cuentan las llamadas"))),
);
vi.mock("@/lib/reconstruct-client", () => ({
  reconstruirCompletoEnNavegador: (...a: unknown[]) => solver(...(a as [])),
}));
vi.mock("@/lib/relieve-cliente", () => ({ relieveDelLugar: () => Promise.resolve(null) }));

/**
 * «Reconstruir» espera las calles del lugar (René, 2026-11-27): entran a la reconstrucción, así que
 * reconstruir antes de que lleguen dejaba la cifra vieja al llegar, y la página se recalculaba sola con
 * «Siguiente» apagado (la E2E del dictamen y la de Presentar lo encontraron a veces en CI). Con la
 * espera, el solver corre una sola vez, ya con ellas.
 */
describe("Reconstruir espera las calles del lugar", () => {
  it("no llama al solver hasta que llegan, lo dice, y entonces lo llama una vez", async () => {
    const RAIZ = resolve(__dirname, "../../../../../..");
    const clave = "reversa-pendiente";
    const receta = RECETAS_PERITO.find((r) => r.clave === clave)!;
    const g = JSON.parse(
      readFileSync(resolve(RAIZ, `data/cesvi/grabaciones/ejemplos/${clave}.json`), "utf8"),
    ) as { narracion: string; salida: SalidaCorpus };
    const leida = cesvi.escenaDeNarracion(g.salida, g.narracion);
    const e0 = conLugarDelEjemplo(g.narracion, leida.expediente as never) as unknown as Expediente;
    const exp = escenaComoPerito(e0, g.narracion, leida.posiciones, receta).expediente;

    const { result, rerender } = renderHook(({ esperar }) => useReconstruccion(exp, { esperar }), {
      initialProps: { esperar: true },
    });
    await act(() => result.current.reconstruir());
    expect(solver).not.toHaveBeenCalled();
    expect(result.current.estado).toMatch(/Esperando las calles del lugar/);
    // Llegan las calles (o fallan): se reconstruye una sola vez.
    rerender({ esperar: false });
    await waitFor(() => expect(solver).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(solver).toHaveBeenCalledTimes(1);
  });

  it("sin nada que esperar, reconstruye al momento", async () => {
    solver.mockClear();
    const exp = { vehiculos: [] } as unknown as Expediente;
    const { result } = renderHook(() => useReconstruccion(exp, { esperar: false }));
    await act(() => result.current.reconstruir());
    // Un expediente vacío falla antes del solver o en él; lo que importa es que no se queda esperando.
    expect(result.current.estado ?? "").not.toMatch(/Esperando/);
  });
});
