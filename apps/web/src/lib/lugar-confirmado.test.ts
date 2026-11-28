import { describe, expect, it } from "vitest";
import { lugarParaProponer, textoDelHallazgo } from "./lugar-confirmado";

/** El centro con que nace el mapa (el Zócalo de la CDMX): nunca es el lugar del choque. */
const ZOCALO = { lat: 19.43, lon: -99.13 };

describe("nunca un punto por omisión (René, 2026-11-27, #388)", () => {
  it("el centro del mapa no es un lugar: sin lugar guardado ni confirmado, no se propone", () => {
    expect(lugarParaProponer({ guardado: null, confirmado: null, centroMapa: ZOCALO })).toBeNull();
  });
  it("lo que encontró Croquis espera a que el perito lo confirme", () => {
    const encontrado = { lat: 19.29299, lon: -99.65772 };
    expect(lugarParaProponer({ guardado: null, confirmado: null, encontrado })).toBeNull();
    expect(lugarParaProponer({ guardado: null, confirmado: encontrado, encontrado })).toEqual(
      encontrado,
    );
  });
  it("el lugar guardado del caso (los ejemplos) se usa tal cual", () => {
    const guardado = { lat: 25.5696, lon: -100.27224 };
    expect(lugarParaProponer({ guardado, confirmado: null, centroMapa: ZOCALO })).toEqual(guardado);
  });
  it("dice qué encontró, cómo y qué tan seguro", () => {
    expect(
      textoDelHallazgo({ nombre: "Cruce de Lerdo de Tejada con Nicolás Bravo", precision: "cruce" })
        .texto,
    ).toBe(
      "Croquis encontró: Cruce de Lerdo de Tejada con Nicolás Bravo · el cruce de las dos calles en OpenStreetMap · seguro",
    );
    expect(
      textoDelHallazgo({
        nombre: "Carretera Federal 45",
        precision: "calle",
        aviso: "OpenStreetMap no tiene el km 120: mueve el mapa",
      }),
    ).toMatchObject({ seguridad: "baja" });
  });
});
