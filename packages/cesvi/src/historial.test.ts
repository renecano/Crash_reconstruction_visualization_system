import { describe, expect, it } from "vitest";
import { deshacer, historial, LIMITE_HISTORIAL, registrar, rehacer } from "./historial";

describe("deshacer y rehacer", () => {
  it("deshace y rehace en orden", () => {
    let h = historial<number | null>(null);
    h = registrar(h, 1);
    h = registrar(h, 2);
    h = deshacer(h);
    expect(h.presente).toBe(1);
    h = deshacer(h);
    expect(h.presente).toBeNull();
    h = deshacer(h);
    expect(h.presente).toBeNull();
    h = rehacer(h);
    h = rehacer(h);
    expect(h.presente).toBe(2);
    expect(rehacer(h)).toBe(h);
  });

  it("un cambio nuevo borra lo que se podía rehacer", () => {
    let h = registrar(registrar(historial(0), 1), 2);
    h = registrar(deshacer(h), 5);
    expect(h.futuro).toEqual([]);
    expect(h.pasado).toEqual([0, 1]);
  });

  it("el mismo estado no se registra dos veces", () => {
    const h = registrar(historial(1), 1);
    expect(h.pasado).toEqual([]);
  });

  it(`guarda a lo más ${LIMITE_HISTORIAL} pasos atrás`, () => {
    let h = historial(0);
    for (let i = 1; i <= LIMITE_HISTORIAL + 20; i++) h = registrar(h, i);
    expect(h.pasado).toHaveLength(LIMITE_HISTORIAL);
  });
});
