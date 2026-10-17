import { describe, expect, it } from "vitest";
import {
  particlePosition,
  particleSeeds,
  precipitationParams,
  PRECIPITATION_HEIGHT,
  RAIN_COUNT,
} from "./precipitation";
import { buildPrecipitation } from "./precipitation-scene";

const BOX = { cx: 5, cz: -3, half: 30, height: PRECIPITATION_HEIGHT };

describe("lluvia y granizo", () => {
  it("sin precipitación no hay partículas; la fuerte tiene más y cae más rápido que la ligera", () => {
    expect(precipitationParams("ninguna", "alta")).toBeNull();
    const fuerte = precipitationParams("lluvia_fuerte", "media")!;
    const ligera = precipitationParams("lluvia_ligera", "media")!;
    const granizo = precipitationParams("granizo", "media")!;
    expect(fuerte.count).toBe(RAIN_COUNT.media);
    expect(ligera.count).toBeLessThan(fuerte.count);
    expect(ligera.speed).toBeLessThan(fuerte.speed);
    expect(granizo.speed).toBeGreaterThan(fuerte.speed);
    expect(granizo.size).toBeGreaterThan(fuerte.size);
    expect(granizo.opacity).toBeGreaterThan(fuerte.opacity);
  });

  it("la cantidad sube con el nivel de calidad", () => {
    const n = (q: "baja" | "media" | "alta") => precipitationParams("lluvia_fuerte", q)!.count;
    expect(n("baja")).toBeLessThan(n("media"));
    expect(n("media")).toBeLessThan(n("alta"));
  });

  it("las semillas son deterministas y uniformes en [0, 1)", () => {
    const a = particleSeeds(2000, 105);
    expect(a).toEqual(particleSeeds(2000, 105));
    expect(a).not.toEqual(particleSeeds(2000, 106));
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThan(1);
    const mean = a.reduce((s, x) => s + x, 0) / a.length;
    expect(mean).toBeCloseTo(0.5, 1);
  });

  it("cada partícula cae a su velocidad y vuelve arriba al tocar el suelo, dentro de la caja", () => {
    const seed = [0.25, 0.75, 0.5] as const;
    const p0 = particlePosition(seed, 0, 7, BOX);
    const p1 = particlePosition(seed, 0.5, 7, BOX);
    expect(p0[1] - p1[1]).toBeCloseTo(3.5, 9);
    expect(p1[0]).toBe(p0[0]);
    expect(p0[0]).toBeCloseTo(5 - 15, 9);
    expect(p0[2]).toBeCloseTo(-3 + 15, 9);
    // Un ciclo completo (altura / velocidad) la deja donde empezó.
    const cycle = particlePosition(seed, PRECIPITATION_HEIGHT / 7, 7, BOX);
    expect(cycle[1]).toBeCloseTo(p0[1], 6);
    for (let t = 0; t < 10; t += 0.37) {
      const y = particlePosition(seed, t, 7, BOX)[1];
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(PRECIPITATION_HEIGHT);
    }
  });

  it("la malla instanciada lleva una instancia por partícula y no se recorta por cámara", () => {
    const params = precipitationParams("granizo", "baja")!;
    const att = buildPrecipitation(params, BOX, 7, false);
    expect(att.object.count).toBe(params.count);
    expect(att.object.frustumCulled).toBe(false);
    expect(att.object.castShadow).toBe(false);
    att.setTime(1.2);
    att.dispose();
    const rain = buildPrecipitation(precipitationParams("lluvia_ligera", "baja")!, BOX, 7, true);
    expect(rain.object.name).toBe("precipitacion-lluvia_ligera");
    rain.dispose();
  });
});
