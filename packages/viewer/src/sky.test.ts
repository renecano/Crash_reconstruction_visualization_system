import { describe, expect, it } from "vitest";
import { environmentFor } from "./environment";
import {
  AMBIENT_TARGET,
  environmentIntensityFor,
  equirectU,
  exposureFor,
  fogColorFor,
  hdriFor,
  hdriRotationY,
  nightSkyColors,
} from "./sky";

const dia = environmentFor({ fechaHora: "2025-03-20 12:30", clima: "despejado" });
const nublado = environmentFor({ fechaHora: "2025-03-20 12:30", clima: "lluvia_fuerte" });
const tarde = environmentFor({ fechaHora: "2025-03-20 18:00", clima: "despejado" });
const noche = environmentFor({ iluminacion: "noche_con_alumbrado", clima: "lluvia_fuerte" });
const nocheOscura = environmentFor({ iluminacion: "noche_sin_alumbrado" });

describe("el HDRI de cada escena", () => {
  it("sigue la hora y el clima del hecho", () => {
    expect(hdriFor(dia)).toBe("dia");
    expect(hdriFor(nublado)).toBe("nublado");
    expect(tarde.sun.elevation).toBeLessThan(15);
    expect(hdriFor(tarde)).toBe("crepusculo");
    expect(hdriFor(noche)).toBe("noche");
  });

  it("la intensidad lleva la radiancia media medida a la meta de cada cielo", () => {
    expect(environmentIntensityFor(dia, 0.3)).toBeCloseTo(AMBIENT_TARGET.dia / 0.3);
    expect(environmentIntensityFor(noche, 0.001)).toBeCloseTo(AMBIENT_TARGET.noche / 0.001);
    // De noche la meta es menor que de día; sin medida, no se escala; nunca más de 50×.
    expect(AMBIENT_TARGET.noche).toBeLessThan(AMBIENT_TARGET.dia);
    expect(environmentIntensityFor(dia, 0)).toBe(1);
    expect(environmentIntensityFor(noche, 1e-9)).toBe(50);
  });
});

describe("exposición por escena", () => {
  it("de día es 1 (la calibración de siempre) y de noche la cámara abre", () => {
    expect(exposureFor(dia)).toBe(1);
    expect(exposureFor(nublado)).toBe(1);
    expect(exposureFor(noche)).toBeGreaterThan(1);
    // Sin alumbrado abre más todavía: lo poco que hay son los faros.
    expect(exposureFor(nocheOscura)).toBeGreaterThan(exposureFor(noche));
  });
});

describe("giro del HDRI hacia el sol calculado", () => {
  it("la columna u sigue la convención de three.js: el este en 0.5 y el sur en 0.75", () => {
    expect(equirectU(90)).toBeCloseTo(0.5);
    expect(equirectU(180)).toBeCloseTo(0.75);
    expect(equirectU(0)).toBeCloseTo(0.25);
    expect(equirectU(270)).toBeCloseTo(0);
    expect(equirectU(450)).toBeCloseTo(0.5);
  });

  it("gira la diferencia de azimuts, en (−π, π]", () => {
    expect(hdriRotationY(180, 120)).toBeCloseTo(Math.PI / 3);
    expect(hdriRotationY(120, 180)).toBeCloseTo(-Math.PI / 3);
    expect(hdriRotationY(10, 350)).toBeCloseTo(Math.PI / 9);
    expect(hdriRotationY(350, 10)).toBeCloseTo(-Math.PI / 9);
    expect(hdriRotationY(124.3, 124.3)).toBe(0);
  });
});

describe("el aire y el domo de noche", () => {
  it("la niebla toma el color del horizonte de cada escena", () => {
    const colores = [dia, nublado, tarde, noche, nocheOscura].map(fogColorFor);
    expect(new Set(colores).size).toBe(5);
    for (const c of colores) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("con alumbrado el horizonte de noche es cálido; sin él, azul oscuro", () => {
    expect(nightSkyColors(true).horizon).not.toBe(nightSkyColors(false).horizon);
    expect(nightSkyColors(true).zenith).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("el HDRI sin su sol", () => {
  it("recorta cada canal al tope y promedia ponderando por la latitud", async () => {
    const { capAndMeasure } = await import("./sky-scene");
    // 2 columnas × 4 filas: cielo de 0.5 con un sol de 1000 en una fila.
    const data = new Float32Array(2 * 4 * 4).fill(0.5);
    data[0] = 1000;
    data[1] = 900;
    data[2] = 800;
    const mean = capAndMeasure(data, 2, 4, 6);
    expect(data[0]).toBe(6);
    expect(data[2]).toBe(6);
    expect(data[3]).toBe(0.5); // el alfa no se toca
    expect(mean).toBeGreaterThan(0.5);
    expect(mean).toBeLessThan(6);
    // Todo uniforme: el promedio es ese valor, sea cual sea el peso de cada fila.
    expect(capAndMeasure(new Float32Array(2 * 4 * 4).fill(0.25), 2, 4)).toBeCloseTo(0.25);
  });
});
