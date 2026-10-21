import { MemoryBudgetStore } from "@croquis/extraction/server";
import { describe, expect, it } from "vitest";
import {
  mensaje,
  numerosNoReconocidos,
  redactarConsideraciones,
  SISTEMA,
  type ClienteClaude,
  type Hechos,
} from "./consideraciones";

const hechos: Hechos = {
  caso: "A2010930",
  velocidad_impacto_kmh: 63.15,
  velocidad_desplazamiento_kmh: 60.27,
  separacion_restos_m: 15.89,
};

/** Un cliente falso que responde con `texto` y la razón de paro dada (sin red). */
function falso(texto: string, stop = "end_turn"): ClienteClaude & { pedidos: unknown[] } {
  const pedidos: unknown[] = [];
  const stream = (params: unknown) => {
    pedidos.push(params);
    return {
      request_id: "req_prueba",
      finalMessage: () =>
        Promise.resolve({
          stop_reason: stop,
          model: "claude-sonnet-5-5",
          content: [{ type: "text", text: texto }],
          usage: { input_tokens: 1000, output_tokens: 500 },
        }),
    };
  };
  return {
    pedidos,
    messages: { stream },
    beta: { messages: { stream } },
  } as unknown as ClienteClaude & { pedidos: unknown[] };
}

describe("borrador de consideraciones", () => {
  it("avisa de los números del borrador que no venían en los datos", () => {
    const borrador =
      "1. La velocidad de impacto es de 63.15 km/h y la de desplazamiento, de 60,27 km/h. 2. Los restos están a 15.89 m y la batea a 2.40 m.";
    expect(numerosNoReconocidos(borrador, hechos)).toEqual(["2.40"]);
  });

  it("pide el texto con los datos, cobra el gasto y devuelve el borrador", async () => {
    const gasto = new MemoryBudgetStore();
    const cliente = falso("1. Se considera que la velocidad de impacto es de 63.15 km/h.");
    const b = await redactarConsideraciones(hechos, {
      modelo: "claude-sonnet-5-5",
      presupuestoUsd: 2,
      gasto,
      cliente,
    });
    expect(b.texto).toContain("63.15 km/h");
    expect(b.numerosNoReconocidos).toEqual([]);
    expect(b.costoUsd).toBeCloseTo((1000 * 2 + 500 * 10) / 1e6, 10);
    expect(await gasto.spentToday()).toBeCloseTo(b.costoUsd, 10);
    const pedido = cliente.pedidos[0] as {
      system: { text: string }[];
      messages: { content: string }[];
    };
    expect(pedido.system[0]!.text).toBe(SISTEMA);
    expect(pedido.messages[0]!.content).toBe(mensaje(hechos));
  });

  it("no llama a la API si ya se alcanzó el tope de gasto", async () => {
    const gasto = new MemoryBudgetStore();
    await gasto.charge(2);
    const cliente = falso("no debería llegar");
    await expect(
      redactarConsideraciones(hechos, {
        modelo: "claude-sonnet-5-5",
        presupuestoUsd: 2,
        gasto,
        cliente,
      }),
    ).rejects.toThrow(/tope de gasto/);
    expect(cliente.pedidos).toHaveLength(0);
  });

  it("si el modelo declina, lo dice en lugar de devolver un texto vacío", async () => {
    const cliente = falso("", "refusal");
    await expect(
      redactarConsideraciones(hechos, {
        modelo: "claude-sonnet-5-5",
        presupuestoUsd: 2,
        gasto: new MemoryBudgetStore(),
        cliente,
      }),
    ).rejects.toThrow(/declinó/);
  });
});
