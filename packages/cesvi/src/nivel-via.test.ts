import { describe, expect, it } from "vitest";
import type { Expediente } from "./corpus";
import { viasDelNivel } from "./nivel-via";

/** El Periférico, la Autopista Urbana Sur encima (2 m al lado) y la rampa que sube a ella (René, 2026-11-27, #380). */
const lat0 = 19.3;
const ll = (x: number, y: number): [number, number] => [
  -99.18 + x / (111320 * Math.cos((lat0 * Math.PI) / 180)),
  lat0 + y / 111320,
];
const vias = [
  { id: 10, tipo: "trunk", nombre: "Periférico", puntos: [ll(-200, 0), ll(200, 0)] },
  {
    id: 11,
    tipo: "motorway",
    nombre: "Autopista Urbana Sur",
    nivel: 1,
    puntos: [ll(-200, 2), ll(200, 2)],
  },
  { id: 12, tipo: "motorway_link", nombre: "Rampa", puntos: [ll(200, 2), ll(300, 60)] },
];
const caso = (estructura: boolean) =>
  ({
    caso: {
      lugar: {
        calles_del_mapa: {
          fuente: "overpass",
          consultado: "2026-11-27T00:00:00Z",
          centro: { lat: lat0, lon: -99.18 },
          radio_m: 300,
          vias,
        },
      },
      ...(estructura
        ? { condiciones: { estructura: { valor: "puente", fuente: "narracion" } } }
        : {}),
    },
    vehiculos: [],
  }) as unknown as Expediente;

describe("las calles guardadas del nivel narrado", () => {
  it("a ras del piso: sin la Autopista Urbana", () => {
    expect(viasDelNivel(caso(false)).map((v) => v.nombre)).toEqual(["Periférico", "Rampa"]);
  });
  it("sobre el puente: sin el Periférico de abajo, con la rampa", () => {
    expect(viasDelNivel(caso(true)).map((v) => v.nombre)).toEqual([
      "Autopista Urbana Sur",
      "Rampa",
    ]);
  });
});
