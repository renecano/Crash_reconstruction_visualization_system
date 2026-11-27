import { describe, expect, it } from "vitest";
import type { Calle } from "@/lib/escena-facil";
import { aLaCalle, mismaCalle, sobreCalle } from "./cadena";

/** Las reglas geométricas de la revisión de la cadena: que el revisor no se equivoque él mismo. */
const P = { lat: 19.29, lon: -99.65 };
const m = (este: number, norte: number) =>
  [P.lon + este / (111320 * Math.cos((P.lat * Math.PI) / 180)), P.lat + norte / 111320] as [
    number,
    number,
  ];
const calle = (nombre: string, puntos: [number, number][], ancho = 10): Calle => ({
  id: 1,
  nombre,
  puntos,
  ancho,
  nodos: [],
});
const norteSur = calle("Avenida Tecnológico", [m(0, -100), m(0, 100)]);

describe("las reglas de la revisión de la cadena", () => {
  it("reconoce la misma calle con otro tipo o con artículos", () => {
    expect(mismaCalle("Avenida de los Insurgentes Sur", "Avenida Insurgentes Sur")).toBe(true);
    expect(mismaCalle("Paseo Tollocan", "Paseo Tollocan")).toBe(true);
    expect(mismaCalle("Avenida Tecnológico", "Avenida Las Torres")).toBe(false);
  });

  it("mide la distancia a la calle y su rumbo", () => {
    const r = aLaCalle({ lat: P.lat, lon: m(3, 0)[0] }, norteSur);
    expect(r.m).toBeCloseTo(3, 1);
    expect(r.rumbo).toBeCloseTo(0, 0);
  });

  it("un vehículo sobre la calle y alineado está sobre ella; cruzado o lejos, no", () => {
    expect(sobreCalle(P, 180, [norteSur])?.sobre).toBe(true);
    expect(sobreCalle(P, 90, [norteSur])?.sobre).toBe(false);
    expect(sobreCalle({ lat: P.lat, lon: m(20, 0)[0] }, 0, [norteSur])?.sobre).toBe(false);
  });
});
