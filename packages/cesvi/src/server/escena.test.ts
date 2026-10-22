import { MemoryBudgetStore } from "@croquis/extraction/server";
import { describe, expect, it } from "vitest";
import type { ClienteClaude } from "./consideraciones";
import { leerEscena } from "./escena";

/** Un cliente falso que responde con `texto` (sin red). */
function falso(texto: string, stop = "end_turn"): ClienteClaude & { pedidos: unknown[] } {
  const pedidos: unknown[] = [];
  const stream = (params: unknown) => {
    pedidos.push(params);
    return {
      finalMessage: () =>
        Promise.resolve({
          stop_reason: stop,
          model: "claude-sonnet-5-5",
          content: [{ type: "text", text: texto }],
          usage: { input_tokens: 2000, output_tokens: 800 },
        }),
    };
  };
  return { pedidos, messages: { stream } } as unknown as ClienteClaude & { pedidos: unknown[] };
}

const SALIDA = {
  datos: [
    {
      seccion: "vehiculo",
      n: 1,
      vehiculo: "V1",
      campo: "modelo",
      valor: "Tsuru",
      cita: "El vehículo A, tipo Tsuru",
    },
  ],
};

describe("lectura de la narración a escena (servidor)", () => {
  it("manda la narración con el prompt de la escena, cobra el gasto y devuelve las filas", async () => {
    const gasto = new MemoryBudgetStore();
    const cliente = falso(JSON.stringify(SALIDA));
    const r = await leerEscena("El vehículo A, tipo Tsuru, presenta daños en su frente.", {
      modelo: "claude-sonnet-5-5",
      presupuestoUsd: 2,
      gasto,
      cliente,
    });
    expect(r.salida).toEqual(SALIDA);
    expect(r.version).toBe("escena-narracion-v1");
    expect(await gasto.spentToday()).toBeCloseTo(r.costoUsd, 10);
    expect(JSON.stringify(cliente.pedidos[0])).toContain("Narración del perito");
  });

  it("no llama a Claude si ya se alcanzó el tope de gasto", async () => {
    const gasto = new MemoryBudgetStore();
    await gasto.charge(5);
    const cliente = falso("{}");
    await expect(
      leerEscena("El vehículo A presenta daños en su frente.", {
        modelo: "claude-sonnet-5-5",
        presupuestoUsd: 2,
        gasto,
        cliente,
      }),
    ).rejects.toThrow(/tope de gasto/);
    expect(cliente.pedidos).toHaveLength(0);
  });
});
