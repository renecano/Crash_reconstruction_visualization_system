import { describe, expect, it } from "vitest";
import { avanzar, distanciaM, type LonLat } from "./geo";
import { callesCerca, tramoDelCaso } from "./tramo";

describe("tramo precargado del caso A2010930", () => {
  const tramo = tramoDelCaso("A2010930");

  it("trae la carretera federal 15 entre Los Mochis y Navojoa, de OSM", () => {
    expect(tramo.length).toBeGreaterThan(10);
    expect(tramo.some((c) => c.nombre?.startsWith("MEX 15"))).toBe(true);
    for (const c of tramo) {
      for (const [lon, lat] of c.puntos) {
        expect(lat).toBeGreaterThan(25.7);
        expect(lat).toBeLessThan(27.2);
        expect(lon).toBeGreaterThan(-109.6);
        expect(lon).toBeLessThan(-108.8);
      }
    }
  });

  it("junto a la carretera la encuentra al instante, con su rumbo", () => {
    const via = tramo.find((c) => c.nombre?.startsWith("MEX 15") && c.puntos.length > 2)!;
    const a = via.puntos[0]!;
    const b = via.puntos[1]!;
    const medio: LonLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // 5 m al lado del eje.
    const p = avanzar(medio, 90, 5);
    const t0 = performance.now();
    const r = callesCerca(tramo, p, 250);
    expect(performance.now() - t0).toBeLessThan(100);
    expect(r.cercana).not.toBeNull();
    expect(r.cercana!.distanciaM).toBeLessThan(10);
    expect(distanciaM(medio, p)).toBeCloseTo(5, 1);
  });

  it("lejos de la carretera no hay calles cerca", () => {
    expect(callesCerca(tramo, [-102.5, 23.6], 250).cercana).toBeNull();
  });

  it("un caso sin tramo precargado no trae calles", () => {
    expect(tramoDelCaso("otro")).toEqual([]);
  });
});
