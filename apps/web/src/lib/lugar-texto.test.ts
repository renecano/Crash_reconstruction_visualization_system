import { describe, expect, it } from "vitest";
import { interpretarLugar } from "./lugar-texto";

const cerca = (x: number, y: number) => expect(Math.abs(x - y)).toBeLessThan(1e-4);

describe("lo que se escribe en «Buscar el lugar» (René, 2026-11-04, A1)", () => {
  it("coordenadas decimales, con o sin hemisferio, van directo al punto", () => {
    for (const t of ["19.2826, -99.6557", "19.2826 -99.6557", "19.2826;-99.6557"]) {
      const r = interpretarLugar(t);
      expect(r.tipo).toBe("punto");
      if (r.tipo === "punto") {
        cerca(r.lat, 19.2826);
        cerca(r.lon, -99.6557);
        expect(r.origen).toBe("coordenadas");
      }
    }
    const h = interpretarLugar("19.2826° N, 99.6557° W");
    expect(h).toMatchObject({ tipo: "punto" });
    if (h.tipo === "punto") cerca(h.lon, -99.6557);
  });

  it("grados, minutos y segundos", () => {
    const r = interpretarLugar(`19°16'57.4"N 99°39'20.5"W`);
    expect(r.tipo).toBe("punto");
    if (r.tipo === "punto") {
      cerca(r.lat, 19 + 16 / 60 + 57.4 / 3600);
      cerca(r.lon, -(99 + 39 / 60 + 20.5 / 3600));
    }
    const o = interpretarLugar("19° 16’ 57.4” N, 99° 39’ 20.5” O");
    expect(o.tipo).toBe("punto");
    if (o.tipo === "punto") expect(o.lon).toBeLessThan(0);
  });

  it("links de Google Maps: el pin manda sobre el centro de la vista", () => {
    const pin = interpretarLugar(
      "https://www.google.com/maps/place/Toluca/@19.29,-99.66,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d19.2826!4d-99.6557",
    );
    expect(pin).toMatchObject({ tipo: "punto", origen: "google" });
    if (pin.tipo === "punto") cerca(pin.lat, 19.2826);
    const vista = interpretarLugar("https://www.google.com/maps/@19.2826,-99.6557,17z");
    expect(vista).toMatchObject({ tipo: "punto", origen: "google" });
    const q = interpretarLugar("https://maps.google.com/?q=19.2826,-99.6557");
    expect(q).toMatchObject({ tipo: "punto", origen: "google" });
  });

  it("links de OpenStreetMap: con marcador y con la vista", () => {
    const m = interpretarLugar(
      "https://www.openstreetmap.org/?mlat=19.2826&mlon=-99.6557#map=17/19.2800/-99.6500",
    );
    expect(m).toMatchObject({ tipo: "punto", origen: "osm" });
    if (m.tipo === "punto") cerca(m.lat, 19.2826);
    const v = interpretarLugar("https://www.openstreetmap.org/#map=17/19.2826/-99.6557");
    expect(v).toMatchObject({ tipo: "punto", origen: "osm" });
  });

  it("carretera y kilómetro: «MEX-15 km 47+800» y variantes", () => {
    expect(interpretarLugar("MEX-15 km 47+800")).toMatchObject({
      tipo: "carretera",
      ref: "MEX 15",
      km: 47.8,
    });
    expect(interpretarLugar("km 47+800 de la carretera federal 15D, Ahome")).toMatchObject({
      tipo: "carretera",
      ref: "MEX 15D",
      km: 47.8,
    });
    expect(interpretarLugar("Fed. 57 km 12.5")).toMatchObject({ ref: "MEX 57", km: 12.5 });
  });

  it("lo demás es texto; coordenadas imposibles no son punto", () => {
    expect(interpretarLugar("Paseo Tollocan, Toluca").tipo).toBe("texto");
    expect(interpretarLugar("95.5, 200").tipo).toBe("texto");
  });
});
