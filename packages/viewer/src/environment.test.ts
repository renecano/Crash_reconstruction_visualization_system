import { describe, expect, it } from "vitest";
import { environmentFor, parseSceneTime, sunDirection, sunPosition, TOLUCA } from "./environment";

/** Elevación máxima del sol en un día (búsqueda minuto a minuto). */
function maxElevation(
  iso: string,
  lat: number,
  lon: number,
): { elevation: number; azimuth: number } {
  const start = new Date(`${iso}T00:00:00Z`).getTime() - (lon / 15) * 3_600_000;
  let best = { elevation: -90, azimuth: 0 };
  for (let m = 0; m < 24 * 60; m++) {
    const p = sunPosition(new Date(start + m * 60_000), lat, lon);
    if (p.elevation > best.elevation) best = p;
  }
  return best;
}

describe("posición del sol (NOAA)", () => {
  it("en el solsticio de junio el sol pasa por el cenit sobre el trópico de Cáncer", () => {
    expect(maxElevation("2025-06-21", 23.44, 0).elevation).toBeGreaterThan(89.5);
  });

  it("en el equinoccio el sol pasa por el cenit sobre el ecuador", () => {
    expect(maxElevation("2025-03-20", 0, 0).elevation).toBeGreaterThan(89.5);
  });

  it("al mediodía de junio en Toluca el sol está alto y al norte del cenit", () => {
    const p = maxElevation("2025-06-21", TOLUCA.lat, TOLUCA.lon);
    // 90° − |19.28° − 23.44°| ≈ 85.8°; el sol queda del lado norte.
    expect(p.elevation).toBeGreaterThan(84);
    expect(p.elevation).toBeLessThan(87.5);
    expect(p.azimuth < 30 || p.azimuth > 330).toBe(true);
  });

  it("en la mañana el sol está al oriente y en la tarde al poniente", () => {
    const morning = sunPosition(new Date("2025-03-20T14:00:00Z"), TOLUCA.lat, TOLUCA.lon); // 08:00 local
    const evening = sunPosition(new Date("2025-03-21T00:00:00Z"), TOLUCA.lat, TOLUCA.lon); // 18:00 local
    expect(morning.azimuth).toBeGreaterThan(60);
    expect(morning.azimuth).toBeLessThan(120);
    expect(evening.azimuth).toBeGreaterThan(240);
    expect(evening.azimuth).toBeLessThan(300);
    expect(morning.elevation).toBeGreaterThan(0);
  });

  it("a medianoche el sol está bajo el horizonte", () => {
    expect(
      sunPosition(new Date("2025-03-21T06:00:00Z"), TOLUCA.lat, TOLUCA.lon).elevation,
    ).toBeLessThan(-30);
  });

  it("la dirección al sol es unitaria y apunta arriba de día", () => {
    const d = sunDirection({ elevation: 30, azimuth: 90 });
    expect(Math.hypot(...d)).toBeCloseTo(1, 12);
    expect(d[0]).toBeCloseTo(Math.cos(Math.PI / 6), 12); // al este
    expect(d[2]).toBeCloseTo(0.5, 12);
  });
});

describe("fecha y hora de la escena", () => {
  it("acepta ISO con zona, fecha y hora local, solo hora o nada", () => {
    expect(parseSceneTime("2025-07-01T09:30:00-06:00", "dia").date.toISOString()).toBe(
      "2025-07-01T15:30:00.000Z",
    );
    const local = parseSceneTime("2025-07-01 09:30", undefined);
    expect(local.date.toISOString()).toBe("2025-07-01T15:30:00.000Z");
    expect(local.supuestos).toEqual([]);
    const soloHora = parseSceneTime("23:00", "noche_con_alumbrado");
    expect(soloHora.date.toISOString()).toBe("2025-03-21T05:00:00.000Z");
    expect(soloHora.supuestos.join(" ")).toContain("Fecha no declarada");
    const nada = parseSceneTime(undefined, "atardecer");
    expect(nada.supuestos.join(" ")).toContain("18:45");
  });

  it("de noche hay poca luz, alumbrado si se declara y los supuestos se reportan", () => {
    const n = environmentFor({
      fechaHora: "23:00",
      iluminacion: "noche_con_alumbrado",
      alumbrado: true,
      clima: "lluvia_ligera",
    });
    expect(n.night).toBe(true);
    expect(n.streetLights).toBe(true);
    expect(n.wet).toBe(true);
    expect(n.sunIntensity).toBeLessThan(0.5);
    expect(n.supuestos.join(" ")).toContain("Toluca");
    const d = environmentFor({ iluminacion: "dia", clima: "despejado", lat: 19.3, lon: -99.6 });
    expect(d.night).toBe(false);
    expect(d.sun.elevation).toBeGreaterThan(40);
    expect(d.fogDensity).toBeLessThan(environmentFor({ clima: "niebla" }).fogDensity);
  });
});
