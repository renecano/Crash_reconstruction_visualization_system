import { describe, expect, it } from "vitest";
import { horaDeTexto, iluminacionDeHora } from "./iluminacion";

describe("la luz del lugar, de la hora del relato (René, 2026-11-18)", () => {
  it("lee la hora como la escriben los peritos", () => {
    expect(horaDeTexto("21:45 horas")).toBeCloseTo(21.75);
    expect(horaDeTexto("aproximadamente a las 22:30 horas")).toBeCloseTo(22.5);
    expect(horaDeTexto("a las 9:10 p. m.")).toBeCloseTo(21 + 10 / 60);
    expect(horaDeTexto("12:05 a.m.")).toBeCloseTo(5 / 60);
    expect(horaDeTexto("14.30 hrs")).toBeCloseTo(14.5);
    expect(horaDeTexto("sin hora")).toBeNull();
    expect(horaDeTexto(null)).toBeNull();
    // Relleno de los reportes: una fecha con «00:00 horas» no dice la hora.
    expect(horaDeTexto("17 de abril de 2012 a las 00:00 horas")).toBeNull();
    // Fechas antes de la hora.
    expect(horaDeTexto("26 de febrero de 2011, aproximadamente a las 12:30 horas")).toBeCloseTo(
      12.5,
    );
    expect(horaDeTexto("13:40 horas del 10 de mayo")).toBeCloseTo(13 + 40 / 60);
  });

  it("los dos ejemplos de noche salen de noche, con alumbrado", () => {
    expect(iluminacionDeHora("21:45 horas")).toBe("noche_con_alumbrado");
    expect(iluminacionDeHora("aproximadamente a las 22:30 horas")).toBe("noche_con_alumbrado");
  });

  it("de día, al amanecer y al atardecer", () => {
    expect(iluminacionDeHora("13:20 horas")).toBe("dia");
    expect(iluminacionDeHora("06:40 horas")).toBe("amanecer");
    expect(iluminacionDeHora("19:00 horas")).toBe("atardecer");
    expect(iluminacionDeHora("03:15 horas")).toBe("noche_con_alumbrado");
  });

  it("nunca supone «noche sin alumbrado», la única luz que entra al cálculo", () => {
    for (let h = 0; h < 24; h++)
      expect(iluminacionDeHora(`${h}:00 horas`)).not.toBe("noche_sin_alumbrado");
  });
});
