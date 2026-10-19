import { beforeEach, describe, expect, it } from "vitest";
import {
  borrarE9,
  E9_KEY,
  iniciarE9,
  leerE9,
  registrarE9,
  resumenE9,
  susPuntaje,
  terminarE9,
} from "./e9";

describe("E9 en el dispositivo", () => {
  beforeEach(() => localStorage.clear());

  it("sin sesión activa no anota nada", () => {
    registrarE9("relato_enviado");
    expect(localStorage.getItem(E9_KEY)).toBeNull();
  });

  it("anota solo tipo y momento, y resume tiempo, correcciones, rondas y SUS", () => {
    iniciarE9("P01", 1_000);
    registrarE9("relato_enviado", 31_000);
    registrarE9("preguntas_respondidas", 61_000);
    registrarE9("croquis_abierto", 70_000);
    registrarE9("correccion_croquis", 80_000);
    registrarE9("correccion_croquis", 90_000);
    registrarE9("reconstruccion_visible", 123_400);
    registrarE9("reconstruccion_visible", 200_000);
    const s = terminarE9([5, 1, 5, 1, 5, 1, 5, 1, 5, 1], 300_000);
    expect(Object.keys(s.eventos[0]!)).toEqual(["tipo", "t"]);
    expect(resumenE9(s)).toEqual({
      segundos_hasta_primera_reconstruccion: 122.4,
      correcciones_croquis: 2,
      rondas_de_preguntas: 1,
      sus: 100,
    });
    // Ya terminada, no se anotan más eventos.
    registrarE9("correccion_croquis", 400_000);
    expect(leerE9()!.eventos).toHaveLength(7);
    borrarE9();
    expect(leerE9()).toBeNull();
  });

  it("el SUS se puntúa como Brooke: neutral = 50, peor = 0", () => {
    expect(susPuntaje([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
    expect(susPuntaje([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
  });

  it("rechaza códigos y respuestas inválidas", () => {
    expect(() => iniciarE9("Ana")).toThrow();
    iniciarE9("P02");
    expect(() => terminarE9([5, 5, 5])).toThrow();
    expect(() => terminarE9([6, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toThrow();
  });
});
