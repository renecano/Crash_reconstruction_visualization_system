import { describe, expect, it } from "vitest";
import {
  environmentFor,
  fogDensityForVisibility,
  parseSceneTime,
  sunDirection,
  sunPosition,
  TOLUCA,
} from "./environment";

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
    expect(nada.supuestos.join(" ")).toContain("18:10");
  });

  it("«noche con alumbrado» ilumina igual con o sin el campo de alumbrado aparte (R10)", () => {
    const solo = environmentFor({ iluminacion: "noche_con_alumbrado" });
    const conCampo = environmentFor({ iluminacion: "noche_con_alumbrado", alumbrado: true });
    expect(solo.streetLights).toBe(true);
    expect(solo.ambientIntensity).toBe(conCampo.ambientIntensity);
    expect(solo.ambientSkyColor).toBe(conCampo.ambientSkyColor);
    // Sin alumbrado (o apagado) la noche queda con la luz de la luna.
    const sin = environmentFor({ iluminacion: "noche_sin_alumbrado" });
    expect(sin.streetLights).toBe(false);
    expect(sin.ambientIntensity).toBeLessThan(solo.ambientIntensity);
    expect(
      environmentFor({ iluminacion: "noche_con_alumbrado", alumbrado: false }).streetLights,
    ).toBe(false);
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

  it("la luz de día nunca queda rasante aunque el sol esté bajo", () => {
    const e = environmentFor({ fechaHora: "18:40", iluminacion: "atardecer" });
    expect(e.night).toBe(false);
    expect(e.lightDirection[2]).toBeGreaterThanOrEqual(Math.sin((6 * Math.PI) / 180) - 1e-12);
  });
});

describe("piso, niebla y precipitación (F8a)", () => {
  it("el piso sigue al estado declarado aunque no llueva (poste: nublado y mojado)", () => {
    const e = environmentFor({ clima: "nublado", estadoSuperficie: "mojado" });
    expect(e.surface).toBe("mojado");
    expect(e.wet).toBe(true);
    expect(e.precipitation).toBe("ninguna");
    expect(e.supuestos.join(" ")).not.toContain("Estado del piso");
  });

  it("sin estado declarado, la lluvia moja el piso y se reporta como supuesto", () => {
    const fuerte = environmentFor({ clima: "lluvia_fuerte" });
    expect(fuerte.surface).toBe("encharcado");
    expect(fuerte.precipitation).toBe("lluvia_fuerte");
    expect(fuerte.supuestos.join(" ")).toContain("Estado del piso no declarado");
    expect(environmentFor({ clima: "lluvia" }).precipitation).toBe("lluvia_ligera");
    expect(environmentFor({ clima: "granizo" }).surface).toBe("mojado");
    // Lo declarado manda: lluvia con el piso seco (recién empezó) se dibuja seco.
    expect(environmentFor({ clima: "lluvia_ligera", estadoSuperficie: "seco" }).wet).toBe(false);
    expect(environmentFor({ estadoSuperficie: "lodo" }).surface).toBe("lodo");
    expect(environmentFor({ estadoSuperficie: "lodo" }).wet).toBe(false);
  });

  it("con visibilidad declarada la niebla deja pasar el 5 % de la luz a esa distancia (OMM)", () => {
    for (const v of [40, 150, 800]) {
      const d = environmentFor({ clima: "niebla", visibilidadM: v }).fogDensity;
      expect(d).toBeCloseTo(fogDensityForVisibility(v), 12);
      expect(Math.exp(-((d * v) ** 2))).toBeCloseTo(0.05, 9);
    }
    // Menos visibilidad, más densa.
    expect(fogDensityForVisibility(60)).toBeGreaterThan(fogDensityForVisibility(600));
  });
});
