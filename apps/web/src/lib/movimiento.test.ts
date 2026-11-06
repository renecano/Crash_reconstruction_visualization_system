import { describe, expect, it } from "vitest";
import { curvaCuenta, posicionTooltip, SEPARACION_TOOLTIP, textoContado } from "./movimiento";

describe("el movimiento (Laboratorio §6)", () => {
  it("la cuenta sigue 1 − (1 − p)⁴ y no se sale de 0–1", () => {
    expect(curvaCuenta(0)).toBe(0);
    expect(curvaCuenta(1)).toBe(1);
    expect(curvaCuenta(0.5)).toBeCloseTo(0.9375, 6);
    expect(curvaCuenta(-1)).toBe(0);
    expect(curvaCuenta(2)).toBe(1);
  });

  it("al terminar se lee exactamente el valor del cálculo", () => {
    expect(textoContado(63.9, 2, 1)).toBe("63.90");
    expect(textoContado(1.1876, 1, 1)).toBe("1.2");
    expect(textoContado(49.21, 1, 0)).toBe("0.0");
    // A la mitad ya va en el 93.75 % del valor.
    expect(textoContado(100, 1, 0.5)).toBe("93.8");
  });
});

describe("dónde va un tooltip (Laboratorio §9)", () => {
  const ventana = { width: 1000, height: 800 };
  const tip = { width: 200, height: 40 };

  it("centrado, 8 px arriba del objeto", () => {
    const c = posicionTooltip({ left: 400, top: 300, width: 100, height: 20 }, tip, ventana);
    expect(c.left).toBe(350);
    expect(c.top).toBe(300 - SEPARACION_TOOLTIP - 40);
    expect(c.abajo).toBe(false);
  });

  it("si arriba no cabe, va abajo", () => {
    const c = posicionTooltip({ left: 400, top: 10, width: 100, height: 20 }, tip, ventana);
    expect(c.abajo).toBe(true);
    expect(c.top).toBe(10 + 20 + SEPARACION_TOOLTIP);
  });

  it("nunca se sale de la ventana", () => {
    expect(posicionTooltip({ left: 0, top: 300, width: 10, height: 10 }, tip, ventana).left).toBe(
      8,
    );
    expect(posicionTooltip({ left: 990, top: 300, width: 10, height: 10 }, tip, ventana).left).toBe(
      792,
    );
    // Un objeto alto pegado arriba: abajo tampoco cabe, y se queda dentro.
    const alto = posicionTooltip({ left: 400, top: 5, width: 100, height: 790 }, tip, ventana);
    expect(alto.top).toBe(752);
  });
});
