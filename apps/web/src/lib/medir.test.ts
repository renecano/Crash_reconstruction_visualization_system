import { describe, expect, it } from "vitest";
import { dibujoMedicion, metrosEntre, textoMedicion } from "./medir";

// Dos puntos a unos 12 m al este, en la latitud de la Ciudad de México.
const a = { lat: 19.4, lon: -99.1 };
const b = { lat: 19.4, lon: -99.1 + 12 / (111_320 * Math.cos((19.4 * Math.PI) / 180)) };

describe("medir una distancia (ronda 2, A5)", () => {
  it("la banda dice qué tocar en cada momento y, al final, la medida", () => {
    expect(textoMedicion([])).toMatch(/primer extremo/);
    expect(textoMedicion([a])).toMatch(/segundo extremo.*sigue al puntero/);
    expect(textoMedicion([a, b])).toMatch(/^1[12]\.\d+ m\. Toca el mapa para medir otra/);
  });

  it("con un extremo, la línea va al puntero y la etiqueta es en vivo", () => {
    const d = dibujoMedicion([a], b);
    const linea = d.geojson.features.find((f) => f.properties.tipo === "linea")!;
    expect(linea.properties.viva).toBe(true);
    expect(linea.geometry.coordinates).toEqual([
      [a.lon, a.lat],
      [b.lon, b.lat],
    ]);
    expect(d.geojson.features.filter((f) => f.properties.tipo === "extremo")).toHaveLength(1);
    expect(d.etiqueta).toMatchObject({ viva: true, en: b });
    expect(Math.abs(metrosEntre(a, b) - 12)).toBeLessThan(0.05);
  });

  it("con los dos extremos, la línea queda fija y los extremos van numerados", () => {
    const d = dibujoMedicion([a, b], { lat: 0, lon: 0 });
    expect(d.geojson.features.find((f) => f.properties.tipo === "linea")!.properties.viva).toBe(
      false,
    );
    expect(
      d.geojson.features.filter((f) => f.properties.tipo === "extremo").map((f) => f.properties.n),
    ).toEqual([1, 2]);
    expect(d.etiqueta).toMatchObject({ viva: false, en: b });
  });

  it("sin extremos ni puntero, no se dibuja nada", () => {
    expect(dibujoMedicion([], null)).toEqual({
      geojson: { type: "FeatureCollection", features: [] },
      etiqueta: null,
    });
    expect(dibujoMedicion([a], null).etiqueta).toBeNull();
  });
});
