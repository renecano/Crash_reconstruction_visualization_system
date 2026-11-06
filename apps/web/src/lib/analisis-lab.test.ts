import type { SupuestoDeclarado } from "@croquis/cesvi";
import { describe, expect, it } from "vitest";
import {
  barraDeRango,
  contadorCriterios,
  perfilDeformacion,
  supuestosParaTarjetas,
} from "./analisis-lab";

const CARA = { x0: 100, ancho: 300, base: 200, alto: 100 };

describe("el perfil de deformación (Laboratorio §8)", () => {
  it("cada C cae a la misma distancia sobre la cara y su profundidad es proporcional", () => {
    const { puntos, d } = perfilDeformacion([96, 86, 52, 20], CARA);
    expect(puntos.map((p) => p.nombre)).toEqual(["C1", "C2", "C3", "C4"]);
    expect(puntos.map((p) => p.x)).toEqual([100, 200, 300, 400]);
    // El mayor llega a lo alto; los demás, en proporción (96 cm es el tope).
    expect(puntos[0]!.y).toBeCloseTo(100, 6);
    expect(puntos[2]!.y).toBeCloseTo(200 - (52 / 96) * 100, 6);
    expect(puntos.map((p) => p.cm)).toEqual([96, 86, 52, 20]);
    expect(d.startsWith("M 100 200")).toBe(true);
    expect(d.endsWith("L 400 200 Z")).toBe(true);
  });

  it("una abolladura chica se ve chica: el eje llega al menos a 30 cm", () => {
    const { puntos } = perfilDeformacion([3, 6], CARA);
    expect(puntos[1]!.y).toBeCloseTo(200 - (6 / 30) * 100, 6);
  });

  it("la curva no se sale de la cara del vehículo aunque caiga a cero", () => {
    const { d } = perfilDeformacion([50, 0, 0, 40], CARA);
    const ys = [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]));
    expect(Math.max(...ys)).toBeLessThanOrEqual(200);
  });

  it("sin medidas no hay dibujo; con una sola, un pico al centro", () => {
    expect(perfilDeformacion([], CARA)).toEqual({ d: "", puntos: [] });
    expect(perfilDeformacion([40], CARA).puntos[0]!.x).toBe(250);
  });
});

describe("la barra de rango de un supuesto", () => {
  it("el rango va al centro y el valor en su lugar", () => {
    const b = barraDeRango(0.55, 0.8, 0.7)!;
    expect(b.izq).toBeCloseTo((0.05 / 0.35) * 100, 1);
    expect(b.izq + b.ancho).toBeCloseTo(100 - b.izq, 1);
    expect(b.marca).toBeCloseTo(((0.7 - 0.5) / 0.35) * 100, 1);
  });

  it("sin rango no hay barra", () => {
    expect(barraDeRango(1, 1, 1)).toBeNull();
    expect(barraDeRango(2, 1, 1)).toBeNull();
  });
});

describe("los criterios y los supuestos en sus tarjetas", () => {
  it("cuenta los criterios marcados", () => {
    expect(
      contadorCriterios({
        forma: { marca: "corresponde", nota: "" },
        altura: { marca: null, nota: "" },
      }),
    ).toBe("1 de 2 criterios marcados");
    expect(contadorCriterios({ forma: { marca: null, nota: "" } })).toBe("0 de 1 criterio marcado");
  });

  const inicio = (id: string): SupuestoDeclarado => ({
    clave: `inicio-${id}`,
    que: `Posición inicial de ${id}`,
    valor: "12 m antes de la posición de impacto que colocó el perito, en su rumbo",
    vehiculo: id,
    justificacion: "El reporte no la da.",
    incertidumbre: "±20°",
  });
  const letra = (id: string) => (id === "V1" ? "A" : "B");

  it("los vehículos se llaman por su letra y las posiciones iguales van juntas", () => {
    const masa: SupuestoDeclarado = {
      clave: "masa-V1",
      que: "Masa de V1",
      valor: "2,562.1 kg",
      vehiculo: "V1",
      justificacion: "Ficha",
      incertidumbre: "±5 %",
    };
    const t = supuestosParaTarjetas([masa, inicio("V2"), inicio("V1")], letra);
    expect(t.map((s) => s.que)).toEqual(["Masa de A", "Posición inicial de A y B"]);
    expect(t[1]!.valor).toBe("12 m antes");
  });

  it("si las posiciones son distintas, cada una conserva su tarjeta", () => {
    const otra = { ...inicio("V2"), valor: "30 m antes de la posición de impacto" };
    expect(supuestosParaTarjetas([inicio("V1"), otra], letra)).toHaveLength(2);
  });
});
