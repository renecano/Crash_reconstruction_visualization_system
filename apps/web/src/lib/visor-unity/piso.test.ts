import { describe, expect, it } from "vitest";
import {
  AJUSTE_MAX_M,
  ajustar,
  ajusteEnPalabras,
  atribucionDelPiso,
  ATRIBUCION_MAPA,
  desplazamientoPx,
  LADO_MAX_M,
  LADO_MIN_M,
  LADO_PX,
  motivoSinFoto,
  pisoDelCaso,
  SIN_AJUSTE,
  zoomParaLado,
} from "./piso";

const origen = [-103.3766224, 20.6667966] as const;
const resultado = (xs: number[], ys: number[]) => ({
  vehiculos: [{ trayectoria: { x: xs, y: ys } }],
});

describe("el piso del modo «mapa real» (ronda 4, punto 9)", () => {
  it("se centra en lo que se mueve, con margen, entre 200 y 800 m de lado", () => {
    const p = pisoDelCaso(resultado([-30, 50], [-10, 30]), origen);
    expect([p.centroX, p.centroY]).toEqual([10, 10]);
    expect(p.ladoM).toBe(LADO_MIN_M);
    expect(pisoDelCaso(resultado([0, 500], [0, 10]), origen).ladoM).toBe(620);
    expect(pisoDelCaso(resultado([0, 3000], [0, 10]), origen).ladoM).toBe(LADO_MAX_M);
    expect(pisoDelCaso({}, origen)).toMatchObject({ centroX: 0, centroY: 0, ladoM: LADO_MIN_M });
  });

  it("el zoom hace caber el lado justo (teselas de 512, Web Mercator)", () => {
    const z = zoomParaLado(600, 20.67, 1024);
    const metrosPorPx = (40075016.686 * Math.cos((20.67 * Math.PI) / 180)) / (512 * 2 ** z);
    expect(metrosPorPx * 1024).toBeCloseTo(600, 6);
  });

  it("la foto se corre con las flechas, dentro de ±15 m, y en pixeles con el norte arriba", () => {
    let a = ajustar(SIN_AJUSTE, 0.5, 0);
    a = ajustar(a, 0, -1);
    expect(a).toEqual({ esteM: 0.5, norteM: -1 });
    expect(ajusteEnPalabras(a)).toBe("0.5 m al este y 1.0 m al sur");
    expect(ajusteEnPalabras(SIN_AJUSTE)).toBe("Sin ajuste");
    expect(ajustar({ esteM: 14.8, norteM: 0 }, 0.5, 0).esteM).toBe(AJUSTE_MAX_M);
    // 1 m al este en 200 m de lado: 1/200 de la imagen a la derecha; al norte, hacia arriba.
    expect(desplazamientoPx({ esteM: 1, norteM: 1 }, 200)).toEqual({
      dx: LADO_PX / 200,
      dy: -LADO_PX / 200,
    });
  });

  it("dice por qué no hay foto, y la atribución lleva a Esri solo si se ve su foto", () => {
    expect(motivoSinFoto({ enLinea: true, llave: "" })).toMatch(/no tiene la llave/);
    expect(motivoSinFoto({ enLinea: false, llave: "x" })).toBe(
      "Sin internet: la foto satelital se apagó y el piso es el mapa.",
    );
    expect(motivoSinFoto({ enLinea: true, llave: "x", fallo: true })).toMatch(/no cargó/);
    expect(motivoSinFoto({ enLinea: true, llave: "x" })).toBeNull();
    const capas = {
      mapa: {} as HTMLCanvasElement,
      foto: {} as HTMLCanvasElement,
      creditosFoto: "Esri",
      sinFoto: null,
    };
    expect(atribucionDelPiso(capas, true)).toBe(`${ATRIBUCION_MAPA} · Powered by Esri · Esri`);
    expect(atribucionDelPiso(capas, false)).toBe(ATRIBUCION_MAPA);
    expect(atribucionDelPiso(null, true)).toBe(ATRIBUCION_MAPA);
  });
});
