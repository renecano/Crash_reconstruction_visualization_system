import { describe, expect, it } from "vitest";
import { danoEnCorto, danoEnTexto, ENERGIA_BORDE_PCT, type LecturaDano } from "./dano-energia";

/** Auditoría del 2026-11-15, C5: «alcanza la deformación» dice cuánto, con sus números. */
describe("la deformación medida contra la reconstrucción, en palabras", () => {
  const banda = { p10: 29.59, p50: 50.97, p90: 89.88 };
  const con = (reconstruccionKmh: number, estado: LecturaDano["estado"]): LecturaDano => ({
    vehiculo: "V2",
    minimo: true,
    banda,
    reconstruccionKmh,
    energiaPct: 100 * (reconstruccionKmh / banda.p50) ** 2,
    estado,
  });

  it("en el borde bajo de la banda: lo dice, con el cambio de velocidad y la energía", () => {
    // AXA: 29.57 km/h contra una banda de 29.59 a 89.88 (mediana 50.97).
    const l = con(29.57, "borde_bajo");
    expect(Math.round(l.energiaPct)).toBe(34);
    expect(l.energiaPct).toBeLessThan(ENERGIA_BORDE_PCT);
    expect(danoEnCorto(l)).toBe("En el borde bajo (34 % de la energía)");
    expect(danoEnTexto(l, "B")).toBe(
      "Queda en el borde bajo de la deformación medida de B: su cambio de velocidad es de 30 km/h y la deformación pide al menos 30–90 km/h (mediana 51 km/h). Es el 34 % de la energía de la mediana.",
    );
  });

  it("dentro, debajo y arriba de la banda", () => {
    expect(danoEnCorto(con(48, "dentro"))).toBe("La alcanza (89 % de la energía)");
    expect(danoEnTexto(con(48, "dentro"))).toMatch(/^Alcanza la deformación medida de V2/);
    expect(danoEnCorto(con(20, "debajo"))).toBe("No la alcanza (15 % de la energía)");
    expect(danoEnTexto(con(20, "debajo"))).toMatch(/^No alcanza la deformación medida de V2/);
    expect(danoEnCorto(con(100, "arriba"))).toMatch(/^La rebasa/);
  });

  it("si los dos vehículos traen deformación, la banda no es un mínimo", () => {
    const l = { ...con(48, "dentro"), minimo: false };
    expect(danoEnTexto(l)).toContain("la deformación pide 30–90 km/h");
    expect(danoEnTexto(l)).not.toContain("al menos");
  });
});
