import { describe, expect, it } from "vitest";
import { casosPorTanda, esperarMemoria, MINIMO_LIBRE_MB } from "./memoria";

/** La revisión de la cadena no se queda sin memoria en la laptop de 8 GB (René, 2026-11-26). */
describe("cuántos casos por tanda según la memoria libre", () => {
  it("menos casos con menos memoria; con muy poca, ninguno (espera)", () => {
    expect(casosPorTanda(MINIMO_LIBRE_MB - 1)).toBe(0);
    expect(casosPorTanda(Number.NaN)).toBe(0);
    expect(casosPorTanda(1000)).toBe(5);
    expect(casosPorTanda(1500)).toBe(15);
    expect(casosPorTanda(4000)).toBe(40);
  });

  it("espera a que se libere memoria y se rinde al tope", async () => {
    const libres = [500, 600, 900];
    let k = 0;
    const dormidas: number[] = [];
    const dormir = (ms: number) => {
      dormidas.push(ms);
      return Promise.resolve();
    };
    expect(await esperarMemoria(() => libres[k++]!, { cadaMs: 10, topeMs: 100, dormir })).toBe(
      true,
    );
    expect(dormidas).toEqual([10, 10]);
    expect(await esperarMemoria(() => 300, { cadaMs: 10, topeMs: 30, dormir })).toBe(false);
  });
});
