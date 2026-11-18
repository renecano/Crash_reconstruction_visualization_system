import { describe, expect, it } from "vitest";
import { MARCA } from "../datos";
import { ruidoSuave } from "../hoja";
import { MOMENTOS } from "../ritmo";
import { COSAS, creditoDeModelos, geometriaDelLogo } from "./Logo";

describe("el cierre del tráiler", () => {
  it("cada letra de la palabra tiene su cosa, en orden", () => {
    const palabra = MARCA.palabra.letras.map((l) => l.letra).join("");
    expect(COSAS.map((c) => c.letra).join("")).toBe(palabra);
    expect(COSAS.length).toBe(MOMENTOS.letras.length);
    // Siete cosas distintas, cada una con su nombre.
    expect(new Set(COSAS.map((c) => c.que)).size).toBe(COSAS.length);
  });

  it("la mira del logo queda dentro de la pantalla en los tres formatos", () => {
    for (const [ancho, alto] of [
      [1920, 1080],
      [3840, 2160],
      [1080, 1920],
    ] as const) {
      const g = geometriaDelLogo(ancho, alto);
      expect(g.miraX).toBeGreaterThan(0);
      expect(g.miraX).toBeLessThan(ancho);
      expect(g.miraY).toBeGreaterThan(0);
      expect(g.miraY).toBeLessThan(alto);
      expect(g.izq + g.anchoLogo).toBeLessThanOrEqual(ancho);
    }
  });

  it("el crédito de los modelos dice quién los hizo y con qué licencia", () => {
    expect(creditoDeModelos(null)).toBeNull();
    const credito = creditoDeModelos({
      sedan: {
        archivo: "modelos/sedan.glb",
        largo: 4.35,
        ancho: 1.7,
        alto: 1.48,
        autor: "Daniel Zhabotinsky",
        nombre: "Kiri '10",
        licencia: "CC-BY 4.0",
        url: "https://sketchfab.com/3d-models/x",
      },
      combi: {
        archivo: "modelos/combi.glb",
        largo: 5.18,
        ancho: 2.35,
        alto: 2.1,
        autor: "Daniel Zhabotinsky",
        nombre: "Shvan 92 Traveller",
        licencia: "CC-BY 4.0",
        url: "https://sketchfab.com/3d-models/y",
      },
    });
    expect(credito).toContain("Daniel Zhabotinsky");
    expect(credito).toContain("CC-BY 4.0");
    expect(credito).toContain("«Kiri '10» y «Shvan 92 Traveller»");
  });

  it("la presión del lápiz es la misma en cada render y nunca se sale de 0 a 1", () => {
    for (const x of [0, 0.37, 12.5, 88.2]) {
      const v = ruidoSuave(x, 17);
      expect(v).toBe(ruidoSuave(x, 17));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(ruidoSuave(3.3, 17)).not.toBe(ruidoSuave(3.3, 18));
  });
});
