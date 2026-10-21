import { describe, expect, it } from "vitest";
import { caso } from "./caso";
import { sugerir, zonasDeDanos } from "./correspondencia";
import { compararVelocidades } from "./metodo";

const c = caso("A2010930");
const zonasA = zonasDeDanos(c.vehiculos.A.danos);
const zonasB = zonasDeDanos(c.vehiculos.B.danos);

describe("zonas de daño del dictamen", () => {
  it("A: posterior izquierda; B: frontal derecha (la batea y el habitáculo no son zonas del diagrama)", () => {
    expect(zonasA).toEqual(["posterior_izquierda"]);
    expect(zonasB).toEqual(["frontal_derecha"]);
  });
});

describe("sugerencia de Croquis", () => {
  it("con los datos del dictamen: la versión declarada no se sostiene, por las tres razones", () => {
    const s = sugerir({
      comparacion: compararVelocidades(63.15, 60.27, 10),
      distanciaRestos: 15.89,
      fuenteDistancia: "del dictamen",
      zonasA,
      zonasB,
    });
    expect(s.conclusion).toBe("no_se_sostiene");
    expect(s.razones.map((r) => r.sentido)).toEqual([
      "contra_declarada",
      "contra_declarada",
      "contra_declarada",
    ]);
    expect(s.razones[1]!.texto).toContain("15.89 m");
  });

  it("sin separación de restos y daños centrados, la declarada se sostiene", () => {
    const s = sugerir({
      comparacion: compararVelocidades(63.15, 0, 10),
      distanciaRestos: 0,
      fuenteDistancia: "medida por el perito",
      zonasA: ["posterior_centro"],
      zonasB: ["frontal_centro"],
    });
    expect(s.conclusion).toBe("se_sostiene");
  });

  it("con dos razones a favor (umbral estricto y daños centrados), se sostiene", () => {
    const s = sugerir({
      comparacion: compararVelocidades(63.15, 60.27, 4),
      distanciaRestos: 15.89,
      fuenteDistancia: "del dictamen",
      zonasA: ["posterior_centro"],
      zonasB: ["frontal_centro"],
    });
    expect(s.razones.map((r) => r.sentido)).toEqual([
      "a_favor_declarada",
      "contra_declarada",
      "a_favor_declarada",
    ]);
    expect(s.conclusion).toBe("se_sostiene");
  });

  it("con una razón en contra, una a favor y una sin dato, no es concluyente", () => {
    const s = sugerir({
      comparacion: compararVelocidades(63.15, 60.27, 4),
      distanciaRestos: 15.89,
      fuenteDistancia: "del dictamen",
      zonasA: [],
      zonasB: ["frontal_derecha"],
    });
    expect(s.razones.map((r) => r.sentido)).toEqual([
      "a_favor_declarada",
      "contra_declarada",
      "sin_dato",
    ]);
    expect(s.conclusion).toBe("no_concluyente");
  });

  it("sin datos, no concluye", () => {
    const s = sugerir({
      comparacion: null,
      distanciaRestos: null,
      fuenteDistancia: "",
      zonasA: [],
      zonasB: [],
    });
    expect(s.conclusion).toBe("no_concluyente");
    expect(s.razones.every((r) => r.sentido === "sin_dato")).toBe(true);
  });
});
