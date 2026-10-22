import { MemoryBudgetStore } from "@croquis/extraction/server";
import { describe, expect, it } from "vitest";
import type { ClienteClaude } from "./consideraciones";
import { leerDictamenImportado } from "./importar";

const CORPUS = { datos: [] };
const NARRACION = {
  descripcion: "El vehículo A presenta daños en su parte frontal.",
  conclusiones: {
    modalidad: "alcance",
    modalidad_cita: "",
    zonas_contacto: [],
    secuencia: [],
    velocidades: [],
    posiciones_finales: [],
  },
};

/** Un cliente falso que responde según el prompt de sistema que recibe (sin red). */
function falso(): ClienteClaude & { pedidos: { system: { text: string }[] }[] } {
  const pedidos: { system: { text: string }[] }[] = [];
  const stream = (params: { system: { text: string }[] }) => {
    pedidos.push(params);
    const esNarracion = params.system[0]!.text.includes("«descripcion»");
    return {
      finalMessage: () =>
        Promise.resolve({
          stop_reason: "end_turn",
          model: "claude-sonnet-5-5",
          content: [{ type: "text", text: JSON.stringify(esNarracion ? NARRACION : CORPUS) }],
          usage: { input_tokens: 10000, output_tokens: 3000 },
        }),
    };
  };
  return { pedidos, messages: { stream } } as unknown as ClienteClaude & {
    pedidos: { system: { text: string }[] }[];
  };
}

describe("importación de un dictamen (servidor)", () => {
  it("hace las dos lecturas, cobra la suma y devuelve las dos salidas", async () => {
    const gasto = new MemoryBudgetStore();
    const cliente = falso();
    const r = await leerDictamenImportado("DICTAMEN TÉCNICO DEL HECHO DE TRÁNSITO…", {
      modelo: "claude-sonnet-5-5",
      presupuestoUsd: 5,
      gasto,
      cliente,
    });
    expect(cliente.pedidos).toHaveLength(2);
    expect(r.corpus).toEqual(CORPUS);
    expect(r.narracion).toEqual(NARRACION);
    expect(r.versiones).toEqual({ corpus: "corpus-cesvi-v3", narracion: "narracion-cesvi-v1" });
    expect(r.costoUsd).toBeGreaterThan(0);
    expect(await gasto.spentToday()).toBeCloseTo(r.costoUsd, 10);
  });

  it("no llama a Claude si ya se alcanzó el tope de gasto", async () => {
    const gasto = new MemoryBudgetStore();
    await gasto.charge(5);
    const cliente = falso();
    await expect(
      leerDictamenImportado("DICTAMEN TÉCNICO…", {
        modelo: "claude-sonnet-5-5",
        presupuestoUsd: 2,
        gasto,
        cliente,
      }),
    ).rejects.toThrow(/tope de gasto/);
    expect(cliente.pedidos).toHaveLength(0);
  });
});
