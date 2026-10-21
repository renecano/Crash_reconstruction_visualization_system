import { describe, expect, it } from "vitest";
import { acomodarEtiquetas, ALTO_ETIQUETA, type EntradaEtiqueta } from "./etiquetas-mapa";

const area = { ancho: 1280, alto: 650 };

function seEnciman(a: { x: number; y: number }, b: { x: number; y: number }, ancho: number) {
  return Math.abs(a.x - b.x) < ancho && Math.abs(a.y - b.y) < ALTO_ETIQUETA;
}

describe("etiquetas del mapa", () => {
  it("nueve puntos en el mismo lugar quedan en dos columnas sin encimarse", () => {
    const punto = { x: 640, y: 320 };
    const entradas: EntradaEtiqueta[] = Array.from({ length: 9 }, (_, i) => ({
      id: `e${i}`,
      lado: i % 2 ? "der" : "izq",
      punto,
      ancho: 110,
    }));
    const colocadas = acomodarEtiquetas(entradas, area);
    expect(colocadas).toHaveLength(9);
    for (let i = 0; i < colocadas.length; i++) {
      for (let j = i + 1; j < colocadas.length; j++) {
        expect(seEnciman(colocadas[i]!, colocadas[j]!, 110)).toBe(false);
      }
    }
    // A los lados del punto, sin taparlo, y con la línea hacia él.
    for (const c of colocadas) {
      expect(c.x + 110 <= punto.x || c.x >= punto.x).toBe(true);
      expect(c.ancla).toEqual(punto);
    }
  });

  it("la columna se queda a la altura de sus puntos y dentro del área", () => {
    const entradas: EntradaEtiqueta[] = [
      { id: "arriba", lado: "izq", punto: { x: 500, y: 5 }, ancho: 90 },
      { id: "abajo", lado: "izq", punto: { x: 520, y: 645 }, ancho: 90 },
      { id: "sola", lado: "der", punto: { x: 700, y: 300 }, ancho: 90 },
    ];
    const c = Object.fromEntries(acomodarEtiquetas(entradas, area).map((e) => [e.id, e]));
    expect(c.arriba!.y).toBeGreaterThanOrEqual(0);
    expect(c.abajo!.y + ALTO_ETIQUETA).toBeLessThanOrEqual(area.alto);
    expect(c.sola!.y + ALTO_ETIQUETA / 2).toBe(300);
    expect(c.arriba!.x + 90).toBeLessThan(500);
    expect(c.sola!.x).toBeGreaterThan(700);
  });
});
