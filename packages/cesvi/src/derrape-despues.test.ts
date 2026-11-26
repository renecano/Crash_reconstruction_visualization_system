import { describe, expect, it } from "vitest";
import { derrapeAntes, derrapeDespues } from "./reconstruccion";
import { velocidadSupuestaEnReversa } from "./reversa";

describe("el derrape de después del contacto", () => {
  it("la huella del Sentra del ejemplo del poste es de después del impacto", () => {
    const cita =
      "Después del contacto, el vehículo B dejó una huella de derrape de 18.40 metros que inicia en el área de contacto, cruza el borde de la carpeta y continúa sobre el acotamiento de terracería";
    expect(derrapeDespues(cita)).toBe(true);
    expect(derrapeAntes(cita)).toBe(false);
    expect(derrapeDespues("una huella de derrape que inicia en el punto de impacto")).toBe(true);
  });
  it("un derrape de antes del choque o sin fase no lo es", () => {
    expect(derrapeDespues("derrape de 18 m antes de la salida del camino")).toBe(false);
    expect(derrapeDespues("una huella de derrape de 12 metros")).toBe(false);
    expect(derrapeDespues(undefined)).toBe(false);
  });
});

describe("la velocidad supuesta en reversa", () => {
  it("pesa como supuesto con el rango de NHTSA (René, 2026-11-26)", () => {
    const v = velocidadSupuestaEnReversa();
    expect(v.a_priori).toBe(true);
    expect(v.rango).toEqual([3.06, 9.07]);
  });
});
