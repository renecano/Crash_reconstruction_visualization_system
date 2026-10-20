import { afterEach, describe, expect, it, vi } from "vitest";
import { cedente } from "./ceder";

describe("cedente", () => {
  afterEach(() => vi.restoreAllMocks());

  it("no cede mientras no pasa el presupuesto", () => {
    let ahora = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => ahora);
    const ceder = cedente(8);
    ahora += 7.9;
    expect(ceder()).toBeNull();
  });

  it("cede al pasar el presupuesto y vuelve a contar desde la cesión", async () => {
    let ahora = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => ahora);
    const ceder = cedente(8);
    ahora += 8;
    const pausa = ceder();
    expect(pausa).toBeInstanceOf(Promise);
    await pausa;
    ahora += 4;
    expect(ceder()).toBeNull();
    ahora += 4;
    expect(ceder()).not.toBeNull();
  });
});
