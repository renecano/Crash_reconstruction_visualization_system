import { describe, expect, it } from "vitest";
import { caso } from "./caso";
import { croquisContraDictamen } from "./contra-dictamen";
import { reproducir } from "./reproduccion";

const c = caso("A2010930");
const filas = reproducir(c).filas;
const de = (clave: string) => filas.find((f) => f.clave === clave)!.croquis;

describe("Croquis contra el reporte de CESVI A2010930", () => {
  const r = croquisContraDictamen(c, {
    modalidad: "Alcance",
    deformacionKmh: de("ebs_kmh_datos"),
    restosKmh: de("v3_kmh"),
    restosM: 15.89,
  });
  const fila = (k: string) => r.filas.find((f) => f.clave === k)!;

  it("compara modalidad, las dos velocidades y la dinámica, con su diferencia en %", () => {
    expect(r.filas.map((f) => f.clave)).toEqual(["modalidad", "deformacion", "restos", "dinamica"]);
    expect(fila("modalidad")).toMatchObject({ cesvi: "alcance", coincide: true });
    // La velocidad por deformación con los datos impresos difiere porque la energía difiere.
    expect(fila("deformacion").cesvi).toBe("63.15 km/h");
    expect(fila("deformacion").diferenciaPct).toBeCloseTo(
      (100 * (de("ebs_kmh_datos") - 63.15)) / 63.15,
      9,
    );
    expect(fila("deformacion").coincide).toBe(false);
    expect(fila("restos")).toMatchObject({ cesvi: "60.27 km/h", coincide: true });
    expect(fila("dinamica")).toMatchObject({ croquis: "15.89 m de restos", coincide: true });
  });

  it("explica la discrepancia de energía con lo medido y lo resume sin juzgar a nadie", () => {
    expect(r.energia!.diferenciaPct).toBeCloseTo(2.39, 2);
    expect(r.resumen).toBe(
      "Croquis llega a lo mismo que el reporte de CESVI en la modalidad, la velocidad por restos y la dinámica del impacto. Difiere en la velocidad por deformación (+1.19 %).",
    );
    expect(r.resumen).not.toMatch(/sostiene|miente|culpa|declar/i);
  });

  it("sin datos de Croquis, deja los huecos a la vista", () => {
    const vacio = croquisContraDictamen(c, {
      modalidad: null,
      deformacionKmh: null,
      restosKmh: null,
      restosM: null,
    });
    expect(vacio.filas.every((f) => f.croquis === "—" && f.coincide === null)).toBe(true);
    expect(vacio.resumen).toBe("Croquis aún no tiene los datos para comparar.");
  });
});
