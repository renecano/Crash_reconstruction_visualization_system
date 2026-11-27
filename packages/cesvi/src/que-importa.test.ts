import { describe, expect, it } from "vitest";
import { desdeMetros, type LonLat } from "./geo";
import { distanciaAlBarrido, MARGEN_QUE_IMPORTA_M, queImporta, type Barrido } from "./que-importa";

/** «Qué cambia la cifra» (René, 2026-11-26): lo que no toca ningún recorrido no influye en la cifra. */
describe("qué importa en la escena", () => {
  const origen: LonLat = [-99.05, 19.32];
  const en = (este: number, norte: number) => desdeMetros(este, norte, origen) as LonLat;
  // Un auto de 4.5 × 1.8 m que recorre el eje x de −20 a 20 m, de frente al este.
  const n = 41;
  const auto: Barrido = {
    largo: 4.5,
    ancho: 1.8,
    x: Array.from({ length: n }, (_, i) => -20 + i),
    y: Array.from({ length: n }, () => 0),
    yaw: Array.from({ length: n }, () => 0),
  };

  it("mide al borde de la caja del vehículo, no a su centro", () => {
    expect(distanciaAlBarrido(0, 0.9, [auto])).toBeCloseTo(0, 6);
    expect(distanciaAlBarrido(0, 3.9, [auto])).toBeCloseTo(3, 6);
    expect(distanciaAlBarrido(25, 0, [auto])).toBeCloseTo(25 - 20 - 2.25, 6);
  });

  it("un poste en el recorrido importa; uno lejos, no (como la e2e del poste)", () => {
    const r = queImporta(
      [
        { clave: "objeto:en-el-camino", punto: en(5, 1), radioM: 0.15 },
        { clave: "objeto:al-margen", punto: en(5, 0.9 + MARGEN_QUE_IMPORTA_M), radioM: 0.15 },
        { clave: "objeto:lejos", punto: en(-25, -12), radioM: 0.15 },
      ],
      [auto],
      origen,
    );
    expect(r).toEqual({
      "objeto:en-el-camino": true,
      "objeto:al-margen": true,
      "objeto:lejos": false,
    });
  });

  it("una zona importa si la pisa o pasa a menos del margen; si no, no", () => {
    const cuadro = (x0: number, y0: number, lado: number) =>
      [en(x0, y0), en(x0 + lado, y0), en(x0 + lado, y0 + lado), en(x0, y0 + lado)] as LonLat[];
    const r = queImporta(
      [
        { clave: "terreno:bajo-el-auto", contorno: cuadro(-3, -3, 6) },
        { clave: "terreno:lejos", contorno: cuadro(0, 10, 4) },
      ],
      [auto],
      origen,
    );
    expect(r).toEqual({ "terreno:bajo-el-auto": true, "terreno:lejos": false });
  });
});
