import { describe, expect, it } from "vitest";
import { esLaCarretera, proponerChoque, type Calle } from "./escena-facil";

/**
 * Si la narración nombra una carretera y ningún cruce, el choque va SOBRE ella, en su punto más
 * cercano al lugar encontrado (René, 2026-11-28: «sobre la carretera Hermosillo–Bahía de Kino, a la
 * altura del poblado Miguel Alemán» quedó en «Calle Yucatán», una calle urbana del pueblo).
 */
// La carretera va de oeste a este por la latitud 28.8400; el pueblo queda al norte, con la calle
// Yucatán (norte–sur) que la cruza y la calle Sonora (oeste–este) a 120 m.
const carretera: Calle = {
  id: 1,
  nombre: "Carretera Hermosillo - Bahía de Kino",
  puntos: [
    [-111.51, 28.84],
    [-111.5, 28.84],
    [-111.49, 28.84],
  ],
  ancho: 7,
  nodos: [1, 2, 3],
  tipo: "primary",
};
const yucatan: Calle = {
  id: 2,
  nombre: "Calle Yucatán",
  puntos: [
    [-111.5, 28.84],
    [-111.5, 28.8411],
    [-111.5, 28.842],
  ],
  ancho: 6.6,
  nodos: [2, 20, 21],
  tipo: "residential",
  maxspeed: "30",
};
const sonora: Calle = {
  id: 3,
  nombre: "Calle Sonora",
  puntos: [
    [-111.501, 28.8411],
    [-111.5, 28.8411],
    [-111.499, 28.8411],
  ],
  ancho: 6.6,
  nodos: [30, 20, 31],
  tipo: "residential",
};
const calles = [carretera, yucatan, sonora];
// El lugar encontrado: dentro del pueblo, junto al cruce de Yucatán y Sonora.
const lugar = { lat: 28.8412, lon: -111.5002 };
const narracion =
  "El hecho se ubica sobre la carretera Hermosillo–Bahía de Kino, a la altura del poblado Miguel Alemán, en Hermosillo, Sonora.";

describe("el choque, sobre la carretera narrada", () => {
  it("va sobre la carretera, en su punto más cercano al lugar, no en el cruce del pueblo", () => {
    const p = proponerChoque(calles, narracion, lugar);
    expect(p).toMatchObject({
      segun: "carretera",
      calles: ["Carretera Hermosillo - Bahía de Kino"],
    });
    expect(p!.punto.lat).toBeCloseTo(28.84, 5);
    expect(p!.punto.lon).toBeCloseTo(-111.5002, 4);
    expect(p!.cita).toBe("sobre la carretera Hermosillo–Bahía de Kino");
  });

  it("sin carretera narrada, sigue el cruce más cercano (como antes)", () => {
    const p = proponerChoque(
      calles,
      "El hecho se ubica en el poblado Miguel Alemán, Sonora.",
      lugar,
    );
    expect(p).toMatchObject({ segun: "cercania" });
    expect(p!.calles).toEqual(expect.arrayContaining(["Calle Yucatán", "Calle Sonora"]));
  });

  it("reconoce la carretera por su número o por su tramo", () => {
    expect(
      esLaCarretera(
        { ...carretera, nombre: "Calzada al Pacífico", ref: "MEX 134" },
        { ref: "MEX 134", tramo: null },
      ),
    ).toBe(true);
    expect(
      esLaCarretera(
        { ...carretera, nombre: null, ref: "MEX-134;MEX-15" },
        { ref: "MEX 134", tramo: null },
      ),
    ).toBe(true);
    expect(esLaCarretera({ ...carretera, ref: "MEX 15" }, { ref: "MEX 134", tramo: null })).toBe(
      false,
    );
    expect(esLaCarretera(carretera, { ref: null, tramo: ["Hermosillo", "Bahía de Kino"] })).toBe(
      true,
    );
    expect(esLaCarretera(yucatan, { ref: null, tramo: ["Hermosillo", "Bahía de Kino"] })).toBe(
      false,
    );
  });
});
