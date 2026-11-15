import { describe, expect, it } from "vitest";
import { BudgetExceededError, costUsd, errorCobrado } from "../claude-output";
import { conReserva, costoMaximoUsd, MemoryBudgetStore, today } from "./budget";

/** Auditoría del 2026-11-15, I1: el tope de gasto diario es un tope de verdad. */
describe("el tope de gasto con reserva", () => {
  it("dos peticiones a la vez no pasan juntas del tope: la segunda espera su turno o se niega", async () => {
    const store = new MemoryBudgetStore();
    let soltar!: () => void;
    const enCurso = conReserva(
      store,
      1,
      0.6,
      () => new Promise<number>((r) => (soltar = () => r(0.1))),
      (c) => c,
    );
    // Deja que la primera reserve.
    await new Promise((r) => setTimeout(r, 0));
    expect(await store.spentToday()).toBeCloseTo(0.6, 10);
    let llamadas = 0;
    await expect(
      conReserva(
        store,
        1,
        0.6,
        () => Promise.resolve(++llamadas),
        () => 0.1,
      ),
    ).rejects.toThrow(BudgetExceededError);
    expect(llamadas).toBe(0);
    // La negada devolvió su reserva; al terminar la primera queda cobrado solo lo que costó.
    expect(await store.spentToday()).toBeCloseTo(0.6, 10);
    soltar();
    await enCurso;
    expect(await store.spentToday()).toBeCloseTo(0.1, 10);
  });

  it("una respuesta que no sirve pero se pagó queda cobrada; un fallo sin costo devuelve la reserva", async () => {
    const store = new MemoryBudgetStore();
    await expect(
      conReserva(
        store,
        1,
        0.5,
        () => Promise.reject(errorCobrado("La lectura se truncó en max_tokens.", 0.32)),
        () => 0,
      ),
    ).rejects.toThrow(/truncó/);
    expect(await store.spentToday()).toBeCloseTo(0.32, 10);
    await expect(
      conReserva(
        store,
        1,
        0.5,
        () => Promise.reject(new Error("sin red")),
        () => 0,
      ),
    ).rejects.toThrow("sin red");
    expect(await store.spentToday()).toBeCloseTo(0.32, 10);
  });

  it("sin tope, o con el tope ya alcanzado, no llama", async () => {
    const store = new MemoryBudgetStore();
    let llamadas = 0;
    const llamar = (tope: number) =>
      conReserva(
        store,
        tope,
        0.01,
        () => Promise.resolve(++llamadas),
        () => 0.01,
      );
    await expect(llamar(0)).rejects.toThrow(BudgetExceededError);
    await store.charge(2);
    await expect(llamar(2)).rejects.toThrow(/tope de gasto/);
    expect(llamadas).toBe(0);
  });

  it("la reserva es una cota: nunca menos que el costo de lo que se manda y de la salida completa", () => {
    const pedido = {
      system: "Lee la narración.",
      messages: ["El vehículo 1 circulaba…".repeat(400)],
    };
    const bytes = Buffer.byteLength(JSON.stringify(pedido), "utf8");
    const real = costUsd("claude-sonnet-5-5", {
      // Aunque cada byte fuera un token y todo se escribiera en la caché.
      input_tokens: 0,
      cache_creation_input_tokens: bytes,
      cache_read_input_tokens: 0,
      output_tokens: 32000,
    });
    expect(costoMaximoUsd("claude-sonnet-5-5", pedido, 32000)).toBeGreaterThanOrEqual(real);
  });

  it("el día del tope corta a la medianoche del centro de México, no a la de UTC", () => {
    expect(today(new Date("2026-11-16T03:00:00Z"))).toBe("2026-11-15");
    expect(today(new Date("2026-11-16T06:30:00Z"))).toBe("2026-11-16");
  });
});
