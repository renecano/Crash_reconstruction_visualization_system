import { avanzar } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import { calzadaEnSuSentido, sobreCalle, type Calle } from "./escena-facil";

/**
 * La calzada en el sentido del vehículo (revisión de la cadena, cesvi-ebb5c029a8): una avenida con
 * dos calzadas de un solo sentido, 15 m entre ejes. La oriente va al norte y la poniente, al sur.
 */
const P = { lat: 22.27, lon: -97.87 };
const oeste = (m: number) => avanzar([P.lon, P.lat], 270, m)[0];
const via = (id: number, lon: number, alNorte: boolean, unSentido?: 1 | -1): Calle => ({
  id,
  nombre: "Avenida Hidalgo",
  puntos: alNorte
    ? [
        [lon, P.lat - 0.001],
        [lon, P.lat + 0.001],
      ]
    : [
        [lon, P.lat + 0.001],
        [lon, P.lat - 0.001],
      ],
  ancho: 7,
  nodos: [id * 10, id * 10 + 1],
  ...(unSentido ? { unSentido } : {}),
});

describe("el choque, en la calzada de su sentido", () => {
  const oriente = via(1, P.lon, true, 1);
  const poniente = via(2, oeste(15), false, 1);

  it("el que va al sur en la calzada que va al norte pasa a la que va al sur", () => {
    const r = calzadaEnSuSentido([oriente, poniente], P, 180)!;
    expect(r.calle.id).toBe(2);
    expect(sobreCalle(poniente, r.punto).distancia).toBeLessThan(0.5);
  });

  it("en su sentido, o en una calle de doble sentido, no se mueve", () => {
    expect(calzadaEnSuSentido([oriente, poniente], P, 0)).toBeNull();
    expect(calzadaEnSuSentido([via(3, P.lon, true)], P, 180)).toBeNull();
  });

  it("`oneway=-1` va al revés del orden de sus nodos", () => {
    expect(calzadaEnSuSentido([via(4, P.lon, true, -1), poniente], P, 180)).toBeNull();
  });
});
